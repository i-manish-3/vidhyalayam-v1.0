import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { apiError, internalError, validationError } from '@/lib/api-errors'
import {
  getClientIp,
  getUserAgent,
  logLoginEvent,
  resetLoginFailures,
  validatePasswordStrength,
} from '@/lib/auth-security'
import { hashResetToken } from '@/lib/password-reset'

// POST /api/auth/reset-password
// Body: { token, newPassword }
// Consumes a previously-issued reset token to set a new password. On success,
// bumps the user's tokenVersion (invalidating every existing session), marks
// this token used, marks every other unused token for the user as used (so
// stockpiled requests can't be cashed in later), and clears any active lockout.

export async function POST(request: NextRequest) {
  const ipAddress = getClientIp(request)
  const userAgent = getUserAgent(request)

  try {
    const body = await request.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

    if (!token) {
      return validationError('Reset link is missing. Please use the link from your email.')
    }

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return validationError(strength.reason || 'Please choose a stronger password.')
    }

    const tokenHash = hashResetToken(token)
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            deletedAt: true,
            school: { select: { status: true } },
          },
        },
      },
    })

    // Roles allowed to consume reset tokens. Mirror the gate in forgot-password
    // so a token issued to an eligible user can't be consumed by some future
    // role change that demoted them.
    const RESET_ELIGIBLE_ROLES = new Set(['SUPER_ADMIN', 'SCHOOL_ADMIN'])

    if (!record) {
      await logLoginEvent({
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'PASSWORD_RESET_INVALID_TOKEN',
      })
      return apiError(410, 'This reset link is invalid. Please request a new one.')
    }

    if (record.usedAt) {
      await logLoginEvent({
        userId: record.userId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'PASSWORD_RESET_USED_TOKEN',
      })
      return apiError(410, 'This reset link has already been used. Please request a new one if you still need to reset your password.')
    }

    if (record.expiresAt <= new Date()) {
      await logLoginEvent({
        userId: record.userId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'PASSWORD_RESET_EXPIRED_TOKEN',
      })
      return apiError(410, 'This reset link has expired. Please request a new one.')
    }

    if (
      !record.user ||
      !RESET_ELIGIBLE_ROLES.has(record.user.role) ||
      !record.user.isActive ||
      record.user.deletedAt ||
      record.user.school?.status === 'suspended'
    ) {
      await logLoginEvent({
        userId: record.userId,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'PASSWORD_RESET_INACTIVE',
      })
      return apiError(403, 'This account is no longer eligible for password reset. Please contact support.')
    }

    const passwordHash = await hashPassword(newPassword)
    const now = new Date()

    // Single transaction: update password + bump tokenVersion + mark this
    // token used + invalidate sibling tokens. Any partial completion would
    // leave the system in a contradictory state (e.g. password changed but
    // session not invalidated, or token marked used but password not changed).
    await db.$transaction([
      db.user.update({
        where: { id: record.user.id },
        data: {
          password: passwordHash,
          tokenVersion: { increment: 1 },
          mustChangePassword: false,
        },
      }),
      db.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      }),
      db.passwordResetToken.updateMany({
        where: {
          userId: record.user.id,
          id: { not: record.id },
          usedAt: null,
        },
        data: { usedAt: now },
      }),
    ])

    // Clear any active lockout outside the transaction — best-effort, must
    // not block the reset. The user can log in immediately afterwards.
    try {
      await resetLoginFailures(record.user.id)
    } catch (lockoutErr) {
      console.error('Failed to clear lockout after password reset:', lockoutErr)
    }

    await logLoginEvent({
      userId: record.user.id,
      email: record.user.email,
      ipAddress,
      userAgent,
      success: true,
      failureReason: 'PASSWORD_RESET_SUCCESS',
    })

    return NextResponse.json({
      message: 'Password reset successful. Please log in with your new password.',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return internalError('resetting your password')
  }
}
