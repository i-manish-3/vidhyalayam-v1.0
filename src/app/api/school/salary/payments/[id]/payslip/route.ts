import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { resolveStaff } from '@/lib/salary/staff-resolver'

// GET /api/school/salary/payments/[id]/payslip - Structured payslip data for
// rendering/printing a single payslip on the client.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view payslips.")
    }

    const { id } = await params
    const payment = await db.salaryPayment.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!payment) {
      return notFoundError('SalaryPayment')
    }

    const [staff, school] = await Promise.all([
      resolveStaff(db, user.schoolId, payment.staffType, payment.staffId),
      db.school.findUnique({
        where: { id: user.schoolId },
        select: {
          name: true,
          logo: true,
          printHeader: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          contactPhone: true,
          contactEmail: true,
          currency: true,
        },
      }),
    ])

    return NextResponse.json({ payment, staff, school })
  } catch (error) {
    console.error('Get payslip error:', error)
    return internalError('loading the payslip')
  }
}
