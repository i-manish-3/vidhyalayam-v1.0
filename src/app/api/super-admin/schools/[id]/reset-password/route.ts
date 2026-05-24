import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { hashPassword } from '@/lib/auth'
import { unauthorizedError, notFoundError, validationError, internalError, apiError } from '@/lib/api-errors'
import { validatePasswordStrength } from '@/lib/auth-security'

// POST /api/super-admin/schools/[id]/reset-password - Reset school admin password
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
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

    // Find the school
    const school = await db.school.findUnique({
      where: { id, deletedAt: null },
    })
    if (!school) {
      return notFoundError('School')
    }

    // Find the school admin user
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
      },
    })

    if (!adminUser) {
      return apiError(404, 'No admin account exists for this school yet. Please create one first.')
    }

    // Hash and update the password
    const hashedPassword = await hashPassword(trimmed)
    await db.user.update({
      where: { id: adminUser.id },
      data: { password: hashedPassword },
    })

    return NextResponse.json({
      message: `Password for ${adminUser.name} (${adminUser.email}) has been reset successfully.`,
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
