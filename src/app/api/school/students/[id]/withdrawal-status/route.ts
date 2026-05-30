/**
 * GET /api/school/students/[id]/withdrawal-status
 *
 * Returns the current/historical withdrawal record for a student so the UI
 * can render a "Withdrawn on DD-MM-YYYY (TC)" banner on the profile and
 * disable mutating actions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, [
      'SUPER_ADMIN',
      'SCHOOL_ADMIN',
      'TEACHER',
      'PARENT',
      'STAFF',
    ])
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, admissionStatus: true, isActive: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const withdrawals = await db.studentWithdrawal.findMany({
      where: { schoolId: user.schoolId, studentId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        academicYear: true,
        effectiveDate: true,
        reason: true,
        reasonNotes: true,
        refundEligible: true,
        cancelledAmount: true,
        totalRefundDue: true,
        performedBy: true,
        reversedAt: true,
        reversedBy: true,
        reversalNotes: true,
        createdAt: true,
      },
    })

    const active = withdrawals.find((w) => !w.reversedAt) || null

    return NextResponse.json({
      success: true,
      isWithdrawn: !!active,
      admissionStatus: student.admissionStatus,
      isActive: student.isActive,
      activeWithdrawal: active,
      history: withdrawals,
    })
  } catch (error) {
    console.error('GET /students/[id]/withdrawal-status failed:', error)
    return internalError('Failed to fetch withdrawal status')
  }
}
