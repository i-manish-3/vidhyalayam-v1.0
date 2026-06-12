import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'

// GET /api/parent/receipts?studentId= — list the parent's children's payment
// receipts (StudentFeePayment). Newest first.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const childIds = await getParentChildStudentIds(user.userId, user.schoolId)
    if (childIds.length === 0) return NextResponse.json({ receipts: [] })

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    if (studentId && !childIds.includes(studentId)) return unauthorizedError()
    const targetIds = studentId ? [studentId] : childIds

    const payments = await db.studentFeePayment.findMany({
      where: { schoolId: user.schoolId, studentId: { in: targetIds } },
      select: {
        id: true,
        receiptNumber: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        studentId: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { paymentDate: 'desc' },
      take: 200,
    })

    return NextResponse.json({
      receipts: payments.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
        studentId: p.studentId,
        studentName: `${p.student.firstName} ${p.student.lastName}`.trim(),
      })),
    })
  } catch (error) {
    console.error('Parent receipts list error:', error)
    return internalError('loading receipts')
  }
}
