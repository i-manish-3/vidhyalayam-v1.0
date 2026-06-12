// Server-side renderers that turn DB rows into a complete, printable slip HTML
// document, reusing the shared `buildSlipHtml` engine. Used by the parent portal
// (and the public /d/[token] demand-slip page) so slip/receipt layout lives in
// exactly one place.
//
// `buildSlipHtml` already returns a full <!doctype html> document; these helpers
// only add a floating "Print" bar so the standalone page is actionable.

import { db } from '@/lib/db'
import type { SchoolForPrintHeader } from '@/lib/print-header'
import {
  buildSlipHtml,
  buildSlipLines,
  sortPeriods,
  type SlipInputLine,
  type SlipStudent,
  type PaymentMethod,
} from '@/lib/fee-slip-template'
import { decodeNotesTail } from '@/lib/fee-notes-tail'

function roundMoney(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

// Inject a fixed, no-print "Print / Save PDF" bar before </body>. Falls back to
// appending if the document has no closing body tag.
export function injectPrintButton(fullHtml: string): string {
  const bar = `
<div class="slip-print-bar" style="position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:center;padding:12px;background:#fff;border-top:1px solid #e5e7eb;box-shadow:0 -2px 8px rgba(0,0,0,.06);z-index:9999">
  <button onclick="window.print()" style="background:#111827;color:#fff;border:0;border-radius:8px;padding:10px 22px;font:600 14px system-ui,sans-serif;cursor:pointer">Print / Save PDF</button>
</div>
<style>@media print{.slip-print-bar{display:none!important}}@media screen{body{padding-bottom:76px}}</style>`
  if (fullHtml.includes('</body>')) return fullHtml.replace('</body>', `${bar}</body>`)
  return `${fullHtml}${bar}`
}

// ── Demand slip ────────────────────────────────────────────────────────────

interface DemandParentLink {
  parent: { fatherName: string | null; motherName: string | null; phone: string | null } | null
}

interface DemandSlipLine {
  feeHeadName: string | null
  installmentName: string | null
  totalAmount: number
  dueDate: Date | null
  assignmentItem: { assignment: { academicYear: string | null } | null } | null
}

export interface DemandSlipInvoice {
  schoolId: string
  studentId: string
  invoiceNumber: string
  invoiceDate: Date | null
  dueDate: Date | null
  billingMonth: number | null
  billingYear: number | null
  subtotal: number
  previousBalance: number
  totalAmount: number
  paidAmount: number
  notes: string | null
  school: SchoolForPrintHeader | null
  student: SlipStudent & { parentLinks?: DemandParentLink[] | null }
  lines: DemandSlipLine[]
}

/**
 * Build a monthly demand slip as a full HTML document (NO print bar). Ports the
 * mapping previously inline in `src/app/d/[token]/page.tsx` so both the public
 * link page and the parent portal stay byte-identical.
 *
 * Computes "previous dues" (unpaid debits before the slip month) itself, so the
 * caller only needs to load the invoice + its lines + student + school.
 */
export async function buildDemandSlipDoc(
  slip: DemandSlipInvoice,
  opts?: { mode?: 'single' | 'parent' },
): Promise<string> {
  const month = slip.billingMonth
  const year = slip.billingYear

  let previousDues: Array<{
    feeHeadName: string
    installmentName: string | null
    academicYear: string | null
    isTransport: boolean
    dueDate: string | null
    balanceAmount: number
  }> = []

  if (month && year) {
    const firstOfSlipMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
    const debits = await db.studentFeeLedgerEntry.findMany({
      where: {
        schoolId: slip.schoolId,
        studentId: slip.studentId,
        entryType: 'DEBIT',
        deletedAt: null,
        status: { not: 'cancelled' },
        transactionDate: { lt: firstOfSlipMonth },
        balanceAmount: { gt: 0 },
      },
      select: {
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
      feeHeadName: d.feeHeadName || 'Fee',
      installmentName: d.installmentName,
      academicYear: d.academicYear,
      isTransport: d.sourceType === 'transport' || (d.feeHeadName || '').toLowerCase().includes('transport'),
      dueDate: d.dueDate ? d.dueDate.toISOString() : null,
      balanceAmount: d.balanceAmount,
    }))
  }

  const invoiceDate = slip.invoiceDate || new Date()
  const currentAY =
    slip.lines.find((l) => l.assignmentItem?.assignment?.academicYear)?.assignmentItem?.assignment?.academicYear || ''

  const inputs: SlipInputLine[] = [
    ...slip.lines.map((line) => ({
      feeHeadName: line.feeHeadName || 'Fee',
      installmentName: line.installmentName || null,
      academicYear: line.assignmentItem?.assignment?.academicYear || null,
      isTransport: (line.feeHeadName || '').toLowerCase().includes('transport'),
      dueDate: line.dueDate ? line.dueDate.toISOString() : null,
      paid: 0,
      discount: 0,
      due: line.totalAmount,
    })),
    ...previousDues.map((prev) => ({
      feeHeadName: prev.feeHeadName,
      installmentName: prev.installmentName,
      academicYear: prev.academicYear,
      isTransport: prev.isTransport,
      dueDate: prev.dueDate,
      paid: 0,
      discount: 0,
      due: prev.balanceAmount,
    })),
  ]
  const bucketed = buildSlipLines(inputs, currentAY, invoiceDate)

  const feeMonths = sortPeriods(
    Array.from(new Set(slip.lines.map((l) => l.installmentName).filter((s): s is string => !!s))),
  )

  const father = slip.student.parentLinks?.find((p) => p.parent?.fatherName)?.parent || null
  const mother = slip.student.parentLinks?.find((p) => p.parent?.motherName)?.parent || null

  const html = buildSlipHtml({
    variant: 'demand',
    mode: opts?.mode || 'single',
    school: slip.school,
    student: slip.student,
    fatherName: father?.fatherName || null,
    phone: father?.phone || mother?.phone || null,
    academicYear: currentAY || `${year ?? ''}`,
    feeMonths,
    slipNumber: slip.invoiceNumber,
    slipDate: invoiceDate,
    lines: bucketed,
    subtotal: slip.subtotal,
    previousBalance: slip.previousBalance,
    totalDemanded: slip.totalAmount,
    paidSoFar: slip.paidAmount,
    amountDue: (slip.totalAmount || 0) - (slip.paidAmount || 0),
    dueDate: slip.dueDate ?? null,
    notes: slip.notes,
  })

  return html
}

/** Demand slip as a standalone printable page (with a "Print / Save PDF" bar). */
export async function renderDemandSlipHtml(
  slip: DemandSlipInvoice,
  opts?: { mode?: 'single' | 'parent' },
): Promise<string> {
  return injectPrintButton(await buildDemandSlipDoc(slip, opts))
}

// ── Receipt ──────────────────────────────────────────────────────────────

interface ReceiptDebitAllocation {
  amount: number
  creditEntryId: string | null
  allocatedAt: Date | null
  createdAt: Date
  creditEntry: { id: string; transactionDate: Date; createdAt: Date } | null
}

interface ReceiptCreditAllocation {
  amount: number
  createdAt: Date
  debitEntry: {
    feeHeadName: string | null
    installmentName: string | null
    academicYear: string | null
    dueDate: Date | null
    balanceAmount: number
    feeCollection: {
      feeHeadName: string | null
      installmentName: string | null
      dueDate: Date | null
      discount: number
      concession: number
      scholarship: number
    } | null
    debitAllocations: ReceiptDebitAllocation[]
  }
}

export interface ReceiptCredit {
  id: string
  receiptNumber: string | null
  credit: number
  paymentMethod: string | null
  transactionDate: Date
  notes: string | null
  creditAllocations: ReceiptCreditAllocation[]
}

export interface ReceiptRenderContext {
  school: SchoolForPrintHeader | null
  student: SlipStudent
  fatherName: string | null
  phone: string | null
  academicYear: string
  collectedByName: string | null
  mode?: 'single' | 'parent'
}

/**
 * Render a payment receipt to a full printable HTML document, reconstructed from
 * a CREDIT ledger entry. Ports the `receiptHistory` reconstruction from the
 * collections route + the `openHistoryReceipt` mapping from the collections page,
 * preferring the persisted slip snapshot when present.
 */
export function renderReceiptHtmlFromCredit(credit: ReceiptCredit, ctx: ReceiptRenderContext): string {
  let discount = 0
  let dues = 0
  const derivedLines: Array<{
    feeHeadName: string
    installmentName: string | null
    academicYear: string | null
    isTransport: boolean
    dueDate: Date | null
    paidInReceipt: number
    balanceAfter: number
  }> = []

  for (const allocation of credit.creditAllocations) {
    const debit = allocation.debitEntry
    const headName = (debit.feeHeadName || debit.feeCollection?.feeHeadName || '').toLowerCase()
    discount +=
      (debit.feeCollection?.discount || 0) +
      (debit.feeCollection?.concession || 0) +
      (debit.feeCollection?.scholarship || 0)

    const laterAllocated = debit.debitAllocations
      .filter((other) => {
        if (other.creditEntryId === credit.id) return false
        const otherTime = other.creditEntry?.transactionDate || other.allocatedAt || other.createdAt
        const currentTime = credit.transactionDate
        if (otherTime.getTime() !== currentTime.getTime()) return otherTime > currentTime
        return other.createdAt > allocation.createdAt
      })
      .reduce((sum, other) => sum + other.amount, 0)

    const balanceAfter = roundMoney(debit.balanceAmount + laterAllocated)
    dues += debit.balanceAmount + laterAllocated

    derivedLines.push({
      feeHeadName: debit.feeHeadName || debit.feeCollection?.feeHeadName || 'Fee',
      installmentName: debit.installmentName || debit.feeCollection?.installmentName || null,
      academicYear: debit.academicYear || null,
      isTransport: headName.includes('transport'),
      dueDate: debit.dueDate || debit.feeCollection?.dueDate || null,
      paidInReceipt: roundMoney(allocation.amount),
      balanceAfter,
    })
  }

  const { notes: cleanNotes, splits, slipLines: persisted } = decodeNotesTail(credit.notes)

  // Prefer the cashier's persisted snapshot; fall back to allocation-derived
  // lines for receipts written before the snapshot tail existed.
  const usePersisted = persisted && persisted.length > 0
  const finalLines = usePersisted
    ? persisted!.map((l) => ({
        feeHeadName: l.feeHeadName,
        installmentName: l.installmentName,
        academicYear: l.academicYear,
        isTransport: l.isTransport,
        dueDate: l.dueDate ? new Date(l.dueDate) : null,
        paidInReceipt: l.paid,
        balanceAfter: l.due,
      }))
    : derivedLines
  const finalDues = usePersisted
    ? roundMoney(persisted!.reduce((sum, l) => sum + (l.due || 0), 0))
    : roundMoney(dues)

  const receiptDate = credit.transactionDate
  const slipInputs: SlipInputLine[] = finalLines.map((line) => ({
    feeHeadName: line.feeHeadName,
    installmentName: line.installmentName,
    academicYear: line.academicYear,
    isTransport: line.isTransport,
    dueDate: line.dueDate ? line.dueDate.toISOString() : null,
    paid: line.paidInReceipt,
    discount: 0,
    due: line.balanceAfter,
  }))

  const bucketed = buildSlipLines(slipInputs, ctx.academicYear, receiptDate)
  const feeMonths = sortPeriods(
    Array.from(new Set(finalLines.map((l) => l.installmentName).filter((p): p is string => !!p))),
  )

  const html = buildSlipHtml({
    variant: 'receipt',
    mode: ctx.mode || 'single',
    school: ctx.school,
    student: ctx.student,
    fatherName: ctx.fatherName,
    phone: ctx.phone,
    academicYear: ctx.academicYear,
    feeMonths: feeMonths.length > 0 ? feeMonths : ['-'],
    slipNumber: credit.receiptNumber || 'Receipt',
    slipDate: receiptDate,
    lines: bucketed,
    paymentMethod: (credit.paymentMethod || 'CASH') as PaymentMethod,
    splits: splits ?? null,
    collectedByName: ctx.collectedByName,
    totalPaid: credit.credit,
    discountAmount: roundMoney(discount),
    duesAmount: finalDues,
    notes: cleanNotes,
  })

  return injectPrintButton(html)
}
