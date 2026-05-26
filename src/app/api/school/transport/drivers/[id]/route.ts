import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'

// PATCH /api/school/transport/drivers/[id] - Update driver fields (currently isActive toggle).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const authorized = await requirePermission(request, 'transport:update')
    if (!authorized) {
      return forbiddenError()
    }

    const { id } = await params
    const body = await request.json()

    const driver = await db.driver.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!driver) {
      return notFoundError('Driver')
    }

    const updateData: Record<string, unknown> = {}
    const userUpdateData: Record<string, unknown> = {}

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return apiError(400, 'isActive must be true or false.')
      }
      updateData.isActive = body.isActive
      userUpdateData.isActive = body.isActive
    }

    if (Object.keys(updateData).length === 0) {
      return apiError(400, 'No changes provided.')
    }

    const driverFullName = `${driver.firstName} ${driver.lastName}`.trim()
    const linkedUser = driver.userId
      ? await db.user.findFirst({
          where: { id: driver.userId, deletedAt: null },
          select: { phone: true },
        })
      : null
    const driverPhone = linkedUser?.phone ?? null

    let unassignedRouteCount = 0

    const updated = await db.$transaction(async (tx) => {
      const updatedDriver = await tx.driver.update({
        where: { id },
        data: updateData,
      })

      if (driver.userId && Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: driver.userId },
          data: userUpdateData,
        })
      }

      // Auto-unassign from all routes when disabling — driver has left the job.
      if (body.isActive === false) {
        const routeMatchClause = driverPhone
          ? { driverName: driverFullName, driverPhone }
          : { driverName: driverFullName }
        const result = await tx.transportRoute.updateMany({
          where: {
            schoolId: user.schoolId!,
            deletedAt: null,
            ...routeMatchClause,
          },
          data: { driverName: null, driverPhone: null },
        })
        unassignedRouteCount = result.count
      }

      return updatedDriver
    })

    return NextResponse.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      isActive: updated.isActive,
      unassignedRouteCount,
    })
  } catch (error) {
    console.error('Update driver error:', error)
    return internalError('updating the driver')
  }
}
