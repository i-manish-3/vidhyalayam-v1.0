import { db } from '@/lib/db'

export async function getFeeLedgerSummary(schoolId: string, studentIds?: string[], academicYear?: string) {
  const academicYearFilter = academicYear ? { academicYear } : {}
  const billingEntryTypes = ['DEBIT', 'FINE']

  const [debits, credits, overdueDebits] = await Promise.all([
    db.studentFeeLedgerEntry.aggregate({
      where: {
        schoolId,
        entryType: { in: billingEntryTypes },
        deletedAt: null,
        status: { not: 'cancelled' },
        ...academicYearFilter,
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
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
          ...academicYearFilter,
        },
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
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
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
      },
      _sum: { balanceAmount: true },
    }),
  ])

  const total = debits._sum.debit || 0
  const pending = debits._sum.balanceAmount || 0
  const collected = credits._sum.amount || Math.max(0, total - pending)

  return {
    total,
    collected,
    pending,
    overdue: overdueDebits._sum.balanceAmount || 0,
  }
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
