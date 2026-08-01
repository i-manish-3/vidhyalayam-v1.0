import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { syncSchoolAdminRoleWithSchoolPermissions } from '@/lib/rbac'

// GET /api/super-admin/schools/[id]/permissions - Get permissions assigned to a specific school
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

    const school = await db.school.findUnique({ where: { id } })
    if (!school) {
      return notFoundError('School')
    }

    const schoolPermissions = await db.schoolPermission.findMany({
      where: { schoolId: id },
      include: {
        permission: true,
      },
      orderBy: { permission: { module: 'asc' } },
    })

    return NextResponse.json({
      schoolId: id,
      schoolName: school.name,
      permissions: schoolPermissions.map((sp) => ({
        id: sp.id,
        permissionId: sp.permissionId,
        code: sp.permission.code,
        name: sp.permission.name,
        module: sp.permission.module,
        action: sp.permission.action,
        grantedBy: sp.grantedBy,
        grantedAt: sp.grantedAt,
      })),
    })
  } catch (error) {
    console.error('Get school permissions error:', error)
    return internalError('fetching school permissions')
  }
}

// PUT /api/super-admin/schools/[id]/permissions - Update permissions for a school (replace existing)
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
    const { permissionIds } = body

    if (!Array.isArray(permissionIds)) {
      return apiError(400, 'Please provide a valid list of permissions to assign.')
    }

    const school = await db.school.findUnique({ where: { id } })
    if (!school) {
      return notFoundError('School')
    }

    // Keep only permission IDs that exist and are active; silently drop stale ones
    // (legacy/inactive permissions may still be referenced by old grants and are
    // not visible in the catalog, so rejecting the whole save on them is wrong)
    const validPermissionIds = permissionIds.filter(
      (permissionId: string) => typeof permissionId === 'string'
    )
    if (validPermissionIds.length > 0) {
      const validPermissions = await db.permission.findMany({
        where: { id: { in: validPermissionIds }, isActive: true },
        select: { id: true },
      })
      const validIds = new Set(validPermissions.map((p) => p.id))
      for (let i = validPermissionIds.length - 1; i >= 0; i--) {
        if (!validIds.has(validPermissionIds[i])) {
          validPermissionIds.splice(i, 1)
        }
      }
    }

    // Replace existing school permissions with the new set in a transaction
    await db.$transaction(async (tx) => {
      // Delete existing permissions for this school
      await tx.schoolPermission.deleteMany({
        where: { schoolId: id },
      })

      // Create new permissions
      if (validPermissionIds.length > 0) {
        await tx.schoolPermission.createMany({
          data: validPermissionIds.map((permissionId: string) => ({
            schoolId: id,
            permissionId,
            grantedBy: user.userId,
          })),
        })
      }

      await tx.rolePermission.deleteMany({
        where: {
          role: { schoolId: id },
          permissionId: { notIn: validPermissionIds },
        },
      })

      await syncSchoolAdminRoleWithSchoolPermissions(id, tx)
    })

    // Fetch the updated permissions for the response
    const updatedPermissions = await db.schoolPermission.findMany({
      where: { schoolId: id },
      include: {
        permission: {
          select: { code: true, name: true, module: true, action: true },
        },
      },
    })

    return NextResponse.json({
      schoolId: id,
      schoolName: school.name,
      permissionCount: updatedPermissions.length,
      permissions: updatedPermissions.map((sp) => ({
        permissionId: sp.permissionId,
        code: sp.permission.code,
        name: sp.permission.name,
        module: sp.permission.module,
        action: sp.permission.action,
      })),
    })
  } catch (error) {
    console.error('Update school permissions error:', error)
    return internalError('updating school permissions')
  }
}
