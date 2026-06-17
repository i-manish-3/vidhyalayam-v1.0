import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError, forbiddenError } from '@/lib/api-errors'

async function requireSalePermission(request: NextRequest) {
  return (await requirePermission(request, 'inventory:sell')) || (await requirePermission(request, 'fees:collect'))
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Thrown inside the txn for a stale/invalid return (re-checked under the lock).
class ReturnValidationError extends Error {}

// POST /api/school/inventory/sales/[id]/return
// Partial (or full) return against a completed sale. Restocks the returned
// quantities and records a return with a refund amount. Following the app's
// refund philosophy, the refund itself is a manual cash event — this endpoint
// records the obligation and restocks; it does not auto-move money.
// Body: { items: [{ saleItemId, quantity }], reason? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSalePermission(request)
    if (!user) return forbiddenError("You don't have permission to process a return.")
    if (!user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null

    const requested = (Array.isArray(body.items) ? body.items : [])
      .map((r: unknown) => {
        const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
        return { saleItemId: typeof o.saleItemId === 'string' ? o.saleItemId.trim() : '', quantity: Number(o.quantity) }
      })
      .filter((r: { saleItemId: string; quantity: number }) => r.saleItemId && Number.isInteger(r.quantity) && r.quantity > 0)
    if (requested.length === 0) return apiError(400, 'Specify at least one line and quantity to return.')

    const sale = await db.inventorySale.findFirst({ where: { id, schoolId }, include: { items: true } })
    if (!sale) return notFoundError('InventorySale')
    if (sale.status === 'voided') return apiError(400, 'This sale is voided — nothing to return.')

    const itemById = new Map(sale.items.map((i) => [i.id, i]))
    for (const r of requested) {
      const line = itemById.get(r.saleItemId)
      if (!line) return apiError(400, 'A returned line does not belong to this sale.')
      const remaining = line.quantity - line.returnedQty
      if (r.quantity > remaining) return apiError(400, `Cannot return ${r.quantity} of "${line.itemName}" — only ${remaining} remain.`)
    }

    const result = await db.$transaction(async (tx) => {
      // Serialize concurrent returns/voids on this student and re-read each line's
      // returnedQty UNDER the lock, so two parallel returns can't both pass the
      // "remaining" check against a stale value and over-return.
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${sale.studentId} FOR UPDATE`
      const freshItems = await tx.inventorySaleItem.findMany({ where: { saleId: sale.id } })
      const freshById = new Map(freshItems.map((i) => [i.id, i]))
      for (const r of requested) {
        const line = freshById.get(r.saleItemId)
        if (!line) throw new ReturnValidationError('A returned line does not belong to this sale.')
        const remaining = line.quantity - line.returnedQty
        if (r.quantity > remaining) throw new ReturnValidationError(`Cannot return ${r.quantity} of "${line.itemName}" — only ${remaining} remain.`)
      }

      let refundAmount = 0
      const returnedSnapshot: Array<{ saleItemId: string; itemName: string; quantity: number; refund: number }> = []

      for (const r of requested) {
        const line = freshById.get(r.saleItemId)!
        const refund = round2(line.unitPrice * r.quantity)
        refundAmount = round2(refundAmount + refund)

        await tx.$queryRaw`SELECT id FROM "InventoryItemVariant" WHERE id = ${line.variantId} FOR UPDATE`
        const variant = await tx.inventoryItemVariant.findUnique({ where: { id: line.variantId }, select: { quantity: true } })
        const newQty = (variant?.quantity ?? 0) + r.quantity
        await tx.inventoryItemVariant.update({ where: { id: line.variantId }, data: { quantity: newQty } })
        await tx.inventoryStockMovement.create({
          data: { schoolId, itemId: line.itemId, variantId: line.variantId, type: 'RETURN', quantity: r.quantity, balanceAfter: newQty, reason: `Return on ${sale.receiptNumber}`, referenceType: 'return', referenceId: sale.id, performedBy: user.userId },
        })
        await tx.inventorySaleItem.update({ where: { id: line.id }, data: { returnedQty: line.returnedQty + r.quantity } })
        returnedSnapshot.push({ saleItemId: line.id, itemName: line.itemName, quantity: r.quantity, refund })
      }

      const ret = await tx.inventorySaleReturn.create({
        data: { schoolId, saleId: sale.id, refundAmount, reason, performedBy: user.userId, itemsJson: JSON.stringify(returnedSnapshot) },
        select: { id: true },
      })

      // If the sale still carries an unpaid balance (sold on due / partial),
      // the return first cancels what the student still owes — only the
      // already-collected portion ever becomes a cash refund.
      //
      // We reduce both the principal (`debit`) and `balanceAmount` by the same
      // amount so the ledger invariant `balance = debit − paidAllocations` holds
      // (paid allocations are untouched by a return). The row is locked FOR
      // UPDATE and its `version` bumped so a concurrent fee payment on the same
      // debit (which uses optimistic version-locking) safely retries instead of
      // losing this update.
      let ledgerReduction = 0
      const debitId = sale.ledgerDebitId
      const debit = debitId
        ? await (async () => {
            await tx.$queryRaw`SELECT id FROM "StudentFeeLedgerEntry" WHERE id = ${debitId} FOR UPDATE`
            return tx.studentFeeLedgerEntry.findFirst({
              where: { id: debitId, schoolId, entryType: 'DEBIT', deletedAt: null },
              select: { id: true, debit: true, balanceAmount: true, version: true },
            })
          })()
        : null
      if (debit && debit.balanceAmount > 0) {
        ledgerReduction = Math.min(refundAmount, debit.balanceAmount)
        const newBalance = round2(debit.balanceAmount - ledgerReduction)
        const newDebit = round2(debit.debit - ledgerReduction)
        await tx.studentFeeLedgerEntry.update({
          where: { id: debit.id },
          data: {
            debit: newDebit,
            balanceAmount: newBalance,
            status: newBalance <= 0 ? 'settled' : newBalance < newDebit ? 'partial' : 'open',
            version: { increment: 1 },
          },
        })
      }
      const cashRefund = round2(refundAmount - ledgerReduction)

      // Persist the refund breakdown on the return record so it stays visible and
      // the owed cash can be tracked/settled later. pending only when cash is owed.
      await tx.inventorySaleReturn.update({
        where: { id: ret.id },
        data: { ledgerReduction, cashRefund, refundStatus: cashRefund > 0 ? 'pending' : 'none' },
      })

      // If every line is now fully returned, flag the sale as voided-by-return.
      const refreshed = await tx.inventorySaleItem.findMany({ where: { saleId: sale.id }, select: { quantity: true, returnedQty: true } })
      const fullyReturned = refreshed.every((l) => l.returnedQty >= l.quantity)
      if (fullyReturned) {
        await tx.inventorySale.update({ where: { id: sale.id }, data: { status: 'voided', voidReason: 'Fully returned' } })
      }

      await tx.feeAuditLog.create({
        data: {
          schoolId, entityType: 'InventorySaleReturn', entityId: ret.id, action: 'created', studentId: sale.studentId, userId: user.userId,
          newValue: JSON.stringify({ saleReceipt: sale.receiptNumber, refundAmount, ledgerReduction, cashRefund, items: returnedSnapshot }),
        },
      })

      return { returnId: ret.id, refundAmount, ledgerReduction, cashRefund, fullyReturned }
    })

    const parts = [`Returned items restocked.`]
    if (result.ledgerReduction > 0) parts.push(`₹${result.ledgerReduction} cleared from the student's outstanding due.`)
    if (result.cashRefund > 0) parts.push(`₹${result.cashRefund} refund due to the student (process as a manual cash refund).`)
    return NextResponse.json({
      success: true,
      refundAmount: result.refundAmount,
      ledgerReduction: result.ledgerReduction,
      cashRefund: result.cashRefund,
      fullyReturned: result.fullyReturned,
      message: parts.join(' '),
    })
  } catch (error) {
    if (error instanceof ReturnValidationError) {
      return apiError(400, error.message)
    }
    console.error('Inventory sale return error:', error)
    return internalError('processing the return')
  }
}
