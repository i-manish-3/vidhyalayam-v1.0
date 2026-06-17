import { db } from '@/lib/db'

/**
 * Single source of truth for fee KPI totals. Every report + the dashboard call
 * this so their numbers always agree and satisfy the reconciliation identity:
 *
 *   Billed = Collected + Waived + Outstanding      (cash refunds net out of both
 *                                                    sides, so they are reported
 *                                                    separately as `refunded`)
 *
 * - total      (Billed)      = sum(debit) on non-cancelled DEBIT/FINE rows
 * - collected  (Collected)   = sum(allocation.amount) where the credit is a CREDIT
 * - waived     (Waived)      = sum(allocation.amount) where the credit is a WAIVER
 * - pending    (Outstanding) = sum(balanceAmount) on non-cancelled DEBIT/FINE rows
 * - refunded   (Refunds out) = cash refunds handed back on transport/hostel
 *                              discontinue (tracked on the event rows, since that
 *                              flow does not write a REFUND ledger entry)
 */
export async function getFeeLedgerSummary(
  schoolId: string,
  studentIds?: string[],
  academicYear?: string,
  options?: { activeOnly?: boolean },
) {
  const academicYearFilter = academicYear ? { academicYear } : {}
  const studentFilter = studentIds ? { studentId: { in: studentIds } } : {}
  // Exclude charges/payments belonging to students who have left, when asked.
  const activeStudentFilter = options?.activeOnly
    ? { student: { isActive: true, deletedAt: null } }
    : {}
  const billingEntryTypes = ['DEBIT', 'FINE']

  const [debits, credits, waivers, overdueDebits, refunded] = await Promise.all([
    db.studentFeeLedgerEntry.aggregate({
      where: {
        schoolId,
        entryType: { in: billingEntryTypes },
        deletedAt: null,
        status: { not: 'cancelled' },
        ...academicYearFilter,
        ...studentFilter,
        ...activeStudentFilter,
      },
      _sum: { debit: true, balanceAmount: true },
    }),
    db.studentFeeLedgerAllocation.aggregate({
      where: {
        schoolId,
        deletedAt: null,
        creditEntry: { entryType: 'CREDIT', deletedAt: null },
        debitEntry: {
          deletedAt: null,
          status: { not: 'cancelled' },
          ...academicYearFilter,
        },
        ...studentFilter,
        ...activeStudentFilter,
      },
      _sum: { amount: true },
    }),
    db.studentFeeLedgerAllocation.aggregate({
      where: {
        schoolId,
        deletedAt: null,
        creditEntry: { entryType: 'WAIVER', deletedAt: null },
        debitEntry: {
          deletedAt: null,
          status: { not: 'cancelled' },
          ...academicYearFilter,
        },
        ...studentFilter,
        ...activeStudentFilter,
      },
      _sum: { amount: true },
    }),
    db.studentFeeLedgerEntry.aggregate({
      where: {
        schoolId,
        entryType: { in: billingEntryTypes },
        deletedAt: null,
        status: { in: ['open', 'partial'] },
        balanceAmount: { gt: 0 },
        dueDate: { lt: new Date() },
        ...academicYearFilter,
        ...studentFilter,
        ...activeStudentFilter,
      },
      _sum: { balanceAmount: true },
    }),
    getCashRefundTotal(schoolId, studentIds, academicYear),
  ])

  const total = debits._sum.debit || 0
  const pending = debits._sum.balanceAmount || 0
  const collected = credits._sum.amount || 0
  const waived = waivers._sum.amount || 0

  return {
    total,
    collected,
    waived,
    pending,
    overdue: overdueDebits._sum.balanceAmount || 0,
    refunded,
  }
}

/**
 * Cash refunds paid back to families on transport/hostel discontinue. This flow
 * records the refund on TransportEvent/HostelEvent (refundMode='cash') rather
 * than as a REFUND ledger entry, so the summary endpoint's old REFUND-entry
 * query always read zero. We aggregate the event rows here instead.
 */
export async function getCashRefundTotal(
  schoolId: string,
  studentIds?: string[],
  academicYear?: string,
) {
  const where = {
    schoolId,
    eventType: 'WITHDRAWN',
    refundMode: 'cash',
    refundStatus: { in: ['pending', 'settled'] },
    ...(studentIds ? { studentId: { in: studentIds } } : {}),
    ...(academicYear ? { academicYear } : {}),
  }
  const [transport, hostel] = await Promise.all([
    db.transportEvent.aggregate({ where, _sum: { refundAmount: true } }),
    db.hostelEvent.aggregate({ where, _sum: { refundAmount: true } }),
  ])
  return (transport._sum.refundAmount || 0) + (hostel._sum.refundAmount || 0)
}

export async function hasFeeLedgerData(schoolId: string, studentIds?: string[]) {
  const count = await db.studentFeeLedgerEntry.count({
    where: {
      schoolId,
      deletedAt: null,
      ...(studentIds ? { studentId: { in: studentIds } } : {}),
    },
  })
  return count > 0
}
