import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

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

// Normalise a single variant from the request body.
interface ParsedVariant {
  label: string | null
  sku: string | null
  quantity: number
  reorderLevel: number
  unitPrice: number | null
  sellingPrice: number | null
}
function parseVariant(raw: unknown): ParsedVariant {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    label: optionalText(o.label),
    sku: optionalText(o.sku),
    quantity: Math.max(0, optionalInt(o.quantity) ?? 0),
    reorderLevel: Math.max(0, optionalInt(o.reorderLevel) ?? 0),
    unitPrice: optionalNumber(o.unitPrice),
    sellingPrice: optionalNumber(o.sellingPrice),
  }
}

// Accept either an explicit `variants` array or top-level single-variant fields
// (a plain item). Always returns at least one variant.
function parseVariants(body: Record<string, unknown>): ParsedVariant[] {
  if (Array.isArray(body.variants) && body.variants.length > 0) {
    return body.variants.map(parseVariant)
  }
  // Fallback: build a single default variant from top-level fields.
  return [parseVariant({
    label: null,
    sku: body.sku,
    quantity: body.quantity,
    reorderLevel: body.reorderLevel,
    unitPrice: body.unitPrice,
    sellingPrice: body.sellingPrice,
  })]
}

// GET /api/school/inventory?search=&category=&categoryId=&lowStock=1&sellable=1&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const permitted = await requirePermission(request, 'inventory:read')
    if (!permitted) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const category = searchParams.get('category') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const lowStock = searchParams.get('lowStock') === '1'
    const sellable = searchParams.get('sellable') === '1'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { schoolId: user.schoolId, deletedAt: null }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (categoryId) where.categoryId = categoryId
    else if (category) where.category = category
    if (sellable) where.isSellable = true

    const allItems = await db.inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    // Decorate each item with aggregate stock + a low-stock flag (any variant at
    // or below its reorder level). Low-stock comparison spans two columns so it
    // is computed in-memory rather than in the query.
    const decorated = allItems.map((it) => {
      const variants = it.variants
      const totalStock = variants.reduce((s, v) => s + v.quantity, 0)
      const lowStockVariants = variants.filter((v) => v.reorderLevel > 0 && v.quantity <= v.reorderLevel)
      return { ...it, totalStock, isLowStock: lowStockVariants.length > 0 }
    })

    const filtered = lowStock ? decorated.filter((i) => i.isLowStock) : decorated
    const total = filtered.length
    const items = filtered.slice(skip, skip + limit)

    return NextResponse.json({
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (error) {
    console.error('List inventory error:', error)
    return internalError('listing inventory')
  }
}

// POST /api/school/inventory - Add item with one or more variants (+ opening-stock movements)
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'inventory:create')
    if (!user || !user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId

    const body = await request.json()
    const name = optionalText(body.name)
    if (!name) return apiError(400, 'Please enter a name for this inventory item.')

    const categoryId = optionalText(body.categoryId)
    if (categoryId) {
      const cat = await db.inventoryCategory.findFirst({ where: { id: categoryId, schoolId, deletedAt: null }, select: { id: true } })
      if (!cat) return apiError(400, 'The selected category no longer exists.')
    }

    const variantLabel = optionalText(body.variantLabel)
    const variants = parseVariants(body)
    if (variants.length === 0) return apiError(400, 'Add at least one variant.')
    // When the item has a variant axis, every variant needs a label.
    if (variantLabel && variants.some((v) => !v.label)) {
      return apiError(400, `Each ${variantLabel.toLowerCase()} needs a label.`)
    }

    const item = await db.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({
        data: {
          schoolId,
          name,
          sku: optionalText(body.sku),
          category: optionalText(body.category),
          categoryId,
          unit: optionalText(body.unit),
          variantLabel,
          isSellable: typeof body.isSellable === 'boolean' ? body.isSellable : false,
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : null,
          condition: optionalText(body.condition),
          location: optionalText(body.location),
        },
      })

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]
        const variant = await tx.inventoryItemVariant.create({
          data: {
            schoolId,
            itemId: created.id,
            label: v.label,
            sku: v.sku,
            quantity: v.quantity,
            reorderLevel: v.reorderLevel,
            unitPrice: v.unitPrice,
            sellingPrice: v.sellingPrice,
            sortOrder: i,
          },
        })
        if (v.quantity > 0) {
          await tx.inventoryStockMovement.create({
            data: {
              schoolId,
              itemId: created.id,
              variantId: variant.id,
              type: 'IN',
              quantity: v.quantity,
              balanceAfter: v.quantity,
              unitCost: v.unitPrice,
              reason: 'Opening stock',
              referenceType: 'purchase',
              performedBy: user.userId,
            },
          })
        }
      }

      return created
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('Add inventory item error:', error)
    return internalError('adding the inventory item')
  }
}
