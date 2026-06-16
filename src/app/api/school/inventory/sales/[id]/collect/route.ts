import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError, notFoundError } from '@/lib/api-errors'
import { recordStudentLedgerPayment, nextSequentialReceiptNumber } from '@/lib/fees'

// Receipt numbers are a shared sequence; concurrent collections can briefly
// collide on the unique (schoolId, receiptNumber) key. Retry transparently on P2002.
const COLLECT_RETRY_ATTEMPTS = 3
const COLLECT_RETRY_DELAY_MS = 100
function isReceiptCollision(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Collecting an inventory due moves real money, so accept either the granular
// `inventory:sell` permission or the broader `fees:collect`.
async function requireCollectPermission(request: NextRequest) {
  return (await requirePermission(request, 'inventory:sell')) || (await requirePermission(request, 'fees:collect'))
}

class CollectError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// POST /api/school/inventory/sales/[id]/collect
// Body: { amount, paymentMethod? }
// Collects (part of) the outstanding balance on a store sale. The sale's linked
// fee-ledger debit is the single source of truth, so this stays consistent with
// any collection done on the Collect Fee page — collecting in either place
// reduces the same balance.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCollectPermission(request)
    if (!user) return forbiddenError("You don't have permission to collect store dues.")
    if (!user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId
    const { id } = await params

    const body = await request.json().catch(() => ({}))
    const requestedAmount = Number(body.amount)
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return apiError(400, 'Enter an amount to collect.')
    }
    const paymentMethod = typeof body.paymentMethod === 'string' && body.paymentMethod.trim() ? body.paymentMethod.trim() : 'cash'

    const sale = await db.inventorySale.findFirst({
      where: { id, schoolId },
      select: { id: true, studentId: true, receiptNumber: true, totalAmount: true, academicYear: true, status: true, ledgerDebitId: true },
    })
    if (!sale) return notFoundError('InventorySale')
    if (sale.status === 'voided') return apiError(400, 'This sale has been voided — there is nothing to collect.')
    if (!sale.ledgerDebitId) return apiError(400, 'This sale has no outstanding due to collect.')

    const runCollect = () => db.$transaction(async (tx) => {
      // The ledger debit balance is the live outstanding amount.
      const debit = await tx.studentFeeLedgerEntry.findFirst({
        where: { id: sale.ledgerDebitId!, schoolId, deletedAt: null },
        select: { id: true, balanceAmount: true },
      })
      if (!debit) throw new CollectError(400, 'This sale has no outstanding due to collect.')
      const outstanding = round2(Math.max(0, debit.balanceAmount))
      if (outstanding <= 0) throw new CollectError(400, 'This sale is already fully paid.')

      const amount = round2(Math.min(requestedAmount, outstanding))
      if (amount <= 0) throw new CollectError(400, 'Enter an amount to collect.')

      const receiptNumber = await nextSequentialReceiptNumber(tx, schoolId)
      await recordStudentLedgerPayment({
        tx,
        schoolId,
        studentId: sale.studentId,
        amount,
        paymentMethod,
        receiptNumber,
        academicYear: sale.academicYear || undefined,
        notes: `Store due collected for sale ${sale.receiptNumber}`,
        receivedBy: user.userId,
        targets: [{ debitEntryId: debit.id, amount }],
      })

      // Mirror the new settlement state onto the sale snapshot.
      const newOutstanding = round2(Math.max(0, outstanding - amount))
      const livePaid = round2(sale.totalAmount - newOutstanding)
      const dueStatus = newOutstanding <= 0 ? 'paid' : livePaid > 0 ? 'partial' : 'due'
      await tx.inventorySale.update({
        where: { id: sale.id },
        data: { amountPaid: livePaid, dueStatus },
      })

      return { receiptNumber, collected: amount, amountPaid: livePaid, dueAmount: newOutstanding, dueStatus }
    })

    let lastError: unknown = null
    for (let attempt = 0; attempt < COLLECT_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await runCollect()
        return NextResponse.json({ success: true, ...result })
      } catch (error) {
        if (error instanceof CollectError) return apiError(error.status, error.message)
        lastError = error
        if (!isReceiptCollision(error) || attempt === COLLECT_RETRY_ATTEMPTS - 1) throw error
        await sleep(COLLECT_RETRY_DELAY_MS * Math.pow(2, attempt))
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Collection failed after retries')
  } catch (error) {
    if (error instanceof CollectError) return apiError(error.status, error.message)
    console.error('Collect inventory due error:', error)
    return internalError('collecting the store due')
  }
}
