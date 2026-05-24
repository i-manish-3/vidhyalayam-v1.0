import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { internalError, apiError } from '@/lib/api-errors'
import { validatePasswordStrength } from '@/lib/auth-security'

// POST /api/auth/change-password - Change password for current user
export async function POST(request: NextRequest) {
  try {
    const user = requireAuth(request)
    if (!user) {
      return apiError(401, 'Authentication required.')
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return apiError(400, 'Please enter both your current password and the new password you\'d like to set.')
    }

    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return apiError(400, strength.reason || 'Please choose a stronger password.')
    }

    if (newPassword === currentPassword) {
      return apiError(400, 'Your new password must be different from your current password.')
    }

    const dbUser = await db.user.findUnique({
      where: { id: user.userId },
    })

    if (!dbUser) {
      return apiError(404, 'We couldn\'t find your account. Please try logging in again.')
    }

    const isValid = await verifyPassword(currentPassword, dbUser.password)
    if (!isValid) {
      return apiError(401, 'The current password you entered is incorrect. Please try again or contact your administrator.')
    }

    const hashedNewPassword = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.userId },
      data: { password: hashedNewPassword, mustChangePassword: false },
    })

    return NextResponse.json({
      message: 'Your password has been changed successfully.',
    })
  } catch (error) {
    console.error('Change password error:', error)
    return internalError('saving your new password')
  }
}
