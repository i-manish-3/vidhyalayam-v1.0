import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

// AES-256-GCM token encryption used by FeeDemandConfig (Meta WhatsApp tokens,
// Baileys session blobs). Key comes from TOKEN_ENCRYPTION_KEY (64 hex chars).
//
// Output format: base64( iv(12) | authTag(16) | ciphertext )
//   - random 12-byte IV per call (GCM-recommended size)
//   - 16-byte auth tag prevents tampering
//   - single concatenated base64 string for easy DB storage
//
// Round-trip example:
//   const enc = encryptToken('EAAB...meta-access-token...')
//   const dec = decryptToken(enc)  // === original
//   const ui  = maskToken('EAAB...meta-access-token...') // 'EAAB…oken'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN_HEX = 64 // 32 bytes = 64 hex chars

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw || raw.length !== KEY_LEN_HEX) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY missing or invalid — set a 64-char hex string in .env (generate with: openssl rand -hex 32)',
    )
  }
  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters')
  }
  cachedKey = Buffer.from(raw, 'hex')
  return cachedKey
}

export function encryptToken(plain: string): string {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('encryptToken requires a non-empty string')
  }
  const key = loadKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptToken(encoded: string): string {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('decryptToken requires a non-empty string')
  }
  const key = loadKey()
  const buf = Buffer.from(encoded, 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decryptToken: ciphertext too short or corrupted')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(ct), decipher.final()])
  return dec.toString('utf8')
}

// Returns a UI-safe preview like "EAAB…oken" — first 4 + last 4 chars.
// Short tokens (≤ 8 chars) are fully masked.
export function maskToken(plain: string): string {
  if (!plain) return ''
  if (plain.length <= 8) return '••••••••'
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`
}
