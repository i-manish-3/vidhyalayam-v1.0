import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'

// POST /api/school/inventory/[id]/stock
// Record a manual stock movement against one variant of the item. Types:
//   IN     — restock / purchase (increments quantity); optional unitCost
//   ADJUST — set the on-hand count to an absolute value (audit a recount)
//   OUT    — manual consumption / wastage (decrements quantity)
// SALE/RETURN movements are written by the sales endpoints, not here.
//
// Body: { variantId: string, type: 'IN'|'OUT'|'ADJUST', quantity: number, unitCost?, reason? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:update')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const variantId = typeof body.variantId === 'string' ? body.variantId.trim() : ''
    if (!variantId) return apiError(400, 'variantId is required.')

    const type = typeof body.type === 'string' ? body.type.toUpperCase() : ''
    if (!['IN', 'OUT', 'ADJUST'].includes(type)) {
      return apiError(400, 'type must be IN, OUT or ADJUST.')
    }
    const qtyRaw = Number(body.quantity)
    if (!Number.isFinite(qtyRaw) || !Number.isInteger(qtyRaw) || qtyRaw < 0) {
      return apiError(400, 'quantity must be a whole number ≥ 0.')
    }
    const unitCost = body.unitCost === undefined || body.unitCost === null || body.unitCost === ''
      ? null
      : Number(body.unitCost)
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return apiError(400, 'unitCost must be a non-negative number.')
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null

    const result = await db.$transaction(async (tx) => {
      // Lock the variant row so concurrent movements can't both read a stale qty.
      await tx.$queryRaw`SELECT id FROM "InventoryItemVariant" WHERE id = ${variantId} FOR UPDATE`
      const variant = await tx.inventoryItemVariant.findFirst({
        where: { id: variantId, itemId: id, schoolId: user.schoolId!, deletedAt: null },
        select: { id: true, quantity: true },
      })
      if (!variant) throw new VariantNotFoundError()

      let newQty: number
      if (type === 'IN') newQty = variant.quantity + qtyRaw
      else if (type === 'OUT') {
        if (qtyRaw > variant.quantity) throw new InsufficientStockError(variant.quantity)
        newQty = variant.quantity - qtyRaw
      } else {
        // ADJUST: quantity is the new absolute on-hand value.
        newQty = qtyRaw
      }

      await tx.inventoryItemVariant.update({
        where: { id: variantId },
        data: {
          quantity: newQty,
          ...(type === 'IN' && unitCost !== null ? { unitPrice: unitCost } : {}),
        },
      })
      const movement = await tx.inventoryStockMovement.create({
        data: {
          schoolId: user.schoolId!,
          itemId: id,
          variantId,
          type,
          quantity: type === 'ADJUST' ? Math.abs(newQty - variant.quantity) : qtyRaw,
          balanceAfter: newQty,
          unitCost: type === 'IN' ? unitCost : null,
          reason: reason || (type === 'ADJUST' ? `Recount to ${newQty}` : null),
          referenceType: type === 'IN' ? 'purchase' : 'adjustment',
          performedBy: user.userId,
        },
      })
      return { newQty, movementId: movement.id }
    })

    return NextResponse.json({ success: true, quantity: result.newQty, movementId: result.movementId })
  } catch (error) {
    if (error instanceof VariantNotFoundError) return notFoundError('InventoryItemVariant')
    if (error instanceof InsufficientStockError) {
      return apiError(400, `Only ${error.available} in stock — cannot remove more than that.`)
    }
    console.error('Stock movement error:', error)
    return internalError('recording the stock movement')
  }
}

class VariantNotFoundError extends Error {}
class InsufficientStockError extends Error {
  constructor(public available: number) {
    super('INSUFFICIENT_STOCK')
  }
}
