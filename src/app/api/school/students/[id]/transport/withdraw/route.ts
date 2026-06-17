/**
 * POST /api/school/students/[id]/transport/withdraw
 *
 * Discontinue a student's active transport allocation mid-year. The
 * student remains enrolled — only their transport billing window closes.
 *
 * - Cancels future-month transport DEBITs + FeeCollections via
 *   applyAssignmentWindow(scope='transport')
 * - Sets TransportAllocation.effectiveTo + isActive=false + changeReason
 * - Already-paid future months stay frozen (returned as requiresRefund)
 * - Writes a TransportEvent (eventType='WITHDRAWN', cascadeFromWithdrawal=false)
 *
 * Body:
 *   {
 *     effectiveDate: string (YYYY-MM-DD),
 *     reason?: string,
 *   }
 *
 * RBAC: SCHOOL_ADMIN.
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

// Thrown from inside the $transaction when a concurrent withdraw beat us
// to the active allocation. Caught at the outer level and mapped to 409.
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
    const user = await requirePermission(request, 'transport:allocation:update')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const effectiveDate = parseEffectiveDate(body.effectiveDate)
    if (!effectiveDate) return apiError(400, 'effectiveDate is required (YYYY-MM-DD)')

    const reasonNotes = typeof body.reason === 'string' ? body.reason.trim() || null : null
    const refundEligible = body.refundEligible === true
    // 'advance' = freed onto the fee account; 'cash' = pending cash refund.
    const refundMode: 'advance' | 'cash' = body.refundMode === 'cash' ? 'cash' : 'advance'

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const allocation = await db.transportAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, academicYear: true, routeId: true, stopName: true },
    })
    if (!allocation) return apiError(404, 'No active transport allocation to withdraw')

    const result = await db.$transaction(async (tx) => {
      // Race-safety: serialize concurrent transport-withdraws for the same
      // student. Without the lock, two parallel calls would both read
      // isActive=true and both attempt to flip it; the second write would
      // overwrite the first's effectiveTo/withdrawalNotes.
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${studentId} FOR UPDATE`

      // Re-confirm under the lock — first request to land flips isActive=false.
      const stillActive = await tx.transportAllocation.findFirst({
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
        scope: 'transport',
        allocationId: allocation.id,
        effectiveTo: effectiveDate,
        reason: 'WITHDRAWN',
        reasonNotes,
        performedBy: user.userId,
        cascadeFromWithdrawal: false,
        mode: 'commit',
        // Only refund the already-paid future months when the box was ticked.
        ...(refundEligible ? { refund: { mode: refundMode } } : {}),
      })

      // advanced = sits as account advance; pending = cash owed; none = nothing freed.
      const refundStatus = r.refundedTotal <= 0 ? 'none' : refundMode === 'cash' ? 'pending' : 'advanced'

      await tx.transportEvent.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          academicYear: allocation.academicYear,
          eventType: 'WITHDRAWN',
          fromAllocationId: allocation.id,
          fromRouteId: allocation.routeId,
          fromStop: allocation.stopName,
          effectiveDate,
          cancelledMonths: JSON.stringify(
            r.cancelledItems.map((i) => i.installmentName).filter(Boolean),
          ),
          cancelledAmount: r.cancelledAmount,
          reason: reasonNotes,
          performedBy: user.userId,
          cascadeFromWithdrawal: false,
          refundMode: refundEligible ? refundMode : null,
          refundAmount: r.refundedTotal,
          refundStatus,
        },
      })

      // Clear current-allocation snapshot on Admission so the profile page
      // reflects "not on transport" without needing to read TransportEvent.
      await tx.admission.updateMany({
        where: { studentId, schoolId: user.schoolId! },
        data: { transportRouteId: null, transportStop: null },
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
      refundEligible,
      requiresRefund: refundEligible ? result.skippedDueToAllocations : [],
      totalRefundDue: refundEligible ? result.totalRefundable : 0,
      refundMode: refundEligible ? refundMode : null,
      refundedTotal: result.refundedTotal,
      cashRefundTotal: result.cashRefundTotal,
    })
  } catch (error) {
    if (error instanceof ConcurrentWithdrawalError) {
      return apiError(
        409,
        'Allocation was already withdrawn by another request. Refresh and try again.',
      )
    }
    console.error('POST /students/[id]/transport/withdraw failed:', error)
    return internalError('Failed to withdraw transport allocation')
  }
}

const REFUND_METHODS = new Set(['cash', 'bank', 'adjustment'])

// PATCH /api/school/students/[id]/transport/withdraw — mark a pending CASH refund
// (from a transport discontinue) as physically paid. Body: { eventId, method }.
// No ledger money moves; the discontinue already accounted for it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'transport:allocation:update')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))
    const eventId = typeof body.eventId === 'string' ? body.eventId : ''
    const method = REFUND_METHODS.has(body.method) ? body.method : 'cash'
    if (!eventId) return apiError(400, 'eventId is required')

    const event = await db.transportEvent.findFirst({
      where: { id: eventId, schoolId: user.schoolId, studentId },
      select: { id: true, refundStatus: true, refundAmount: true },
    })
    if (!event) return apiError(404, 'Transport event not found')
    if (event.refundStatus !== 'pending') return apiError(400, 'This refund is not pending.')

    // Conditional update guards against a concurrent double-settle; audit is in
    // the same txn so a settled refund always has a matching trail.
    const settled = await db.$transaction(async (tx) => {
      const res = await tx.transportEvent.updateMany({
        where: { id: event.id, refundStatus: 'pending' },
        data: { refundStatus: 'settled', refundSettledAt: new Date(), refundSettledBy: user.userId, refundMethod: method },
      })
      if (res.count === 0) return false
      await tx.feeAuditLog.create({
        data: {
          schoolId: user.schoolId!, entityType: 'TransportEvent', entityId: event.id, action: 'refund_settled',
          studentId, userId: user.userId,
          newValue: JSON.stringify({ amount: event.refundAmount, method }),
        },
      })
      return true
    })
    if (!settled) return apiError(409, 'This refund was already settled.')

    return NextResponse.json({ success: true, amount: event.refundAmount, method, message: `₹${event.refundAmount} cash refund marked as paid (${method}).` })
  } catch (error) {
    console.error('PATCH /students/[id]/transport/withdraw failed:', error)
    return internalError('settling the refund')
  }
}
