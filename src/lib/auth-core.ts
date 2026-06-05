// Shared, transport-agnostic auth logic for both the web (cookie-based) and the
// mobile (bearer-token) login/refresh endpoints.
//
// The web routes (/api/auth/login, /api/auth/refresh) put the resulting tokens
// in HttpOnly cookies; the mobile routes (/api/mobile/auth/*) return them in the
// JSON body. Everything BEFORE that transport decision — credential checks,
// account lockout, login auditing, the sliding-session refresh, token version
// invalidation — is identical and lives here so the two surfaces can never
// drift apart on security-critical behaviour.

import { db } from '@/lib/db'
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '@/lib/auth'
import {
  isAccountLocked,
  recordLoginFailure,
  resetLoginFailures,
  logLoginEvent,
} from '@/lib/auth-security'

// Prisma user shape used by login (school + first assigned custom role name).
const LOGIN_USER_INCLUDE = {
  school: true,
  userRoles: { select: { role: { select: { name: true } } } },
} as const

type LoginUser = Awaited<ReturnType<typeof findLoginUser>>

async function findLoginUser(identifier: string) {
  // A 10+ digit identifier is treated as a phone number (parent/student logins
  // commonly use phone). Everything else is looked up by email.
  const isPhone = /^\d{10,}$/.test(identifier.replace(/\D/g, ''))

  if (isPhone) {
    const phone = identifier.replace(/\D/g, '').slice(-10)
    const byPhone = await db.user.findFirst({
      where: { phone, isActive: true, deletedAt: null },
      include: LOGIN_USER_INCLUDE,
    })
    if (byPhone) return byPhone
    // Parent accounts are stored with a synthetic @parent.local email + phone.
    return db.user.findFirst({
      where: { email: { endsWith: '@parent.local' }, phone, isActive: true, deletedAt: null },
      include: LOGIN_USER_INCLUDE,
    })
  }

  return db.user.findUnique({
    where: { email: identifier },
    include: LOGIN_USER_INCLUDE,
  })
}

export interface AuthFailure {
  ok: false
  status: number
  message: string
  // Present only for lockout (HTTP 423) so the caller can attach Retry-After.
  retryAfterSec?: number
  failureReason?: string
}

export type AuthCredentialsResult =
  | { ok: true; user: NonNullable<LoginUser> }
  | AuthFailure

export interface AuthContext {
  ipAddress: string
  userAgent: string
}

/**
 * Validate a login identifier + password and run all account-state and lockout
 * checks. On success it also resets the failure counter, stamps lastLoginAt,
 * and writes a success audit event — i.e. the caller only needs to issue tokens.
 *
 * Mirrors (and is the shared source of truth for) the logic previously inlined
 * in /api/auth/login. Returns a discriminated result instead of an HTTP
 * response so cookie and bearer callers can shape the transport themselves.
 */
export async function authenticateCredentials(
  identifier: string,
  password: string,
  ctx: AuthContext,
): Promise<AuthCredentialsResult> {
  const user = await findLoginUser(identifier)

  if (!user) {
    await logLoginEvent({
      email: identifier,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      success: false,
      failureReason: 'USER_NOT_FOUND',
    })
    return {
      ok: false,
      status: 401,
      message: 'No account found with this email or phone number. Please check and try again, or contact your school administrator.',
      failureReason: 'USER_NOT_FOUND',
    }
  }

  if (!user.isActive) {
    await logLoginEvent({
      userId: user.id, email: user.email, schoolId: user.schoolId,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      success: false, failureReason: 'INACTIVE',
    })
    return {
      ok: false,
      status: 403,
      message: 'Your account has been deactivated by your school administrator. Please contact them to reactivate your account.',
      failureReason: 'INACTIVE',
    }
  }

  if (user.deletedAt) {
    await logLoginEvent({
      userId: user.id, email: user.email, schoolId: user.schoolId,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      success: false, failureReason: 'DELETED',
    })
    return {
      ok: false,
      status: 403,
      message: 'This account no longer exists. Please contact your school administrator for assistance.',
      failureReason: 'DELETED',
    }
  }

  // School suspension — SUPER_ADMIN has no school so this is skipped for them.
  if (user.school?.status === 'suspended') {
    await logLoginEvent({
      userId: user.id, email: user.email, schoolId: user.schoolId,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      success: false, failureReason: 'SCHOOL_SUSPENDED',
    })
    return {
      ok: false,
      status: 403,
      message: 'Your school is currently suspended. Please contact the platform administrator to restore access.',
      failureReason: 'SCHOOL_SUSPENDED',
    }
  }

  // Account lockout — SUPER_ADMIN is exempt (can't be locked out of their own
  // platform). Everyone else is blocked while a DB lockout is active.
  if (user.role !== 'SUPER_ADMIN') {
    const lockStatus = await isAccountLocked(user.id)
    if (lockStatus.locked) {
      await logLoginEvent({
        userId: user.id, email: user.email, schoolId: user.schoolId,
        ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
        success: false, failureReason: 'LOCKED',
      })
      const retryAfterSec = lockStatus.lockedUntil
        ? Math.max(0, Math.ceil((lockStatus.lockedUntil.getTime() - Date.now()) / 1000))
        : 600
      return {
        ok: false,
        status: 423,
        message: 'Your account is temporarily locked due to too many failed login attempts. Please try again later or contact your school administrator.',
        retryAfterSec,
        failureReason: 'LOCKED',
      }
    }
  }

  const isValid = await verifyPassword(password, user.password)
  if (!isValid) {
    const failure = user.role !== 'SUPER_ADMIN'
      ? await recordLoginFailure(user.id)
      : { lockedUntil: undefined }
    await logLoginEvent({
      userId: user.id, email: user.email, schoolId: user.schoolId,
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      success: false, failureReason: 'BAD_PASSWORD',
    })
    if (failure.lockedUntil) {
      const retryAfterSec = Math.max(0, Math.ceil((failure.lockedUntil.getTime() - Date.now()) / 1000))
      return {
        ok: false,
        status: 423,
        message: 'Your account has been locked due to too many failed login attempts. Please try again later or contact your school administrator.',
        retryAfterSec,
        failureReason: 'BAD_PASSWORD',
      }
    }
    return {
      ok: false,
      status: 401,
      message: 'The password you entered is incorrect. Please try again.',
      failureReason: 'BAD_PASSWORD',
    }
  }

  // Success — reset failures, stamp lastLoginAt, audit.
  if (user.role !== 'SUPER_ADMIN') {
    await resetLoginFailures(user.id)
  }
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })
  await logLoginEvent({
    userId: user.id, email: user.email, schoolId: user.schoolId,
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    success: true,
  })

  return { ok: true, user }
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Issue a fresh access + refresh token pair for a just-authenticated user.
 * A fresh login carries no impersonation context.
 */
