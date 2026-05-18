import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission, getUserPermissions } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/users/[id]/permissions - Get user's effective permissions (inherited from roles only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN') {
      const permCheck = await requirePermission(request, 'role:read')
      if (!permCheck) {
        return forbiddenError()
      }
    }

    const { id } = await params

    // Find the target user in the same school
    const targetUser = await db.user.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
    })

    if (!targetUser) {
      return notFoundError('User')
    }

    // Get effective permissions (inherited from roles only)
    const effectivePermissions = await getUserPermissions(
      targetUser.id,
      targetUser.role,
      targetUser.schoolId || undefined
    )

    // Get role-based permissions (from UserRole → RolePermission)
    const userRoles = await db.userRole.findMany({
      where: { userId: targetUser.id },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: { select: { code: true, name: true, module: true } },
              },
            },
          },
        },
      },
    })

    return NextResponse.json({
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      effectivePermissions,
      roles: userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        color: ur.role.color,
        permissions: ur.role.permissions.map((rp) => ({
          code: rp.permission.code,
          name: rp.permission.name,
          module: rp.permission.module,
        })),
      })),
    })
  } catch (error) {
    console.error('Get user permissions error:', error)
    return internalError('fetching user permissions')
  }
}

// PUT /api/school/users/[id]/permissions - Disabled; use role assignment instead
export async function PUT() {
  return apiError(
    400,
    "Permissions are managed through roles, not assigned directly. To change a user's permissions, assign them a different role instead."
  )
}
