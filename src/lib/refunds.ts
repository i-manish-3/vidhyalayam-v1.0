import { Prisma } from '@prisma/client'

type FeeTx = Prisma.TransactionClient

export class RefundValidationError extends Error {
  code:
    | 'WITHDRAWAL_NOT_FOUND'
    | 'WITHDRAWAL_REVERSED'
    | 'AMOUNT_INVALID'
    | 'AMOUNT_EXCEEDS_OUTSTANDING'
    | 'REFUND_NOT_FOUND'
    | 'REFUND_ALREADY_VOIDED'
    | 'CONCURRENT_REFUND'
  constructor(
    code: RefundValidationError['code'],
    message: string,
  ) {
    super(message)
    this.name = 'RefundValidationError'
    this.code = code
  }
}

function round2(n: number) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100
}

export interface RefundObligation {
  totalDue: number
  alreadyRefunded: number
  outstanding: number
}

// Returns the live refund obligation for a withdrawal. `alreadyRefunded`
// counts only active (non-voided, non-soft-deleted) refunds — voided ones
// have already been reversed by their counter-entry.
export async function computeOutstandingObligation(
  tx: FeeTx,
  withdrawalId: string,
): Promise<RefundObligation> {
  const withdrawal = await tx.studentWithdrawal.findUnique({
    where: { id: withdrawalId },
    select: { totalRefundDue: true },
  })
  if (!withdrawal) {
    throw new RefundValidationError(
      'WITHDRAWAL_NOT_FOUND',
      'Withdrawal record not found.',
    )
  }
  const totalDue = round2(withdrawal.totalRefundDue || 0)
  const agg = await tx.studentFeeRefund.aggregate({
    where: {
      withdrawalId,
      voidedAt: null,
      deletedAt: null,
    },
    _sum: { amount: true },
  })
  const alreadyRefunded = round2(agg._sum.amount || 0)
  const outstanding = round2(Math.max(0, totalDue - alreadyRefunded))
  return { totalDue, alreadyRefunded, outstanding }
}

