import { db } from '../../src/lib/db'

const ACADEMIC_YEAR = '2025-2026'
// April → March, JS month indexes
const FEE_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2]

async function main() {
  console.log('🌱 Seeding transport stop fares and student allocations...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) throw new Error('Seed school "dps-delhi" not found. Run the core seed first.')

  const routes = await db.transportRoute.findMany({
    where: { schoolId: school.id, deletedAt: null, isActive: true },
    orderBy: { routeNumber: 'asc' },
  })
  if (routes.length === 0) {
    console.log('↺ No transport routes found. Skipping transport seed.')
    return
  }

  // ============================================
  // STOP FARES — per route × per stop in route.stops JSON
  // ============================================
  let stopFaresCreated = 0
  const stopFareIndex = new Map<string, { routeId: string; stopName: string; fare: number }>() // routeId|stopName → record

  for (const route of routes) {
    if (!route.academicYear) continue
    let stops: string[] = []
    try {
      const parsed = route.stops ? JSON.parse(route.stops) : []
      if (Array.isArray(parsed)) stops = parsed.filter((s): s is string => typeof s === 'string')
    } catch {
      stops = []
    }
    if (stops.length === 0) continue

    const baseFare = route.fee || 1500
    // Fare ascends with stop distance from origin: base, base+200, base+400, ...
    for (let i = 0; i < stops.length; i++) {
      const stopName = stops[i]
      const fare = baseFare + i * 200
      const existing = await db.transportStopFare.findFirst({
        where: { routeId: route.id, academicYear: ACADEMIC_YEAR, stopName },
      })
      if (existing) {
        stopFareIndex.set(`${route.id}|${stopName}`, { routeId: route.id, stopName, fare: existing.fare })
        continue
      }
      const created = await db.transportStopFare.create({
        data: {
          schoolId: school.id,
          routeId: route.id,
          academicYear: ACADEMIC_YEAR,
          stopName,
          fare,
          feeMonths: JSON.stringify(FEE_MONTHS),
          isActive: true,
        },
      })
      stopFareIndex.set(`${route.id}|${stopName}`, { routeId: route.id, stopName, fare: created.fare })
      stopFaresCreated++
    }
  }
  console.log(`✅ Created ${stopFaresCreated} transport stop fares`)

  // ============================================
  // ALLOCATIONS — assign 2 demo students to routes/stops
  // ============================================
  const demoStudents = await db.student.findMany({
    where: { schoolId: school.id, admissionNumber: { startsWith: 'ADM-SEED-2025-' }, deletedAt: null },
    orderBy: { admissionNumber: 'asc' },
    take: 2,
  })

  if (demoStudents.length === 0) {
    console.log('↺ No demo students found. Skipping transport allocations.')
    return
  }

  let allocationsCreated = 0
  for (let i = 0; i < demoStudents.length; i++) {
    const student = demoStudents[i]
    const route = routes[i % routes.length]
    let stops: string[] = []
    try {
      const parsed = route.stops ? JSON.parse(route.stops) : []
      if (Array.isArray(parsed)) stops = parsed.filter((s): s is string => typeof s === 'string')
    } catch {
      stops = []
    }
    if (stops.length === 0) continue

    const stopName = stops[Math.min(i, stops.length - 1)]
    const stopFare = stopFareIndex.get(`${route.id}|${stopName}`)
    const fareAmount = stopFare?.fare || route.fee || 1500

    const existing = await db.transportAllocation.findFirst({
      where: { schoolId: school.id, studentId: student.id, academicYear: ACADEMIC_YEAR, isActive: true },
    })
    if (existing) continue

    await db.transportAllocation.create({
      data: {
        schoolId: school.id,
        studentId: student.id,
        routeId: route.id,
        academicYear: ACADEMIC_YEAR,
        pickupPoint: stopName,
        dropPoint: stopName,
        stopName,
        fareAmount,
        feeMonths: JSON.stringify(FEE_MONTHS),
        isActive: true,
      },
    })
    allocationsCreated++
  }
  console.log(`✅ Created ${allocationsCreated} transport allocations`)

  console.log('🚌 Transport seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
