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
        studentId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            admissionNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
            parentLinks: {
              select: {
                parent: {
                  select: {
                    fatherName: true,
                    motherName: true,
                    phone: true,
                  },
                },
              },
            },
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
            // Pull the source assignment so the renderer knows the per-line
            // academicYear (needed by buildSlipLines to bucket cross-session
            // dues correctly) without joining ledger entries.
            assignmentItem: {
              select: {
                assignment: {
                  select: { academicYear: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!slip) return notFoundError('Demand slip')

    // Pull every unpaid debit dated strictly before the earliest month included in this slip.
    // With catch-up behavior, if the slip includes June+July, previous dues should be before June.
    // Find the earliest month by checking all invoice lines.
    const month = slip.billingMonth ?? null
    const year = slip.billingYear ?? null
    let previousDues: Array<{
      id: string
      feeHeadName: string
      installmentName: string | null
      academicYear: string | null
      isTransport: boolean
      dueDate: string | null
      balanceAmount: number
    }> = []
    if (month && year) {
      // Find the earliest month in the slip lines
      let earliestMonthYM = year * 12 + (month - 1) // Default to slip month
      const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

      for (const line of slip.lines) {
        const monthName = line.installmentName
        if (monthName) {
          const monthIndex = MONTH_NAMES.indexOf(monthName)
          if (monthIndex >= 0) {
            const lineYM = year * 12 + monthIndex
            if (lineYM < earliestMonthYM) earliestMonthYM = lineYM
          }
        }
      }

      const earliestYear = Math.floor(earliestMonthYM / 12)
      const earliestMonth = (earliestMonthYM % 12) + 1
      const firstOfEarliestMonth = new Date(Date.UTC(earliestYear, earliestMonth - 1, 1, 0, 0, 0, 0))

      const debits = await db.studentFeeLedgerEntry.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: slip.studentId,
          entryType: 'DEBIT',
          deletedAt: null,
          status: { not: 'cancelled' },
          transactionDate: { lt: firstOfEarliestMonth },
          balanceAmount: { gt: 0 },
        },
        select: {
          id: true,
          feeHeadName: true,
          installmentName: true,
          academicYear: true,
          sourceType: true,
          dueDate: true,
          balanceAmount: true,
        },
        orderBy: { transactionDate: 'asc' },
      })
      previousDues = debits.map((d) => ({
        id: d.id,
        feeHeadName: d.feeHeadName || 'Fee',
        installmentName: d.installmentName,
        academicYear: d.academicYear,
        // sourceType is the canonical signal for transport debits, written by
        // the admission and transport-allocation flows. Fall back to head-name
        // heuristic for older rows.
        isTransport:
          d.sourceType === 'transport' || (d.feeHeadName || '').toLowerCase().includes('transport'),
        dueDate: d.dueDate ? d.dueDate.toISOString() : null,
        balanceAmount: d.balanceAmount,
      }))
    }

    // Flatten the assignmentItem nesting into a `lineAcademicYear` field and
    // derive isTransport for each on-slip line via the same heuristic the
    // collection page uses. The shape stays close to the existing API so
    // existing detail-view callers keep working; only two fields are new.
    const flatLines = slip.lines.map((line) => ({
      id: line.id,
      feeHeadName: line.feeHeadName,
      installmentName: line.installmentName,
      amount: line.amount,
      totalAmount: line.totalAmount,
      dueDate: line.dueDate,
      status: line.status,
      lineAcademicYear: line.assignmentItem?.assignment?.academicYear ?? null,
      isTransport: (line.feeHeadName || '').toLowerCase().includes('transport'),
    }))

    const { lines: _ignored, ...rest } = slip
    void _ignored

    return NextResponse.json({
      slip: {
        ...rest,
        lines: flatLines,
        previousDues,
      },
    })
  } catch (error) {
    console.error('Get demand slip error:', error)
    return internalError('loading demand slip')
  }
}
