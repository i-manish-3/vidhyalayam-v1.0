import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import {
  unauthorizedError,
  notFoundError,
  apiError,
  validationError,
  internalError,
} from '@/lib/api-errors'
import {
  getClientIp,
  getUserAgent,
  logLoginEvent,
  resetLoginFailures,
  validatePasswordStrength,
} from '@/lib/auth-security'

// POST /api/school/users/[id]/reset-password
// SCHOOL_ADMIN can directly reset the password of any non-admin user in their
// own school. The reset:
//   • updates the password
//   • bumps tokenVersion (invalidates every active session)
//   • marks any in-flight reset tokens used (so a separate forgot-password flow
//     in progress can't be cashed in afterwards)
//   • forces mustChangePassword=true so the temp password the admin set can't
//     linger — the user is required to change it on next login
//   • clears any active lockout so the user can log in immediately
//   • logs an audit row to the LoginEvent table
//
// Peer-admin (SCHOOL_ADMIN / SUPER_ADMIN) targets are forbidden — that path
// requires SUPER_ADMIN.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const requester = requireRole(request, ['SCHOOL_ADMIN'])
    if (!requester || !requester.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return validationError(strength.reason || 'Please choose a stronger password.')
    }

    const target = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        schoolId: true,
        role: true,
        deletedAt: true,
      },
    })

    if (!target || target.deletedAt) {
      return notFoundError('User')
    }

    // Same-school scope check.
    if (target.schoolId !== requester.schoolId) {
      return apiError(403, 'You can only reset passwords for users in your own school.')
    }

    // School admins cannot reset other school admins' passwords. Forces
    // accountability: a peer admin can't quietly take over a colleague's
    // account.
    if (target.role === 'SCHOOL_ADMIN' || target.role === 'SUPER_ADMIN') {
      return apiError(403, "Only a super admin can reset another admin's password.")
    }

    const passwordHash = await hashPassword(newPassword)
    const now = new Date()

    // Single transaction so partial completion can't leave a contradictory
    // state (password updated but session not invalidated, etc.).
    await db.$transaction([
      db.user.update({
        where: { id: target.id },
        data: {
          password: passwordHash,
          tokenVersion: { increment: 1 },
          mustChangePassword: true,
        },
      }),
      // Burn any unused reset tokens (email or OTP) for this user so a stale
      // token from before the admin reset can't be used.
      db.passwordResetToken.updateMany({
        where: { userId: target.id, usedAt: null },
        data: { usedAt: now },
      }),
    ])

    // Best-effort lockout clear so the user can log in immediately.
    try {
      await resetLoginFailures(target.id)
    } catch (lockoutErr) {
      console.error('Failed to clear lockout after admin reset:', lockoutErr)
    }

    await logLoginEvent({
      userId: target.id,
      email: target.email,
      schoolId: target.schoolId,
      ipAddress: getClientIp(request),
      userAgent: `admin-reset by ${requester.userId} | ${getUserAgent(request)}`,
      success: true,
      failureReason: 'ADMIN_PASSWORD_RESET_SUCCESS',
    })

    return NextResponse.json({
      message: `Password reset for ${target.name}. They must change it on next login.`,
    })
  } catch (error) {
    console.error('Admin reset password error:', error)
    return internalError('resetting the password')
  }
}
