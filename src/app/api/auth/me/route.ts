import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, requireAuth } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

const SCHOOL_SELECT = {
  id: true, name: true, logo: true, favicon: true, printHeader: true,
  registrationNumber: true, udiseNumber: true, affiliationNumber: true,
  establishedYear: true, principalSignature: true,
  status: true,
  academicYear: true, board: true, city: true, state: true, country: true,
  currency: true, workingDays: true,
} as const

export async function GET(request: NextRequest) {
  try {
    const jwtUser = getAuthUser(request)
    if (!jwtUser) return unauthorizedError()

    const dbUser = await db.user.findUnique({
      where: { id: jwtUser.userId },
      include: {
        school: { select: SCHOOL_SELECT },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    })

    if (!dbUser) {
      return apiError(404, 'We couldn\'t find your account. Please try logging in again.')
    }

    if (dbUser.school?.status === 'suspended') {
      return apiError(401, 'Your school is currently suspended. Please contact the platform administrator to restore access.')
    }

    if (!dbUser.isActive || dbUser.deletedAt) {
      return apiError(401, 'Your account is no longer active. Please contact your school administrator.')
    }

    // When SUPER_ADMIN is impersonating a school, overlay the impersonated school
    // so the frontend store gets the correct school branding and context.
    let effectiveSchool = dbUser.school
    if (jwtUser.impersonatingSchoolId) {
      effectiveSchool = await db.school.findUnique({
        where: { id: jwtUser.impersonatingSchoolId },
        select: SCHOOL_SELECT,
      })
    }

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      phone: dbUser.phone,
      avatar: dbUser.avatar,
      mustChangePassword: dbUser.mustChangePassword,
      schoolId: jwtUser.impersonatingSchoolId || dbUser.schoolId,
      isActive: dbUser.isActive,
      lastLoginAt: dbUser.lastLoginAt,
      assignedRoleName: dbUser.userRoles[0]?.role.name ?? null,
      school: effectiveSchool,
      impersonatingSchoolId: jwtUser.impersonatingSchoolId || null,
    })
  } catch (error) {
    console.error('Get me error:', error)
    return internalError('loading your profile')
  }
}
