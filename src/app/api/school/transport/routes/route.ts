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

    const routes = await db.transportRoute.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(academicYear ? { academicYear } : {}),
      },
      include: {
        _count: {
          select: { allocations: { where: { isActive: true, ...(academicYear ? { academicYear } : {}) } } },
        },
      },
      orderBy: { routeName: 'asc' },
    })

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
      capacity,
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

    const cleanedCapacity = optionalNumber(capacity) ?? 40
    if (Number.isNaN(cleanedCapacity) || !Number.isInteger(cleanedCapacity) || cleanedCapacity < 1) {
      return apiError(400, 'Please enter a valid vehicle capacity.')
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
        capacity: cleanedCapacity,
        fee: 0,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
    })

    return NextResponse.json(route, { status: 201 })
  } catch (error) {
    console.error('Create transport route error:', error)
    return internalError('creating the transport route')
  }
}
