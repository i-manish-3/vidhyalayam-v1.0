import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// PUT /api/school/transport/routes/[id] - Update a transport route
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()
    const {
      routeName,
      routeNumber,
      startPoint,
      endPoint,
      stops,
      distance,
      driverName,
      driverPhone,
      vehicleNumber,
      capacity,
      fee,
      isActive,
    } = body

    // Verify route exists and belongs to this school (not soft-deleted)
    const existing = await db.transportRoute.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('TransportRoute')
    }

    // Validate routeName if provided
    if (routeName !== undefined && !routeName?.trim()) {
      return apiError(400, 'Please enter a name for this transport route.')
    }

    // Build update data — only include fields that are explicitly provided
    const updateData: Record<string, unknown> = {}
    if (routeName !== undefined) updateData.routeName = routeName.trim()
    if (routeNumber !== undefined) updateData.routeNumber = routeNumber || null
    if (startPoint !== undefined) updateData.startPoint = startPoint || null
    if (endPoint !== undefined) updateData.endPoint = endPoint || null
    if (stops !== undefined) updateData.stops = stops ? JSON.stringify(stops) : null
    if (distance !== undefined) updateData.distance = distance != null ? distance : null
    if (driverName !== undefined) updateData.driverName = driverName || null
    if (driverPhone !== undefined) updateData.driverPhone = driverPhone || null
    if (vehicleNumber !== undefined) updateData.vehicleNumber = vehicleNumber || null
    if (capacity !== undefined) updateData.capacity = capacity || 40
    if (fee !== undefined) updateData.fee = fee || 0
    if (isActive !== undefined) updateData.isActive = isActive

    const updated = await db.transportRoute.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      route: updated,
      message: 'Transport route has been updated successfully.',
    })
  } catch (error) {
    console.error('Update transport route error:', error)
    return internalError('updating the transport route')
  }
}

// DELETE /api/school/transport/routes/[id] - Soft delete a transport route
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    // Verify route exists and belongs to this school
    const existing = await db.transportRoute.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('TransportRoute')
    }

    // Soft delete — set deletedAt to now and isActive to false
    await db.transportRoute.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })

    return NextResponse.json({
      message: `Route "${existing.routeName}" has been deleted successfully.`,
    })
  } catch (error) {
    console.error('Delete transport route error:', error)
    return internalError('deleting the transport route')
  }
}
