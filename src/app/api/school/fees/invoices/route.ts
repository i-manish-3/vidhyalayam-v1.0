import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { internalError, unauthorizedError } from '@/lib/api-errors'

// GET /api/school/fees/invoices - List fee invoices with lines and payment context.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const status = searchParams.get('status') || ''
    const academicYear = searchParams.get('academicYear') || ''

    const invoices = await db.studentFeeInvoice.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(studentId ? { studentId } : {}),
        ...(status ? { status } : {}),
        ...(academicYear ? { assignment: { academicYear } } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            rollNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
        assignment: {
          select: {
            id: true,
            academicYear: true,
            name: true,
            source: true,
            feesGroup: { select: { name: true } },
          },
        },
        lines: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } },
        collections: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('List fee invoices error:', error)
    return internalError('listing fee invoices')
  }
}
