import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, notFoundError } from '@/lib/api-errors'

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
      select: { name: true, address: true, city: true, contactPhone: true, printHeader: true },
    })

    return NextResponse.json({ sale: enriched, school })
  } catch (error) {
    console.error('Get inventory sale error:', error)
    return internalError('loading the sale')
  }
}
