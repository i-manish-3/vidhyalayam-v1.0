import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { resolveStaff } from '@/lib/salary/staff-resolver'
import { computePayslip } from '@/lib/salary/compute'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// PATCH /api/school/salary/payments/[id] - Mark a payslip paid and/or adjust LOP.
// Body: { action?: 'pay', paymentMethod?, transactionRef?, lopDays? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:pay')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to process salary payments.")
    }

    const { id } = await params
    const schoolId = user.schoolId

    const payment = await db.salaryPayment.findFirst({ where: { id, schoolId } })
    if (!payment) {
      return notFoundError('SalaryPayment')
    }

    const body = await request.json()
    const auditContext = extractSalaryAuditContext(request, user.userId)

    if (body.action === 'pay' && payment.paymentStatus === 'paid') {
      return apiError(409, 'This payslip has already been paid.')
    }

    // Recompute if LOP changed; pull the structure for accurate per-day math.
    let recomputed = null as null | ReturnType<typeof computePayslip>
    if (body.lopDays !== undefined) {
      const structure = await db.salaryStructure.findFirst({
        where: { schoolId, staffType: payment.staffType, staffId: payment.staffId, deletedAt: null },
      })
      if (structure) {
        recomputed = computePayslip({
          structure,
          lopDays: Number(body.lopDays),
          advanceDeduction: payment.advanceDeduction,
        })
      }
    }

    const isPaying = body.action === 'pay'

    const updated = await db.$transaction(async (tx: typeof db) => {
      const result = await tx.salaryPayment.update({
        where: { id },
        data: {
          ...(recomputed
            ? {
                lopDays: recomputed.lopDays,
                paidDays: recomputed.paidDays,
                lopDeduction: recomputed.lopDeduction,
                totalDeductions: recomputed.totalDeductions,
                netPayable: recomputed.netPayable,
              }
            : {}),
          ...(isPaying
            ? {
                paymentStatus: 'paid',
                paymentDate: new Date(),
                paymentMethod: body.paymentMethod || 'bank_transfer',
                transactionRef: body.transactionRef,
              }
            : {}),
        },
      })
      await logSalaryEvent(
        tx,
        schoolId,
        'SalaryPayment',
        id,
        isPaying ? 'paid' : 'updated',
        payment,
        result,
        {
          ...auditContext,
          staffType: payment.staffType,
          staffId: payment.staffId,
          diffSummary: isPaying
            ? `Payslip marked paid, net ${result.netPayable}`
            : `Payslip adjusted, net ${payment.netPayable} -> ${result.netPayable}`,
        }
      )
      return result
    })

    const staff = await resolveStaff(db, schoolId, updated.staffType, updated.staffId)
    return NextResponse.json({ ...updated, staff })
  } catch (error) {
    console.error('Update salary payment error:', error)
    return internalError('updating the salary payment')
  }
}
