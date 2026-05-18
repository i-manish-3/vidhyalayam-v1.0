import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/fees/dashboard - Fee dashboard stats
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const schoolId = user.schoolId

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
