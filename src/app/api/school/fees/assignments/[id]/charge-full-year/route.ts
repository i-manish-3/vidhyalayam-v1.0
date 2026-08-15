import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requirePermission } from '@/lib/api-auth'
import {
  apiError,
  forbiddenError,
  internalError,
  notFoundError,
  unauthorizedError,
} from '@/lib/api-errors'
import { FullYearRecomputeError, recomputeFullYearForAssignment } from '@/lib/fees-full-year'

// PATCH /api/school/fees/assignments/[id]/charge-full-year
// Recomputes a zero-paid, pro-rated fee assignment as a full-year demand.
// The shareable logic (hard-delete + rebuild + transport top-up) lives in
// recomputeFullYearForAssignment so bulk-charge-full-year stays identical.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // SUPER_ADMIN is intentionally excluded — same restriction as change-group.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to change fee billing. Contact your school administrator.")
      }
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    let result
    try {
      result = await recomputeFullYearForAssignment({
        assignmentId: id,
        schoolId: user.schoolId,
        assignedBy: user.userId,
        reason,
      })
    } catch (err) {
      if (err instanceof FullYearRecomputeError) {
        if (err.code === 'not_found') {
          return notFoundError('StudentFeeAssignment')
        }
        return apiError(400, err.message)
      }
      throw err
    }

    const transportNote =
      result.transportMonthsAdded > 0
        ? ` Transport extended by ${result.transportMonthsAdded} month${result.transportMonthsAdded === 1 ? '' : 's'}.`
        : ''

    return NextResponse.json({
      assignment: { id: result.assignmentId },
      message: `Fee demand recomputed for the full academic year.${transportNote}`,
    })
  } catch (error) {
    console.error('Charge full year error:', error)
    return internalError('recomputing the full-year fee demand')
  }
}