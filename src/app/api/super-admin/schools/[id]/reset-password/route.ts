import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, notFoundError, validationError, internalError, apiError } from '@/lib/api-errors'
import {
  getClientIp,
  getUserAgent,
  logLoginEvent,
  resetLoginFailures,
  validatePasswordStrength,
} from '@/lib/auth-security'

// POST /api/super-admin/schools/[id]/reset-password — Reset school-admin password.
// The reset:
//   • updates the password
//   • bumps tokenVersion (invalidates every active session for that admin)
//   • marks any in-flight reset tokens used (email/OTP links can't replay the old password)
//   • forces mustChangePassword=true so the temp password the super-admin set
//     can't be reused indefinitely
//   • clears lockout on a best-effort basis so the admin can sign in immediately
//   • writes a LoginEvent audit row tagged with the requesting super-admin
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const requester = requireRole(request, ['SUPER_ADMIN'])
    if (!requester) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()
    const { newPassword } = body

    if (!newPassword || typeof newPassword !== 'string') {
      return validationError('Please provide a new password.')
    }
    const trimmed = newPassword.trim()
    const strength = validatePasswordStrength(trimmed)
    if (!strength.valid) {
      return validationError(strength.reason || 'Please choose a stronger password.')
    }

    const school = await db.school.findUnique({
      where: { id, deletedAt: null },
    })
    if (!school) {
      return notFoundError('School')
    }

    const adminUser = await db.user.findFirst({
      where: {
        schoolId: id,
        role: 'SCHOOL_ADMIN',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        schoolId: true,
      },
    })

    if (!adminUser) {
      return apiError(404, 'No admin account exists for this school yet. Please create one first.')
    }

    const passwordHash = await hashPassword(trimmed)
    const now = new Date()

    await db.$transaction([
      db.user.update({
        where: { id: adminUser.id },
        data: {
          password: passwordHash,
          tokenVersion: { increment: 1 },
          mustChangePassword: true,
        },
      }),
      db.passwordResetToken.updateMany({
        where: { userId: adminUser.id, usedAt: null },
        data: { usedAt: now },
      }),
    ])

    // Best-effort lockout clear so the admin can log in immediately.
    try {
      await resetLoginFailures(adminUser.id)
    } catch (lockoutErr) {
      console.error('Failed to clear lockout after super-admin reset:', lockoutErr)
    }

    await logLoginEvent({
      userId: adminUser.id,
      email: adminUser.email,
      schoolId: adminUser.schoolId,
      ipAddress: getClientIp(request),
      userAgent: `super-admin-reset by ${requester.userId} | ${getUserAgent(request)}`,
      success: true,
      failureReason: 'ADMIN_PASSWORD_RESET_SUCCESS',
    })

    return NextResponse.json({
      message: `Password for ${adminUser.name} (${adminUser.email}) has been reset. They must change it on next login.`,
      admin: {
        id: adminUser.id,
        name: adminUser.name,
        email: adminUser.email,
      },
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return internalError('resetting the admin password')
  }
}
