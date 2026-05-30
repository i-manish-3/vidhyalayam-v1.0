/**
 * POST /api/school/students/[id]/withdraw
 *
 * Issue Transfer Certificate (or record dropout/transfer) for a student.
 * Closes their academic-fee assignments AND transport allocations for the
 * current AY, cancelling all future-dated unpaid items in one transaction.
 * Items that already received payment are returned as `requiresRefund` —
 * the cashier handles those in a separate manual refund flow.
 *
 * Body shape:
 *   {
 *     effectiveDate: string (YYYY-MM-DD),
 *     reason: 'TC' | 'DROPOUT' | 'TRANSFER' | 'COMPLETED' | 'OTHER',
 *     reasonNotes?: string,
 *     refundEligible?: boolean,
 *     transferCertNo?: string,
 *   }
 *
 * RBAC: SCHOOL_ADMIN required (TC issuance is a high-impact, irreversible-by-
 * default action). Backdating beyond TC_BACKDATE_LIMIT_DAYS env (default 30)
 * is rejected for everyone except SUPER_ADMIN with reasonNotes set.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { applyAssignmentWindow, type WindowReason, type WindowChangeResult } from '@/lib/billing-window'

const VALID_REASONS = ['TC', 'DROPOUT', 'TRANSFER', 'COMPLETED', 'OTHER'] as const
type ValidReason = (typeof VALID_REASONS)[number]

// Thrown from inside the $transaction when a concurrent withdraw beat us
// to inserting the StudentWithdrawal row. Caught at the outer level and
// mapped to 409 instead of bubbling as a generic 500.
class ConcurrentWithdrawalError extends Error {
  constructor() {
    super('CONCURRENT_WITHDRAWAL')
    this.name = 'ConcurrentWithdrawalError'
  }
}

function backdateLimitDays(): number {
  const raw = Number(process.env.TC_BACKDATE_LIMIT_DAYS || '30')
  return Number.isFinite(raw) && raw >= 0 ? raw : 30
}

function parseEffectiveDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !s.trim()) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  // Normalise to UTC end-of-day so "effectiveDate = 15-Jul" includes
  // anything dated up to 23:59:59.999 on 15-Jul.
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

    // Backdate guard: SCHOOL_ADMIN can backdate up to N days; older than that
    // requires SUPER_ADMIN + a non-empty note.
    const today = new Date()
    const ageMs = today.getTime() - effectiveDate.getTime()
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
    const limit = backdateLimitDays()
    if (ageDays > limit) {
      if (user.role !== 'SUPER_ADMIN') {
        return apiError(403, `Backdating beyond ${limit} days requires SUPER_ADMIN`)
      }
      if (!reasonNotes) {
        return apiError(400, 'reasonNotes is required for backdated withdrawals')
      }
    }

    // Tenant-scoped student check.
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, schoolId: true, admissionStatus: true },
    })
    if (!student) return apiError(404, 'Student not found')

    const academicYear = currentAcademicYear(today)

    // Block double-withdrawal — the unique([studentId, academicYear]) on
    // StudentWithdrawal will catch race conditions, but a clean 409 here
    // is friendlier than a Prisma error.
    const existing = await db.studentWithdrawal.findFirst({
      where: { studentId, academicYear, deletedAt: null },
      select: { id: true, effectiveDate: true, reason: true },
    })
    if (existing) {
      return apiError(
        409,
        `Student already withdrawn on ${existing.effectiveDate.toISOString().slice(0, 10)} (${existing.reason})`,
      )
    }

    // ── Atomic cascade ──
    const result = await db.$transaction(async (tx) => {
      // Race-safety: serialize concurrent withdraw attempts for this student.
      // The DB-level @@unique([studentId, academicYear]) on StudentWithdrawal
      // is the ultimate guard, but the row-lock makes concurrent calls fail
      // with a clean 409 instead of doing partial cascade work that then
      // gets rolled back when the unique fires.
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${studentId} FOR UPDATE`

      // Re-confirm under the lock — first request to land creates the row.
      const stillNotWithdrawn = await tx.studentWithdrawal.findFirst({
        where: { studentId, academicYear, deletedAt: null },
        select: { id: true },
      })
      if (stillNotWithdrawn) {
        throw new ConcurrentWithdrawalError()
      }

      // 1. Close every active academic-fee assignment for this AY.
      const assignments = await tx.studentFeeAssignment.findMany({
        where: {
          schoolId: user.schoolId!,
          studentId,
          academicYear,
          status: 'active',
          deletedAt: null,
        },
        select: { id: true },
      })

      const academicResults: WindowChangeResult[] = []
      for (const a of assignments) {
        const r = await applyAssignmentWindow({
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
          mode: 'commit',
        })
        academicResults.push(r)
      }

      // 2. Close every active transport allocation for this AY.
      const allocations = await tx.transportAllocation.findMany({
        where: {
          schoolId: user.schoolId!,
          studentId,
          academicYear,
          isActive: true,
        },
        select: { id: true, routeId: true, stopName: true },
      })

      const transportResults: WindowChangeResult[] = []
      for (const alloc of allocations) {
        const r = await applyAssignmentWindow({
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
          mode: 'commit',
        })
        transportResults.push(r)
        // Append a TransportEvent row so the timeline reflects the cascade.
        await tx.transportEvent.create({
          data: {
            schoolId: user.schoolId!,
            studentId,
            academicYear,
            eventType: 'WITHDRAWN',
            fromAllocationId: alloc.id,
            fromRouteId: alloc.routeId,
            fromStop: alloc.stopName,
            effectiveDate,
            cancelledMonths: JSON.stringify(
              r.cancelledItems.map((i) => i.installmentName).filter(Boolean),
            ),
            cancelledAmount: r.cancelledAmount,
            reason: 'STUDENT_WITHDRAWN',
            performedBy: user.userId,
            cascadeFromWithdrawal: true,
          },
        })
      }

      // 3. Aggregate everything for the StudentWithdrawal audit row.
      const allCancelled = [
        ...academicResults.flatMap((r) => r.cancelledItems),
        ...transportResults.flatMap((r) => r.cancelledItems),
      ]
      const allSkipped = [
        ...academicResults.flatMap((r) => r.skippedDueToAllocations),
        ...transportResults.flatMap((r) => r.skippedDueToAllocations),
      ]
      const cancelledAmount =
        academicResults.reduce((s, r) => s + r.cancelledAmount, 0) +
        transportResults.reduce((s, r) => s + r.cancelledAmount, 0)
      const totalRefundDue =
        academicResults.reduce((s, r) => s + r.totalRefundable, 0) +
        transportResults.reduce((s, r) => s + r.totalRefundable, 0)

      // 4. Create the StudentWithdrawal row.
      const withdrawal = await tx.studentWithdrawal.create({
        data: {
          schoolId: user.schoolId!,
          studentId,
          academicYear,
          effectiveDate,
          reason,
          reasonNotes,
          refundEligible: !!body.refundEligible,
          cancelledItemsJson: JSON.stringify({
            academic: academicResults.map((r) => ({
              cancelledItems: r.cancelledItems,
              skippedDueToAllocations: r.skippedDueToAllocations,
            })),
            transport: transportResults.map((r) => ({
              cancelledItems: r.cancelledItems,
              skippedDueToAllocations: r.skippedDueToAllocations,
            })),
          }),
          cancelledAmount,
          totalRefundDue,
          performedBy: user.userId,
        },
      })

      // 5. Flip Student record: admissionStatus + isActive. Keep deletedAt
      // null — soft-delete is reserved for "this row was created in error".
      // A withdrawn student is still queryable for historical reports.
      const transferCertNo =
        typeof body.transferCertNo === 'string' && body.transferCertNo.trim()
          ? body.transferCertNo.trim()
          : null
      await tx.student.update({
        where: { id: studentId },
        data: {
          admissionStatus: reason === 'TC' ? 'transferred' : 'withdrawn',
          isActive: false,
          ...(transferCertNo ? { transferCertNo } : {}),
        },
      })

      return {
        withdrawalId: withdrawal.id,
        effectiveDate: effectiveDate.toISOString(),
        academicYear,
        reason,
        cancelledItems: allCancelled,
        cancelledAmount,
        requiresRefund: allSkipped,
        totalRefundDue,
        academicAssignmentsClosed: academicResults.length,
        transportAllocationsClosed: transportResults.length,
      }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof ConcurrentWithdrawalError) {
      return apiError(
        409,
        'Student was already withdrawn by another request. Refresh and try again.',
      )
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'P2002'
    ) {
      return apiError(409, 'Student is already withdrawn for this academic year.')
    }
    console.error('POST /students/[id]/withdraw failed:', error)
    return internalError('Failed to issue withdrawal')
  }
}
