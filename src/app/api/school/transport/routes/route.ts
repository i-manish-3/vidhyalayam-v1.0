import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

const VALID_FEE_MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  return ACADEMIC_YEAR_PATTERN.test(academicYear) ? academicYear : null
}

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
      fare: optionalNumber(record.fare) ?? 0,
    }
  })

  if (stops.some((stop) => !stop.name || Number.isNaN(stop.fare) || stop.fare < 0)) {
    return null
  }

  return stops
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

// GET /api/school/transport/routes - List routes
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const authorized = await requirePermission(request, 'transport:read')
    if (!authorized) {
      return forbiddenError()
    }

    const { searchParams } = new URL(request.url)
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))

    // A route belongs to the requested year if EITHER its own academicYear tag
    // matches (original / freshly created routes), OR it has at least one
    // active TransportStopFare for that year (routes copied via Annual Setup
    // keep their original tag but get per-year fares). Discontinued routes
    // (no active fares for the year) are excluded unless this is also their
    // tag year.
    let routeIdsWithActiveFares: string[] = []
    if (academicYear) {
      const fareRoutes = await db.transportStopFare.findMany({
        where: { schoolId: user.schoolId, academicYear, isActive: true },
        select: { routeId: true },
        distinct: ['routeId'],
      })
      routeIdsWithActiveFares = fareRoutes.map((r) => r.routeId)
    }

    const routes = await db.transportRoute.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(academicYear
          ? {
              OR: [
                { academicYear },
                ...(routeIdsWithActiveFares.length > 0 ? [{ id: { in: routeIdsWithActiveFares } }] : []),
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: { allocations: { where: { isActive: true, ...(academicYear ? { academicYear } : {}) } } },
        },
      },
      orderBy: { routeName: 'asc' },
    })

    if (academicYear && routes.length > 0) {
      const fares = await db.transportStopFare.findMany({
        where: {
          schoolId: user.schoolId,
          routeId: { in: routes.map((route) => route.id) },
          academicYear,
          isActive: true,
        },
        orderBy: { stopName: 'asc' },
      })
      const fareMap = new Map<string, typeof fares>()
      for (const fare of fares) {
        fareMap.set(fare.routeId, [...(fareMap.get(fare.routeId) || []), fare])
      }

      const routesWithYearFares = routes.map((route) => {
        const routeFares = fareMap.get(route.id)
        if (!routeFares || routeFares.length === 0) return route
        return {
          ...route,
          academicYear,
          feeMonths: routeFares[0]?.feeMonths || route.feeMonths,
          stops: JSON.stringify(routeFares.map((fare) => ({ name: fare.stopName, fare: fare.fare }))),
          fee: routeFares.length > 0 ? Math.round(routeFares.reduce((sum, fare) => sum + fare.fare, 0) / routeFares.length) : route.fee,
        }
      })

      return NextResponse.json({ routes: routesWithYearFares })
    }

    return NextResponse.json({ routes })
  } catch (error) {
    console.error('List transport routes error:', error)
    return internalError('listing transport routes')
  }
}

// POST /api/school/transport/routes - Create route
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    const authorized = await requirePermission(request, 'transport:create')
    if (!authorized) {
      return forbiddenError()
    }

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
      isActive,
      driverId,
    } = body

    const cleanedRouteName = optionalText(routeName)
    if (!cleanedRouteName) {
      return apiError(400, 'Please enter a route name for this transport route.')
    }

    const cleanedRouteNumber = optionalText(routeNumber)
    if (!cleanedRouteNumber) {
      return apiError(400, 'Please enter a route code for this transport route.')
    }

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

    const cleanedFeeMonths = parseFeeMonths(feeMonths)
    if (feeMonths !== undefined && feeMonths !== null && !cleanedFeeMonths) {
      return apiError(400, 'Please select at least one fee month.')
    }
    if (!cleanedFeeMonths || cleanedFeeMonths.length === 0) {
      return apiError(400, 'Please select at least one fee month.')
    }

    const cleanedDistance = optionalNumber(distance)
    if (Number.isNaN(cleanedDistance) || (cleanedDistance !== null && cleanedDistance < 0)) {
      return apiError(400, 'Please enter a valid route distance.')
    }

    const cleanedStops = parseStops(stops)
    if (stops !== undefined && stops !== null && !cleanedStops) {
      return apiError(400, 'Please add each stop with a valid stop name and fare.')
    }
    if (!cleanedStops || cleanedStops.length === 0) {
      return apiError(400, 'Please add at least one stop with fare.')
    }

    let selectedDriver: { name: string; phone: string | null } | null = null
    const cleanedDriverId = optionalText(driverId)
    if (cleanedDriverId) {
      const driverRecord = await db.driver.findFirst({
        where: {
          id: cleanedDriverId,
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
        },
        select: {
          firstName: true,
          lastName: true,
          userId: true,
        },
      })

      if (driverRecord) {
        const linkedUser = driverRecord.userId
          ? await db.user.findFirst({
              where: { id: driverRecord.userId, deletedAt: null },
              select: { phone: true },
            })
          : null
        selectedDriver = {
          name: `${driverRecord.firstName} ${driverRecord.lastName}`.trim(),
          phone: linkedUser?.phone ?? null,
        }
      }

      if (!selectedDriver) {
        return apiError(400, 'Please choose a valid driver from the driver list.')
      }
    }

    const route = await db.transportRoute.create({
      data: {
        schoolId: user.schoolId,
        routeName: cleanedRouteName,
        routeNumber: cleanedRouteNumber,
        academicYear: cleanedAcademicYear,
        feeMonths: JSON.stringify(cleanedFeeMonths),
        startPoint: optionalText(startPoint),
        endPoint: optionalText(endPoint),
        stops: cleanedStops && cleanedStops.length > 0 ? JSON.stringify(cleanedStops) : null,
        distance: cleanedDistance,
        driverName: selectedDriver?.name || optionalText(driverName),
        driverPhone: selectedDriver?.phone || optionalText(driverPhone),
        vehicleNumber: optionalText(vehicleNumber),
        fee: 0,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    })

    await syncStopFares(route.id, user.schoolId, cleanedAcademicYear, cleanedStops, cleanedFeeMonths)

    return NextResponse.json(route, { status: 201 })
  } catch (error) {
    console.error('Create transport route error:', error)
    return internalError('creating the transport route')
  }
}
