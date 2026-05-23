import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError, apiError } from '@/lib/api-errors'

const VALID_FEE_MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

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
  if (!Array.isArray(value)) return null
  const stops = value.map((stop) => {
    if (!stop || typeof stop !== 'object') return { name: '', fare: Number.NaN }
    const record = stop as Record<string, unknown>
    return {
      name: optionalText(record.name) || '',
      fare: optionalNumber(record.fare) ?? Number.NaN,
    }
  })
  if (stops.some((s) => !s.name || Number.isNaN(s.fare) || s.fare < 0)) return null
  const names = stops.map((s) => s.name)
  if (new Set(names).size !== names.length) return null
  return stops
}

function parseFeeMonths(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const months = value.map((m) => (typeof m === 'string' ? m.trim() : '')).filter(Boolean)
  if (months.length === 0) return null
  if (months.some((m) => !VALID_FEE_MONTHS.has(m))) return null
  return Array.from(new Set(months))
}

type RouteEntry =
  | {
      mode: 'copy'
      routeId: string
      stops: Array<{ name: string; fare: number }>
      feeMonths: string[]
    }
  | {
      mode: 'create'
      routeName: string
      routeNumber: string
      startPoint: string | null
      endPoint: string | null
      distance: number | null
      driverName: string | null
      driverPhone: string | null
      vehicleNumber: string | null
      stops: Array<{ name: string; fare: number }>
      feeMonths: string[]
    }
  | {
      mode: 'discontinue'
      routeId: string
    }

function parseRouteEntry(raw: unknown): { entry: RouteEntry | null; error: string | null } {
  if (!raw || typeof raw !== 'object') return { entry: null, error: 'Each route entry must be an object.' }
  const r = raw as Record<string, unknown>
  const mode = typeof r.mode === 'string' ? r.mode : ''

  if (mode === 'discontinue') {
    const routeId = optionalText(r.routeId)
    if (!routeId) return { entry: null, error: 'Discontinue entries require a routeId.' }
    return { entry: { mode: 'discontinue', routeId }, error: null }
  }

  if (mode === 'copy') {
    const routeId = optionalText(r.routeId)
    if (!routeId) return { entry: null, error: 'Copy entries require a routeId.' }
    const stops = parseStops(r.stops)
    if (!stops || stops.length === 0) return { entry: null, error: 'Copy entries need at least one stop with a unique name and non-negative fare.' }
    const feeMonths = parseFeeMonths(r.feeMonths)
    if (!feeMonths) return { entry: null, error: 'Copy entries need at least one valid fee month.' }
    return { entry: { mode: 'copy', routeId, stops, feeMonths }, error: null }
  }

  if (mode === 'create') {
    const routeName = optionalText(r.routeName)
    if (!routeName) return { entry: null, error: 'New route entries require a route name.' }
    const routeNumber = optionalText(r.routeNumber)
    if (!routeNumber) return { entry: null, error: 'New route entries require a route number.' }
    const stops = parseStops(r.stops)
    if (!stops || stops.length === 0) return { entry: null, error: 'New routes need at least one stop with a unique name and non-negative fare.' }
    const feeMonths = parseFeeMonths(r.feeMonths)
    if (!feeMonths) return { entry: null, error: 'New routes need at least one valid fee month.' }
    const distance = optionalNumber(r.distance)
    if (Number.isNaN(distance) || (distance !== null && distance < 0)) {
      return { entry: null, error: 'New route distance must be a non-negative number.' }
    }
    return {
      entry: {
        mode: 'create',
        routeName,
        routeNumber,
        startPoint: optionalText(r.startPoint),
        endPoint: optionalText(r.endPoint),
        distance,
        driverName: optionalText(r.driverName),
        driverPhone: optionalText(r.driverPhone),
        vehicleNumber: optionalText(r.vehicleNumber),
        stops,
        feeMonths,
      },
      error: null,
    }
  }

  return { entry: null, error: `Unknown mode "${mode}". Expected copy, create or discontinue.` }
}

