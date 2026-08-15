import { NextRequest, NextResponse } from 'next/server'
import { requireRole, requirePermission } from '@/lib/api-auth'
import {
  apiError,
  forbiddenError,
  internalError,
  notFoundError,
  unauthorizedError,
} from '@/lib/api-errors'
import { ChangeGroupError, changeFeeGroupForAssignment } from '@/lib/fees-change-group'

// PATCH /api/school/fees/assignments/[id]/change-group
// Moves a single zero-paid fee assignment onto a different fee group. The
// shareable logic (cancel old demand + rebuild with new group) lives in
// changeFeeGroupForAssignment so bulk-change-group stays identical.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // SUPER_ADMIN is intentionally excluded — only SCHOOL_ADMIN (or delegated users via permission) can change fee groups.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to change fee groups. Contact your school administrator.")
      }
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const newFeesGroupId = typeof body.newFeesGroupId === 'string' ? body.newFeesGroupId.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    let result
    try {
      result = await changeFeeGroupForAssignment({
        assignmentId: id,
        newFeesGroupId,
        schoolId: user.schoolId,
        assignedBy: user.userId,
        reason,
      })
    } catch (err) {
      if (err instanceof ChangeGroupError) {
        if (err.code === 'not_found') {
          return notFoundError('StudentFeeAssignment')
        }
        return apiError(400, err.message)
      }
      throw err
    }

    return NextResponse.json({
      assignment: result,
      message: 'Fee group changed.',
    })
  } catch (error) {
    console.error('Change fee group error:', error)
    return internalError('changing the fee group')
  }
}