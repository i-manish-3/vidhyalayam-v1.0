/**
 * GET /api/school/students/[id]/refunds/preview?withdrawalId=...
 *
 * Returns the live refund obligation for a withdrawal:
 *   { totalDue, alreadyRefunded, outstanding }
 *
 * Used by the refund dialog to show "you can refund up to ₹X" before the
 * cashier commits. Read-only, but routes through computeOutstandingObligation
 * so the same aggregate that gates POST is the one shown to the UI.
 *
 * RBAC: `fees:read`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { computeOutstandingObligation, RefundValidationError } from '@/lib/refunds'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const url = new URL(request.url)
    const withdrawalId = url.searchParams.get('withdrawalId')?.trim()
    if (!withdrawalId) {
      return apiError(400, 'withdrawalId query parameter is required')
    }

    // Confirm the withdrawal belongs to this student in this school before
    // exposing its refund obligation. computeOutstandingObligation itself
    // does not filter by tenant.
    const withdrawal = await db.studentWithdrawal.findFirst({
      where: {
        id: withdrawalId,
        studentId,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      select: { id: true, reversedAt: true, totalRefundDue: true, effectiveDate: true, reason: true },
    })
    if (!withdrawal) return apiError(404, 'Withdrawal not found for this student')

    const obligation = await db.$transaction((tx) =>
      computeOutstandingObligation(tx, withdrawalId),
    )

    return NextResponse.json({
      success: true,
      withdrawal: {
        id: withdrawal.id,
        effectiveDate: withdrawal.effectiveDate,
        reason: withdrawal.reason,
        reversedAt: withdrawal.reversedAt,
      },
      obligation,
    })
  } catch (error) {
    if (error instanceof RefundValidationError) {
      return apiError(400, error.message)
    }
    console.error('GET /students/[id]/refunds/preview failed:', error)
    return internalError('Failed to load refund preview')
  }
}
