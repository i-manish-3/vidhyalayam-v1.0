import Redis from 'ioredis'

/**
 * Per-user daily message cap for the chatbot. Backed by Redis when configured
 * (so it works across app instances), with an in-process fallback for single
 * instance dev. Prevents runaway Anthropic API cost / abuse.
 */

const DAILY_LIMIT = parseInt(process.env.CHATBOT_DAILY_LIMIT || '100')

const globalForRl = globalThis as unknown as {
  __chatbotRedis?: Redis | null
  __chatbotMem?: Map<string, { count: number; resetAt: number }>
}

function redisEnabled(): boolean {
  return Boolean(process.env.REDIS_HOST || process.env.USE_QUEUE)
}

function getRedis(): Redis | null {
  if (!redisEnabled()) return null
  if (globalForRl.__chatbotRedis === undefined) {
    try {
      globalForRl.__chatbotRedis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null,
        lazyConnect: false,
      })
    } catch {
      globalForRl.__chatbotRedis = null
    }
  }
  return globalForRl.__chatbotRedis ?? null
}

function memStore(): Map<string, { count: number; resetAt: number }> {
  if (!globalForRl.__chatbotMem) globalForRl.__chatbotMem = new Map()
  return globalForRl.__chatbotMem
}

// Day bucket key (UTC date). Passed in to stay deterministic/testable.
function dayKey(userId: string, todayIso: string): string {
  return `chatbot:rl:${userId}:${todayIso}`
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
}

/**
 * Consume one unit of the caller's daily quota. Returns whether the request is
 * allowed and how many remain. Fails OPEN on store errors (never blocks a user
 * because Redis hiccuped) but still counts in memory.
 */
export async function consumeChatQuota(userId: string, now: Date = new Date()): Promise<RateLimitResult> {
  const todayIso = now.toISOString().slice(0, 10)
  const key = dayKey(userId, todayIso)
  const redis = getRedis()

  if (redis) {
    try {
      const count = await redis.incr(key)
      if (count === 1) {
        // Expire at end of day (+buffer). 26h covers timezone slack.
        await redis.expire(key, 26 * 60 * 60)
      }
      return { allowed: count <= DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - count), limit: DAILY_LIMIT }
    } catch {
      // fall through to memory
    }
  }

  const store = memStore()
  const endOfDay = new Date(now)
  endOfDay.setUTCHours(23, 59, 59, 999)
  const entry = store.get(key)
  if (!entry || entry.resetAt < now.getTime()) {
    store.set(key, { count: 1, resetAt: endOfDay.getTime() })
    return { allowed: true, remaining: DAILY_LIMIT - 1, limit: DAILY_LIMIT }
  }
  entry.count += 1
  return { allowed: entry.count <= DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - entry.count), limit: DAILY_LIMIT }
}
