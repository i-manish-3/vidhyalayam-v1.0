import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'
import { resolveStaffMap, isStaffType, staffKey, salaryRound, STAFF_TYPES } from '@/lib/salary/staff-resolver'

interface PaymentRow {
  staffType: string
  staffId: string
  month: number
  year: number
  grossEarnings: number
  totalDeductions: number
  netPayable: number
  paymentStatus: string
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  // Neutralise spreadsheet formula injection: a leading =, +, -, @ or tab can be
  // executed as a formula in Excel/Calc. Prefix such values with a tab.
  const safe = /^[=+\-@\t\r]/.test(s) ? `\t${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// GET /api/school/salary/reports - Salary summary for a period.
// Query: ?year=&month=&staffType=&format=csv
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'salary:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view salary reports.")
    }

    const { searchParams } = new URL(request.url)
    const yearParam = searchParams.get('year')
    const monthParam = searchParams.get('month')
    const staffTypeParam = searchParams.get('staffType') || ''
    const format = searchParams.get('format') || 'json'

    if (!yearParam) {
      return apiError(400, 'Please choose a year for the salary report.')
    }
    const year = parseInt(yearParam)
    const month = monthParam ? parseInt(monthParam) : undefined

    const where: Record<string, unknown> = { schoolId: user.schoolId, year }
    if (month) where.month = month
    if (isStaffType(staffTypeParam)) where.staffType = staffTypeParam

    const payments: PaymentRow[] = await db.salaryPayment.findMany({
      where,
      select: {
        staffType: true,
        staffId: true,
        month: true,
        year: true,
        grossEarnings: true,
        totalDeductions: true,
        netPayable: true,
        paymentStatus: true,
      },
      orderBy: [{ month: 'asc' }],
    })

    // Per-staff-type breakdown + paid/pending split.
    const byType: Record<string, { count: number; gross: number; net: number; paidNet: number; pendingNet: number }> = {}
    for (const t of STAFF_TYPES) byType[t] = { count: 0, gross: 0, net: 0, paidNet: 0, pendingNet: 0 }

    let totalGross = 0
    let totalNet = 0
    let paidNet = 0
    let pendingNet = 0

    for (const p of payments) {
      const bucket = byType[p.staffType] || (byType[p.staffType] = { count: 0, gross: 0, net: 0, paidNet: 0, pendingNet: 0 })
      bucket.count += 1
      bucket.gross = salaryRound(bucket.gross + p.grossEarnings)
      bucket.net = salaryRound(bucket.net + p.netPayable)
      totalGross = salaryRound(totalGross + p.grossEarnings)
      totalNet = salaryRound(totalNet + p.netPayable)
      if (p.paymentStatus === 'paid') {
        bucket.paidNet = salaryRound(bucket.paidNet + p.netPayable)
        paidNet = salaryRound(paidNet + p.netPayable)
      } else {
        bucket.pendingNet = salaryRound(bucket.pendingNet + p.netPayable)
        pendingNet = salaryRound(pendingNet + p.netPayable)
      }
    }

    // Outstanding advances (approved, not yet fully recovered) for the school.
    const advances = await db.advanceRequest.findMany({
      where: { schoolId: user.schoolId, approvalStatus: 'approved' },
      select: { amount: true, deductedAmount: true },
    })
    const advanceOutstanding = salaryRound(
      advances.reduce((sum: number, a: { amount: number; deductedAmount: number }) => sum + Math.max(a.amount - a.deductedAmount, 0), 0)
    )

    if (format === 'csv') {
      const staffMap = await resolveStaffMap(
        db,
        user.schoolId,
        payments.map((p) => ({ staffType: p.staffType, staffId: p.staffId }))
      )
      const header = ['Employee', 'Employee ID', 'Role', 'Type', 'Month', 'Year', 'Gross', 'Deductions', 'Net', 'Status']
      const lines = [header.join(',')]
      for (const p of payments) {
        const staff = staffMap.get(staffKey(p.staffType, p.staffId))
        lines.push(
          [
            csvCell(staff?.fullName || 'Unknown'),
            csvCell(staff?.employeeId || ''),
            csvCell(staff?.roleLabel || ''),
            csvCell(p.staffType),
            csvCell(p.month),
            csvCell(p.year),
            csvCell(p.grossEarnings),
            csvCell(p.totalDeductions),
            csvCell(p.netPayable),
            csvCell(p.paymentStatus),
          ].join(',')
        )
      }
      const csv = lines.join('\n')
      const filename = `salary-report-${year}${month ? `-${String(month).padStart(2, '0')}` : ''}.csv`
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    return NextResponse.json({
      period: { year, month: month || null, staffType: isStaffType(staffTypeParam) ? staffTypeParam : null },
      summary: {
        totalPayslips: payments.length,
        totalGross,
        totalNet,
        paidNet,
        pendingNet,
        advanceOutstanding,
      },
      byType,
    })
  } catch (error) {
    console.error('Salary report error:', error)
    return internalError('building the salary report')
  }
}
