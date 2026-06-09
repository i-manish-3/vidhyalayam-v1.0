import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// PATCH /api/school/salary/advance/[id] - Approve/reject advance
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'salary:advance')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage salary advances.")
    }

    const { id } = await params
    const body = await request.json()
    const { approvalStatus, deductionMonth, deductionYear } = body

    if (!approvalStatus || !['approved', 'rejected'].includes(approvalStatus)) {
      return apiError(400, 'Please choose whether to approve or reject this advance request.')
    }

    // Verify advance request belongs to this school
    const advanceRequest = await db.advanceRequest.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!advanceRequest) {
      return notFoundError('Advance request')
    }

    if (advanceRequest.approvalStatus !== 'pending') {
      return apiError(400, 'This advance request has already been processed. No further changes can be made.')
    }

    const auditContext = extractSalaryAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx: typeof db) => {
      const result = await tx.advanceRequest.update({
        where: { id },
        data: {
          approvalStatus,
          approvedBy: user.userId,
          approvedAt: new Date(),
          deductionMonth: approvalStatus === 'approved' ? (deductionMonth || advanceRequest.deductionMonth) : undefined,
          deductionYear: approvalStatus === 'approved' ? (deductionYear || advanceRequest.deductionYear) : undefined,
        },
      })
      await logSalaryEvent(tx, user.schoolId!, 'AdvanceRequest', result.id, approvalStatus, advanceRequest, result, {
        ...auditContext,
        staffType: advanceRequest.staffType,
        staffId: advanceRequest.staffId,
        diffSummary: `Advance request ${approvalStatus} (amount ${advanceRequest.amount})`,
      })
      return result
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update advance request error:', error)
    return internalError('updating the advance request')
  }
}
