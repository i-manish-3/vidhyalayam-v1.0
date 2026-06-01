import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { apiError, internalError } from '@/lib/api-errors'

/**
 * GET /api/school/fees/reports/student-statement
 *
 * Full ledger statement for one student. Suitable for printing or sharing
 * with parents during reconciliation.
 *
 * Query params:
 *   studentId    (required)
 *   academicYear (optional — filters entries to one AY)
 *   startDate    (optional)
 *   endDate      (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'fees:read')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view fee reports.")
    }
    const schoolId = user.schoolId

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId')
    const academicYear = searchParams.get('academicYear') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    if (!studentId) {
      return apiError(400, 'studentId is required')
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    })
    if (!student) {
      return apiError(404, 'Student not found')
    }

    const dateRange: any = {}
    if (startDate) dateRange.gte = new Date(startDate)
    if (endDate) dateRange.lt = new Date(endDate)

    const entries = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId,
        studentId,
        deletedAt: null,
        ...(academicYear ? { academicYear } : {}),
        ...(Object.keys(dateRange).length > 0 ? { transactionDate: dateRange } : {}),
      },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        academicYear: true,
        entryType: true,
        sourceType: true,
        feeHeadName: true,
        installmentName: true,
        description: true,
        debit: true,
        credit: true,
        balanceAmount: true,
        dueDate: true,
        transactionDate: true,
        paymentMethod: true,
        transactionRef: true,
        receiptNumber: true,
        status: true,
        notes: true,
      },
    })

    // Compute running balance as we walk forward. Debit = increases balance,
    // Credit / Refund (refund = debit-of-cash to balance student's account) =
    // careful: in this schema, REFUND entries are recorded with debit > 0 to
    // represent money paid back to the student, which reduces what's been
    // collected (NOT what the student owes). For the running statement we
    // treat: balance += DEBIT.debit - CREDIT.credit, ignoring REFUND/WAIVER
    // sign so they show as informational rows.
    let runningBalance = 0
    const rows = entries.map(e => {
      if (e.entryType === 'DEBIT' || e.entryType === 'FINE') {
        runningBalance += e.debit
      } else if (e.entryType === 'CREDIT' || e.entryType === 'WAIVER' || e.entryType === 'ADJUSTMENT') {
        runningBalance -= e.credit
      }
      // REFUND entries reduce nothing on the dues side — they're a separate cash leg.

      return {
        id: e.id,
        date: e.transactionDate.toISOString(),
        dueDate: e.dueDate?.toISOString() ?? null,
        academicYear: e.academicYear,
        type: e.entryType,
        sourceType: e.sourceType,
        feeHeadName: e.feeHeadName,
        installmentName: e.installmentName,
        description: e.description || buildDescription(e),
        debit: round2(e.debit || 0),
        credit: round2(e.credit || 0),
        balance: round2(runningBalance),
        paymentMethod: e.paymentMethod,
        transactionRef: e.transactionRef,
        receiptNumber: e.receiptNumber,
        status: e.status,
      }
    })

    // Summary totals
    const totals = entries.reduce(
      (acc, e) => {
        if (e.entryType === 'DEBIT' || e.entryType === 'FINE') acc.billed += e.debit
        if (e.entryType === 'CREDIT') acc.paid += e.credit
        if (e.entryType === 'WAIVER') acc.waiver += e.credit
        if (e.entryType === 'REFUND') acc.refunded += e.debit
        return acc
      },
      { billed: 0, paid: 0, waiver: 0, refunded: 0 }
    )

    // Outstanding = current open balance on open/partial debits
    const openDebits = entries.filter(
      e => e.entryType === 'DEBIT' && (e.status === 'open' || e.status === 'partial')
    )
    const outstanding = openDebits.reduce((s, e) => s + (e.balanceAmount || 0), 0)

    return NextResponse.json({
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        class: student.class,
        section: student.section,
      },
      summary: {
        billed: round2(totals.billed),
        paid: round2(totals.paid),
        waiver: round2(totals.waiver),
        refunded: round2(totals.refunded),
        outstanding: round2(outstanding),
      },
      entries: rows,
    })
  } catch (error) {
    console.error('Student statement error:', error)
    return internalError('loading student statement')
  }
}

function buildDescription(e: any): string {
  const parts: string[] = []
  if (e.feeHeadName) parts.push(e.feeHeadName)
  if (e.installmentName) parts.push(e.installmentName)
  if (e.entryType === 'CREDIT' && e.paymentMethod) {
    parts.push(`Payment via ${e.paymentMethod}`)
  }
  if (e.entryType === 'REFUND') {
    parts.push('Refund')
  }
  return parts.join(' · ') || e.entryType
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