export function issueTokensForLogin(user: NonNullable<LoginUser>): AuthTokens {
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId || undefined,
    tv: user.tokenVersion,
  })
  const refreshToken = generateRefreshToken(user.id, user.tokenVersion)
  return { accessToken, refreshToken }
}

/**
 * The public user object returned to clients on login. Identical shape for web
 * and mobile so a single client model works against both surfaces.
 */
export function toAuthUserJson(user: NonNullable<LoginUser>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    avatar: user.avatar,
    mustChangePassword: user.mustChangePassword,
    schoolId: user.schoolId,
    assignedRoleName: user.userRoles[0]?.role.name ?? null,
    school: user.school
      ? {
          id: user.school.id,
          name: user.school.name,
          logo: user.school.logo,
          status: user.school.status,
          primaryColor: user.school.primaryColor,
          academicYear: user.school.academicYear,
        }
      : null,
  }
}

export type RefreshResult =
  | { ok: true; tokens: AuthTokens }
  | { ok: false; status: number; message: string }

/**
 * Sliding-session refresh, shared by the cookie and bearer refresh endpoints.
 * Re-verifies the user against the DB (disabled/deleted/suspended users stop
 * getting new tokens) and enforces token-version invalidation (e.g. after a
 * password reset). Re-issues BOTH tokens so an active session never expires.
 *
 * Callers handle transport: the web route clears its cookies on failure; the
 * mobile route just relays the failure. Both treat failure as "log in again".
 */
export async function refreshSession(refreshToken: string | undefined | null): Promise<RefreshResult> {
  if (!refreshToken) {
    return { ok: false, status: 401, message: 'No refresh token. Please log in again.' }
  }

  const payload = verifyRefreshToken(refreshToken)
  if (!payload) {
    return { ok: false, status: 401, message: 'Your session has expired. Please log in again.' }
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      role: true,
      schoolId: true,
      impersonatingSchoolId: true,
      isActive: true,
      deletedAt: true,
      tokenVersion: true,
      school: { select: { status: true } },
    },
  })

  if (!user || !user.isActive || user.deletedAt) {
    return { ok: false, status: 401, message: 'Your account is no longer active. Please contact your school administrator.' }
  }

  if (user.school?.status === 'suspended') {
    return { ok: false, status: 401, message: 'Your school is currently suspended. Please contact the platform administrator to restore access.' }
  }

  // Refresh tokens predating the `tv` field carry undefined → treat as 0.
  const tokenTv = payload.tv ?? 0
  if (tokenTv !== user.tokenVersion) {
    return { ok: false, status: 401, message: 'Your session has been invalidated. Please log in again.' }
  }

  const effectiveSchoolId = user.impersonatingSchoolId || user.schoolId || undefined
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: effectiveSchoolId,
    tv: user.tokenVersion,
    ...(user.impersonatingSchoolId ? { impersonatingSchoolId: user.impersonatingSchoolId } : {}),
  })
  const newRefresh = generateRefreshToken(user.id, user.tokenVersion)

  return { ok: true, tokens: { accessToken, refreshToken: newRefresh } }
}
