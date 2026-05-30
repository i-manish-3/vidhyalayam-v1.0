import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, generateAccessToken, generateRefreshToken } from '@/lib/auth'
import { setAuthCookies } from '@/lib/cookies'
import { internalError, apiError } from '@/lib/api-errors'
import {
  getClientIp,
  getUserAgent,
  isAccountLocked,
  recordLoginFailure,
  resetLoginFailures,
  logLoginEvent,
} from '@/lib/auth-security'

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  const userAgent = getUserAgent(request)

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return apiError(400, 'Please enter your email or phone number and password to log in.')
    }

    const identifier = String(email).trim()

    // Check if the identifier is a phone number (10+ digits)
    const isPhone = /^\d{10,}$/.test(identifier.replace(/\D/g, ''))

    // Find user by email or phone
    let user
    const userInclude = {
      school: true,
      userRoles: { select: { role: { select: { name: true } } } },
    } as const

    if (isPhone) {
      const phone = identifier.replace(/\D/g, '').slice(-10) // Last 10 digits
      user = await db.user.findFirst({
        where: { phone, isActive: true, deletedAt: null },
        include: userInclude,
      })
      // Also try finding by email with phone pattern (for parent accounts)
      if (!user) {
        user = await db.user.findFirst({
          where: { email: { endsWith: `@parent.local` }, phone, isActive: true, deletedAt: null },
          include: userInclude,
        })
      }
    } else {
      user = await db.user.findUnique({
        where: { email: identifier },
        include: userInclude,
      })
    }

    if (!user) {
      await logLoginEvent({
        email: identifier,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'USER_NOT_FOUND',
      })
      return apiError(401, 'No account found with this email or phone number. Please check and try again, or contact your school administrator.')
    }

    if (!user.isActive) {
      await logLoginEvent({
        userId: user.id,
        email: user.email,
        schoolId: user.schoolId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'INACTIVE',
      })
      return apiError(403, 'Your account has been deactivated by your school administrator. Please contact them to reactivate your account.')
    }

    if (user.deletedAt) {
      await logLoginEvent({
        userId: user.id,
        email: user.email,
        schoolId: user.schoolId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'DELETED',
      })
      return apiError(403, 'This account no longer exists. Please contact your school administrator for assistance.')
    }

    // School suspension check — if the user belongs to a school and that school
    // is suspended by a super admin, refuse login until it's reactivated.
    // SUPER_ADMIN has no schoolId so user.school is null and this check is skipped.
    if (user.school?.status === 'suspended') {
      await logLoginEvent({
        userId: user.id,
        email: user.email,
        schoolId: user.schoolId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'SCHOOL_SUSPENDED',
      })
      return apiError(403, 'Your school is currently suspended. Please contact the platform administrator to restore access.')
    }

    // Account lockout check — SUPER_ADMIN is the only role exempt from lockout
    // (the platform owner can't be locked out of their own system). For every
    // other role, an active DB lockout blocks login until it expires or an
    // admin manually unlocks the account.
    if (user.role !== 'SUPER_ADMIN') {
      const lockStatus = await isAccountLocked(user.id)
      if (lockStatus.locked) {
        await logLoginEvent({
          userId: user.id,
          email: user.email,
          schoolId: user.schoolId,
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'LOCKED',
        })
        const retryAfterSec = lockStatus.lockedUntil
          ? Math.max(0, Math.ceil((lockStatus.lockedUntil.getTime() - Date.now()) / 1000))
          : 600
        return NextResponse.json(
          { error: 'Your account is temporarily locked due to too many failed login attempts. Please try again later or contact your school administrator.' },
          { status: 423, headers: { 'Retry-After': String(retryAfterSec) } },
        )
      }
    }

    const isValid = await verifyPassword(password, user.password)
    if (!isValid) {
      // Don't track failures for SUPER_ADMIN — they're exempt from lockout, so
      // recording attempts would just bloat the AccountLockout row pointlessly.
      const failure = user.role !== 'SUPER_ADMIN'
        ? await recordLoginFailure(user.id)
        : { lockedUntil: undefined }
      await logLoginEvent({
        userId: user.id,
        email: user.email,
        schoolId: user.schoolId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'BAD_PASSWORD',
      })
      if (failure.lockedUntil) {
        const retryAfterSec = Math.max(0, Math.ceil((failure.lockedUntil.getTime() - Date.now()) / 1000))
        return NextResponse.json(
          { error: 'Your account has been locked due to too many failed login attempts. Please try again later or contact your school administrator.' },
          { status: 423, headers: { 'Retry-After': String(retryAfterSec) } },
        )
      }
      return apiError(401, 'The password you entered is incorrect. Please try again.')
    }

    // Success — reset failure counter, update lastLoginAt, audit log, issue token.
    if (user.role !== 'SUPER_ADMIN') {
      await resetLoginFailures(user.id)
    }
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    await logLoginEvent({
      userId: user.id,
      email: user.email,
      schoolId: user.schoolId,
      ipAddress,
      userAgent,
      success: true,
    })

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId || undefined,
      tv: user.tokenVersion,
    })
    const refreshToken = generateRefreshToken(user.id, user.tokenVersion)

    // Tokens go in HttpOnly cookies, not the JSON body — client JavaScript
    // never sees the raw JWT. Subsequent API calls auto-include the cookie
    // because the fetch wrapper uses `credentials: 'include'`.
    const response = NextResponse.json({
      user: {
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
              subdomain: user.school.subdomain,
              primaryColor: user.school.primaryColor,
              academicYear: user.school.academicYear,
            }
          : null,
      },
    })
    setAuthCookies(response, accessToken, refreshToken)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return internalError('logging you in')
  }
}
