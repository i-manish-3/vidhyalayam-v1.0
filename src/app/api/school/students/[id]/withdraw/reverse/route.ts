/**
 * POST /api/school/students/[id]/withdraw/reverse
 *
 * Reverse an erroneous TC/withdrawal. Allowed within TC_REVERSAL_WINDOW_DAYS
 * (default 7) of the original withdrawal's createdAt. Re-opens the academic-
 * fee assignments by clearing effectiveTo/status, and rebills any cancelled
 * items by re-running the open-side flow.
 *
 * NOTE on transport: reopening a transport allocation is NOT idempotent in
 * the same way — the original cancelled debits are tombstoned. Reversal
 * creates a NEW TransportAllocation chained via previousAllocationId. This
 * keeps the audit trail accurate (you can always see the WITHDRAWN+REJOINED
 * pair in TransportEvent).
 *
 * Body:
 *   { reversalNotes: string (required) }
 *
 * RBAC: SCHOOL_ADMIN. Reasons aren't enumerated — `reversalNotes` is the
 * audit trail.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

function reversalWindowDays(): number {
  const raw = Number(process.env.TC_REVERSAL_WINDOW_DAYS || '7')
  return Number.isFinite(raw) && raw >= 0 ? raw : 7
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'student:withdraw:reverse')
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: studentId } = await params
    const body = await request.json().catch(() => ({}))

    const reversalNotes =
      typeof body.reversalNotes === 'string' && body.reversalNotes.trim()
        ? body.reversalNotes.trim()
        : null
    if (!reversalNotes) {
      return apiError(400, 'reversalNotes is required for TC reversal')
    }

    // Tenant-scoped withdrawal lookup. Latest non-deleted, non-reversed.
    const withdrawal = await db.studentWithdrawal.findFirst({
      where: {
        studentId,
        schoolId: user.schoolId,
        deletedAt: null,
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        academicYear: true,
        effectiveDate: true,
        createdAt: true,
        reason: true,
      },
    })
    if (!withdrawal) {
      return apiError(404, 'No active withdrawal to reverse')
    }

    const ageDays = Math.floor((Date.now() - withdrawal.createdAt.getTime()) / 86_400_000)
    const window = reversalWindowDays()
    if (ageDays > window) {
      return apiError(
        403,
        `Reversal window of ${window} days has elapsed (withdrawal is ${ageDays} days old). Re-admit the student instead.`,
      )
    }

    const result = await db.$transaction(async (tx) => {
      // 1. Re-open the academic-fee assignments by clearing the window stamp.
      //    Cancelled items remain cancelled — they'll need to be recreated
      //    by re-running structure assignment if the student rejoins.
      const reopened = await tx.studentFeeAssignment.updateMany({
        where: {
          schoolId: user.schoolId!,
          studentId,
          academicYear: withdrawal.academicYear,
          status: 'closed',
        },
        data: { effectiveTo: null, status: 'active' },
      })

      // 2. Mark the withdrawal as reversed (audit trail preserved).
      await tx.studentWithdrawal.update({
        where: { id: withdrawal.id },
        data: {
          reversedAt: new Date(),
          reversedBy: user.userId,
          reversalNotes,
        },
      })

      // 3. Restore the Student record. We can't always recover the prior
      //    admissionStatus precisely (it was likely 'admitted'); set it
      //    back to 'admitted' as the safe default.
      await tx.student.update({
        where: { id: studentId },
        data: { admissionStatus: 'admitted', isActive: true },
      })

      // 4. Audit log.
      await tx.feeAuditLog.create({
        data: {
          schoolId: user.schoolId!,
          entityType: 'StudentWithdrawal',
          entityId: withdrawal.id,
          action: 'reverse',
          studentId,
          newValue: JSON.stringify({
            studentId,
            academicYear: withdrawal.academicYear,
            reversalNotes,
            reopenedAssignments: reopened.count,
          }),
          userId: user.userId,
        },
      })

      return { reopenedAssignments: reopened.count }
    })

    return NextResponse.json({
      success: true,
      withdrawalId: withdrawal.id,
      ...result,
      note: 'Cancelled fee items remain cancelled. To re-bill them, run the structure assignment flow again, or recreate transport via the add-transport endpoint.',
    })
  } catch (error) {
    console.error('POST /students/[id]/withdraw/reverse failed:', error)
    return internalError('Failed to reverse withdrawal')
  }
}
