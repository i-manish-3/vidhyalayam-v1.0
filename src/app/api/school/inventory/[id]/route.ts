import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'

function optionalText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t || null
}
function optionalNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function optionalInt(v: unknown): number | null {
  const n = optionalNumber(v)
  return n === null ? null : Math.trunc(n)
}

// GET /api/school/inventory/[id] - item detail + variants + recent movements
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:read')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const item = await db.inventoryItem.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    })
    if (!item) return notFoundError('InventoryItem')

    const movements = await db.inventoryStockMovement.findMany({
      where: { schoolId: user.schoolId, itemId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ item, movements })
  } catch (error) {
    console.error('Get inventory item error:', error)
    return internalError('loading the inventory item')
  }
}

// PATCH /api/school/inventory/[id]
// Updates item-level fields and (when `variants` is supplied) reconciles the
// variant set: existing variants are updated in place (a changed quantity writes
// an ADJUST movement), new variants are created (with an opening IN movement),
// and variants omitted from the payload are soft-deleted.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:update')
    if (!user || !user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId
    const { id } = await params
    const body = await request.json()

    const existing = await db.inventoryItem.findFirst({
      where: { id, schoolId, deletedAt: null },
      include: { variants: { where: { deletedAt: null } } },
    })
    if (!existing) return notFoundError('InventoryItem')

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = optionalText(body.name)
      if (!name) return apiError(400, 'Name cannot be empty.')
      data.name = name
    }
    if (body.sku !== undefined) data.sku = optionalText(body.sku)
    if (body.category !== undefined) data.category = optionalText(body.category)
    if (body.unit !== undefined) data.unit = optionalText(body.unit)
    if (body.variantLabel !== undefined) data.variantLabel = optionalText(body.variantLabel)
    if (body.condition !== undefined) data.condition = optionalText(body.condition)
    if (body.location !== undefined) data.location = optionalText(body.location)
    if (body.isSellable !== undefined) data.isSellable = !!body.isSellable
    if (body.isActive !== undefined) data.isActive = !!body.isActive
    if (body.purchaseDate !== undefined) data.purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : null

    if (body.categoryId !== undefined) {
      const categoryId = optionalText(body.categoryId)
      if (categoryId) {
        const cat = await db.inventoryCategory.findFirst({ where: { id: categoryId, schoolId, deletedAt: null }, select: { id: true } })
        if (!cat) return apiError(400, 'The selected category no longer exists.')
      }
      data.categoryId = categoryId
    }

    // Variant reconciliation (only when the caller sends a `variants` array).
    const reconcile = Array.isArray(body.variants)
    const incoming = reconcile
      ? (body.variants as unknown[]).map((raw) => {
          const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
          return {
            id: optionalText(o.id),
            label: optionalText(o.label),
            sku: optionalText(o.sku),
            quantity: Math.max(0, optionalInt(o.quantity) ?? 0),
            reorderLevel: Math.max(0, optionalInt(o.reorderLevel) ?? 0),
            unitPrice: optionalNumber(o.unitPrice),
            sellingPrice: optionalNumber(o.sellingPrice),
          }
        })
      : []
    if (reconcile && incoming.length === 0) return apiError(400, 'An item must keep at least one variant.')
    const variantLabel = body.variantLabel !== undefined ? optionalText(body.variantLabel) : existing.variantLabel
    if (reconcile && variantLabel && incoming.some((v) => !v.label)) {
      return apiError(400, `Each ${variantLabel.toLowerCase()} needs a label.`)
    }

    await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.inventoryItem.update({ where: { id }, data })
      }
      if (!reconcile) return

      const existingById = new Map(existing.variants.map((v) => [v.id, v]))
      const keptIds = new Set<string>()

      for (let i = 0; i < incoming.length; i++) {
        const v = incoming[i]
        const current = v.id ? existingById.get(v.id) : undefined
        if (current) {
          keptIds.add(current.id)
          await tx.inventoryItemVariant.update({
            where: { id: current.id },
            data: { label: v.label, sku: v.sku, reorderLevel: v.reorderLevel, unitPrice: v.unitPrice, sellingPrice: v.sellingPrice, sortOrder: i },
          })
          // A quantity change is recorded as an ADJUST (recount) movement.
          if (v.quantity !== current.quantity) {
            await tx.inventoryItemVariant.update({ where: { id: current.id }, data: { quantity: v.quantity } })
            await tx.inventoryStockMovement.create({
              data: {
                schoolId, itemId: id, variantId: current.id, type: 'ADJUST',
                quantity: Math.abs(v.quantity - current.quantity), balanceAfter: v.quantity,
                reason: `Recount to ${v.quantity}`, referenceType: 'adjustment', performedBy: user.userId,
              },
            })
          }
        } else {
          // New variant.
          const created = await tx.inventoryItemVariant.create({
            data: { schoolId, itemId: id, label: v.label, sku: v.sku, quantity: v.quantity, reorderLevel: v.reorderLevel, unitPrice: v.unitPrice, sellingPrice: v.sellingPrice, sortOrder: i },
          })
          if (v.quantity > 0) {
            await tx.inventoryStockMovement.create({
              data: {
                schoolId, itemId: id, variantId: created.id, type: 'IN',
                quantity: v.quantity, balanceAfter: v.quantity, unitCost: v.unitPrice,
                reason: 'Opening stock', referenceType: 'purchase', performedBy: user.userId,
              },
            })
          }
        }
      }

      // Soft-delete variants no longer present in the payload.
      for (const v of existing.variants) {
        if (!keptIds.has(v.id)) {
          await tx.inventoryItemVariant.update({ where: { id: v.id }, data: { deletedAt: new Date(), isActive: false } })
        }
      }
    })

    const updated = await db.inventoryItem.findFirst({
      where: { id },
      include: { variants: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    })
    return NextResponse.json({ item: updated, message: 'Item updated.' })
  } catch (error) {
    console.error('Update inventory item error:', error)
    return internalError('updating the inventory item')
  }
}

// DELETE /api/school/inventory/[id] - soft delete item + its variants
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'inventory:delete')
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const existing = await db.inventoryItem.findFirst({ where: { id, schoolId: user.schoolId, deletedAt: null } })
    if (!existing) return notFoundError('InventoryItem')

    await db.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } })
      await tx.inventoryItemVariant.updateMany({ where: { itemId: id, deletedAt: null }, data: { deletedAt: new Date(), isActive: false } })
    })
    return NextResponse.json({ message: `"${existing.name}" has been deleted.` })
  } catch (error) {
    console.error('Delete inventory item error:', error)
    return internalError('deleting the inventory item')
  }
}
