import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// PATCH /api/school/salary/advance/[id] - Approve/reject advance
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
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

    const updated = await db.advanceRequest.update({
      where: { id },
      data: {
        approvalStatus,
        approvedBy: user.userId,
        approvedAt: new Date(),
        deductionMonth: approvalStatus === 'approved' ? (deductionMonth || advanceRequest.deductionMonth) : undefined,
        deductionYear: approvalStatus === 'approved' ? (deductionYear || advanceRequest.deductionYear) : undefined,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update advance request error:', error)
    return internalError('updating the advance request')
  }
}
