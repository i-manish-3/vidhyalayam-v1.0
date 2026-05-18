import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { findIncompatibleRoleAssignment } from '@/lib/rbac'

// GET /api/school/users/[id]/roles - Get user's assigned roles
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

    // Verify the target user belongs to the same school
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

    const userRoles = await db.userRole.findMany({
      where: { userId: targetUser.id },
      include: {
        role: {
          include: {
            _count: {
              select: { permissions: true },
            },
          },
        },
      },
    })

    return NextResponse.json({
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      roles: userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        color: ur.role.color,
        isSystem: ur.role.isSystem,
        permissionCount: ur.role._count.permissions,
        assignedBy: ur.assignedBy,
        assignedAt: ur.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get user roles error:', error)
    return internalError('fetching user roles')
  }
}

// PUT /api/school/users/[id]/roles - Assign roles to a user (replace existing)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN') {
      const permCheck = await requirePermission(request, 'role:update')
      if (!permCheck) {
        return forbiddenError()
      }
    }

    const { id } = await params
    const body = await request.json()
    const { roleIds } = body

    if (!Array.isArray(roleIds)) {
      return apiError(400, 'Please provide a valid list of roles to assign.')
    }

    // Verify the target user belongs to the same school
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

    // Validate that all role IDs belong to the same school and are not deleted
    if (roleIds.length > 0) {
      const validRoles = await db.role.findMany({
        where: {
          id: { in: roleIds },
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true, name: true },
      })
      const validIds = new Set(validRoles.map((r) => r.id))
      const invalidIds = roleIds.filter((rid: string) => !validIds.has(rid))
      if (invalidIds.length > 0) {
        return apiError(400, "Some of the roles you selected don't exist in your school. Please refresh and try again.")
      }

      const incompatibleAssignment = findIncompatibleRoleAssignment([targetUser], validRoles)
      if (incompatibleAssignment) {
        return apiError(
          400,
          `${targetUser.name} is a ${targetUser.role.replaceAll('_', ' ')} user and cannot be assigned the "${incompatibleAssignment.roleName}" role. Convert the user's primary profile type first, or create a separate account for that profile.`
        )
      }
    }

    // Replace existing roles with the new set
    await db.$transaction(async (tx) => {
      // Delete existing role assignments
      await tx.userRole.deleteMany({
        where: { userId: targetUser.id },
      })

      // Create new role assignments
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId: string) => ({
            userId: targetUser.id,
            roleId,
            assignedBy: user.userId,
          })),
        })
      }
    })

    // Fetch updated roles
    const updatedUserRoles = await db.userRole.findMany({
      where: { userId: targetUser.id },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            isSystem: true,
          },
        },
      },
    })

    return NextResponse.json({
      userId: targetUser.id,
      userName: targetUser.name,
      roles: updatedUserRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        color: ur.role.color,
        isSystem: ur.role.isSystem,
        assignedBy: ur.assignedBy,
        assignedAt: ur.createdAt,
      })),
    })
  } catch (error) {
    console.error('Update user roles error:', error)
    return internalError('updating user roles')
  }
}
