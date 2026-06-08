import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { createFeeDebitLedgerEntry, recordStudentLedgerPayment, nextSequentialReceiptNumber } from '@/lib/fees'

// A store sale collects money from a student, so we accept either the granular
// `inventory:sell` permission or the broader `fees:collect` an accountant/admin
// already holds.
async function requireSalePermission(request: NextRequest) {
  return (await requirePermission(request, 'inventory:sell')) || (await requirePermission(request, 'fees:collect'))
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

class SaleError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// GET /api/school/inventory/sales?studentId=&status=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const status = searchParams.get('status') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '30')
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { schoolId: user.schoolId }
    if (studentId) where.studentId = studentId
    if (status) where.status = status

    const [sales, total] = await Promise.all([
      db.inventorySale.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        skip,
        take: limit,
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
          items: { select: { id: true, itemName: true, variantLabel: true, quantity: true, unitPrice: true, lineTotal: true, returnedQty: true } },
        },
      }),
      db.inventorySale.count({ where }),
    ])

    return NextResponse.json({ sales, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) {
    console.error('List inventory sales error:', error)
    return internalError('listing inventory sales')
  }
}

// POST /api/school/inventory/sales
// Body: { studentId, items: [{ variantId, quantity, unitPrice? }], discount?, paymentMethod?, notes? }
// Atomically: decrements variant stock, posts a paid DEBIT+payment to the student
// fee ledger (sourceType='inventory'), and returns a receipt number.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSalePermission(request)
    if (!user) return forbiddenError("You don't have permission to sell inventory.")
    if (!user.schoolId) return unauthorizedError()
    const schoolId = user.schoolId

    const body = await request.json().catch(() => ({}))
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : ''
    if (!studentId) return apiError(400, 'Please select a student.')

    const rawItems = Array.isArray(body.items) ? body.items : []
    const lines = rawItems
      .map((l: unknown) => {
        const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>
        const variantId = typeof o.variantId === 'string' ? o.variantId.trim() : ''
        const quantity = Number(o.quantity)
        const unitPriceOverride = o.unitPrice === undefined || o.unitPrice === null || o.unitPrice === '' ? null : Number(o.unitPrice)
        return { variantId, quantity, unitPriceOverride }
      })
      .filter((l: { variantId: string; quantity: number }) => l.variantId && Number.isFinite(l.quantity) && l.quantity > 0)
    if (lines.length === 0) return apiError(400, 'Add at least one item with a quantity.')

    const discount = Number.isFinite(Number(body.discount)) && Number(body.discount) > 0 ? round2(Number(body.discount)) : 0
    const paymentMethod = typeof body.paymentMethod === 'string' && body.paymentMethod.trim() ? body.paymentMethod.trim() : 'cash'
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null

    const student = await db.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true } })
    if (!student) return apiError(404, 'Student not found.')

    const school = await db.school.findUnique({ where: { id: schoolId }, select: { academicYear: true } })
    const academicYear = school?.academicYear || null

    const result = await db.$transaction(async (tx) => {
      // Lock + validate each variant, compute line totals.
      const priced: Array<{ itemId: string; variantId: string; itemName: string; variantLabel: string | null; quantity: number; unitPrice: number; lineTotal: number; newQty: number }> = []
      for (const line of lines) {
        await tx.$queryRaw`SELECT id FROM "InventoryItemVariant" WHERE id = ${line.variantId} FOR UPDATE`
        const variant = await tx.inventoryItemVariant.findFirst({
          where: { id: line.variantId, schoolId, deletedAt: null },
          select: {
            id: true, label: true, quantity: true, sellingPrice: true, unitPrice: true, isActive: true,
            item: { select: { id: true, name: true, isSellable: true, deletedAt: true } },
          },
        })
        if (!variant || !variant.item || variant.item.deletedAt) throw new SaleError(404, 'One of the selected items no longer exists.')
        const displayName = variant.label ? `${variant.item.name} (${variant.label})` : variant.item.name
        if (!variant.isActive) throw new SaleError(400, `"${displayName}" is not available.`)
        if (!variant.item.isSellable) throw new SaleError(400, `"${variant.item.name}" is not marked as sellable.`)
        if (line.quantity > variant.quantity) throw new SaleError(400, `Only ${variant.quantity} of "${displayName}" in stock.`)
        const unitPrice = line.unitPriceOverride != null && line.unitPriceOverride >= 0
          ? round2(line.unitPriceOverride)
          : round2(variant.sellingPrice ?? variant.unitPrice ?? 0)
        if (unitPrice <= 0) throw new SaleError(400, `"${displayName}" has no selling price set.`)
        priced.push({ itemId: variant.item.id, variantId: variant.id, itemName: variant.item.name, variantLabel: variant.label, quantity: line.quantity, unitPrice, lineTotal: round2(unitPrice * line.quantity), newQty: variant.quantity - line.quantity })
      }

      const subtotal = round2(priced.reduce((s, p) => s + p.lineTotal, 0))
      if (discount > subtotal) throw new SaleError(400, 'Discount cannot exceed the subtotal.')
      const totalAmount = round2(subtotal - discount)
      if (totalAmount <= 0) throw new SaleError(400, 'Sale total must be greater than zero.')

      const receiptNumber = await nextSequentialReceiptNumber(tx, schoolId)

      const sale = await tx.inventorySale.create({
        data: {
          schoolId, studentId, receiptNumber, subtotal, discount, totalAmount,
          paymentMethod, academicYear, status: 'completed', notes, soldBy: user.userId,
        },
        select: { id: true },
      })

      // Decrement variant stock + SALE movements + sale items.
      for (const p of priced) {
        await tx.inventoryItemVariant.update({ where: { id: p.variantId }, data: { quantity: p.newQty } })
        await tx.inventoryStockMovement.create({
          data: { schoolId, itemId: p.itemId, variantId: p.variantId, type: 'SALE', quantity: p.quantity, balanceAfter: p.newQty, reason: `Sale #${receiptNumber}`, referenceType: 'sale', referenceId: sale.id, performedBy: user.userId },
        })
        await tx.inventorySaleItem.create({
          data: { saleId: sale.id, itemId: p.itemId, variantId: p.variantId, itemName: p.itemName, variantLabel: p.variantLabel, quantity: p.quantity, unitPrice: p.unitPrice, lineTotal: p.lineTotal },
        })
      }

      // Post the charge to the student ledger and immediately pay it.
      const itemSummary = priced.map((p) => `${p.variantLabel ? `${p.itemName} (${p.variantLabel})` : p.itemName} ×${p.quantity}`).join(', ')
      const debit = await createFeeDebitLedgerEntry({
        tx, schoolId, studentId, academicYear,
        sourceType: 'inventory', sourceId: sale.id,
        feeHeadName: 'Store Purchase',
        description: `Store Purchase (${receiptNumber}): ${itemSummary}`.slice(0, 500),
        amount: totalAmount,
        notes,
        createdBy: user.userId,
      })

      const payment = await recordStudentLedgerPayment({
        tx, schoolId, studentId, amount: totalAmount, paymentMethod, receiptNumber, academicYear,
        notes: `Store purchase ${receiptNumber}`, receivedBy: user.userId,
        targets: debit ? [{ debitEntryId: debit.id, amount: totalAmount }] : undefined,
      })

      await tx.inventorySale.update({
        where: { id: sale.id },
        data: { ledgerDebitId: debit?.id || null, paymentId: payment.payment?.id || null },
      })

      return { saleId: sale.id, receiptNumber, subtotal, discount, totalAmount, itemCount: priced.length }
    })

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (error) {
    if (error instanceof SaleError) return apiError(error.status, error.message)
    console.error('Create inventory sale error:', error)
    return internalError('recording the sale')
  }
}
