import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

// ============================================
// CONFIG
// ============================================

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_DURATION_MS = 10 * 60 * 1000

export const PASSWORD_MIN_LENGTH = 8

// ============================================
// REQUEST METADATA HELPERS
// ============================================

export function getClientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent')?.slice(0, 512) || 'unknown'
}

// ============================================
// ACCOUNT LOCKOUT (DB-backed)
// ============================================
// 5 wrong passwords → account locked for 10 minutes. Lock auto-expires after
// that window, or can be cleared early by a school admin (own school, non-admin
// users) or a super admin (anyone). SUPER_ADMIN role is exempt from lockout
// — the platform owner can't be locked out of their own system.

export async function isAccountLocked(userId: string): Promise<{ locked: boolean; lockedUntil?: Date }> {
  const lockout = await db.accountLockout.findUnique({ where: { userId } })
  if (!lockout?.lockedUntil) return { locked: false }
  if (lockout.lockedUntil > new Date()) {
    return { locked: true, lockedUntil: lockout.lockedUntil }
  }
  return { locked: false }
}

export async function recordLoginFailure(userId: string): Promise<{ lockedUntil?: Date }> {
  const now = new Date()
  const existing = await db.accountLockout.findUnique({ where: { userId } })
  const attempts = (existing?.failedAttempts ?? 0) + 1
  const shouldLock = attempts >= LOCKOUT_THRESHOLD
  const lockedUntil = shouldLock ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : existing?.lockedUntil ?? null

  await db.accountLockout.upsert({
    where: { userId },
    create: { userId, failedAttempts: attempts, lastFailedAt: now, lockedUntil },
    update: { failedAttempts: attempts, lastFailedAt: now, lockedUntil },
  })
  return { lockedUntil: lockedUntil ?? undefined }
}

export async function resetLoginFailures(userId: string): Promise<void> {
  await db.accountLockout.upsert({
    where: { userId },
    create: { userId, failedAttempts: 0, lockedUntil: null, lastFailedAt: null },
    update: { failedAttempts: 0, lockedUntil: null },
  })
}

// Manual unlock by an admin. Same effect as resetLoginFailures but records
// who performed the action so the audit trail isn't anonymous.
export async function manualUnlock(userId: string, performedBy: string): Promise<void> {
  const now = new Date()
  await db.accountLockout.upsert({
    where: { userId },
    create: {
      userId,
      failedAttempts: 0,
      lockedUntil: null,
      lastFailedAt: null,
      unlockedBy: performedBy,
      unlockedAt: now,
    },
    update: {
      failedAttempts: 0,
      lockedUntil: null,
      unlockedBy: performedBy,
      unlockedAt: now,
    },
  })
}

// ============================================
// LOGIN AUDIT LOG
// ============================================

export type LoginFailureReason =
  | 'BAD_PASSWORD'
  | 'USER_NOT_FOUND'
  | 'INACTIVE'
  | 'DELETED'
  | 'LOCKED'
  | 'SCHOOL_SUSPENDED'
  // Password reset events — the LoginEvent table doubles as the auth audit log.
  // REQUESTED rows have success=false plus a sub-reason in the email/userId
  // fields; SUCCESS rows have success=true and a real userId.
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_NO_USER'
  | 'PASSWORD_RESET_WRONG_ROLE'
  | 'PASSWORD_RESET_INACTIVE'
  | 'PASSWORD_RESET_RATE_LIMITED'
  | 'PASSWORD_RESET_SUCCESS'
  | 'PASSWORD_RESET_INVALID_TOKEN'
  | 'PASSWORD_RESET_EXPIRED_TOKEN'
  | 'PASSWORD_RESET_USED_TOKEN'
  // WhatsApp OTP self-service reset (TEACHER / PARENT roles).
  | 'PASSWORD_OTP_REQUESTED'
  | 'PASSWORD_OTP_NO_USER'
  | 'PASSWORD_OTP_WRONG_ROLE'
  | 'PASSWORD_OTP_INACTIVE'
  | 'PASSWORD_OTP_RATE_LIMITED'
  | 'PASSWORD_OTP_NO_PROVIDER'
  | 'PASSWORD_OTP_SEND_FAILED'
  | 'PASSWORD_OTP_INVALID'
  | 'PASSWORD_OTP_EXPIRED'
  | 'PASSWORD_OTP_LOCKED'
  | 'PASSWORD_OTP_SUCCESS'
  // Admin-initiated reset (school admin resets a non-admin's password from UI).
  | 'ADMIN_PASSWORD_RESET_SUCCESS'

interface LoginEventInput {
  userId?: string | null
  email?: string | null
  schoolId?: string | null
  ipAddress: string
  userAgent: string
  success: boolean
  failureReason?: LoginFailureReason
}

export async function logLoginEvent(input: LoginEventInput): Promise<void> {
  try {
    await db.loginEvent.create({
      data: {
        userId: input.userId ?? null,
        email: input.email ?? null,
        schoolId: input.schoolId ?? null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        success: input.success,
        failureReason: input.failureReason ?? null,
      },
    })
  } catch (err) {
    console.error('Failed to log login event:', err)
  }
}

// ============================================
// PASSWORD VALIDATION
// ============================================

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (typeof password !== 'string') return { valid: false, reason: 'Password is required.' }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.` }
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password must be no more than 128 characters long.' }
  }
  return { valid: true }
}
