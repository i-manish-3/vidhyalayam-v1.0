import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, notFoundError, apiError, forbiddenError } from '@/lib/api-errors'

const REFUND_METHODS = new Set(['cash', 'bank', 'adjustment'])

// Thrown inside the settle txn when the target return row can't be found.
class SettleNotFoundError extends Error {}

// GET /api/school/inventory/sales/[id] - full sale detail for the receipt view.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:read')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const sale = await db.inventorySale.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, rollNumber: true } },
        items: true,
        returns: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!sale) return notFoundError('InventorySale')

    // Override the at-sale snapshot with the live ledger balance so the receipt
    // reflects payments collected later on the Collect Fee page.
    let enriched = sale
    if (sale.ledgerDebitId) {
      const debit = await db.studentFeeLedgerEntry.findFirst({
        where: { id: sale.ledgerDebitId, schoolId: user.schoolId },
        select: { balanceAmount: true, deletedAt: true },
      })
      if (debit && !debit.deletedAt) {
        const outstanding = Math.max(0, debit.balanceAmount)
        const livePaid = Math.round((sale.totalAmount - outstanding + Number.EPSILON) * 100) / 100
        enriched = { ...sale, amountPaid: livePaid, dueStatus: outstanding <= 0 ? 'paid' : livePaid > 0 ? 'partial' : 'due' }
      }
    }

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: {
        name: true, logo: true, address: true, city: true, state: true, pincode: true,
        country: true, contactPhone: true, contactEmail: true, website: true, board: true,
        printHeader: true,
      },
    })

    return NextResponse.json({ sale: enriched, school })
  } catch (error) {
    console.error('Get inventory sale error:', error)
    return internalError('loading the sale')
  }
}

// PATCH /api/school/inventory/sales/[id] — settle a pending CASH refund as paid.
// Body: { action: 'settleRefund', target: 'void' | 'return', returnId?, method }
// Records who/when/how the physical cash was handed back. No ledger money moves:
// the void/return already accounted for it — this only closes the open obligation.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = (await requirePermission(request, 'inventory:sell')) || (await requirePermission(request, 'fees:collect'))
    if (!user) return forbiddenError("You don't have permission to settle a refund.")
    if (!user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    if (body.action !== 'settleRefund') return apiError(400, 'Unsupported action.')
    const method = REFUND_METHODS.has(body.method) ? body.method : 'cash'
    const target = body.target === 'return' ? 'return' : 'void'

    const sale = await db.inventorySale.findFirst({ where: { id, schoolId }, select: { id: true, receiptNumber: true, studentId: true } })
    if (!sale) return notFoundError('InventorySale')

    const now = new Date()

    // Conditional update (where refundStatus='pending') makes settle idempotent
    // under concurrency; the audit row is written in the same txn.
    const result = await db.$transaction(async (tx) => {
      let amount = 0
      let count = 0
      if (target === 'return') {
        const returnId = typeof body.returnId === 'string' ? body.returnId : ''
        const ret = await tx.inventorySaleReturn.findFirst({ where: { id: returnId, saleId: sale.id, schoolId }, select: { id: true, cashRefund: true } })
        if (!ret) throw new SettleNotFoundError()
        amount = ret.cashRefund
        const res = await tx.inventorySaleReturn.updateMany({
          where: { id: ret.id, refundStatus: 'pending' },
          data: { refundStatus: 'settled', refundSettledAt: now, refundSettledBy: user.userId, refundMethod: method },
        })
        count = res.count
      } else {
        const res = await tx.inventorySale.updateMany({
          where: { id: sale.id, refundStatus: 'pending' },
          data: { refundStatus: 'settled', refundSettledAt: now, refundSettledBy: user.userId, refundMethod: method },
        })
        count = res.count
        const voidSale = await tx.inventorySale.findUnique({ where: { id: sale.id }, select: { refundAmount: true } })
        amount = voidSale?.refundAmount ?? 0
      }
      if (count === 0) return { settled: false, amount }
      await tx.feeAuditLog.create({
        data: {
          schoolId, entityType: 'InventorySale', entityId: sale.id, action: 'refund_settled', studentId: sale.studentId, userId: user.userId,
          newValue: JSON.stringify({ receiptNumber: sale.receiptNumber, target, returnId: body.returnId ?? null, amount, method }),
        },
      })
      return { settled: true, amount }
    })

    if (!result.settled) return apiError(409, 'This refund was already settled or is not pending.')
    return NextResponse.json({ success: true, amount: result.amount, method, message: `₹${result.amount} cash refund marked as paid (${method}).` })
  } catch (error) {
    if (error instanceof SettleNotFoundError) return notFoundError('InventorySaleReturn')
    console.error('Settle inventory refund error:', error)
    return internalError('settling the refund')
  }
}
