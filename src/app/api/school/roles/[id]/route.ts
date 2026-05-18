import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/roles/[id] - Get role details with its permissions
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

    const role = await db.role.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, phone: true },
            },
          },
        },
        _count: {
          select: { userRoles: true },
        },
      },
    })

    if (!role) {
      return notFoundError('Role')
    }

    return NextResponse.json({
      id: role.id,
      name: role.name,
      description: role.description,
      color: role.color,
      isSystem: role.isSystem,
      isActive: role.isActive,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      userCount: role._count.userRoles,
      users: role.userRoles.map((ur) => ({
        id: ur.user.id,
        name: ur.user.name,
        email: ur.user.email,
        role: ur.user.role,
        phone: ur.user.phone,
        assignedAt: ur.assignedAt,
      })),
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        module: rp.permission.module,
        action: rp.permission.action,
      })),
    })
  } catch (error) {
    console.error('Get role error:', error)
    return internalError('fetching the role')
  }
}

// PUT /api/school/roles/[id] - Update role and/or its permissions
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
    const { name, description, color, permissionIds, userIds } = body

    const role = await db.role.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
    })

    if (!role) {
      return notFoundError('Role')
    }

    // School Admin role is protected — only SUPER_ADMIN can modify its permissions
    if (role.name === 'School Admin' && user.role !== 'SUPER_ADMIN') {
      // Allow SCHOOL_ADMIN to view but NOT modify the School Admin role
      if (permissionIds !== undefined || name !== undefined || description !== undefined || color !== undefined || userIds !== undefined) {
        return apiError(403, 'Only the Super Admin can modify the School Admin role\'s permissions. Please contact the Super Admin if you need changes.')
      }
    }

    // Only SUPER_ADMIN can edit role names — SCHOOL_ADMIN cannot rename any role
    if (name !== undefined && name.trim() !== role.name && user.role !== 'SUPER_ADMIN') {
      return apiError(403, 'Only the Super Admin can rename roles. Please contact them if you need a name change.')
    }

    // Check for duplicate name if name is being changed
    if (name && name.trim() !== role.name) {
      const existingRole = await db.role.findFirst({
        where: {
          schoolId: user.schoolId,
          name: name.trim(),
          deletedAt: null,
          id: { not: id },
        },
      })
      if (existingRole) {
        return apiError(409, `A role named "${name.trim()}" already exists. Please choose a different name.`)
      }
    }

    // If permissionIds are provided, validate they are available to this school
    if (permissionIds !== undefined && Array.isArray(permissionIds)) {
      if (user.role === 'SCHOOL_ADMIN') {
        // Get permissions available to this school
        const schoolPerms = await db.schoolPermission.findMany({
          where: { schoolId: user.schoolId },
          select: { permissionId: true },
        })
        const availablePermIds = new Set(schoolPerms.map((sp) => sp.permissionId))
        const invalidPermIds = permissionIds.filter((pid: string) => !availablePermIds.has(pid))
        if (invalidPermIds.length > 0) {
          return apiError(400, 'Some permissions you selected aren\'t available for your school. Please contact the Super Admin to enable them.')
        }
      } else {
        // SUPER_ADMIN - just validate permission IDs exist
        if (permissionIds.length > 0) {
          const validPerms = await db.permission.findMany({
            where: { id: { in: permissionIds }, isActive: true },
            select: { id: true },
          })
          const validIds = new Set(validPerms.map((p) => p.id))
          const invalidIds = permissionIds.filter((pid: string) => !validIds.has(pid))
          if (invalidIds.length > 0) {
            return apiError(400, "Some of the permissions you selected are invalid. Please refresh and try again.")
          }
        }
      }
    }

    await db.$transaction(async (tx) => {
      // Update role fields
      const updateData: Record<string, unknown> = {}
      if (name !== undefined) updateData.name = name.trim()
      if (description !== undefined) updateData.description = description?.trim() || null
      if (color !== undefined) updateData.color = color || null

      if (Object.keys(updateData).length > 0) {
        await tx.role.update({
          where: { id },
          data: updateData,
        })
      }

      // Update permissions if provided
      if (permissionIds !== undefined && Array.isArray(permissionIds)) {
        // Delete existing permissions
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        })

        // Create new permissions
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId: string) => ({
              roleId: id,
              permissionId,
            })),
          })
        }
      }

      // Update assigned users if provided
      if (userIds !== undefined && Array.isArray(userIds)) {
        // Delete existing user assignments for this role
        await tx.userRole.deleteMany({
          where: { roleId: id },
        })

        // Create new user assignments
        if (userIds.length > 0) {
          await tx.userRole.createMany({
            data: userIds.map((uId: string) => ({
              userId: uId,
              roleId: id,
              assignedBy: user.userId,
            })),
          })
        }
      }
    })

    // Fetch updated role with permissions
    const updatedRole = await db.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: {
              select: { code: true, name: true, module: true, action: true, id: true },
            },
          },
        },
        userRoles: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, phone: true },
            },
          },
        },
        _count: {
          select: { userRoles: true },
        },
      },
    })

    return NextResponse.json({
      id: updatedRole!.id,
      name: updatedRole!.name,
      description: updatedRole!.description,
      color: updatedRole!.color,
      isSystem: updatedRole!.isSystem,
      isActive: updatedRole!.isActive,
      createdAt: updatedRole!.createdAt,
      updatedAt: updatedRole!.updatedAt,
      userCount: updatedRole!._count.userRoles,
      users: updatedRole!.userRoles.map((ur) => ({
        id: ur.user.id,
        name: ur.user.name,
        email: ur.user.email,
        role: ur.user.role,
        phone: ur.user.phone,
        assignedAt: ur.assignedAt,
      })),
      permissions: updatedRole!.permissions.map((rp) => ({
        id: rp.permission.id,
        code: rp.permission.code,
        name: rp.permission.name,
        module: rp.permission.module,
        action: rp.permission.action,
      })),
    })
  } catch (error) {
    console.error('Update role error:', error)
    return internalError('updating the role')
  }
}

// DELETE /api/school/roles/[id] - Soft delete the role
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SUPER_ADMIN') {
      const permCheck = await requirePermission(request, 'role:delete')
      if (!permCheck) {
        return forbiddenError()
      }
    }

    const { id } = await params

    const role = await db.role.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    })

    if (!role) {
      return notFoundError('Role')
    }

    // Only SUPER_ADMIN can delete roles — SCHOOL_ADMIN cannot delete any role
    if (user.role !== 'SUPER_ADMIN') {
      return apiError(403, 'Only the Super Admin can delete roles. Please contact them if you need a role removed.')
    }

    if (role._count.userRoles > 0) {
      return apiError(400, `Cannot delete role "${role.name}" because it is assigned to ${role._count.userRoles} user(s). Please remove the role from all users first.`)
    }

    // Soft delete
    await db.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({
      message: `Role "${role.name}" has been deleted successfully.`,
    })
  } catch (error) {
    console.error('Delete role error:', error)
    return internalError('deleting the role')
  }
}
