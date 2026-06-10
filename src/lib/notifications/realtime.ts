import Redis from 'ioredis'
import { EventEmitter } from 'node:events'

/**
 * Real-time notification bus.
 *
 * Transport selection is automatic:
 *  - If REDIS_HOST (or USE_QUEUE) is configured, events are published over
 *    Redis Pub/Sub so they fan out across every app instance + the worker.
 *  - Otherwise we fall back to an in-process EventEmitter so single-instance
 *    dev still gets live SSE updates with zero infrastructure.
 *
 * The SSE route subscribes to channels derived from the AUTHENTICATED user
 * (never from client input), so cross-tenant / cross-user subscription is
 * impossible. See src/app/api/school/notifications/stream/route.ts.
 */

export type RealtimeEvent =
  | 'notification:new'
  | 'notification:unread_count'
  | 'notification:read'
  | 'announcement:new'
  | 'notification:bulk_progress'
  | 'notification:bulk_completed'
  // Platform-wide ops banners (SUPER_ADMIN → everyone) on PLATFORM_CHANNEL.
  | 'platform:announcement'

export interface RealtimePayload {
  event: RealtimeEvent
  data: unknown
}

export type RealtimeHandler = (channel: string, payload: RealtimePayload) => void

// --- Channel naming (server-derived only) ---
export function userChannel(userId: string): string {
  return `notif:user:${userId}`
}
export function schoolChannel(schoolId: string): string {
  return `notif:school:${schoolId}`
}
export function roleChannel(schoolId: string, role: string): string {
  return `notif:role:${schoolId}:${role}`
}
// System-wide channel for SUPER_ADMIN only (schoolId = null notifications).
// NOTE: not every session subscribes here — keep tenant-scoped payloads off it.
export const SYSTEM_CHANNEL = 'notif:system'
// Platform broadcast channel — EVERY authenticated session subscribes. Only ever
// carries platform-public ops banners (no tenant/user-scoped data).
export const PLATFORM_CHANNEL = 'notif:platform'

function redisEnabled(): boolean {
  return Boolean(process.env.REDIS_HOST || process.env.USE_QUEUE)
}

// --- Lazy singletons (publisher + local emitter) ---
const globalForBus = globalThis as unknown as {
  __notifPublisher?: Redis
  __notifEmitter?: EventEmitter
}

function getPublisher(): Redis | null {
  if (!redisEnabled()) return null
  if (!globalForBus.__notifPublisher) {
    globalForBus.__notifPublisher = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
      lazyConnect: false,
    })
    globalForBus.__notifPublisher.on('error', (err) => {
      console.error('[notif-bus] publisher error:', err?.message)
    })
  }
  return globalForBus.__notifPublisher
}

function getEmitter(): EventEmitter {
  if (!globalForBus.__notifEmitter) {
    const emitter = new EventEmitter()
    // Many concurrent SSE connections subscribe; lift the default cap.
    emitter.setMaxListeners(0)
    globalForBus.__notifEmitter = emitter
  }
  return globalForBus.__notifEmitter
}

/**
 * Publish an event to one or more channels. Fire-and-forget: failures are
 * logged but never thrown into the caller (notifications must never break a
 * core flow).
 */
export async function publish(channels: string[], payload: RealtimePayload): Promise<void> {
  if (channels.length === 0) return
  const message = JSON.stringify(payload)
  try {
    const pub = getPublisher()
    if (pub) {
      await Promise.all(channels.map((c) => pub.publish(c, message)))
    } else {
      const emitter = getEmitter()
      for (const c of channels) emitter.emit(c, message)
    }
  } catch (err) {
    console.error('[notif-bus] publish failed:', err instanceof Error ? err.message : err)
  }
}

/**
 * Subscribe to channels. Returns an async unsubscribe function. Each SSE
 * connection gets its own dedicated Redis subscriber (a connection in
 * subscribe mode cannot issue normal commands).
 */
export async function subscribe(channels: string[], handler: RealtimeHandler): Promise<() => Promise<void>> {
  if (redisEnabled()) {
    const sub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    })
    sub.on('error', (err) => console.error('[notif-bus] subscriber error:', err?.message))
    sub.on('message', (channel: string, message: string) => {
      try {
        handler(channel, JSON.parse(message) as RealtimePayload)
      } catch {
        /* ignore malformed payloads */
      }
    })
    if (channels.length) await sub.subscribe(...channels)
    return async () => {
      try {
        await sub.unsubscribe()
      } finally {
        sub.disconnect()
      }
    }
  }

  // In-process fallback.
  const emitter = getEmitter()
  const listeners = channels.map((channel) => {
    const listener = (message: string) => {
      try {
        handler(channel, JSON.parse(message) as RealtimePayload)
      } catch {
        /* ignore */
      }
    }
    emitter.on(channel, listener)
    return { channel, listener }
  })
  return async () => {
    for (const { channel, listener } of listeners) emitter.off(channel, listener)
  }
}

// --- Convenience publishers used by the service + worker ---
export function publishToUser(userId: string, payload: RealtimePayload): Promise<void> {
  return publish([userChannel(userId)], payload)
}
export function publishToSchool(schoolId: string, payload: RealtimePayload): Promise<void> {
  return publish([schoolChannel(schoolId)], payload)
}
export function publishToRole(schoolId: string, role: string, payload: RealtimePayload): Promise<void> {
  return publish([roleChannel(schoolId, role)], payload)
}
// Fan a platform-wide event out to every connected session (all users subscribe
// to PLATFORM_CHANNEL via the SSE route). Used for platform broadcast banners.
// Kept distinct from SYSTEM_CHANNEL so SUPER_ADMIN-only system notifications
// never reach ordinary tenant users.
export function publishToPlatform(payload: RealtimePayload): Promise<void> {
  return publish([PLATFORM_CHANNEL], payload)
}
