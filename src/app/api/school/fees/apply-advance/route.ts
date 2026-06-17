import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'
import { applyExistingAdvance, nextAdjustmentReceiptNumber } from '@/lib/fees'
import { logFeeTransaction, extractAuditContext } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 100

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// POST /api/school/fees/apply-advance
// Applies a student's existing unspent advance (open CREDIT balance) to their
// open dues. Creates no new payment — it allocates money already on the ledger.
// Body: { studentId, amount? }  (amount optional cap; default = apply as much as possible)
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:collect')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to apply advances.")
    }
    const schoolId = user.schoolId

    const body = await request.json().catch(() => ({}))
    const studentId = typeof body.studentId === 'string' ? body.studentId : ''
    if (!studentId) return apiError(400, 'Please select a student.')

    let maxAmount: number | undefined
    if (body.amount !== undefined && body.amount !== null) {
      const n = Number(body.amount)
      if (!Number.isFinite(n) || n <= 0) return apiError(400, 'Enter a valid amount to apply.')
      maxAmount = n
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, "We couldn't find this student's record.")

    const auditContext = extractAuditContext(request, user.userId)

    let lastError: unknown = null
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await db.$transaction(async (tx) => {
          const receiptNumber = await nextAdjustmentReceiptNumber(tx, schoolId)
          const applied = await applyExistingAdvance({
            tx,
            schoolId,
            studentId,
            maxAmount,
            receiptNumber,
            createdBy: user.userId,
          })

          if (applied.appliedAmount > 0) {
            await logFeeTransaction(
              tx,
              schoolId,
              'StudentFeeLedgerEntry',
              receiptNumber,
              'advance_applied',
              null,
              {
                studentId,
                appliedAmount: applied.appliedAmount,
                advanceRemaining: applied.advanceRemaining,
                allocations: applied.allocations,
              },
              auditContext,
            )
          }

          return applied
        })

        if (result.appliedAmount <= 0) {
          return apiError(400, 'There is no advance to apply, or no open dues to apply it to.')
        }

        return NextResponse.json({
          success: true,
          appliedAmount: result.appliedAmount,
          advanceRemaining: result.advanceRemaining,
          message: `₹${result.appliedAmount} advance applied to dues.${result.advanceRemaining > 0 ? ` ₹${result.advanceRemaining} advance remaining.` : ''}`,
        })
      } catch (err) {
        lastError = err
        const isConcurrency = err instanceof Error && /concurrent modification/i.test(err.message)
        if (isConcurrency && attempt < RETRY_ATTEMPTS - 1) {
          await sleep(RETRY_DELAY_MS * (attempt + 1))
          continue
        }
        throw err
      }
    }

    throw lastError
  } catch (error) {
    console.error('Apply advance error:', error)
    return internalError('applying the advance')
  }
}
