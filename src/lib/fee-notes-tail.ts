// Structured audit payloads are stashed as JSON tails on a fee ledger entry's
// `notes` column using distinct delimiters so the human-readable part of notes
// stays intact. Encoding order is fixed: `<base> ||SLIP=... ||SPLITS=...` so the
// decoder can strip them right-to-left without ambiguity. Older rows simply have
// no tail and parse with all fields null.
//
// Extracted from the fee-collections route so both the collection (encode) and
// the parent receipt renderer (decode) can share one source of truth.

export const SLIP_DELIMITER = '||SLIP='
export const SPLITS_DELIMITER = '||SPLITS='

function roundMoney(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export interface RecordedPaymentSplit {
  paymentMethod: string
  amount: number
  transactionRef?: string | null
  remarks?: string | null
}

// Snapshot of one slip line at collection time — what was billed, paid, and left
// due on this specific receipt. Persisting this lets the history / receipt view
// reproduce the exact slip the cashier saw, including ticked items that received
// zero allocation because the payment didn't cover them.
export interface PersistedSlipLine {
  feeHeadName: string
  installmentName: string | null
  academicYear: string | null
  isTransport: boolean
  dueDate: string | null // ISO string; used to flag overdue term heads
  paid: number
  due: number
}

export function encodeNotesTail(
  baseNotes: string | null | undefined,
  slipLines: PersistedSlipLine[] | null | undefined,
  splits: RecordedPaymentSplit[] | null | undefined,
): string | null {
  let s = (baseNotes || '').trim()
  if (slipLines && slipLines.length > 0) {
    s = `${s}${s ? ' ' : ''}${SLIP_DELIMITER}${JSON.stringify(slipLines)}`
  }
  if (splits && splits.length > 0) {
    s = `${s}${s ? ' ' : ''}${SPLITS_DELIMITER}${JSON.stringify(splits)}`
  }
  return s || null
}

export function decodeNotesTail(value: string | null | undefined): {
  notes: string | null
  splits: RecordedPaymentSplit[] | null
  slipLines: PersistedSlipLine[] | null
} {
  if (!value) return { notes: null, splits: null, slipLines: null }
  let remaining = value

  // Right-to-left: splits was appended last, so peel it off first.
  let splits: RecordedPaymentSplit[] | null = null
  const splitsIdx = remaining.lastIndexOf(SPLITS_DELIMITER)
  if (splitsIdx !== -1) {
    const tail = remaining.slice(splitsIdx + SPLITS_DELIMITER.length).trim()
    try {
      const parsed = JSON.parse(tail)
      if (Array.isArray(parsed)) {
        splits = parsed
          .filter(
            (s) =>
              s && typeof s === 'object' && typeof s.paymentMethod === 'string' && Number.isFinite(Number(s.amount)),
          )
          .map((s) => ({
            paymentMethod: String(s.paymentMethod),
            amount: roundMoney(Number(s.amount)),
            transactionRef: s.transactionRef ? String(s.transactionRef) : null,
            remarks: s.remarks ? String(s.remarks) : null,
          }))
      }
    } catch {
      splits = null
    }
    remaining = remaining.slice(0, splitsIdx).trim()
  }

  let slipLines: PersistedSlipLine[] | null = null
  const slipIdx = remaining.lastIndexOf(SLIP_DELIMITER)
  if (slipIdx !== -1) {
    const tail = remaining.slice(slipIdx + SLIP_DELIMITER.length).trim()
    try {
      const parsed = JSON.parse(tail)
      if (Array.isArray(parsed)) {
        slipLines = parsed
          .filter((l) => l && typeof l === 'object' && typeof l.feeHeadName === 'string')
          .map((l) => ({
            feeHeadName: String(l.feeHeadName),
            installmentName: l.installmentName ? String(l.installmentName) : null,
            academicYear: l.academicYear ? String(l.academicYear) : null,
            isTransport: !!l.isTransport,
            dueDate: l.dueDate ? String(l.dueDate) : null,
            paid: roundMoney(Number(l.paid) || 0),
            due: roundMoney(Number(l.due) || 0),
          }))
      }
    } catch {
      slipLines = null
    }
    remaining = remaining.slice(0, slipIdx).trim()
  }

  return { notes: remaining || null, splits, slipLines }
}
