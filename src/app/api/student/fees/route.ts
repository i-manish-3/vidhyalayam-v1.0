import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/student/fees - Get fee details for the logged-in student
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['STUDENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''

    // Find parent record for this user
    const parent = await db.parent.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      include: {
        children: {
          where: { student: { isActive: true } },
          select: { studentId: true },
        },
      },
    })

    if (!parent || parent.children.length === 0) {
      return NextResponse.json({ fees: [], summary: { total: 0, paid: 0, pending: 0 } })
    }

    const targetId = studentId || parent.children[0].studentId

    // Verify access
    if (!parent.children.some(c => c.studentId === targetId)) {
      return unauthorizedError()
    }

    const ledgerFees = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: targetId,
        entryType: 'DEBIT',
        status: { not: 'cancelled' },
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
    })

    if (ledgerFees.length > 0) {
      const total = ledgerFees.reduce((s, f) => s + f.debit, 0)
      const pending = ledgerFees.reduce((s, f) => s + f.balanceAmount, 0)
      const paid = total - pending
      const overdue = ledgerFees
        .filter(f => f.status !== 'settled' && f.dueDate && f.dueDate < new Date())
        .reduce((s, f) => s + f.balanceAmount, 0)

      return NextResponse.json({
        fees: ledgerFees.map(f => ({
          id: f.id,
          feeHead: f.feeHeadName || 'Fee',
          installment: f.installmentName || '',
          amount: f.debit,
          paid: f.debit - f.balanceAmount,
          discount: 0,
          concession: 0,
          scholarship: 0,
          fine: 0,
          pending: f.balanceAmount,
          status: f.status === 'settled' ? 'paid' : f.status === 'partial' ? 'partial' : 'unpaid',
          dueDate: f.dueDate ? new Date(f.dueDate).toLocaleDateString() : null,
          paymentDate: f.transactionDate ? new Date(f.transactionDate).toLocaleDateString() : null,
          receiptNumber: f.receiptNumber,
        })),
        summary: { total, paid, pending, overdue },
      })
    }

    const fees = await db.feeCollection.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: targetId,
        deletedAt: null,
      },
      orderBy: { dueDate: 'asc' },
    })

    const total = fees.reduce((s, f) => s + f.amount, 0)
    const paid = fees.reduce((s, f) => s + f.paidAmount, 0)
    const pending = total - paid
    const overdue = fees
      .filter(f => f.paymentStatus !== 'paid' && f.dueDate && f.dueDate < new Date())
      .reduce((s, f) => s + (f.amount - f.paidAmount), 0)

    return NextResponse.json({
      fees: fees.map(f => ({
        id: f.id,
        feeHead: f.feeHeadName || 'Fee',
        installment: f.installmentName || '',
        amount: f.amount,
        paid: f.paidAmount,
        discount: f.discount,
        concession: f.concession,
        scholarship: f.scholarship,
        fine: f.fine,
        pending: f.amount - f.paidAmount,
        status: f.paymentStatus,
        dueDate: f.dueDate ? new Date(f.dueDate).toLocaleDateString() : null,
        paymentDate: f.paymentDate ? new Date(f.paymentDate).toLocaleDateString() : null,
        receiptNumber: f.receiptNumber,
      })),
      summary: { total, paid, pending, overdue },
    })
  } catch (error) {
    console.error('Student fees error:', error)
    return internalError('loading your fee details')
  }
}
