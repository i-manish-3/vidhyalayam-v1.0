import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { resolveStaff, resolveStaffMap, isStaffType, staffKey } from '@/lib/salary/staff-resolver'
import { computePayslip } from '@/lib/salary/compute'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// GET /api/school/salary/payments - List salary payments
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view salary payments.")
    }

    const { searchParams } = new URL(request.url)
    const staffType = searchParams.get('staffType') || ''
    const staffId = searchParams.get('staffId') || ''
    const month = searchParams.get('month') || ''
    const year = searchParams.get('year') || ''
    const paymentStatus = searchParams.get('paymentStatus') || ''
    const payrollRunId = searchParams.get('payrollRunId') || ''
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20'), 1), 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (isStaffType(staffType)) where.staffType = staffType
    if (staffId) where.staffId = staffId
    if (month) where.month = parseInt(month)
    if (year) where.year = parseInt(year)
    if (paymentStatus) where.paymentStatus = paymentStatus
    if (payrollRunId) where.payrollRunId = payrollRunId

    const [payments, total] = await Promise.all([
      db.salaryPayment.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip,
        take: limit,
      }),
      db.salaryPayment.count({ where }),
    ])

    const staffMap = await resolveStaffMap(
      db,
      user.schoolId,
      payments.map((p: { staffType: string; staffId: string }) => ({ staffType: p.staffType, staffId: p.staffId }))
    )
    const withStaff = payments.map((p: { staffType: string; staffId: string }) => ({
      ...p,
      staff: staffMap.get(staffKey(p.staffType, p.staffId)) || null,
    }))

    return NextResponse.json({
      payments: withStaff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('List salary payments error:', error)
    return internalError('listing salary payments')
  }
}

// POST /api/school/salary/payments - Generate/process a single salary payment
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:pay')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to process salary payments.")
    }

    const body = await request.json()
    const {
      staffType,
      staffId,
      month,
      year,
      paymentMethod,
      transactionRef,
      lopDays,
      action, // 'generate' or 'process'
    } = body

    if (!isStaffType(staffType) || !staffId || !month || !year) {
      return apiError(400, 'Please select a staff member, month, and year to generate the salary payment.')
    }

    const monthNum = parseInt(String(month))
    const yearNum = parseInt(String(year))

    const staff = await resolveStaff(db, user.schoolId, staffType, staffId)
    if (!staff) {
      return notFoundError('Staff member')
    }

    const existingPayment = await db.salaryPayment.findUnique({
      where: {
        schoolId_staffType_staffId_month_year: {
          schoolId: user.schoolId,
          staffType,
          staffId,
          month: monthNum,
          year: yearNum,
        },
      },
    })

    if (existingPayment && action !== 'process') {
      return NextResponse.json(
        {
          message:
            "This staff member's salary has already been processed for this month. You can view it in the salary payments list.",
          payment: existingPayment,
        },
        { status: 400 }
      )
    }

    if (existingPayment && action === 'process' && existingPayment.paymentStatus === 'paid') {
      return apiError(409, 'This payslip has already been paid.')
    }

    const salaryStructure = await db.salaryStructure.findFirst({
      where: { schoolId: user.schoolId, staffType, staffId, deletedAt: null },
    })
    if (!salaryStructure) {
      return apiError(
        400,
        "This staff member doesn't have a salary structure yet. Please create one before processing payments."
      )
    }

    // Approved advances scheduled for deduction this month
    const advanceDeduction = await db.advanceRequest.aggregate({
      where: {
        schoolId: user.schoolId,
        staffType,
        staffId,
        approvalStatus: 'approved',
        deductionMonth: monthNum,
        deductionYear: yearNum,
      },
      _sum: { amount: true },
    })
    const advanceDed = advanceDeduction._sum.amount || 0

    const effectiveLopDays = lopDays !== undefined ? Number(lopDays) : existingPayment?.lopDays || 0
    const slip = computePayslip({
      structure: salaryStructure,
      lopDays: effectiveLopDays,
      advanceDeduction: advanceDed,
    })

    const auditContext = extractSalaryAuditContext(request, user.userId)

    if (existingPayment && action === 'process') {
      const updated = await db.$transaction(async (tx: typeof db) => {
        const result = await tx.salaryPayment.update({
          where: { id: existingPayment.id },
          data: {
            paymentStatus: 'paid',
            paymentDate: new Date(),
            paymentMethod: paymentMethod || 'bank_transfer',
            transactionRef,
            advanceDeduction: slip.advanceDeduction,
            lopDays: slip.lopDays,
            paidDays: slip.paidDays,
            lopDeduction: slip.lopDeduction,
            totalDeductions: slip.totalDeductions,
            netPayable: slip.netPayable,
          },
        })
        await logSalaryEvent(tx, user.schoolId!, 'SalaryPayment', result.id, 'paid', existingPayment, result, {
          ...auditContext,
          staffType,
          staffId,
          diffSummary: `Marked salary paid for ${staff.fullName} (${monthNum}/${yearNum}), net ${slip.netPayable}`,
          metadata: { month: monthNum, year: yearNum, paymentMethod: paymentMethod || 'bank_transfer' },
        })
        return result
      })
      return NextResponse.json({ ...updated, staff })
    }

    const payment = await db.$transaction(async (tx: typeof db) => {
      const created = await tx.salaryPayment.create({
        data: {
          schoolId: user.schoolId!,
          staffType,
          staffId,
          salaryStructureId: salaryStructure.id,
          month: monthNum,
          year: yearNum,
          basicSalary: slip.basicSalary,
          hra: slip.hra,
          da: slip.da,
          ta: slip.ta,
          medicalAllowance: slip.medicalAllowance,
          specialAllowance: slip.specialAllowance,
          grossEarnings: slip.grossEarnings,
          pf: slip.pf,
          esi: slip.esi,
          tax: slip.tax,
          advanceDeduction: slip.advanceDeduction,
          lopDays: slip.lopDays,
          paidDays: slip.paidDays,
          lopDeduction: slip.lopDeduction,
          otherDeductions: slip.otherDeductions,
          totalDeductions: slip.totalDeductions,
          netPayable: slip.netPayable,
          paymentStatus: 'pending',
          generatedOn: new Date(),
        },
      })
      await logSalaryEvent(tx, user.schoolId!, 'SalaryPayment', created.id, 'generated', null, created, {
        ...auditContext,
        staffType,
        staffId,
        diffSummary: `Generated salary payslip for ${staff.fullName} (${monthNum}/${yearNum}), net ${slip.netPayable}`,
        metadata: { month: monthNum, year: yearNum },
      })
      return created
    })

    return NextResponse.json({ ...payment, staff }, { status: 201 })
  } catch (error) {
    console.error('Create salary payment error:', error)
    return internalError('processing the salary payment')
  }
}
