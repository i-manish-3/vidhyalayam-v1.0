import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, notFoundError, internalError, apiError } from '@/lib/api-errors'

const VALID_FEE_MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : Number.NaN
}

function parseFeeMonths(value: unknown): string[] | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return null

  const months = value
    .map((month) => typeof month === 'string' ? month.trim() : '')
    .filter(Boolean)

  if (months.length === 0) return null
  if (months.some((month) => !VALID_FEE_MONTHS.has(month))) return null
  return Array.from(new Set(months))
}

function parseStops(value: unknown): Array<{ name: string; fare: number }> | null {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return null

  const stops = value.map((stop) => {
    if (typeof stop === 'string') {
      return { name: stop.trim(), fare: 0 }
    }
    if (!stop || typeof stop !== 'object') {
      return { name: '', fare: Number.NaN }
    }

    const record = stop as Record<string, unknown>
    return {
      name: optionalText(record.name) || '',
      fare: optionalNumber(record.fare) ?? Number.NaN,
    }
  })

  if (stops.some((stop) => !stop.name || Number.isNaN(stop.fare) || stop.fare < 0)) {
    return null
  }

  return stops
}

async function syncStopFares(
  routeId: string,
  schoolId: string,
  academicYear: string,
  stops: Array<{ name: string; fare: number }>,
  feeMonths: string[]
) {
  await db.$transaction([
    db.transportStopFare.updateMany({
      where: { routeId, schoolId, academicYear },
      data: { isActive: false },
    }),
    ...stops.map((stop) =>
      db.transportStopFare.upsert({
        where: {
          routeId_academicYear_stopName: {
            routeId,
            academicYear,
            stopName: stop.name,
          },
        },
        create: {
          routeId,
          schoolId,
          academicYear,
          stopName: stop.name,
          fare: stop.fare,
          feeMonths: JSON.stringify(feeMonths),
          isActive: true,
        },
        update: {
          fare: stop.fare,
          feeMonths: JSON.stringify(feeMonths),
          isActive: true,
        },
      })
    ),
  ])
}

// PUT /api/school/transport/routes/[id] - Update a transport route
export async function PUT(
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
    const {
      routeName,
      routeNumber,
      academicYear,
      feeMonths,
      startPoint,
      endPoint,
      stops,
      distance,
      driverName,
      driverPhone,
      vehicleNumber,
      driverId,
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
      return apiError(400, 'Please enter a route code for this transport route.')
    }

    if (academicYear !== undefined) {
      const cleanedAcademicYear = optionalText(academicYear)
      if (!cleanedAcademicYear || !/^\d{4}-\d{4}$/.test(cleanedAcademicYear)) {
        return apiError(400, 'Please choose a valid academic year.')
      }

      const academicYearExists = await db.academicYear.findFirst({
        where: {
          schoolId: user.schoolId,
          name: cleanedAcademicYear,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      })
      if (!academicYearExists) {
        return apiError(400, 'Please choose an active academic year from school settings.')
      }
    }

    if (feeMonths !== undefined) {
      const cleanedFeeMonths = parseFeeMonths(feeMonths)
      if (!cleanedFeeMonths || cleanedFeeMonths.length === 0) {
        return apiError(400, 'Please select at least one fee month.')
      }
    }

    const cleanedDistance = optionalNumber(distance)
    if (distance !== undefined && (Number.isNaN(cleanedDistance) || (cleanedDistance !== null && cleanedDistance < 0))) {
      return apiError(400, 'Please enter a valid route distance.')
    }

    const cleanedFee = optionalNumber(fee)
    if (fee !== undefined && (Number.isNaN(cleanedFee) || cleanedFee === null || cleanedFee < 0)) {
      return apiError(400, 'Please enter a valid transport fee.')
    }

    const cleanedStops = parseStops(stops)
    if (stops !== undefined && stops !== null && !cleanedStops) {
      return apiError(400, 'Please add each stop with a valid stop name and fare.')
    }

    // Build update data — only include fields that are explicitly provided
    let selectedDriver: { name: string; phone: string | null } | null = null
    const cleanedDriverId = optionalText(driverId)
    if (driverId !== undefined && cleanedDriverId) {
      selectedDriver = await db.user.findFirst({
        where: {
          id: cleanedDriverId,
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
          userRoles: {
            some: {
              role: {
                schoolId: user.schoolId,
                name: 'Transport',
                deletedAt: null,
                isActive: true,
              },
            },
          },
        },
        select: {
          name: true,
          phone: true,
        },
      })

      if (!selectedDriver) {
        return apiError(400, 'Please choose a valid driver from the driver list.')
      }
    }

    const updateData: Record<string, unknown> = {}
    if (routeName !== undefined) updateData.routeName = routeName.trim()
    if (routeNumber !== undefined) updateData.routeNumber = optionalText(routeNumber)
    if (academicYear !== undefined) updateData.academicYear = optionalText(academicYear)
    if (feeMonths !== undefined) updateData.feeMonths = JSON.stringify(parseFeeMonths(feeMonths))
    if (startPoint !== undefined) updateData.startPoint = optionalText(startPoint)
    if (endPoint !== undefined) updateData.endPoint = optionalText(endPoint)
    if (stops !== undefined) updateData.stops = cleanedStops && cleanedStops.length > 0 ? JSON.stringify(cleanedStops) : null
    if (distance !== undefined) updateData.distance = cleanedDistance
    if (driverName !== undefined) updateData.driverName = optionalText(driverName)
    if (driverPhone !== undefined) updateData.driverPhone = optionalText(driverPhone)
    if (driverId !== undefined) {
      updateData.driverName = selectedDriver?.name || null
      updateData.driverPhone = selectedDriver?.phone || null
    }
    if (vehicleNumber !== undefined) updateData.vehicleNumber = optionalText(vehicleNumber)
    if (fee !== undefined) updateData.fee = cleanedFee
    if (isActive !== undefined) updateData.isActive = isActive

    const updated = await db.transportRoute.update({
      where: { id },
      data: updateData,
    })

    const updatedAcademicYear = typeof updateData.academicYear === 'string' ? updateData.academicYear : existing.academicYear
    const updatedFeeMonths = feeMonths !== undefined ? parseFeeMonths(feeMonths) || [] : parseFeeMonths(existing.feeMonths) || []
    if (stops !== undefined || feeMonths !== undefined || academicYear !== undefined) {
      const normalizedStops = cleanedStops || parseStops(existing.stops) || []
      if (normalizedStops.length > 0) {
        await syncStopFares(updated.id, user.schoolId, updatedAcademicYear, normalizedStops, updatedFeeMonths)
      }
    }

    return NextResponse.json({
      route: updated,
      message: 'Transport route has been updated successfully.',
    })
  } catch (error) {
    console.error('Update transport route error:', error)
    return internalError('updating the transport route')
  }
}

