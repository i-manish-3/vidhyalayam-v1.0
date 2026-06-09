import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/api-auth'
import {
  subscribe,
  userChannel,
  schoolChannel,
  roleChannel,
  SYSTEM_CHANNEL,
  type RealtimePayload,
} from '@/lib/notifications/realtime'

// ioredis + long-lived stream require the Node.js runtime (not Edge), and the
// response must never be statically cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KEEPALIVE_MS = parseInt(process.env.NOTIFICATION_SSE_KEEPALIVE_MS || '25000')

// GET /api/school/notifications/stream — Server-Sent Events.
// Channels are derived ONLY from the authenticated JWT, so a client can never
// subscribe to another user's or another tenant's stream.
export async function GET(request: NextRequest) {
  const user = getAuthUser(request)
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const channels: string[] = [userChannel(user.userId)]
  if (user.role === 'SUPER_ADMIN') {
    channels.push(SYSTEM_CHANNEL)
  }
  if (user.schoolId) {
    channels.push(schoolChannel(user.schoolId))
    channels.push(roleChannel(user.schoolId, user.role))
  }

  const encoder = new TextEncoder()
  let unsubscribe: (() => Promise<void>) | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          /* controller already closed */
        }
      }

      // Initial handshake so the client's onopen fires promptly.
      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`)

      unsubscribe = await subscribe(channels, (_channel: string, payload: RealtimePayload) => {
        safeEnqueue(`event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`)
      })

      keepalive = setInterval(() => safeEnqueue(`: keepalive\n\n`), KEEPALIVE_MS)

      const cleanup = async () => {
        if (closed) return
        closed = true
        if (keepalive) clearInterval(keepalive)
        if (unsubscribe) await unsubscribe().catch(() => {})
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      request.signal.addEventListener('abort', () => {
        void cleanup()
      })
    },
    async cancel() {
      closed = true
      if (keepalive) clearInterval(keepalive)
      if (unsubscribe) await unsubscribe().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
