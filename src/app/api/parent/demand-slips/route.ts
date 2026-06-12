import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'

// GET /api/parent/demand-slips?studentId= — list the parent's children's monthly
// demand slips (StudentFeeInvoice). Newest first.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const childIds = await getParentChildStudentIds(user.userId, user.schoolId)
    if (childIds.length === 0) return NextResponse.json({ slips: [] })

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    if (studentId && !childIds.includes(studentId)) return unauthorizedError()
    const targetIds = studentId ? [studentId] : childIds

    const slips = await db.studentFeeInvoice.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: targetIds },
        isMonthlyDemand: true,
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        billingMonth: true,
        billingYear: true,
        invoiceDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ billingYear: 'desc' }, { billingMonth: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({
      slips: slips.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        billingMonth: s.billingMonth,
        billingYear: s.billingYear,
        invoiceDate: s.invoiceDate,
        dueDate: s.dueDate,
        totalAmount: s.totalAmount,
        paidAmount: s.paidAmount,
        amountDue: (s.totalAmount || 0) - (s.paidAmount || 0),
        status: s.status,
        studentId: s.studentId,
        studentName: `${s.student.firstName} ${s.student.lastName}`.trim(),
      })),
    })
  } catch (error) {
    console.error('Parent demand-slips list error:', error)
    return internalError('loading demand slips')
  }
}