// DELETE /api/school/transport/routes/[id]?academicYear=YYYY-YYYY
// Year-scoped soft delete (matches the schema's per-year design):
//   - Deactivates TransportStopFare rows for this route × year.
//   - Deactivates TransportAllocation rows for this route × year.
//   - If the route's own academicYear tag matches the deleted year, re-tag it
//     to another year that still has active data (so the route disappears
//     from this year's list but stays visible in past/future years).
//   - Only hard-soft-deletes the TransportRoute row when no other year has
//     active fares or allocations.
// Omitting academicYear is allowed only when the route has no active data
// in any year — otherwise we'd silently nuke historic sessions.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const authorized = await requirePermission(request, 'transport:delete')
    if (!authorized) {
      return forbiddenError()
    }

    const { id } = await params
    const schoolId = user.schoolId
    const url = new URL(request.url)
    const academicYear = optionalText(url.searchParams.get('academicYear'))
    if (academicYear && !/^\d{4}-\d{4}$/.test(academicYear)) {
      return apiError(400, 'Please provide a valid academic year (YYYY-YYYY).')
    }

    const existing = await db.transportRoute.findFirst({
      where: { id, schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('TransportRoute')
    }

    // No academicYear supplied — only safe to hard-soft-delete when the route
    // has nothing active anywhere. Otherwise force the caller to scope.
    if (!academicYear) {
      const [activeFareCount, activeAllocCount] = await Promise.all([
        db.transportStopFare.count({ where: { routeId: id, isActive: true } }),
        db.transportAllocation.count({ where: { routeId: id, isActive: true } }),
      ])
      if (activeFareCount + activeAllocCount > 0) {
        return apiError(
          400,
          'This route has data in one or more academic years. Switch to that academic year and delete from there to keep history intact.',
        )
      }
      await db.transportRoute.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      })
      return NextResponse.json({
        message: `Route "${existing.routeName}" has been deleted successfully.`,
      })
    }

    // Year-scoped delete.
    await db.$transaction(async (tx) => {
      await tx.transportStopFare.updateMany({
        where: { routeId: id, schoolId, academicYear, isActive: true },
        data: { isActive: false },
      })
      await tx.transportAllocation.updateMany({
        where: { routeId: id, schoolId, academicYear, isActive: true },
        data: { isActive: false },
      })

      // If this route's identity year is the one we're removing, re-anchor it
      // to another year that still has active data; if none, soft-delete row.
      if (existing.academicYear === academicYear) {
        const remainingFare = await tx.transportStopFare.findFirst({
          where: { routeId: id, isActive: true, academicYear: { not: academicYear } },
          orderBy: { academicYear: 'desc' },
          select: { academicYear: true },
        })
        const remainingAlloc = remainingFare
          ? null
          : await tx.transportAllocation.findFirst({
              where: { routeId: id, isActive: true, academicYear: { not: academicYear } },
              orderBy: { academicYear: 'desc' },
              select: { academicYear: true },
            })
        const reanchorTo = remainingFare?.academicYear || remainingAlloc?.academicYear || null
        if (reanchorTo) {
          await tx.transportRoute.update({
            where: { id },
            data: { academicYear: reanchorTo },
          })
        } else {
          await tx.transportRoute.update({
            where: { id },
            data: { deletedAt: new Date(), isActive: false },
          })
        }
      }
    })

    return NextResponse.json({
      message: `Route "${existing.routeName}" removed from ${academicYear}. Past sessions are unaffected.`,
    })
  } catch (error) {
    console.error('Delete transport route error:', error)
    return internalError('deleting the transport route')
  }
}
