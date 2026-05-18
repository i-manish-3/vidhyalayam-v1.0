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
          },
        },
      },
    })

    if (!dbUser) {
      return apiError(404, 'We couldn\'t find your account. Please try logging in again.')
    }

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      phone: dbUser.phone,
      avatar: dbUser.avatar,
      schoolId: dbUser.schoolId,
      isActive: dbUser.isActive,
      lastLoginAt: dbUser.lastLoginAt,
      school: dbUser.school,
    })
  } catch (error) {
    console.error('Get me error:', error)
    return internalError('loading your profile')
  }
}
