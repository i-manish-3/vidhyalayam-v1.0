/**
 * POST /api/school/students/[id]/hostel/withdraw
 *
 * Discontinue a student's active hostel allocation mid-year. The student
 * remains enrolled — only their hostel billing window closes.
 *
 * - Cancels future-month hostel DEBITs + FeeCollections via
 *   applyAssignmentWindow(scope='hostel')
 * - Sets HostelAllocation.effectiveTo + isActive=false + changeReason
 * - Already-paid future months stay frozen (returned as requiresRefund)
 * - Writes a HostelEvent (eventType='WITHDRAWN', cascadeFromWithdrawal=false)
 *
 * Body: { effectiveDate: string (YYYY-MM-DD), reason?: string }
 * RBAC: hostel:allocation:update.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { applyAssignmentWindow } from '@/lib/billing-window'

function parseEffectiveDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

class ConcurrentWithdrawalError extends Error {
  constructor() {
    super('CONCURRENT_WITHDRAWAL')
    this.name = 'ConcurrentWithdrawalError'
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

    const effectiveDate = parseEffectiveDate(body.effectiveDate)
    if (!effectiveDate) return apiError(400, 'effectiveDate is required (YYYY-MM-DD)')

    const reasonNotes = typeof body.reason === 'string' ? body.reason.trim() || null : null

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const allocation = await db.hostelAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, academicYear: true, hostelId: true, roomId: true, bedId: true },
    })
    if (!allocation) return apiError(404, 'No active hostel allocation to withdraw')

    // Resolve bed number for the event timeline.
    const bed = await db.hostelBed.findUnique({ where: { id: allocation.bedId }, select: { bedNumber: true } })

    const result = await db.$transaction(async (tx) => {
      // Race-safety: lock the bed row so concurrent withdraws serialize.
      await tx.$queryRaw`SELECT id FROM "HostelBed" WHERE id = ${allocation.bedId} FOR UPDATE`

      const stillActive = await tx.hostelAllocation.findFirst({
        where: { id: allocation.id, isActive: true },
        select: { id: true },
      })
      if (!stillActive) {
        throw new ConcurrentWithdrawalError()
      }

      const r = await applyAssignmentWindow({
        tx,
        schoolId: user.schoolId!,
        studentId,
        scope: 'hostel',
        hostelAllocationId: allocation.id,
        effectiveTo: effectiveDate,
        reason: 'WITHDRAWN',
        reasonNotes,
        performedBy: user.userId,
        cascadeFromWithdrawal: false,
        mode: 'commit',
      })

      await tx.hostelEvent.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          academicYear: allocation.academicYear,
          eventType: 'WITHDRAWN',
          fromAllocationId: allocation.id,
          fromHostelId: allocation.hostelId,
          fromRoom: allocation.roomId,
          fromBed: bed?.bedNumber ?? null,
          effectiveDate,
          cancelledMonths: JSON.stringify(r.cancelledItems.map((i) => i.installmentName).filter(Boolean)),
          cancelledAmount: r.cancelledAmount,
          reason: reasonNotes,
          performedBy: user.userId,
          cascadeFromWithdrawal: false,
        },
      })

      // Clear current-allocation snapshot on Admission.
      await tx.admission.updateMany({
        where: { studentId, schoolId: user.schoolId! },
        data: { hostelId: null, hostelRoomId: null, hostelBedId: null },
      })

      return r
    })

    return NextResponse.json({
      success: true,
      allocationId: allocation.id,
      academicYear: allocation.academicYear,
      effectiveDate: effectiveDate.toISOString(),
      cancelledItems: result.cancelledItems,
      cancelledAmount: result.cancelledAmount,
      requiresRefund: result.skippedDueToAllocations,
      totalRefundDue: result.totalRefundable,
    })
  } catch (error) {
    if (error instanceof ConcurrentWithdrawalError) {
      return apiError(409, 'Allocation was already withdrawn by another request. Refresh and try again.')
    }
    console.error('POST /students/[id]/hostel/withdraw failed:', error)
    return internalError('Failed to withdraw hostel allocation')
  }
}
