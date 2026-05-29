// Baileys WhatsApp client + per-school session manager.
//
// Lifecycle: lazy spawn on first use, idle-close after 30 min. Session state
// persists on disk under ./baileys-sessions/<schoolId>/. Survives restart.
// Map<schoolId, Client> keeps the active socket and latest QR in-memory so
// the QR-scan modal can poll for status without re-instantiating Baileys.

import path from 'node:path'
import fs from 'node:fs/promises'
import QRCode from 'qrcode'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys'
import { db } from '@/lib/db'
import { normalizePhoneE164 } from './meta-cloud'

const SESSION_ROOT = path.resolve(process.cwd(), 'baileys-sessions')
const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 min

interface BaileysClient {
  sock: WASocket
  lastQR: string | null
  lastQRDataUrl: string | null
  connected: boolean
  phoneNumber: string | null
  lastSeen: Date
  idleTimer: NodeJS.Timeout | null
  starting: boolean
}

const clients = new Map<string, BaileysClient>()

function sessionDir(schoolId: string) {
  return path.join(SESSION_ROOT, schoolId)
}

async function ensureSessionDir(schoolId: string) {
  await fs.mkdir(sessionDir(schoolId), { recursive: true })
}

function clearIdleTimer(client: BaileysClient) {
  if (client.idleTimer) {
    clearTimeout(client.idleTimer)
    client.idleTimer = null
  }
}

function bumpIdle(schoolId: string, client: BaileysClient) {
  clearIdleTimer(client)
  client.idleTimer = setTimeout(() => {
    void closeClient(schoolId, 'idle')
  }, IDLE_TIMEOUT_MS)
  client.lastSeen = new Date()
}

async function closeClient(schoolId: string, reason: 'idle' | 'logout') {
  const client = clients.get(schoolId)
  if (!client) return
  clearIdleTimer(client)
  clients.delete(schoolId)
  try {
    if (reason === 'logout') {
      await client.sock.logout()
    } else {
      client.sock.end(undefined)
    }
  } catch { /* swallow — socket may already be closed */ }
}

async function createClient(schoolId: string): Promise<BaileysClient> {
  await ensureSessionDir(schoolId)
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(schoolId))

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    browser: ['Vidhyalayam ERP', 'Chrome', '1.0'],
  })

  const client: BaileysClient = {
    sock,
    lastQR: null,
    lastQRDataUrl: null,
    connected: false,
    phoneNumber: null,
    lastSeen: new Date(),
    idleTimer: null,
    starting: true,
  }
  clients.set(schoolId, client)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr && qr !== client.lastQR) {
      client.lastQR = qr
      try {
        client.lastQRDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 1 })
      } catch {
        client.lastQRDataUrl = null
      }
    }

    if (connection === 'open') {
      client.connected = true
      client.starting = false
      client.lastQR = null
      client.lastQRDataUrl = null
      const userId = sock.user?.id || null
      const phone = userId ? `+${userId.split(':')[0].split('@')[0]}` : null
      client.phoneNumber = phone
      bumpIdle(schoolId, client)

      try {
        await db.feeDemandConfig.update({
          where: { schoolId },
          data: {
            baileysConnected: true,
            baileysPhoneNumber: phone,
            baileysLastActiveAt: new Date(),
          },
        })
      } catch (err) {
        console.error('[baileys] failed to persist connected state', err)
      }
    }

    if (connection === 'close') {
      client.connected = false
      client.starting = false
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      clients.delete(schoolId)
      clearIdleTimer(client)

      if (loggedOut) {
        try {
          await db.feeDemandConfig.update({
            where: { schoolId },
            data: { baileysConnected: false },
          })
          await fs.rm(sessionDir(schoolId), { recursive: true, force: true })
        } catch (err) {
          console.error('[baileys] failed to clear logged-out session', err)
        }
      }
      // Non-logout disconnects: drop the in-memory entry; next call will respawn.
    }
  })

  return client
}

export async function connectBaileys(schoolId: string): Promise<{
  qrDataUrl: string | null
  connected: boolean
  phoneNumber: string | null
}> {
  let client = clients.get(schoolId)
  if (!client) {
    client = await createClient(schoolId)
    // Give the socket up to 1.5s to surface initial QR / open event before
    // returning, so the first call from the modal already has data.
    for (let i = 0; i < 15; i++) {
      if (client.connected || client.lastQRDataUrl) break
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  return {
    qrDataUrl: client.lastQRDataUrl,
    connected: client.connected,
    phoneNumber: client.phoneNumber,
  }
}

export async function sendBaileysMessage(args: {
  schoolId: string
  toPhoneE164: string
  body: string
}): Promise<{ messageId: string }> {
  let client = clients.get(args.schoolId)
  if (!client) {
    // Try to respawn from disk if a session is stored.
    const dir = sessionDir(args.schoolId)
    let hasCreds = false
    try {
      await fs.stat(path.join(dir, 'creds.json'))
      hasCreds = true
    } catch { /* no creds */ }

    if (!hasCreds) throw new Error('Baileys not connected. Scan QR in settings first.')

    client = await createClient(args.schoolId)
    for (let i = 0; i < 100; i++) {
      if (client.connected) break
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  if (!client.connected) {
    throw new Error('Baileys is reconnecting. Try again in a few seconds.')
  }

  const e164 = normalizePhoneE164(args.toPhoneE164)
  if (!e164) throw new Error('Invalid recipient phone number')
  const jid = `${e164.slice(1)}@s.whatsapp.net`

  const result = await client.sock.sendMessage(jid, { text: args.body })
  if (!result?.key.id) throw new Error('Baileys returned no message id')
  bumpIdle(args.schoolId, client)
  return { messageId: result.key.id }
}

export async function disconnectBaileys(schoolId: string): Promise<void> {
  await closeClient(schoolId, 'logout')
  try {
    await fs.rm(sessionDir(schoolId), { recursive: true, force: true })
  } catch { /* ignore */ }
  try {
    await db.feeDemandConfig.update({
      where: { schoolId },
      data: {
        baileysConnected: false,
        baileysPhoneNumber: null,
        baileysLastActiveAt: null,
      },
    })
  } catch { /* config may not exist */ }
}

export function getBaileysStatus(schoolId: string): {
  connected: boolean
  phoneNumber: string | null
  lastSeen: Date | null
} {
  const client = clients.get(schoolId)
  if (!client) return { connected: false, phoneNumber: null, lastSeen: null }
  return {
    connected: client.connected,
    phoneNumber: client.phoneNumber,
    lastSeen: client.lastSeen,
  }
}
