import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// GET /api/school/inventory/reports?from=&to=
// Returns: stock valuation (cost + retail), low-stock list, sales summary for
// the date window, and top-selling items.
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'inventory:read')
    if (!user || !user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId

    const { searchParams } = new URL(request.url)
    const fromStr = searchParams.get('from')
    const toStr = searchParams.get('to')
    const from = fromStr ? new Date(fromStr) : null
    const to = toStr ? new Date(`${toStr}T23:59:59.999Z`) : null
    const saleDateFilter: Record<string, Date> = {}
    if (from && !Number.isNaN(from.getTime())) saleDateFilter.gte = from
    if (to && !Number.isNaN(to.getTime())) saleDateFilter.lte = to

    const items = await db.inventoryItem.findMany({
      where: { schoolId, deletedAt: null },
      select: {
        id: true, name: true, category: true,
        variants: { where: { deletedAt: null }, select: { id: true, label: true, quantity: true, reorderLevel: true, unitPrice: true, sellingPrice: true } },
      },
    })

    // Valuation aggregated over every variant.
    let costValue = 0
    let retailValue = 0
    let totalUnits = 0
    const lowStock: Array<{ id: string; name: string; quantity: number; reorderLevel: number }> = []
    for (const it of items) {
      for (const v of it.variants) {
        totalUnits += v.quantity
        costValue += (v.unitPrice ?? 0) * v.quantity
        retailValue += (v.sellingPrice ?? v.unitPrice ?? 0) * v.quantity
        if (v.reorderLevel > 0 && v.quantity <= v.reorderLevel) {
          lowStock.push({ id: v.id, name: v.label ? `${it.name} — ${v.label}` : it.name, quantity: v.quantity, reorderLevel: v.reorderLevel })
        }
      }
    }

    // Sales summary for the window.
    const saleWhere: Record<string, unknown> = { schoolId, status: 'completed' }
    if (Object.keys(saleDateFilter).length) saleWhere.saleDate = saleDateFilter
    const sales = await db.inventorySale.findMany({
      where: saleWhere,
      select: { id: true, totalAmount: true, discount: true, items: { select: { itemId: true, itemName: true, quantity: true, lineTotal: true } } },
    })
    const salesCount = sales.length
    const salesRevenue = round2(sales.reduce((s, x) => s + x.totalAmount, 0))
    const salesDiscount = round2(sales.reduce((s, x) => s + x.discount, 0))

    // Top sellers by quantity sold in the window.
    const byItem = new Map<string, { itemName: string; quantity: number; revenue: number }>()
    for (const sale of sales) {
      for (const li of sale.items) {
        const cur = byItem.get(li.itemId) || { itemName: li.itemName, quantity: 0, revenue: 0 }
        cur.quantity += li.quantity
        cur.revenue = round2(cur.revenue + li.lineTotal)
        byItem.set(li.itemId, cur)
      }
    }
    const topSellers = Array.from(byItem.entries())
      .map(([itemId, v]) => ({ itemId, ...v }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)

    return NextResponse.json({
      valuation: {
        itemCount: items.length,
        totalUnits,
        costValue: round2(costValue),
        retailValue: round2(retailValue),
        potentialMargin: round2(retailValue - costValue),
      },
      lowStock: lowStock.sort((a, b) => a.quantity - b.quantity),
      sales: { count: salesCount, revenue: salesRevenue, discount: salesDiscount },
      topSellers,
    })
  } catch (error) {
    console.error('Inventory reports error:', error)
    return internalError('building inventory reports')
  }
}
