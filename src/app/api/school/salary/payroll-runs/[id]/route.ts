import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { resolveStaffMap, staffKey } from '@/lib/salary/staff-resolver'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// GET /api/school/salary/payroll-runs/[id] - Run detail + its payslips
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view payroll runs.")
    }

    const { id } = await params
    const run = await db.payrollRun.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!run) {
      return notFoundError('payroll run')
    }

    const payments = await db.salaryPayment.findMany({
      where: { schoolId: user.schoolId, payrollRunId: id },
      orderBy: { createdAt: 'asc' },
    })

    const staffMap = await resolveStaffMap(
      db,
      user.schoolId,
      payments.map((p: { staffType: string; staffId: string }) => ({ staffType: p.staffType, staffId: p.staffId }))
    )
    const withStaff = payments.map((p: { staffType: string; staffId: string }) => {
      const staff = staffMap.get(staffKey(p.staffType, p.staffId)) || null
      return {
        ...p,
        staff,
        staffName: staff?.fullName || '',
        staffEmployeeId: staff?.employeeId || '',
      }
    })

    return NextResponse.json({ run, payments: withStaff })
  } catch (error) {
    console.error('Get payroll run error:', error)
    return internalError('loading the payroll run')
  }
}

// PATCH /api/school/salary/payroll-runs/[id] - Finalize the run and/or mark its
// pending payslips as paid. Body: { action: 'pay-all' | 'finalize', paymentMethod? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:pay')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to process payroll.")
    }

    const { id } = await params
    const body = await request.json()
    const action = body.action === 'finalize' ? 'finalize' : 'pay-all'
    const paymentMethod = body.paymentMethod || 'bank_transfer'
    const schoolId = user.schoolId
    const auditContext = extractSalaryAuditContext(request, user.userId)

    const run = await db.payrollRun.findFirst({ where: { id, schoolId } })
    if (!run) {
      return notFoundError('payroll run')
    }
    if (run.status === 'finalized') {
      return apiError(409, 'This payroll run is already finalized.')
    }

    const updatedRun = await db.$transaction(async (tx: typeof db) => {
      if (action === 'pay-all') {
        await tx.salaryPayment.updateMany({
          where: { schoolId, payrollRunId: id, paymentStatus: 'pending' },
          data: { paymentStatus: 'paid', paymentDate: new Date(), paymentMethod },
        })
      }

      const result = await tx.payrollRun.update({
        where: { id },
        data: {
          status: 'finalized',
          finalizedAt: new Date(),
        },
      })

      await logSalaryEvent(tx, schoolId, 'PayrollRun', id, action === 'pay-all' ? 'paid' : 'finalized', run, result, {
        ...auditContext,
        diffSummary:
          action === 'pay-all'
            ? `Payroll ${run.month}/${run.year} paid and finalized`
            : `Payroll ${run.month}/${run.year} finalized`,
        metadata: { month: run.month, year: run.year, paymentMethod },
      })

      return result
    })

    return NextResponse.json({ run: updatedRun, message: 'Payroll run updated successfully.' })
  } catch (error) {
    console.error('Update payroll run error:', error)
    return internalError('updating the payroll run')
  }
}

// DELETE /api/school/salary/payroll-runs/[id] - Discard a non-finalized run and
// its still-pending payslips. Paid payslips are preserved (and block deletion).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'salary:pay')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to discard payroll runs.")
    }

    const { id } = await params
    const schoolId = user.schoolId

    const run = await db.payrollRun.findFirst({ where: { id, schoolId } })
    if (!run) {
      return notFoundError('payroll run')
    }
    if (run.status === 'finalized') {
      return apiError(409, 'A finalized payroll run cannot be discarded.')
    }

    const paidCount = await db.salaryPayment.count({
      where: { schoolId, payrollRunId: id, paymentStatus: 'paid' },
    })
    if (paidCount > 0) {
      return apiError(
        409,
        'This run has payslips that were already paid. Discarding it would lose payment records, so it is blocked.'
      )
    }

    const auditContext = extractSalaryAuditContext(request, user.userId)

    await db.$transaction(async (tx: typeof db) => {
      await tx.salaryPayment.deleteMany({ where: { schoolId, payrollRunId: id, paymentStatus: 'pending' } })
      await tx.payrollRun.deleteMany({ where: { id, schoolId } })
      await logSalaryEvent(tx, schoolId, 'PayrollRun', id, 'deleted', run, null, {
        ...auditContext,
        diffSummary: `Discarded draft payroll run ${run.month}/${run.year}`,
      })
    })

    return NextResponse.json({ message: 'Payroll run discarded.' })
  } catch (error) {
    console.error('Delete payroll run error:', error)
    return internalError('discarding the payroll run')
  }
}
