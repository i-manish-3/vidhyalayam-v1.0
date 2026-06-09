import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'
import { salaryRound } from '@/lib/salary/staff-resolver'
import { computePayslip } from '@/lib/salary/compute'
import { logSalaryEvent, extractSalaryAuditContext } from '@/lib/salary/audit'

// GET /api/school/salary/payroll-runs - List monthly payroll runs
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view payroll runs.")
    }

    const { searchParams } = new URL(request.url)
    const year = searchParams.get('year') || ''

    const where: Record<string, unknown> = { schoolId: user.schoolId }
    if (year) where.year = parseInt(year)

    const runs = await db.payrollRun.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    return NextResponse.json({ runs })
  } catch (error) {
    console.error('List payroll runs error:', error)
    return internalError('listing payroll runs')
  }
}

// POST /api/school/salary/payroll-runs - Generate a payroll run for a month/year.
// Creates pending payslips for every active staff that has an active salary
// structure and isn't already paid/generated for that period. Idempotent: a
// re-run only adds the missing staff and never duplicates.
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:pay')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to run payroll.")
    }

    const body = await request.json()
    const month = parseInt(String(body.month))
    const year = parseInt(String(body.year))

    if (!month || month < 1 || month > 12 || !year) {
      return apiError(400, 'Please choose a valid month and year for this payroll run.')
    }

    const schoolId = user.schoolId
    const auditContext = extractSalaryAuditContext(request, user.userId)

    const result = await db.$transaction(async (tx: typeof db) => {
      // Block re-running a finalized period.
      const existingRun = await tx.payrollRun.findUnique({
        where: { schoolId_month_year: { schoolId, month, year } },
      })
      if (existingRun && existingRun.status === 'finalized') {
        return { finalized: true as const, run: existingRun }
      }

      const structures = await tx.salaryStructure.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
      })

      // Payments already present for this period (any staff), to stay idempotent.
      const existingPayments = await tx.salaryPayment.findMany({
        where: { schoolId, month, year },
        select: { staffType: true, staffId: true },
      })
      const taken = new Set(existingPayments.map((p: { staffType: string; staffId: string }) => `${p.staffType}:${p.staffId}`))

      // Approved advances due for deduction this period, summed per staff.
      const advances = await tx.advanceRequest.groupBy({
        by: ['staffType', 'staffId'],
        where: {
          schoolId,
          approvalStatus: 'approved',
          deductionMonth: month,
          deductionYear: year,
        },
        _sum: { amount: true },
      })
      const advanceByStaff = new Map<string, number>()
      for (const a of advances) {
        advanceByStaff.set(`${a.staffType}:${a.staffId}`, a._sum.amount || 0)
      }

      const run = await tx.payrollRun.upsert({
        where: { schoolId_month_year: { schoolId, month, year } },
        update: { status: 'generated', generatedBy: user.userId },
        create: { schoolId, month, year, status: 'generated', generatedBy: user.userId },
      })

      let created = 0
      let totalGross = existingRun ? 0 : 0
      let totalNet = 0

      for (const structure of structures) {
        const key = `${structure.staffType}:${structure.staffId}`
        if (taken.has(key)) continue

        const advanceDeduction = advanceByStaff.get(key) || 0
        const slip = computePayslip({ structure, lopDays: 0, advanceDeduction })

        await tx.salaryPayment.create({
          data: {
            schoolId,
            staffType: structure.staffType,
            staffId: structure.staffId,
            salaryStructureId: structure.id,
            payrollRunId: run.id,
            month,
            year,
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
        created += 1
        totalGross = salaryRound(totalGross + slip.grossEarnings)
        totalNet = salaryRound(totalNet + slip.netPayable)
      }

      // Recompute run totals from all its payslips so re-runs stay accurate.
      const agg = await tx.salaryPayment.aggregate({
        where: { schoolId, payrollRunId: run.id },
        _sum: { grossEarnings: true, netPayable: true },
        _count: true,
      })
      const finalRun = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          totalStaff: agg._count || 0,
          totalGross: salaryRound(agg._sum.grossEarnings || 0),
          totalNet: salaryRound(agg._sum.netPayable || 0),
        },
      })

      await logSalaryEvent(tx, schoolId, 'PayrollRun', finalRun.id, 'generated', existingRun, finalRun, {
        ...auditContext,
        diffSummary: `Payroll generated for ${month}/${year}: ${created} new payslip(s), ${finalRun.totalStaff} total`,
        metadata: { month, year, created, totalStaff: finalRun.totalStaff },
      })

      return { finalized: false as const, run: finalRun, created }
    })

    if (result.finalized) {
      return apiError(409, 'Payroll for this month has already been finalized and can no longer be regenerated.')
    }

    return NextResponse.json(
      { run: result.run, created: result.created, message: `Payroll generated: ${result.created} new payslip(s).` },
      { status: 201 }
    )
  } catch (error) {
    console.error('Generate payroll run error:', error)
    return internalError('generating the payroll run')
  }
}
