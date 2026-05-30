/**
 * POST /api/school/students/[id]/transport
 *
 * Add a transport allocation to a student mid-year. Symmetric to the
 * transport block of the admissions endpoint but standalone.
 *
 * - Pro-rates `feeMonths` by `effectiveFrom` (drops months before join)
 * - Creates a TransportAllocation, monthly FeeCollection rows, DEBIT ledger
 * - If a previous TransportAllocation exists for this AY (chained rejoin),
 *   sets previousAllocationId for audit lineage
 * - Writes a TransportEvent (CREATED or REJOINED)
 * - Atomic; refuses overlap with an active allocation (must withdraw first)
 *
 * Body:
 *   {
 *     routeId: string,
 *     stopName: string,
 *     effectiveFrom?: string (YYYY-MM-DD; defaults to today),
 *     reason?: string,
 *   }
 *
 * RBAC: SCHOOL_ADMIN (high-impact billing event).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { createFeeDebitLedgerEntry } from '@/lib/fees'

const AY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

// Thrown from inside the $transaction when a concurrent request beat us to
// the active-allocation slot. Caught at the outer level and mapped to 409.
class ActiveAllocationConflictError extends Error {
  constructor() {
    super('ACTIVE_ALLOCATION_CONFLICT')
    this.name = 'ActiveAllocationConflictError'
  }
}

function parseDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function currentAcademicYear(today: Date): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function parseFeeMonths(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((m): m is string => typeof m === 'string' && !!m.trim())
      : []
  } catch {
    return value.split(',').map((m) => m.trim()).filter(Boolean)
  }
}

async function resolveStopFare(
  schoolId: string,
  routeId: string,
  stopName: string,
  academicYear: string,
): Promise<{ fare: number; feeMonths: string } | null> {
  const stopFare = await db.transportStopFare.findFirst({
    where: { schoolId, routeId, academicYear, stopName, isActive: true },
    select: { fare: true, feeMonths: true },
  })
  if (stopFare) return stopFare

  const route = await db.transportRoute.findFirst({
    where: { id: routeId, schoolId, academicYear, deletedAt: null, isActive: true },
    select: { stops: true, feeMonths: true },
  })
  if (!route?.stops) return null
  try {
    const stops = JSON.parse(route.stops)
    if (!Array.isArray(stops)) return null
    const match = stops.find((s) => (typeof s === 'string' ? s === stopName : s?.name === stopName))
    if (!match) return null
    return {
      fare: typeof match === 'object' && typeof match.fare === 'number' ? match.fare : 0,
      feeMonths: route.feeMonths,
    }
  } catch {
    return null
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'transport:allocation:update')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const routeId = typeof body.routeId === 'string' && body.routeId.trim() ? body.routeId.trim() : null
    const stopName = typeof body.stopName === 'string' && body.stopName.trim() ? body.stopName.trim() : null
    if (!routeId || !stopName) {
      return apiError(400, 'routeId and stopName are required')
    }

    const today = new Date()
    const effectiveFrom = parseDate(body.effectiveFrom) || today
    const academicYear = currentAcademicYear(today)
    const reasonNotes = typeof body.reason === 'string' ? body.reason.trim() || null : null

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    // Pre-flight check (cheap, surfaces a clear 409 before the heavier work).
    // The authoritative check runs again inside the transaction below under a
    // row-level lock — this guards against concurrent adds racing past the
    // pre-flight.
    const activeAlloc = await db.transportAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, academicYear, isActive: true },
      select: { id: true },
    })
    if (activeAlloc) {
      return apiError(
        409,
        'Student already has an active transport allocation. Withdraw it first before adding a new one.',
      )
    }

    const fareInfo = await resolveStopFare(user.schoolId, routeId, stopName, academicYear)
    if (!fareInfo) {
      return apiError(400, 'No fare configured for this route+stop in the current academic year')
    }

    const allMonths = parseFeeMonths(fareInfo.feeMonths)
    if (allMonths.length === 0) {
      return apiError(400, 'Route has no fee months configured')
    }

    // Pro-rate by effectiveFrom — same rule as admissions transport block.
    const [startYearStr] = academicYear.split('-')
    const startYear = Number(startYearStr)
    const effYM = effectiveFrom.getUTCFullYear() * 12 + effectiveFrom.getUTCMonth()
    const monthLabelToYM = (label: string): number | null => {
      if (!Number.isFinite(startYear)) return null
      const idx = AY_MONTHS.findIndex((m) => m.toLowerCase() === label.toLowerCase())
      if (idx === -1) return null
      const calMonth = idx <= 8 ? idx + 3 : idx - 9
      const calYear = idx <= 8 ? startYear : startYear + 1
      return calYear * 12 + calMonth
    }
    const billableMonths = allMonths.filter((label) => {
      const ym = monthLabelToYM(label)
      return ym === null || ym >= effYM
    })

    if (billableMonths.length === 0) {
      return apiError(400, 'No billable months remain after applying effectiveFrom')
    }

    // Look up the most recent prior allocation for chain history.
    const prior = await db.transportAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, academicYear },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const result = await db.$transaction(async (tx) => {
      // Race-safety: serialize concurrent transport-adds for the same student
      // by taking a row-level lock on the Student row. Two near-simultaneous
      // requests both pass the pre-flight check above, but only one can hold
      // this lock at a time. Inside the lock we re-check the active-allocation
      // invariant; the second request will see the first's row and abort.
      // Postgres releases the lock at commit/rollback.
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${studentId} FOR UPDATE`

      const conflictingActive = await tx.transportAllocation.findFirst({
        where: { schoolId: user.schoolId!, studentId, academicYear, isActive: true },
        select: { id: true },
      })
      if (conflictingActive) {
        // Surface this as a typed sentinel so the outer catch can map it to
        // a 409 instead of a generic 500.
        throw new ActiveAllocationConflictError()
      }

      const allocation = await tx.transportAllocation.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          routeId,
          academicYear,
          pickupPoint: stopName,
          dropPoint: null,
          stopName,
          fareAmount: fareInfo.fare,
          feeMonths: JSON.stringify(billableMonths),
          isActive: true,
          effectiveFrom,
          changeReason: prior ? 'REJOIN' : 'INITIAL',
          previousAllocationId: prior?.id ?? null,
        },
      })

      let totalDebited = 0
      if (fareInfo.fare > 0) {
        for (const month of billableMonths) {
          const collection = await tx.feeCollection.create({
            data: {
              schoolId: user.schoolId!,
              studentId,
              amount: fareInfo.fare,
              paidAmount: 0,
              discount: 0,
              concession: 0,
              scholarship: 0,
              fine: 0,
              paymentStatus: 'unpaid',
              installmentName: month,
              feeHeadName: 'Transport Fee',
              notes: `Transport fee for ${stopName} (${academicYear})`,
            },
          })
          await createFeeDebitLedgerEntry({
            tx,
            schoolId: user.schoolId!,
            studentId,
            academicYear,
            feeCollectionId: collection.id,
            sourceType: 'transport',
            sourceId: collection.id,
            feeHeadName: 'Transport Fee',
            installmentName: month,
            description: `Transport Fee - ${month}`,
            amount: fareInfo.fare,
            notes: `Transport fee for ${stopName} (${academicYear})`,
            createdBy: user.userId,
          })
          totalDebited += fareInfo.fare
        }
      }

      // Update Admission snapshot (current state for fast read).
      await tx.admission.updateMany({
        where: { studentId, schoolId: user.schoolId! },
        data: { transportRouteId: routeId, transportStop: stopName },
      })

      // TransportEvent for the timeline.
      await tx.transportEvent.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          academicYear,
          eventType: prior ? 'REJOINED' : 'CREATED',
          fromAllocationId: prior?.id ?? null,
          toAllocationId: allocation.id,
          toRouteId: routeId,
          toStop: stopName,
          effectiveDate: effectiveFrom,
          cancelledMonths: null,
          cancelledAmount: 0,
          reason: reasonNotes,
          performedBy: user.userId,
          cascadeFromWithdrawal: false,
        },
      })

      return { allocationId: allocation.id, billableMonths, totalDebited }
    })

    return NextResponse.json({ success: true, ...result, fare: fareInfo.fare, academicYear })
  } catch (error) {
    if (error instanceof ActiveAllocationConflictError) {
      return apiError(
        409,
        'Student already has an active transport allocation. Withdraw it first before adding a new one.',
      )
    }
    // P2002 = unique constraint violation. Hits when production has the
    // partial unique index (transport_alloc_active_uniq) installed and two
    // concurrent transactions slip past the lock — should be rare, but we
    // surface it cleanly instead of as a 500.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'P2002'
    ) {
      return apiError(
        409,
        'Student already has an active transport allocation. Withdraw it first before adding a new one.',
      )
    }
    console.error('POST /students/[id]/transport failed:', error)
    return internalError('Failed to add transport allocation')
  }
}
