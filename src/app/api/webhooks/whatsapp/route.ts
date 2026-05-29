import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Meta webhook for WhatsApp delivery / read receipts.
//
// GET  — Meta's subscription verification handshake (echo hub.challenge if
//        the verify_token matches what we configured in Meta Developer App).
// POST — Live event delivery. Validates the x-hub-signature-256 HMAC against
//        META_APP_SECRET, then maps statuses[].status onto FeeNotification.

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
}

export async function GET(request: NextRequest) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
  if (!verifyToken) {
    return new NextResponse('Webhook verify token not configured', { status: 503 })
  }
  const sp = request.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return new NextResponse('forbidden', { status: 403 })
}

function safeEqualHex(expected: string, actual: string) {
  try {
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(actual, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface MetaStatus {
  id?: string
  status?: string
  errors?: Array<{ title?: string; message?: string }>
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: MetaStatus[]
      }
    }>
  }>
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    // In production, a missing secret is a misconfig — fail loud so we notice
    // (and Meta retries). In dev/local we keep the soft 200 so a half-set-up
    // env doesn't spam errors during onboarding.
    if (process.env.NODE_ENV === 'production') {
      console.error('[whatsapp-webhook] META_APP_SECRET missing in production')
      return new NextResponse('webhook not configured', { status: 503 })
    }
    console.warn('[whatsapp-webhook] META_APP_SECRET missing — skipping (non-prod)')
    return NextResponse.json({ ok: true, skipped: true })
  }

  const raw = await request.text()
  const sigHeader = request.headers.get('x-hub-signature-256') || ''
  const provided = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : ''
  const expected = crypto.createHmac('sha256', appSecret).update(raw).digest('hex')
  if (!provided || !safeEqualHex(expected, provided)) {
    return new NextResponse('invalid signature', { status: 401 })
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        const statuses = change.value?.statuses || []
        for (const s of statuses) {
          if (!s.id || !s.status) continue
          // We track sent locally; Meta also re-emits sent. Skip it.
          if (s.status === 'sent') continue

          const newStatus = s.status === 'delivered' ? 'delivered'
            : s.status === 'read' ? 'read'
            : s.status === 'failed' ? 'failed'
            : null
          if (!newStatus) continue

          const rank = STATUS_RANK[newStatus]
          // Idempotent precedence: only move forward, except failed always wins.
          const existing = await db.feeNotification.findFirst({
            where: { providerMsgId: s.id },
            select: { id: true, status: true },
          })
          if (!existing) continue
          const currentRank = STATUS_RANK[existing.status] ?? 0
          if (newStatus !== 'failed' && rank <= currentRank) continue

          const errMessage = newStatus === 'failed'
            ? (s.errors?.[0]?.message || s.errors?.[0]?.title || 'Delivery failed')
            : null

          await db.feeNotification.update({
            where: { id: existing.id },
            data: {
              status: newStatus,
              ...(newStatus === 'delivered' ? { deliveredAt: new Date() } : {}),
              ...(newStatus === 'read' ? { readAt: new Date() } : {}),
              ...(errMessage ? { errorMessage: errMessage } : {}),
            },
          })
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] processing error', err)
  }

  // Always 200 so Meta doesn't retry a transient DB hiccup forever.
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
