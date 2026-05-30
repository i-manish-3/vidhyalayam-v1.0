/**
 * POST /api/school/students/[id]/refunds/[refundId]/void
 *
 * Voids a previously-issued refund. Writes a counter-CREDIT ledger row so
 * the student's running balance returns to its pre-refund state, and stamps
 * voidedAt / voidedBy / voidReason / voidLedgerEntryId on the refund. The
 * original refund row stays — voiding is a soft reversal for audit, not a
 * delete.
 *
 * Body: { reason: string }  — non-empty, becomes voidReason and the ledger
 * entry's notes field.
 *
 * RBAC: `fees:refund`. (Issuing and voiding are the same trust boundary —
 * cashiers correcting their own data-entry errors should not need a higher
 * role for the second half of the round-trip.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { voidRefund, RefundValidationError } from '@/lib/refunds'

function mapRefundError(err: RefundValidationError) {
  switch (err.code) {
    case 'REFUND_NOT_FOUND':
      return apiError(404, err.message)
    case 'REFUND_ALREADY_VOIDED':
      return apiError(409, err.message)
    default:
      return apiError(400, err.message)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; refundId: string }> },
) {
  try {
    const user = await requirePermission(request, 'fees:refund')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId, refundId } = await params
    const body = await request.json().catch(() => ({}))

    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return apiError(400, 'reason is required to void a refund')
    }

    // Tenant-scoped student check.
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    // Confirm the refund actually belongs to this student before opening
    // the transaction. voidRefund itself checks schoolId but not studentId
    // — the URL pairing of /students/[id]/refunds/[refundId] is part of
    // the contract, so a mismatch should 404, not silently accept.
    const refund = await db.studentFeeRefund.findFirst({
      where: {
        id: refundId,
        schoolId: user.schoolId,
        studentId,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!refund) return apiError(404, 'Refund not found for this student')

    const updated = await db.$transaction(async (tx) => {
      return voidRefund({
        tx,
        schoolId: user.schoolId!,
        refundId,
        reason,
        performedBy: user.userId,
      })
    })

    return NextResponse.json({ success: true, refund: updated })
  } catch (error) {
    if (error instanceof RefundValidationError) {
      return mapRefundError(error)
    }
    console.error('POST /students/[id]/refunds/[refundId]/void failed:', error)
    return internalError('Failed to void refund')
  }
}
