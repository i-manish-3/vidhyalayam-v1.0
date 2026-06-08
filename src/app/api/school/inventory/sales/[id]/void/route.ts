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

// POST /api/school/inventory/sales/[id]/void
// Reverses a completed sale: restocks the (non-returned) items and cancels the
// sale's ledger DEBIT, freeing the original payment into a refundable advance on
// the student's account (the payment + receipt are preserved for audit).
// Body: { reason? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSalePermission(request)
    if (!user) return forbiddenError("You don't have permission to void a sale.")
    if (!user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null

    const sale = await db.inventorySale.findFirst({
      where: { id, schoolId },
      include: { items: true },
    })
    if (!sale) return notFoundError('InventorySale')
    if (sale.status === 'voided') return apiError(400, 'This sale is already voided.')

    await db.$transaction(async (tx) => {
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
        const allocations = await tx.studentFeeLedgerAllocation.findMany({
          where: { debitEntryId: debit.id, deletedAt: null },
          select: { id: true, amount: true, creditEntryId: true },
        })
        for (const alloc of allocations) {
          // Return the allocated amount to the credit entry (becomes advance).
          const credit = await tx.studentFeeLedgerEntry.findUnique({ where: { id: alloc.creditEntryId }, select: { credit: true, balanceAmount: true } })
          if (credit) {
            const newBalance = round2((credit.balanceAmount || 0) + alloc.amount)
            await tx.studentFeeLedgerEntry.update({
              where: { id: alloc.creditEntryId },
              data: { balanceAmount: newBalance, status: newBalance >= (credit.credit || 0) ? 'open' : 'partial' },
            })
          }
          await tx.studentFeeLedgerAllocation.update({ where: { id: alloc.id }, data: { deletedAt: new Date() } })
        }
        await tx.studentFeeLedgerEntry.update({
          where: { id: debit.id },
          data: { status: 'cancelled', deletedAt: new Date(), notes: `Voided sale ${sale.receiptNumber}${reason ? ` — ${reason}` : ''}` },
        })
      }

      // 3. Mark sale voided + audit.
      await tx.inventorySale.update({
        where: { id: sale.id },
        data: { status: 'voided', voidedAt: new Date(), voidedBy: user.userId, voidReason: reason },
      })
      await tx.feeAuditLog.create({
        data: {
          schoolId, entityType: 'InventorySale', entityId: sale.id, action: 'voided', studentId: sale.studentId, userId: user.userId,
          newValue: JSON.stringify({ receiptNumber: sale.receiptNumber, totalAmount: sale.totalAmount, reason }),
        },
      })
    })

    return NextResponse.json({ success: true, message: `Sale ${sale.receiptNumber} voided. ₹${sale.totalAmount} is now a refundable advance on the student's account.` })
  } catch (error) {
    console.error('Void inventory sale error:', error)
    return internalError('voiding the sale')
  }
}
