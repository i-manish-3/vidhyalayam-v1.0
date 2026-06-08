/**
 * POST /api/school/students/[id]/withdraw/preview
 *
 * Dry-run of the TC/withdrawal cascade. Returns the same impact shape as
 * POST .../withdraw without writing anything. The UI calls this every time
 * the cashier changes the effective-date input so they see exactly what
 * gets cancelled vs. flagged for refund before they confirm.
 *
 * Body: same as withdraw POST.
 *
 * Identical safety: SCHOOL_ADMIN required, same backdate guard, no writes
 * even on success.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  applyAssignmentWindow,
  type WindowReason,
  type WindowChangeResult,
} from '@/lib/billing-window'

const VALID_REASONS = ['TC', 'DROPOUT', 'TRANSFER', 'COMPLETED', 'OTHER'] as const
type ValidReason = (typeof VALID_REASONS)[number]

function backdateLimitDays(): number {
  const raw = Number(process.env.TC_BACKDATE_LIMIT_DAYS || '30')
  return Number.isFinite(raw) && raw >= 0 ? raw : 30
}

function parseEffectiveDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

function currentAcademicYear(today: Date): string {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'student:withdraw')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const effectiveDate = parseEffectiveDate(body.effectiveDate)
    if (!effectiveDate) {
      return apiError(400, 'effectiveDate is required (YYYY-MM-DD)')
    }
    const reason = body.reason as ValidReason
    if (!VALID_REASONS.includes(reason)) {
      return apiError(400, `reason must be one of: ${VALID_REASONS.join(', ')}`)
    }
    const reasonNotes = typeof body.reasonNotes === 'string' ? body.reasonNotes.trim() || null : null

    const today = new Date()
    const ageDays = Math.floor((today.getTime() - effectiveDate.getTime()) / 86_400_000)
    const limit = backdateLimitDays()
    if (ageDays > limit && user.role !== 'SUPER_ADMIN') {
      return apiError(403, `Backdating beyond ${limit} days requires SUPER_ADMIN`)
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const academicYear = currentAcademicYear(today)

    // Preview already withdrawn — return the existing record's stats so the
    // UI can render a "Already withdrawn" state with the right amounts.
    const existing = await db.studentWithdrawal.findFirst({
      where: { studentId, academicYear, deletedAt: null },
      select: { id: true, effectiveDate: true, reason: true, cancelledAmount: true, totalRefundDue: true },
    })

    const result = await db.$transaction(async (tx) => {
      const assignments = await tx.studentFeeAssignment.findMany({
        where: { schoolId: user.schoolId!, studentId, academicYear, status: 'active', deletedAt: null },
        select: { id: true },
      })
      const academicResults: WindowChangeResult[] = []
      for (const a of assignments) {
        academicResults.push(
          await applyAssignmentWindow({
            tx,
            schoolId: user.schoolId!,
            studentId,
            scope: 'academic',
            assignmentId: a.id,
            effectiveTo: effectiveDate,
            reason: reason === 'TC' ? 'TC' : (reason as WindowReason),
            reasonNotes,
            performedBy: user.userId,
            cascadeFromWithdrawal: true,
            mode: 'preview',
          }),
        )
      }

      const allocations = await tx.transportAllocation.findMany({
        where: { schoolId: user.schoolId!, studentId, academicYear, isActive: true },
        select: { id: true },
      })
      const transportResults: WindowChangeResult[] = []
      for (const alloc of allocations) {
        transportResults.push(
          await applyAssignmentWindow({
            tx,
            schoolId: user.schoolId!,
            studentId,
            scope: 'transport',
            allocationId: alloc.id,
            effectiveTo: effectiveDate,
            reason: 'STUDENT_WITHDRAWN',
            reasonNotes,
            performedBy: user.userId,
            cascadeFromWithdrawal: true,
            mode: 'preview',
          }),
        )
      }
      const hostelAllocations = await tx.hostelAllocation.findMany({
        where: { schoolId: user.schoolId!, studentId, academicYear, isActive: true },
        select: { id: true },
      })
      const hostelResults: WindowChangeResult[] = []
      for (const alloc of hostelAllocations) {
        hostelResults.push(
          await applyAssignmentWindow({
            tx,
            schoolId: user.schoolId!,
            studentId,
            scope: 'hostel',
            hostelAllocationId: alloc.id,
            effectiveTo: effectiveDate,
            reason: 'STUDENT_WITHDRAWN',
            reasonNotes,
            performedBy: user.userId,
            cascadeFromWithdrawal: true,
            mode: 'preview',
          }),
        )
      }
      return { academicResults, transportResults, hostelResults }
    })

    const allCancelled = [
      ...result.academicResults.flatMap((r) => r.cancelledItems),
      ...result.transportResults.flatMap((r) => r.cancelledItems),
      ...result.hostelResults.flatMap((r) => r.cancelledItems),
    ]
    const allSkipped = [
      ...result.academicResults.flatMap((r) => r.skippedDueToAllocations),
      ...result.transportResults.flatMap((r) => r.skippedDueToAllocations),
      ...result.hostelResults.flatMap((r) => r.skippedDueToAllocations),
    ]
    const cancelledAmount =
      result.academicResults.reduce((s, r) => s + r.cancelledAmount, 0) +
      result.transportResults.reduce((s, r) => s + r.cancelledAmount, 0) +
      result.hostelResults.reduce((s, r) => s + r.cancelledAmount, 0)
    const totalRefundDue =
      result.academicResults.reduce((s, r) => s + r.totalRefundable, 0) +
      result.transportResults.reduce((s, r) => s + r.totalRefundable, 0) +
      result.hostelResults.reduce((s, r) => s + r.totalRefundable, 0)

    return NextResponse.json({
      success: true,
      effectiveDate: effectiveDate.toISOString(),
      academicYear,
      reason,
      cancelledItems: allCancelled,
      cancelledAmount,
      requiresRefund: allSkipped,
      totalRefundDue,
      academicAssignmentsClosed: result.academicResults.length,
      transportAllocationsClosed: result.transportResults.length,
      hostelAllocationsClosed: result.hostelResults.length,
      alreadyWithdrawn: existing
        ? {
            withdrawalId: existing.id,
            effectiveDate: existing.effectiveDate.toISOString(),
            reason: existing.reason,
            cancelledAmount: existing.cancelledAmount,
            totalRefundDue: existing.totalRefundDue,
          }
        : null,
    })
  } catch (error) {
    console.error('POST /students/[id]/withdraw/preview failed:', error)
    return internalError('Failed to preview withdrawal')
  }
}
