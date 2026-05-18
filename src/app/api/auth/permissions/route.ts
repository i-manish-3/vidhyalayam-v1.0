import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, getUserPermissions } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/auth/permissions - Get the current user's effective permissions
export async function GET(request: NextRequest) {
  try {
    const user = getAuthUser(request)
    if (!user) {
      return unauthorizedError()
    }

    const permissions = await getUserPermissions(
      user.userId,
      user.role,
      user.schoolId
    )

    return NextResponse.json({
      permissions,
      role: user.role,
      userId: user.userId,
      schoolId: user.schoolId || null,
    })
  } catch (error) {
    console.error('Get current user permissions error:', error)
    return internalError('loading your permissions')
  }
}
