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

// Thrown inside the txn when a concurrent request voided the sale first.
class AlreadyVoidedError extends Error {}

// POST /api/school/inventory/sales/[id]/void
// Reverses a completed sale: restocks the (non-returned) items and cancels the
// sale's ledger DEBIT. The collected payment (if any) is refunded one of two
// ways, chosen by the caller:
//   - 'advance' (default): freed back onto the student's account as a refundable
//     credit/advance (usable for future fees, or refunded via the fees module).
//   - 'cash': not left as an advance — recorded as a PENDING cash refund the
//     school will hand back physically, settled later from the sales page.
// Either way the payment + receipt are preserved for audit.
// Body: { reason?, refundMode?: 'advance' | 'cash' }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSalePermission(request)
    if (!user) return forbiddenError("You don't have permission to void a sale.")
    if (!user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null
    const refundMode = body.refundMode === 'cash' ? 'cash' : 'advance'

    const sale = await db.inventorySale.findFirst({
      where: { id, schoolId },
      include: { items: true },
    })
    if (!sale) return notFoundError('InventorySale')
    if (sale.status === 'voided') return apiError(400, 'This sale is already voided.')

    // Block voiding once returns exist: a return has already refunded/adjusted
    // part of this sale's money, so reversing the full payment here would refund
    // that portion twice. The remaining items should be processed as a return.
    const existingReturn = await db.inventorySaleReturn.findFirst({
      where: { saleId: sale.id, schoolId },
      select: { id: true },
    })
    if (existingReturn) {
      return apiError(400, 'This sale already has returns recorded. Process the remaining items as a return instead of voiding.')
    }

    // The actually-collected amount tied to this sale (sum of payment allocations
    // on its debit) is what gets refunded. Computed inside the txn below.
    let refundedTotal = 0

    await db.$transaction(async (tx) => {
      // Serialize against a concurrent void of this sale AND against any other
      // credit-balance mutation for this student (payments, advance application,
      // other reversals) — they all lock the Student row.
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${sale.studentId} FOR UPDATE`
      const locked = await tx.inventorySale.findUnique({ where: { id: sale.id }, select: { status: true } })
      if (!locked || locked.status === 'voided') {
        throw new AlreadyVoidedError()
      }

      // 1. Restock the still-held quantity of each line (quantity - returnedQty).
      for (const line of sale.items) {
        const restock = line.quantity - line.returnedQty
        if (restock <= 0) continue
        await tx.$queryRaw`SELECT id FROM "InventoryItemVariant" WHERE id = ${line.variantId} FOR UPDATE`
        const variant = await tx.inventoryItemVariant.findUnique({ where: { id: line.variantId }, select: { quantity: true } })
        const newQty = (variant?.quantity ?? 0) + restock
        await tx.inventoryItemVariant.update({ where: { id: line.variantId }, data: { quantity: newQty } })
        await tx.inventoryStockMovement.create({
          data: { schoolId, itemId: line.itemId, variantId: line.variantId, type: 'RETURN', quantity: restock, balanceAfter: newQty, reason: `Void sale ${sale.receiptNumber}`, referenceType: 'sale', referenceId: sale.id, performedBy: user.userId },
        })
      }

      // 2. Cancel the sale's DEBIT and free the allocated payment credit.
      const debit = await tx.studentFeeLedgerEntry.findFirst({
        where: { schoolId, studentId: sale.studentId, sourceType: 'inventory', sourceId: sale.id, entryType: 'DEBIT', deletedAt: null },
        select: { id: true },
      })
      if (debit) {
        // Only reverse real payments (CREDIT) — never waivers/discounts.
        const allocations = await tx.studentFeeLedgerAllocation.findMany({
          where: { debitEntryId: debit.id, deletedAt: null, amount: { gt: 0 }, creditEntry: { entryType: 'CREDIT' } },
          select: { id: true, amount: true, creditEntryId: true },
        })
        for (const alloc of allocations) {
          refundedTotal = round2(refundedTotal + alloc.amount)
          // In 'advance' mode the allocated payment is returned to its credit
          // entry, becoming a usable advance. In 'cash' mode we deliberately do
          // NOT restore it — the money leaves as a physical cash refund, so the
          // student gets no account credit (prevents double-refunding).
          if (refundMode === 'advance') {
            const credit = await tx.studentFeeLedgerEntry.findUnique({ where: { id: alloc.creditEntryId }, select: { credit: true, balanceAmount: true } })
            if (credit) {
              const newBalance = round2((credit.balanceAmount || 0) + alloc.amount)
              await tx.studentFeeLedgerEntry.update({
                where: { id: alloc.creditEntryId },
                data: { balanceAmount: newBalance, status: newBalance >= (credit.credit || 0) ? 'open' : 'partial' },
              })
            }
          }
          await tx.studentFeeLedgerAllocation.update({ where: { id: alloc.id }, data: { deletedAt: new Date() } })
        }
        await tx.studentFeeLedgerEntry.update({
          where: { id: debit.id },
          data: { status: 'cancelled', deletedAt: new Date(), notes: `Voided sale ${sale.receiptNumber}${reason ? ` — ${reason}` : ''}` },
        })
      }

      // 3. Mark sale voided, record the refund outcome + audit.
      //    advanced  → money sits as account advance (terminal).
      //    pending   → cash owed to the student, not yet handed over.
      //    none      → nothing was collected, so nothing to refund.
      const refundStatus = refundedTotal <= 0 ? 'none' : refundMode === 'cash' ? 'pending' : 'advanced'
      await tx.inventorySale.update({
        where: { id: sale.id },
        data: {
          status: 'voided', voidedAt: new Date(), voidedBy: user.userId, voidReason: reason,
          refundMode, refundAmount: refundedTotal, refundStatus,
        },
      })
      await tx.feeAuditLog.create({
        data: {
          schoolId, entityType: 'InventorySale', entityId: sale.id, action: 'voided', studentId: sale.studentId, userId: user.userId,
          newValue: JSON.stringify({ receiptNumber: sale.receiptNumber, totalAmount: sale.totalAmount, refundMode, refundedTotal, refundStatus, reason }),
        },
      })
    })

    const msg = refundedTotal <= 0
      ? `Sale ${sale.receiptNumber} voided. No payment was collected — items have been restocked.`
      : refundMode === 'cash'
        ? `Sale ${sale.receiptNumber} voided. ₹${refundedTotal} is due back to the student as a cash refund (mark it refunded once paid).`
        : `Sale ${sale.receiptNumber} voided. ₹${refundedTotal} is now a refundable advance on the student's account.`
    return NextResponse.json({ success: true, refundMode, refundAmount: refundedTotal, message: msg })
  } catch (error) {
    if (error instanceof AlreadyVoidedError) {
      return apiError(409, 'This sale was just voided by another request. Refresh and try again.')
    }
    console.error('Void inventory sale error:', error)
    return internalError('voiding the sale')
  }
}
