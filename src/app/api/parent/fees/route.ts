import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/parent/fees - Get fee details for parent's children
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''

    // Find parent record
    const parent = await db.parent.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      include: {
        children: {
          where: { student: { isActive: true } },
          select: { studentId: true },
        },
      },
    })

    if (!parent) {
      return NextResponse.json({ fees: [], summary: { total: 0, paid: 0, pending: 0 } })
    }

    const childIds = parent.children.map(c => c.studentId)

    // If specific student requested, verify it belongs to this parent
    if (studentId && !childIds.includes(studentId)) {
      return unauthorizedError()
    }

    const targetStudentIds = studentId ? [studentId] : childIds

    // Get fee collections for children
    const fees = await db.feeCollection.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: targetStudentIds },
        deletedAt: null,
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    // Group by student
    const byStudent = fees.reduce((acc, f) => {
      const key = f.studentId
      if (!acc[key]) {
        acc[key] = {
          studentId: f.studentId,
          studentName: `${f.student.firstName} ${f.student.lastName}`,
          admissionNumber: f.student.admissionNumber,
          fees: [],
          summary: { total: 0, paid: 0, pending: 0, overdue: 0 },
        }
      }
      const pending = f.amount - f.paidAmount
      acc[key].fees.push({
        id: f.id,
        feeHead: f.feeHeadName || 'Fee',
        installment: f.installmentName || '',
        amount: f.amount,
        paid: f.paidAmount,
        discount: f.discount,
        fine: f.fine,
        pending,
        status: f.paymentStatus,
        dueDate: f.dueDate ? new Date(f.dueDate).toLocaleDateString() : null,
        paymentDate: f.paymentDate ? new Date(f.paymentDate).toLocaleDateString() : null,
        receiptNumber: f.receiptNumber,
      })
      acc[key].summary.total += f.amount
      acc[key].summary.paid += f.paidAmount
      acc[key].summary.pending += pending
      if (f.paymentStatus !== 'paid' && f.dueDate && f.dueDate < new Date()) {
        acc[key].summary.overdue += pending
      }
      return acc
    }, {} as Record<string, {
      studentId: string
      studentName: string
      admissionNumber: string | null
      fees: Array<{
        id: string; feeHead: string; installment: string; amount: number; paid: number
        discount: number; fine: number; pending: number; status: string
        dueDate: string | null; paymentDate: string | null; receiptNumber: string | null
      }>
      summary: { total: number; paid: number; pending: number; overdue: number }
    }>)

    // Overall summary
    const allFees = Object.values(byStudent)
    const summary = {
      total: allFees.reduce((s, f) => s + f.summary.total, 0),
      paid: allFees.reduce((s, f) => s + f.summary.paid, 0),
      pending: allFees.reduce((s, f) => s + f.summary.pending, 0),
      overdue: allFees.reduce((s, f) => s + f.summary.overdue, 0),
    }

    return NextResponse.json({ fees: Object.values(byStudent), summary })
  } catch (error) {
    console.error('Parent fees error:', error)
    return internalError('loading fee details')
  }
}
