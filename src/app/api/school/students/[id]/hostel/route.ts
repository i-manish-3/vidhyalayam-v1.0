/**
 * POST /api/school/students/[id]/hostel
 *
 * Allocate a hostel bed to a student mid-year. Symmetric to the transport POST
 * but with bed-level capacity enforcement.
 *
 * - Pro-rates `feeMonths` by `effectiveFrom` (drops months before join)
 * - Creates a HostelAllocation, monthly FeeCollection rows, DEBIT ledger
 * - Enforces one active allocation per (student, AY) AND one student per
 *   (bed, AY) — both checked under a SELECT ... FOR UPDATE on the bed row
 * - If a previous HostelAllocation exists for this AY (chained rejoin),
 *   sets previousAllocationId for audit lineage
 * - Writes a HostelEvent (CREATED or REJOINED)
 * - Atomic; refuses overlap with an active allocation (must withdraw first)
 *
 * Body:
 *   {
 *     bedId: string,
 *     effectiveFrom?: string (YYYY-MM-DD; defaults to today),
 *     reason?: string,
 *   }
 *
 * RBAC: hostel:allocation:update (high-impact billing event).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { createFeeDebitLedgerEntry } from '@/lib/fees'
import { currentAcademicYear, parseDate, parseFeeMonths, proRateMonths, resolveRoomFare } from '@/lib/hostel-billing'

// Thrown inside the $transaction when another request beat us to the
// student's active-allocation slot or to the bed. Mapped to 409.
class HostelConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HostelConflictError'
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'hostel:allocation:update')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const bedId = typeof body.bedId === 'string' && body.bedId.trim() ? body.bedId.trim() : null
    if (!bedId) return apiError(400, 'bedId is required')

    const today = new Date()
    const effectiveFrom = parseDate(body.effectiveFrom) || today
    const academicYear = currentAcademicYear(today)
    const reasonNotes = typeof body.reason === 'string' ? body.reason.trim() || null : null

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    // Resolve the bed → room → hostel chain (tenant-scoped).
    const bed = await db.hostelBed.findFirst({
      where: { id: bedId, schoolId: user.schoolId, deletedAt: null, isActive: true },
      select: { id: true, roomId: true, hostelId: true, bedNumber: true },
    })
    if (!bed) return apiError(404, 'Bed not found')

    // Pre-flight: student already on hostel this year?
    const activeAlloc = await db.hostelAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, academicYear, isActive: true },
      select: { id: true },
    })
    if (activeAlloc) {
      return apiError(409, 'Student already has an active hostel allocation. Withdraw it first before adding a new one.')
    }

    const fareInfo = await resolveRoomFare(user.schoolId, bed.roomId, academicYear)
    if (!fareInfo) {
      return apiError(400, 'No fare configured for this room in the current academic year')
    }

    const allMonths = parseFeeMonths(fareInfo.feeMonths)
    if (allMonths.length === 0) {
      return apiError(400, 'Room has no fee months configured')
    }

    const billableMonths = proRateMonths(allMonths, academicYear, effectiveFrom)
    if (billableMonths.length === 0) {
      return apiError(400, 'No billable months remain after applying effectiveFrom')
    }

    // Most recent prior allocation for chain history.
    const prior = await db.hostelAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, academicYear },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const result = await db.$transaction(async (tx) => {
      // Race-safety: lock the BED row. Two near-simultaneous requests for the
      // same bed serialize here; the loser sees the winner's active allocation
      // and aborts. We also re-check the student's per-AY invariant.
      await tx.$queryRaw`SELECT id FROM "HostelBed" WHERE id = ${bedId} FOR UPDATE`

      const studentConflict = await tx.hostelAllocation.findFirst({
        where: { schoolId: user.schoolId!, studentId, academicYear, isActive: true },
        select: { id: true },
      })
      if (studentConflict) {
        throw new HostelConflictError('Student already has an active hostel allocation. Withdraw it first before adding a new one.')
      }

      const bedConflict = await tx.hostelAllocation.findFirst({
        where: { schoolId: user.schoolId!, bedId, academicYear, isActive: true },
        select: { id: true },
      })
      if (bedConflict) {
        throw new HostelConflictError('That bed is already occupied for this academic year. Choose a different bed.')
      }

      const allocation = await tx.hostelAllocation.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          hostelId: bed.hostelId,
          roomId: bed.roomId,
          bedId,
          academicYear,
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
              feeHeadName: 'Hostel Fee',
              notes: `Hostel fee for bed ${bed.bedNumber} (${academicYear})`,
            },
          })
          await createFeeDebitLedgerEntry({
            tx,
            schoolId: user.schoolId!,
            studentId,
            academicYear,
            feeCollectionId: collection.id,
            sourceType: 'hostel',
            sourceId: collection.id,
            feeHeadName: 'Hostel Fee',
            installmentName: month,
            description: `Hostel Fee - ${month}`,
            amount: fareInfo.fare,
            notes: `Hostel fee for bed ${bed.bedNumber} (${academicYear})`,
            createdBy: user.userId,
          })
          totalDebited += fareInfo.fare
        }
      }

      // Update Admission snapshot (current state for fast read).
      await tx.admission.updateMany({
        where: { studentId, schoolId: user.schoolId! },
        data: { hostelId: bed.hostelId, hostelRoomId: bed.roomId, hostelBedId: bedId },
      })

      await tx.hostelEvent.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          academicYear,
          eventType: prior ? 'REJOINED' : 'CREATED',
          fromAllocationId: prior?.id ?? null,
          toAllocationId: allocation.id,
          toHostelId: bed.hostelId,
          toRoom: bed.roomId,
          toBed: bed.bedNumber,
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
    if (error instanceof HostelConflictError) {
      return apiError(409, error.message)
    }
    // P2002 = unique constraint (if a production partial-unique index is added).
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'P2002'
    ) {
      return apiError(409, 'That bed or student already has an active hostel allocation for this year.')
    }
    console.error('POST /students/[id]/hostel failed:', error)
    return internalError('Failed to add hostel allocation')
  }
}
