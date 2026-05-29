import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { forbiddenError, internalError, notFoundError, unauthorizedError } from '@/lib/api-errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'fees:read')
      if (!ok) return forbiddenError("You don't have permission to view demand slips.")
    }

    const { id } = await params

    const slip = await db.studentFeeInvoice.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
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
        subtotal: true,
        previousBalance: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        notes: true,
        demandRunId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
        },
        lines: {
          select: {
            id: true,
            feeHeadName: true,
            installmentName: true,
            amount: true,
            totalAmount: true,
            dueDate: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!slip) return notFoundError('Demand slip')

    return NextResponse.json({ slip })
  } catch (error) {
    console.error('Get demand slip error:', error)
    return internalError('loading demand slip')
  }
}
