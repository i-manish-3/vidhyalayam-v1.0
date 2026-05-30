import { randomBytes, createHash } from 'node:crypto'
import { db } from '@/lib/db'

// ============================================
// CONFIG
// ============================================

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
export const MAX_REQUESTS_PER_USER_PER_HOUR = 3
export const MAX_REQUESTS_PER_IP_PER_HOUR = 5

// ============================================
// TOKEN GENERATION / HASHING
// ============================================

// 32 bytes = 256 bits of entropy. base64url avoids '+' and '/' which would
// break round-tripping through URLs without encoding.
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ============================================
// RATE LIMITING
// ============================================

export async function countRecentRequestsForUser(userId: string): Promise<number> {
  return db.passwordResetToken.count({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  })
}

export async function countRecentRequestsForIp(ip: string): Promise<number> {
  return db.passwordResetToken.count({
    where: {
      requestedIp: ip,
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  })
}

// ============================================
// HELPERS
// ============================================

// Mask an email for display in the verify response — gives the user enough
// hint to confirm they're resetting the right account without exposing the
// full address to anyone who happens to land on the link.
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`
}
