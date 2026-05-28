import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

export async function GET(request: NextRequest) {
  try {
    const user = requireAuth(request)
    if (!user) {
      return unauthorizedError()
    }

    const dbUser = await db.user.findUnique({
      where: { id: user.userId },
      include: {
        school: {
          select: {
            id: true,
            name: true,
            logo: true,
            favicon: true,
            printHeader: true,
            status: true,
            subdomain: true,
            primaryColor: true,
            dashboardFont: true,
            academicYear: true,
            board: true,
            city: true,
            state: true,
            country: true,
            currency: true,
            workingDays: true,
          },
        },
        userRoles: {
          select: { role: { select: { name: true } } },
        },
      },
    })

    if (!dbUser) {
      return apiError(404, 'We couldn\'t find your account. Please try logging in again.')
    }

    // Return 401 (not 403) so the api wrapper's session-expired handling kicks
    // in and logs the user out cleanly. SUPER_ADMIN has no school so is exempt.
    if (dbUser.school?.status === 'suspended') {
      return apiError(401, 'Your school is currently suspended. Please contact the platform administrator to restore access.')
    }

    // Account was disabled (e.g. driver let go, teacher disabled, etc.) since
    // this session was issued. Boot them out on the next page navigation so
    // they don't keep using the app with a still-valid access token.
    if (!dbUser.isActive || dbUser.deletedAt) {
      return apiError(401, 'Your account is no longer active. Please contact your school administrator.')
    }

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      phone: dbUser.phone,
      avatar: dbUser.avatar,
      mustChangePassword: dbUser.mustChangePassword,
      schoolId: dbUser.schoolId,
      isActive: dbUser.isActive,
      lastLoginAt: dbUser.lastLoginAt,
      assignedRoleName: dbUser.userRoles[0]?.role.name ?? null,
      school: dbUser.school,
    })
  } catch (error) {
    console.error('Get me error:', error)
    return internalError('loading your profile')
  }
}
