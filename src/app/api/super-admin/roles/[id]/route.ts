import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/super-admin/roles/[id] - Get role detail with permissions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { id } = await params

    const role = await db.role.findFirst({
      where: { id, deletedAt: null },
      include: {
        school: {
          select: { id: true, name: true, primaryColor: true },
        },
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
      school: role.school ? {
        id: role.school.id,
        name: role.school.name,
        primaryColor: role.school.primaryColor,
      } : null,
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
    console.error('Get super-admin role error:', error)
    return internalError('fetching the role')
  }
}

// PUT /api/super-admin/roles/[id] - Update a non-predefined role
export async function PUT(
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
    const { name, description, color, permissionIds } = body

    const role = await db.role.findFirst({
      where: { id, deletedAt: null },
    })

    if (!role) {
      return notFoundError('Role')
    }

    // Predefined (system) roles: only permission changes allowed, not name/description/color
    if (role.isSystem) {
      if (name !== undefined || description !== undefined || color !== undefined) {
        return apiError(403, "System roles like this one can't be renamed. You can only change which permissions they have.")
      }
      if (permissionIds === undefined) {
        return apiError(400, 'No changes were detected. For system roles, you can only update permissions.')
      }
    }

    // Check for duplicate name if name is being changed
    if (name && name.trim() !== role.name) {
      const existingRole = await db.role.findFirst({
        where: {
          schoolId: role.schoolId,
          name: name.trim(),
          deletedAt: null,
          id: { not: id },
        },
      })
      if (existingRole) {
        return apiError(409, `A role with the name "${name.trim()}" already exists in this school.`)
      }
    }

    // Validate permission IDs exist
    if (permissionIds !== undefined && Array.isArray(permissionIds)) {
      if (permissionIds.length > 0) {
        const validPerms = await db.permission.findMany({
          where: { id: { in: permissionIds }, isActive: true },
          select: { id: true },
        })
        const validIds = new Set(validPerms.map((p) => p.id))
        const invalidIds = permissionIds.filter((pid: string) => !validIds.has(pid))
        if (invalidIds.length > 0) {
          return apiError(400, `Invalid permission IDs: ${invalidIds.join(', ')}`)
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
        await tx.rolePermission.deleteMany({
          where: { roleId: id },
        })

        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId: string) => ({
              roleId: id,
              permissionId,
            })),
          })
        }
      }
    })

    // Fetch updated role
    const updatedRole = await db.role.findUnique({
      where: { id },
      include: {
        school: {
          select: { id: true, name: true, primaryColor: true },
        },
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
      school: updatedRole!.school ? {
        id: updatedRole!.school.id,
        name: updatedRole!.school.name,
        primaryColor: updatedRole!.school.primaryColor,
      } : null,
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
    console.error('Update super-admin role error:', error)
    return internalError('updating the role')
  }
}

// DELETE /api/super-admin/roles/[id] - Soft delete a non-predefined role
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN'])
    if (!user) {
      return unauthorizedError()
    }

    const { id } = await params

    const role = await db.role.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: { userRoles: true },
        },
      },
    })

    if (!role) {
      return notFoundError('Role')
    }

    // Predefined roles cannot be deleted
    if (role.isSystem) {
      return apiError(403, "This is a system role and can't be deleted. Only custom roles can be removed.")
    }

    if (role._count.userRoles > 0) {
      return apiError(400, `This role is currently assigned to ${role._count.userRoles} user(s). Please remove the role from all users before deleting it.`)
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
    console.error('Delete super-admin role error:', error)
    return internalError('deleting the role')
  }
}
