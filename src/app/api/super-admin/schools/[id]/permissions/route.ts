import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

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
    const { permissionIds, grantedBy } = body

    if (!Array.isArray(permissionIds)) {
      return apiError(400, 'Please provide a valid list of permissions to assign.')
    }
    if (!grantedBy) {
      return apiError(400, 'Please specify who is granting these permissions.')
    }

    const school = await db.school.findUnique({ where: { id } })
    if (!school) {
      return notFoundError('School')
    }

    // Validate that all permission IDs exist
    if (permissionIds.length > 0) {
      const validPermissions = await db.permission.findMany({
        where: { id: { in: permissionIds }, isActive: true },
        select: { id: true },
      })
      const validIds = new Set(validPermissions.map((p) => p.id))
      const invalidIds = permissionIds.filter((pid: string) => !validIds.has(pid))
      if (invalidIds.length > 0) {
        return apiError(400, 'Some of the permissions you selected don\'t exist. Please refresh and try again.')
      }
    }

    // Replace existing school permissions with the new set in a transaction
    await db.$transaction(async (tx) => {
      // Delete existing permissions for this school
      await tx.schoolPermission.deleteMany({
        where: { schoolId: id },
      })

      // Create new permissions
      if (permissionIds.length > 0) {
        await tx.schoolPermission.createMany({
          data: permissionIds.map((permissionId: string) => ({
            schoolId: id,
            permissionId,
            grantedBy,
          })),
        })
      }
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