// POST /api/school/transport/annual-setup
// Bulk-configure transport stop fares for a target academic year, scoped to a
// single source year for reference. Three per-route modes:
//   - copy: existing route, write stop fares for target year (upsert)
//   - create: new TransportRoute (tagged with target year) + stop fares for target year
//   - discontinue: existing route, deactivate all its stop fares for target year
// All operations run inside a single transaction.
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const authorized = await requirePermission(request, 'transport:annual-setup')
    if (!authorized) {
      return forbiddenError("You don't have permission to run the annual transport setup. Contact your school administrator.")
    }

    const body = await request.json()
    const fromAcademicYear = optionalText(body.fromAcademicYear)
    const toAcademicYear = optionalText(body.toAcademicYear)

    if (!fromAcademicYear || !ACADEMIC_YEAR_PATTERN.test(fromAcademicYear)) {
      return apiError(400, 'Please choose a valid source academic year.')
    }
    if (!toAcademicYear || !ACADEMIC_YEAR_PATTERN.test(toAcademicYear)) {
      return apiError(400, 'Please choose a valid target academic year.')
    }
    if (fromAcademicYear === toAcademicYear) {
      return apiError(400, 'Source and target academic years must be different.')
    }

    const [fromYearExists, toYearExists] = await Promise.all([
      db.academicYear.findFirst({
        where: { schoolId: user.schoolId, name: fromAcademicYear, deletedAt: null },
        select: { id: true },
      }),
      db.academicYear.findFirst({
        where: { schoolId: user.schoolId, name: toAcademicYear, isActive: true, deletedAt: null },
        select: { id: true },
      }),
    ])
    if (!fromYearExists) return apiError(400, 'The source academic year was not found for this school.')
    if (!toYearExists) return apiError(400, 'The target academic year must be an active session. Please activate it in Settings first.')

    if (!Array.isArray(body.routes)) {
      return apiError(400, 'Please provide a routes list describing what to copy, create or discontinue.')
    }
    if (body.routes.length === 0) {
      return apiError(400, 'Please include at least one route entry.')
    }

    const parsed: RouteEntry[] = []
    for (let i = 0; i < body.routes.length; i++) {
      const { entry, error } = parseRouteEntry(body.routes[i])
      if (error || !entry) return apiError(400, `Route entry #${i + 1}: ${error || 'invalid'}`)
      parsed.push(entry)
    }

    const referencedRouteIds = Array.from(
      new Set(parsed.flatMap((e) => (e.mode === 'copy' || e.mode === 'discontinue' ? [e.routeId] : [])))
    )
    const newRouteNumbers = parsed.flatMap((e) => (e.mode === 'create' ? [e.routeNumber] : []))
    if (new Set(newRouteNumbers).size !== newRouteNumbers.length) {
      return apiError(400, 'Two or more new routes share the same route number. Please use a unique route number for each new route.')
    }

    const [existingRoutes, conflictingRouteNumbers] = await Promise.all([
      referencedRouteIds.length > 0
        ? db.transportRoute.findMany({
            where: { id: { in: referencedRouteIds }, schoolId: user.schoolId, deletedAt: null },
            select: { id: true, routeName: true, routeNumber: true },
          })
        : Promise.resolve([] as Array<{ id: string; routeName: string; routeNumber: string | null }>),
      newRouteNumbers.length > 0
        ? db.transportRoute.findMany({
            where: { schoolId: user.schoolId, routeNumber: { in: newRouteNumbers }, deletedAt: null },
            select: { id: true, routeNumber: true },
          })
        : Promise.resolve([] as Array<{ id: string; routeNumber: string | null }>),
    ])

    const existingRouteMap = new Map(existingRoutes.map((r) => [r.id, r]))
    const missingRefs = referencedRouteIds.filter((id) => !existingRouteMap.has(id))
    if (missingRefs.length > 0) {
      return apiError(400, `Some referenced routes no longer exist. Please refresh and try again.`)
    }
    if (conflictingRouteNumbers.length > 0) {
      const codes = conflictingRouteNumbers.map((r) => r.routeNumber).filter(Boolean).join(', ')
      return apiError(400, `Route number(s) already in use: ${codes}. Please choose different codes.`)
    }

    let routesCreated = 0
    let routesCopied = 0
    let routesDiscontinued = 0
    let stopFaresUpserted = 0
    let stopFaresDeactivated = 0

    await db.$transaction(async (tx) => {
      for (const entry of parsed) {
        if (entry.mode === 'discontinue') {
          const result = await tx.transportStopFare.updateMany({
            where: {
              routeId: entry.routeId,
              schoolId: user.schoolId!,
              academicYear: toAcademicYear,
              isActive: true,
            },
            data: { isActive: false },
          })
          stopFaresDeactivated += result.count
          routesDiscontinued += 1
          continue
        }

        let routeId: string
        let feeMonthsJson: string

        if (entry.mode === 'create') {
          feeMonthsJson = JSON.stringify(entry.feeMonths)
          const newRoute = await tx.transportRoute.create({
            data: {
              schoolId: user.schoolId!,
              routeName: entry.routeName,
              routeNumber: entry.routeNumber,
              academicYear: toAcademicYear,
              feeMonths: feeMonthsJson,
              startPoint: entry.startPoint,
              endPoint: entry.endPoint,
              stops: JSON.stringify(entry.stops),
              distance: entry.distance,
              driverName: entry.driverName,
              driverPhone: entry.driverPhone,
              vehicleNumber: entry.vehicleNumber,
              fee: 0,
              isActive: true,
            },
            select: { id: true },
          })
          routeId = newRoute.id
          routesCreated += 1
        } else {
          routeId = entry.routeId
          feeMonthsJson = JSON.stringify(entry.feeMonths)
          routesCopied += 1
        }

        // Deactivate any prior stop fares for (route, target year) not in this batch.
        const incomingNames = entry.stops.map((s) => s.name)
        await tx.transportStopFare.updateMany({
          where: {
            routeId,
            schoolId: user.schoolId!,
            academicYear: toAcademicYear,
            stopName: { notIn: incomingNames },
            isActive: true,
          },
          data: { isActive: false },
        })

        for (const stop of entry.stops) {
          await tx.transportStopFare.upsert({
            where: {
              routeId_academicYear_stopName: {
                routeId,
                academicYear: toAcademicYear,
                stopName: stop.name,
              },
            },
            create: {
              routeId,
              schoolId: user.schoolId!,
              academicYear: toAcademicYear,
              stopName: stop.name,
              fare: stop.fare,
              feeMonths: feeMonthsJson,
              isActive: true,
            },
            update: {
              fare: stop.fare,
              feeMonths: feeMonthsJson,
              isActive: true,
            },
          })
          stopFaresUpserted += 1
        }
      }
    })

    return NextResponse.json({
      fromAcademicYear,
      toAcademicYear,
      summary: {
        routesCreated,
        routesCopied,
        routesDiscontinued,
        stopFaresUpserted,
        stopFaresDeactivated,
      },
      message:
        `Annual setup complete for ${toAcademicYear}. ` +
        `${routesCreated} new route(s), ${routesCopied} updated, ${routesDiscontinued} discontinued. ` +
        `${stopFaresUpserted} stop fare(s) saved, ${stopFaresDeactivated} deactivated.`,
    }, { status: 200 })
  } catch (error) {
    console.error('Annual transport setup error:', error)
    return internalError('running the annual transport setup')
  }
}
