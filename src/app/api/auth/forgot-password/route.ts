import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { internalError } from '@/lib/api-errors'
import {
  getClientIp,
  getUserAgent,
  logLoginEvent,
  type LoginFailureReason,
} from '@/lib/auth-security'
import {
  generateResetToken,
  hashResetToken,
  countRecentRequestsForIp,
  countRecentRequestsForUser,
  RESET_TOKEN_TTL_MS,
  MAX_REQUESTS_PER_IP_PER_HOUR,
  MAX_REQUESTS_PER_USER_PER_HOUR,
} from '@/lib/password-reset'
import { sendPasswordResetEmail } from '@/lib/email/send'

// Always returns 200 with the same generic message regardless of outcome,
// to prevent attackers from probing which emails belong to eligible accounts.
// The real branching (issue token + send email vs. silently log) happens
// server-side and is recorded in LoginEvent for audit/monitoring.
const GENERIC_RESPONSE = {
  message:
    'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.',
}

// Roles allowed to self-serve reset via email. Students/parents/teachers are
// intentionally excluded for now — many use synthetic emails (@parent.local)
// or don't have a real inbox on file. They'll get an SMS/WhatsApp channel
// later. Admins are the only roles guaranteed to have a real inbox.
const RESET_ELIGIBLE_ROLES = new Set(['SUPER_ADMIN', 'SCHOOL_ADMIN'])

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  const userAgent = getUserAgent(request)

  try {
    const body = await request.json().catch(() => ({}))
    const emailRaw = body?.email
    const email = typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : ''

    // Minimum sanity check on the input shape — but we still respond 200
    // with the generic message for empty input to avoid leaking validation
    // logic to an attacker probing the endpoint.
    if (!email || !email.includes('@')) {
      return NextResponse.json(GENERIC_RESPONSE)
    }

    // Per-IP rate limit. Checked before user lookup so an attacker can't
    // amplify lookups against the user table.
    const ipCount = await countRecentRequestsForIp(ipAddress)
    if (ipCount >= MAX_REQUESTS_PER_IP_PER_HOUR) {
      await logLoginEvent({
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'PASSWORD_RESET_RATE_LIMITED' satisfies LoginFailureReason,
      })
      return NextResponse.json(GENERIC_RESPONSE)
    }

    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        deletedAt: true,
        school: {
          select: {
            name: true,
            status: true,
          },
        },
      },
    })

    // Eligible roles: SUPER_ADMIN + SCHOOL_ADMIN. Other roles silently no-op
    // until SMS/WhatsApp channels are wired up. School admins whose school is
    // suspended are also blocked — they should contact the platform owner.
    const eligible =
      !!user &&
      RESET_ELIGIBLE_ROLES.has(user.role) &&
      user.isActive &&
      !user.deletedAt &&
      user.school?.status !== 'suspended'

    if (!eligible) {
      const reason: LoginFailureReason = !user
        ? 'PASSWORD_RESET_NO_USER'
        : user.deletedAt
          ? 'PASSWORD_RESET_NO_USER'
          : !user.isActive
            ? 'PASSWORD_RESET_INACTIVE'
            : !RESET_ELIGIBLE_ROLES.has(user.role)
              ? 'PASSWORD_RESET_WRONG_ROLE'
              : 'PASSWORD_RESET_INACTIVE'

      await logLoginEvent({
        userId: user?.id ?? null,
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: reason,
      })
      return NextResponse.json(GENERIC_RESPONSE)
    }

    // Per-user rate limit. Same 200 response, recorded for monitoring.
    const userCount = await countRecentRequestsForUser(user.id)
    if (userCount >= MAX_REQUESTS_PER_USER_PER_HOUR) {
      await logLoginEvent({
        userId: user.id,
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'PASSWORD_RESET_RATE_LIMITED',
      })
      return NextResponse.json(GENERIC_RESPONSE)
    }

    // All checks pass — issue a token.
    const token = generateResetToken()
    const tokenHash = hashResetToken(token)
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: ipAddress,
        requestedUa: userAgent,
      },
    })

    const baseUrl =
      process.env.PUBLIC_APP_URL ||
      request.headers.get('origin') ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password/${encodeURIComponent(token)}`

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetUrl,
        ip: ipAddress,
        userAgent,
        expiresAt,
        role: user.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SCHOOL_ADMIN',
        schoolName: user.school?.name ?? null,
      })
    } catch (mailErr) {
      // Don't reveal email failures to the caller — log server-side. The
      // token row still exists; the user can retry or an admin can read the
      // dev-fallback log.
      console.error('Password reset email send failed:', mailErr)
    }

    await logLoginEvent({
      userId: user.id,
      email: user.email,
      ipAddress,
      userAgent,
      success: false,
      failureReason: 'PASSWORD_RESET_REQUESTED',
    })

    return NextResponse.json(GENERIC_RESPONSE)
  } catch (error) {
    console.error('Forgot password error:', error)
    return internalError('processing your password reset request')
  }
}