// Sequential per-school receipt number with 'RFD-' prefix. Walks existing
// refund rows for the school, parses numeric suffix, returns max + 1. Runs
// inside the issuing transaction so the lock-protected Student row prevents
// two refunds from grabbing the same number.
export async function nextRefundReceiptNumber(
  tx: FeeTx,
  schoolId: string,
): Promise<string> {
  const existing = await tx.studentFeeRefund.findMany({
    where: { schoolId },
    select: { receiptNumber: true },
  })
  const maxNum = existing
    .map((r) => {
      const match = /^RFD-(\d+)$/.exec(r.receiptNumber)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => (n > m ? n : m), 0)
  return `RFD-${maxNum + 1}`
}

interface IssueRefundInput {
  tx: FeeTx
  schoolId: string
  studentId: string
  withdrawalId: string
  amount: number
  paymentMethod?: string
  notes?: string | null
  performedBy?: string | null
}

export interface IssueRefundResult {
  refund: Awaited<ReturnType<FeeTx['studentFeeRefund']['create']>>
  ledgerEntryId: string
  receiptNumber: string
}

// Issues a single refund payout against a withdrawal. Caller must already be
// inside a $transaction. We acquire a row lock on Student so concurrent
// refunds (or a concurrent withdrawal-reverse) serialize cleanly.
export async function issueRefund(
  input: IssueRefundInput,
): Promise<IssueRefundResult> {
  const {
    tx,
    schoolId,
    studentId,
    withdrawalId,
    amount,
    paymentMethod = 'cash',
    notes = null,
    performedBy = null,
  } = input

  // Lock the student row — same pattern as withdraw / transport flows so
  // refund issue, withdrawal reversal, and transport changes all serialize
  // through one mutex per student.
  await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${studentId} FOR UPDATE`

  const rounded = round2(amount)
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new RefundValidationError(
      'AMOUNT_INVALID',
      'Refund amount must be a positive number.',
    )
  }

  const withdrawal = await tx.studentWithdrawal.findFirst({
    where: { id: withdrawalId, studentId, schoolId },
    select: {
      id: true,
      academicYear: true,
      reversedAt: true,
      reason: true,
    },
  })
  if (!withdrawal) {
    throw new RefundValidationError(
      'WITHDRAWAL_NOT_FOUND',
      'Withdrawal record not found for this student.',
    )
  }
  if (withdrawal.reversedAt) {
    throw new RefundValidationError(
      'WITHDRAWAL_REVERSED',
      'This withdrawal has been reversed — refunds are no longer allowed against it.',
    )
  }

  const obligation = await computeOutstandingObligation(tx, withdrawalId)
  if (rounded > obligation.outstanding + 0.001) {
    throw new RefundValidationError(
      'AMOUNT_EXCEEDS_OUTSTANDING',
      `Refund amount ₹${rounded.toFixed(2)} exceeds outstanding obligation ₹${obligation.outstanding.toFixed(2)}.`,
    )
  }

  // Ledger row first so we can link it from the refund record. Refund payout
  // is recorded as a DEBIT against the student ledger — it cancels the
  // credit balance the student held after withdrawal cancelled future
  // debits while keeping their already-paid receipts.
  const ledgerEntry = await tx.studentFeeLedgerEntry.create({
    data: {
      schoolId,
      studentId,
      academicYear: withdrawal.academicYear,
      entryType: 'REFUND',
      sourceType: 'refund',
      sourceId: withdrawalId,
      debit: rounded,
      credit: 0,
      balanceAmount: 0,
      transactionDate: new Date(),
      paymentMethod,
      description: `Refund payout against withdrawal (${withdrawal.reason})`,
      notes: notes || null,
      status: 'settled',
      createdBy: performedBy || null,
    },
  })

  const receiptNumber = await nextRefundReceiptNumber(tx, schoolId)

  // Refunds are only issuable against StudentWithdrawal rows, which are
  // created by the TC-style student-withdraw flow. That flow cascades both
  // academic and transport cancellations, so every refund here is scoped
  // 'combined'. Transport-only withdrawals (the Phase 3 transport/withdraw
  // endpoint) don't create a StudentWithdrawal — they cancel future
  // transport debits directly and have no separate refund obligation
  // tracker today. If that ever changes, widen this scope inference.
  const scope = 'combined'

  const refund = await tx.studentFeeRefund.create({
    data: {
      schoolId,
      studentId,
      withdrawalId,
      scope,
      academicYear: withdrawal.academicYear,
      amount: rounded,
      paymentMethod,
      receiptNumber,
      issuedBy: performedBy || null,
      notes: notes || null,
      ledgerEntryId: ledgerEntry.id,
    },
  })

  return { refund, ledgerEntryId: ledgerEntry.id, receiptNumber }
}

interface VoidRefundInput {
  tx: FeeTx
  schoolId: string
  refundId: string
  reason: string
  performedBy?: string | null
}

// Voids a previously-issued refund. Writes a counter-CREDIT ledger row so
// the student's running balance returns to its pre-refund state, and stamps
// voidedAt / voidedBy / voidReason / voidLedgerEntryId on the refund.
export async function voidRefund(input: VoidRefundInput) {
  const { tx, schoolId, refundId, reason, performedBy = null } = input

  const existing = await tx.studentFeeRefund.findFirst({
    where: { id: refundId, schoolId, deletedAt: null },
    select: {
      id: true,
      studentId: true,
      academicYear: true,
      withdrawalId: true,
      amount: true,
      paymentMethod: true,
      receiptNumber: true,
      voidedAt: true,
    },
  })
  if (!existing) {
    throw new RefundValidationError(
      'REFUND_NOT_FOUND',
      'Refund record not found.',
    )
  }
  if (existing.voidedAt) {
    throw new RefundValidationError(
      'REFUND_ALREADY_VOIDED',
      'This refund has already been voided.',
    )
  }

  await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${existing.studentId} FOR UPDATE`

  const counterEntry = await tx.studentFeeLedgerEntry.create({
    data: {
      schoolId,
      studentId: existing.studentId,
      academicYear: existing.academicYear,
      entryType: 'REFUND',
      sourceType: 'refund',
      sourceId: existing.withdrawalId,
      debit: 0,
      credit: round2(existing.amount),
      balanceAmount: 0,
      transactionDate: new Date(),
      paymentMethod: existing.paymentMethod,
      description: `Void of refund ${existing.receiptNumber}`,
      notes: reason,
      status: 'settled',
      createdBy: performedBy || null,
    },
  })

  return tx.studentFeeRefund.update({
    where: { id: refundId },
    data: {
      voidedAt: new Date(),
      voidedBy: performedBy || null,
      voidReason: reason,
      voidLedgerEntryId: counterEntry.id,
    },
  })
}
