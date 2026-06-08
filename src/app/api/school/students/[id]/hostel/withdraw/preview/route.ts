/**
 * POST /api/school/students/[id]/hostel/withdraw/preview
 *
 * Dry-run for hostel-only withdrawal. Same shape as the commit endpoint but no
 * writes. UI calls this on every effective-date change.
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

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const allocation = await db.hostelAllocation.findFirst({
      where: { schoolId: user.schoolId, studentId, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, academicYear: true, bedId: true },
    })
    if (!allocation) {
      return NextResponse.json({
        success: true,
        canCommit: false,
        blockers: ['No active hostel allocation to withdraw'],
        cancelledItems: [],
        cancelledAmount: 0,
        requiresRefund: [],
        totalRefundDue: 0,
      })
    }

    const result = await db.$transaction(async (tx) => {
      return applyAssignmentWindow({
        tx,
        schoolId: user.schoolId!,
        studentId,
        scope: 'hostel',
        hostelAllocationId: allocation.id,
        effectiveTo: effectiveDate,
        reason: 'WITHDRAWN',
        reasonNotes: null,
        performedBy: user.userId,
        cascadeFromWithdrawal: false,
        mode: 'preview',
      })
    })

    return NextResponse.json({
      success: true,
      canCommit: true,
      blockers: [],
      allocationId: allocation.id,
      effectiveDate: effectiveDate.toISOString(),
      cancelledItems: result.cancelledItems,
      cancelledAmount: result.cancelledAmount,
      requiresRefund: result.skippedDueToAllocations,
      totalRefundDue: result.totalRefundable,
    })
  } catch (error) {
    console.error('POST /students/[id]/hostel/withdraw/preview failed:', error)
    return internalError('Failed to preview hostel withdrawal')
  }
}
