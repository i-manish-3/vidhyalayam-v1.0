import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { getFeeLedgerSummary, hasFeeLedgerData } from '@/lib/fee-ledger-summary'

// GET /api/school/fees/dashboard - Fee dashboard stats
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view fee dashboard.")
    }

    const schoolId = user.schoolId
    const academicYear = new URL(request.url).searchParams.get('academicYear') || undefined
    const ayFilter = academicYear ? { academicYear } : {}
    const useLedger = await hasFeeLedgerData(schoolId)
    if (useLedger) {
      const [summary, methodAllocations, recentPayments, fineTotals] = await Promise.all([
        getFeeLedgerSummary(schoolId, undefined, academicYear),
        // Payment-mode mix must come from actual allocated cash (matching the
        // reports' definition), not the face value of CREDIT rows which can hold
        // unspent advance. Advance applied to dues (receiptNumber 'ADJ-…') is
        // bucketed as ADJUSTMENT since it moves no real cash.
        db.studentFeeLedgerAllocation.findMany({
          where: {
            schoolId, deletedAt: null,
            creditEntry: { entryType: 'CREDIT', deletedAt: null },
            debitEntry: { deletedAt: null, status: { not: 'cancelled' }, ...ayFilter },
          },
          select: {
            amount: true,
            receiptNumber: true,
            creditEntry: { select: { paymentMethod: true } },
          },
        }),
        db.studentFeeLedgerEntry.findMany({
          where: { schoolId, deletedAt: null, entryType: 'CREDIT', ...ayFilter },
          include: { student: { select: { firstName: true, lastName: true, rollNumber: true } } },
          orderBy: { transactionDate: 'desc' },
          take: 5,
        }),
        db.studentFeeLedgerEntry.aggregate({
          where: { schoolId, deletedAt: null, entryType: 'FINE', status: { not: 'cancelled' }, ...ayFilter },
          _sum: { debit: true },
        }),
      ])

      const methodMap = new Map<string, { amount: number; count: number }>()
      for (const a of methodAllocations) {
        const isAdjustment = (a.receiptNumber || '').startsWith('ADJ-')
        // Normalise casing: fees store 'CASH', inventory stores 'cash' — same mode.
        const method = isAdjustment ? 'ADJUSTMENT' : (a.creditEntry.paymentMethod || 'UNSPECIFIED').toUpperCase()
        const b = methodMap.get(method) ?? { amount: 0, count: 0 }
        b.amount += a.amount || 0
        b.count += 1
        methodMap.set(method, b)
      }
      const paymentsByMethod = Array.from(methodMap.entries())
        .map(([paymentMethod, v]) => ({ paymentMethod, _sum: { paidAmount: v.amount }, _count: { id: v.count } }))
        .sort((a, b) => b._sum.paidAmount - a._sum.paidAmount)

      return NextResponse.json({
        totalFees: summary.total,
        collected: summary.collected,
        pending: summary.pending,
        overdue: summary.overdue,
        discounts: summary.waived,
        refunded: summary.refunded,
        fines: fineTotals._sum.debit || 0,
        collectionRate: summary.total > 0 ? ((summary.collected / summary.total) * 100).toFixed(1) : '0',
        paymentsByMethod,
        recentPayments: recentPayments.map((payment) => ({
          id: payment.id,
          studentId: payment.studentId,
          paidAmount: payment.credit,
          amount: payment.credit,
          paymentMethod: payment.paymentMethod,
          paymentDate: payment.transactionDate,
          receiptNumber: payment.receiptNumber,
          student: payment.student,
        })),
      })
    }

    // Total fees (all collections)
    const totalFees = await db.feeCollection.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { amount: true },
    })

    // Total collected
    const collectedFees = await db.feeCollection.aggregate({
      where: { schoolId, deletedAt: null, paymentStatus: { in: ['paid', 'partial'] } },
      _sum: { paidAmount: true },
    })

    // Pending fees (unpaid + partial balance)
    const pendingFees = await db.feeCollection.aggregate({
      where: { schoolId, deletedAt: null, paymentStatus: { in: ['unpaid', 'partial'] } },
      _sum: { amount: true, paidAmount: true },
    })

    // Overdue fees (past due date and unpaid/partial)
    const overdueFees = await db.feeCollection.aggregate({
      where: {
        schoolId,
        deletedAt: null,
        paymentStatus: { in: ['unpaid', 'partial'] },
        dueDate: { lt: new Date() },
      },
      _sum: { amount: true, paidAmount: true },
    })

    // Total discounts
    const totalDiscounts = await db.feeCollection.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { discount: true, concession: true, scholarship: true },
    })

    // Total fines collected
    const totalFines = await db.feeCollection.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { fine: true },
    })

    // Payment method breakdown
    const paymentsByMethod = await db.feeCollection.groupBy({
      by: ['paymentMethod'],
      where: { schoolId, deletedAt: null, paymentStatus: { in: ['paid', 'partial'] } },
      _sum: { paidAmount: true },
      _count: { id: true },
    })

    // Recent payments
    const recentPayments = await db.feeCollection.findMany({
      where: { schoolId, paymentStatus: { in: ['paid', 'partial'] }, deletedAt: null },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            rollNumber: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: 5,
    })

    const totalAmount = totalFees._sum.amount || 0
    const collected = collectedFees._sum.paidAmount || 0
    const pendingAmount = (pendingFees._sum.amount || 0) - (pendingFees._sum.paidAmount || 0)
    const overdueAmount = (overdueFees._sum.amount || 0) - (overdueFees._sum.paidAmount || 0)

    return NextResponse.json({
      totalFees: totalAmount,
      collected: collected,
      pending: pendingAmount,
      overdue: overdueAmount,
      discounts: (totalDiscounts._sum.discount || 0) + (totalDiscounts._sum.concession || 0) + (totalDiscounts._sum.scholarship || 0),
      fines: totalFines._sum.fine || 0,
      collectionRate: totalAmount > 0 ? ((collected / totalAmount) * 100).toFixed(1) : '0',
      paymentsByMethod,
      recentPayments,
    })
  } catch (error) {
    console.error('Fee dashboard error:', error)
    return internalError('loading the fee dashboard')
  }
}
