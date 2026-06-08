import { db } from '@/lib/db'
import type { BulkLookups, TransportStopInfo } from '@/lib/bulk-admission'

function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === 'string' && !!m.trim())
      : []
  } catch {
    return value
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
  }
}

/**
 * Pre-fetch all reference data needed to validate a bulk admission upload.
 *
 * One call returns everything: classes, sections, fee groups, fee structures,
 * existing admission numbers, transport routes/stops, sibling lookup, the
 * admission window + per-class cap, and current per-class admission counts.
 * The validator then runs row-by-row against these in-memory maps with zero
 * further DB calls.
 *
 * Server-only — must not be imported from client code (depends on @/lib/db).
 */
export async function loadBulkAdmissionLookups(
  schoolId: string,
  academicYear: string,
): Promise<BulkLookups> {
  const [
    classes,
    sections,
    feesGroups,
    feesStructures,
    existingStudents,
    routes,
    stopFares,
    settings,
    admissionsByClass,
  ] = await Promise.all([
    db.class.findMany({
      where: { schoolId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
    db.section.findMany({
      where: { schoolId, deletedAt: null },
      select: { id: true, name: true, classId: true },
    }),
    db.feesGroup.findMany({
      where: { schoolId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
    }),
    db.feesStructure.findMany({
      where: {
        schoolId,
        academicYear,
        isActive: true,
        status: 'active',
        deletedAt: null,
      },
      select: { classId: true, feesGroupId: true },
    }),
    db.student.findMany({
      where: { schoolId, deletedAt: null },
      select: { id: true, admissionNumber: true, familyId: true },
    }),
    db.transportRoute.findMany({
      where: { schoolId, academicYear, deletedAt: null, isActive: true },
      select: { id: true, routeName: true, fee: true, feeMonths: true, stops: true },
    }),
    db.transportStopFare.findMany({
      where: { schoolId, academicYear, isActive: true },
      select: { routeId: true, stopName: true, fare: true, feeMonths: true },
    }),
    db.admissionSetting.findUnique({
      where: { schoolId },
      select: {
        admissionOpenDate: true,
        admissionCloseDate: true,
        maxApplicationsPerClass: true,
      },
    }),
    db.admission.groupBy({
      by: ['classId'],
      where: { schoolId, academicYear, deletedAt: null },
      _count: { _all: true },
    }),
  ])

  const classByName = new Map<string, string>()
  for (const c of classes) classByName.set(c.name.toLowerCase(), c.id)

  const sectionByClassAndName = new Map<string, string>()
  for (const s of sections) sectionByClassAndName.set(`${s.classId}|${s.name.toLowerCase()}`, s.id)

  const feesGroupByName = new Map<string, string>()
  for (const g of feesGroups) feesGroupByName.set(g.name.toLowerCase(), g.id)

  const feesStructureKeys = new Set<string>()
  for (const fs of feesStructures) feesStructureKeys.add(`${fs.classId}|${fs.feesGroupId}`)

  const existingAdmissionNumbers = new Set<string>()
  const studentByAdmissionNumber = new Map<string, { studentId: string; familyId: string | null }>()
  for (const s of existingStudents) {
    if (s.admissionNumber) {
      existingAdmissionNumbers.add(s.admissionNumber)
      studentByAdmissionNumber.set(s.admissionNumber, { studentId: s.id, familyId: s.familyId })
    }
  }

  // ── Transport ──────────────────────────────────────────────────────────────
  // Prefer explicit TransportStopFare rows. Fall back to a route's legacy
  // `stops` JSON (same precedence as the single-admission route).
  const routeById = new Map<string, (typeof routes)[number]>()
  const transportRouteNames = new Set<string>()
  for (const r of routes) {
    routeById.set(r.id, r)
    transportRouteNames.add(r.routeName.toLowerCase())
  }

  const transportStopByRouteAndName = new Map<string, TransportStopInfo>()
  for (const sf of stopFares) {
    const route = routeById.get(sf.routeId)
    if (!route) continue
    const key = `${route.routeName.toLowerCase()}|${sf.stopName.toLowerCase()}`
    transportStopByRouteAndName.set(key, {
      routeId: route.id,
      routeName: route.routeName,
      stopName: sf.stopName,
      fare: sf.fare,
      feeMonths: parseFeeMonths(sf.feeMonths),
    })
  }

  // Legacy fallback: stops embedded as JSON on the route. Only fill keys that
  // an explicit stop-fare row didn't already provide.
  for (const r of routes) {
    if (!r.stops) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(r.stops)
    } catch {
      continue
    }
    if (!Array.isArray(parsed)) continue
    const routeMonths = parseFeeMonths(r.feeMonths)
    for (const stop of parsed) {
      const stopName = typeof stop === 'string' ? stop : stop && typeof stop === 'object' ? stop.name : null
      if (!stopName || typeof stopName !== 'string') continue
      const key = `${r.routeName.toLowerCase()}|${stopName.toLowerCase()}`
      if (transportStopByRouteAndName.has(key)) continue
      const fare =
        stop && typeof stop === 'object' && typeof stop.fare === 'number' ? stop.fare : r.fee || 0
      transportStopByRouteAndName.set(key, {
        routeId: r.id,
        routeName: r.routeName,
        stopName,
        fare,
        feeMonths: routeMonths,
      })
    }
  }

  // ── Admission window + class cap ─────────────────────────────────────────────
  const admissionOpenAt = settings?.admissionOpenDate ? new Date(settings.admissionOpenDate).getTime() : null
  const admissionCloseAt = settings?.admissionCloseDate ? new Date(settings.admissionCloseDate).getTime() : null
  const maxApplicationsPerClass = settings?.maxApplicationsPerClass ?? null

  const admissionCountByClassId = new Map<string, number>()
  for (const row of admissionsByClass) {
    if (row.classId) admissionCountByClassId.set(row.classId, row._count._all)
  }

  return {
    classByName,
    sectionByClassAndName,
    feesGroupByName,
    feesStructureKeys,
    existingAdmissionNumbers,
    transportStopByRouteAndName,
    transportRouteNames,
    studentByAdmissionNumber,
    admissionOpenAt,
    admissionCloseAt,
    maxApplicationsPerClass,
    admissionCountByClassId,
  }
}
