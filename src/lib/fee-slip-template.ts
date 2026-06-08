// Shared template for the printable fee slip — used by both the post-
// collection receipt (variant: 'receipt') and the monthly demand slip
// (variant: 'demand'). Same HTML/CSS scaffold, same line-bucketing engine,
// same school header. Only the title row, totals block, and payment-info
// block differ between variants.
//
// All inputs are pure data — no React, no closures — so the template can be
// invoked from server components, API responses, and client print windows
// alike. Callers shape their own row-level inputs into SlipInputLine[] and
// hand them to buildSlipLines() to get the bucketed view rendered here.

import { buildPrintHeaderHtml, type SchoolForPrintHeader } from '@/lib/print-header'

// ── Constants ────────────────────────────────────────────────────────────

export const SLIP_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

export type PaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI' | 'SPLIT'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  ONLINE: 'Online',
  CHEQUE: 'Cheque',
  UPI: 'UPI',
  SPLIT: 'Split',
}

// ── Formatters ───────────────────────────────────────────────────────────

export function receiptPlainAmount(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

export function receiptMoney(value: number | string | null | undefined): string {
  return `₹ ${receiptPlainAmount(value)}`
}

export function formatReceiptDate(value: Date): string {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatReceiptTime(value: Date): string {
  return value.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Period helpers ───────────────────────────────────────────────────────

export function normalizedPeriod(period: string): string {
  return period.trim().toLowerCase()
}

export function isMonthPeriod(period: string): boolean {
  return SLIP_MONTHS.some((month) => normalizedPeriod(month) === normalizedPeriod(period))
}

export function periodSortIndex(period: string): number {
  const index = SLIP_MONTHS.findIndex((month) => normalizedPeriod(month) === normalizedPeriod(period))
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

export function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    const indexCompare = periodSortIndex(a) - periodSortIndex(b)
    return indexCompare || a.localeCompare(b)
  })
}

// Resolve an installment label like "Jul" + an academic year like "2025-26"
// to the calendar year+month it represents (year=2025, month=6 for Jul). Used
// to bucket lines into prev/current/future months.
export function slipLineYearMonth(
  installmentName: string | null | undefined,
  academicYear: string | null | undefined,
): { year: number; month: number } | null {
  if (!installmentName || !academicYear) return null
  const monthIdx = SLIP_MONTHS.findIndex((m) => normalizedPeriod(m) === normalizedPeriod(installmentName))
  if (monthIdx === -1) return null
  const [start] = academicYear.split('-').map((n) => Number(n))
  if (Number.isNaN(start)) return null
  const calendarMonth = monthIdx <= 8 ? monthIdx + 3 : monthIdx - 9
  const calendarYear = monthIdx <= 8 ? start : start + 1
  return { year: calendarYear, month: calendarMonth }
}

// ── Number-to-words (Indian crore/lakh) ──────────────────────────────────

export function numberToWords(value: number): string {
  const amount = Math.round(Number(value || 0))
  if (amount === 0) return 'Zero Rupees only'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const underHundred = (num: number) => {
    if (num < 20) return ones[num]
    return [tens[Math.floor(num / 10)], ones[num % 10]].filter(Boolean).join(' ')
  }

  const underThousand = (num: number) => {
    const hundred = Math.floor(num / 100)
    const rest = num % 100
    return [
      hundred ? `${ones[hundred]} Hundred` : '',
      rest ? underHundred(rest) : '',
    ].filter(Boolean).join(' ')
  }

  const parts = [
    { value: Math.floor(amount / 10000000), label: 'Crore' },
    { value: Math.floor((amount % 10000000) / 100000), label: 'Lakh' },
    { value: Math.floor((amount % 100000) / 1000), label: 'Thousand' },
    { value: amount % 1000, label: '' },
  ]

  return `${parts
    .filter((part) => part.value > 0)
    .map((part) => `${underThousand(part.value)} ${part.label}`.trim())
    .join(' ')} Rupees only`
}

// ── Slip-line bucketing ──────────────────────────────────────────────────

export type SlipInputLine = {
  feeHeadName: string
  installmentName: string | null
  academicYear: string | null
  isTransport: boolean
  dueDate: string | null   // ISO string; used to mark term heads as overdue
  paid: number
  discount: number
  due: number
}

export type SlipBucketedLine = {
  label: string
  months: string[]
  paid: number
  discount: number
  due: number
}

// Buckets per-row inputs into the same Current / Previous Month / Previous /
// Future / Previous Session groups the receipt has always shown. Same engine
// used for: live collection slip, history-view receipt, and now demand slip.
// `asOfDate` decides what "previous" means — pass the receipt date for a
// receipt, the slip's invoice date for a demand slip.
export function buildSlipLines(
  inputs: SlipInputLine[],
  currentAcademicYear: string,
  asOfDate: Date,
): SlipBucketedLine[] {
  type Bucket = 'prev_session' | 'prev_month' | 'overdue_term' | 'current_month' | 'future_month' | 'term'
  const bucketOrder: Record<Bucket, number> = {
    prev_session: 0,
    prev_month: 1,
    overdue_term: 2,
    current_month: 3,
    term: 4,
    future_month: 5,
  }
  const bucketLabel: Record<Bucket, string> = {
    prev_session: 'Previous Session Dues',
    prev_month: 'Previous Month Dues',
    overdue_term: 'Previous Dues',
    current_month: '',
    future_month: 'Advance',
    term: '',
  }
  const asOfYear = asOfDate.getFullYear()
  const asOfMonth = asOfDate.getMonth()
  const asOfStart = new Date(asOfYear, asOfMonth, asOfDate.getDate())
  const isTermOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    const due = new Date(dueDate)
    if (Number.isNaN(due.getTime())) return false
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate())
    return dueStart.getTime() < asOfStart.getTime()
  }
  const classify = (input: SlipInputLine): Bucket => {
    const ay = (input.academicYear || '').trim()
    if (ay && ay < currentAcademicYear) return 'prev_session'
    const isMonthly = isMonthPeriod(input.installmentName || '')
    if (!isMonthly && !input.isTransport) {
      return isTermOverdue(input.dueDate) ? 'overdue_term' : 'term'
    }
    const ym = slipLineYearMonth(input.installmentName, input.academicYear)
    if (!ym) return 'current_month'
    if (ym.year < asOfYear) return 'prev_month'
    if (ym.year > asOfYear) return 'future_month'
    if (ym.month < asOfMonth) return 'prev_month'
    if (ym.month > asOfMonth) return 'future_month'
    return 'current_month'
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const groups = new Map<string, {
    bucket: Bucket
    feeHeadName: string
    academicYear: string
    isTransport: boolean
    months: Set<string>
    paid: number
    discount: number
    due: number
  }>()
  for (const input of inputs) {
    const head = (input.feeHeadName || 'Fee').trim() || 'Fee'
    const ay = (input.academicYear || '').trim()
    const bucket = classify(input)
    const key = `${bucket}|${head}|${input.isTransport ? 't' : 'f'}|${bucket === 'prev_session' ? ay : ''}`
    const existing = groups.get(key) || {
      bucket,
      feeHeadName: head,
      academicYear: ay,
      isTransport: input.isTransport,
      months: new Set<string>(),
      paid: 0,
      discount: 0,
      due: 0,
    }
    if (input.installmentName) existing.months.add(input.installmentName)
    existing.paid += input.paid
    existing.discount += input.discount
    existing.due += input.due
    groups.set(key, existing)
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      const bucketCompare = bucketOrder[a.bucket] - bucketOrder[b.bucket]
      if (bucketCompare !== 0) return bucketCompare
      if (a.bucket === 'prev_session' && a.academicYear !== b.academicYear) {
        return b.academicYear.localeCompare(a.academicYear)
      }
      // Within each bucket: Transport/Hostel first, then Tuition, then others
      const aService = a.isTransport || /hostel/i.test(a.feeHeadName)
      const bService = b.isTransport || /hostel/i.test(b.feeHeadName)
      if (aService !== bService) return aService ? -1 : 1
      const aTuition = /tuition/i.test(a.feeHeadName)
      const bTuition = /tuition/i.test(b.feeHeadName)
      if (aTuition !== bTuition) return aTuition ? -1 : 1
      return a.feeHeadName.localeCompare(b.feeHeadName)
    })
    .map((group) => {
      const months = sortPeriods(Array.from(group.months))
      const periodList = months.length > 0 ? months.join(', ') : ''
      const prefix = bucketLabel[group.bucket]

      // Only show "Previous Dues" labels for Transport, Hostel, and Tuition fees
      const isTuition = /tuition/i.test(group.feeHeadName)
      const isHostel = /hostel/i.test(group.feeHeadName)
      const shouldShowPreviousLabel = group.isTransport || isHostel || isTuition

      let label: string
      if (!prefix) {
        // No prefix for current_month and term buckets
        label = periodList ? `${group.feeHeadName} (${periodList})` : group.feeHeadName
      } else if (group.bucket === 'overdue_term') {
        // Never show "Previous Dues" prefix for term fees, even if overdue
        label = periodList ? `${group.feeHeadName} (${periodList})` : group.feeHeadName
      } else if (!shouldShowPreviousLabel && group.bucket === 'prev_month') {
        // For non-transport/non-tuition fees in prev_month, show without prefix
        label = periodList ? `${group.feeHeadName} (${periodList})` : group.feeHeadName
      } else {
        // Show the "Previous Session Dues" prefix + session year for EVERY head
        // carried from a past session (Admission, Annual, Exam Qn included), and
        // for transport/tuition in the prev_month bucket. This makes it explicit
        // on the slip which session a carried-forward due belongs to.
        const monthPart = periodList ? ` (${periodList})` : ''
        const yearPart =
          group.bucket === 'prev_session' && group.academicYear ? ` — ${group.academicYear}` : ''
        label = `${prefix} — ${group.feeHeadName}${monthPart}${yearPart}`
      }
      return {
        label,
        months,
        paid: round2(group.paid),
        discount: round2(group.discount),
        due: round2(group.due),
      }
    })
}

// ── HTML template ────────────────────────────────────────────────────────

export type SlipReceiptSplit = {
  paymentMethod: string
  amount: number
  transactionRef?: string | null
  remarks?: string | null
}

export type SlipStudent = {
  firstName: string
  lastName: string
  fullName?: string | null
  rollNumber?: string | null
  admissionNumber?: string | null
  class?: { name: string } | null
  section?: { name: string } | null
}

export type SlipHtmlInput = {
  variant: 'receipt' | 'demand'
  // 'single' = no copy band; 'office'/'parent' = labelled copy band; 'both' =
  // two stacked slips (office then parent), each with its own page break.
  mode?: 'single' | 'office' | 'parent' | 'both'
  school: SchoolForPrintHeader | null
  student: SlipStudent
  fatherName: string | null
  phone: string | null
  academicYear: string
  // Header strip below the title — month-only periods touched by this slip.
  // Non-month installments (Term/Admission/etc.) are filtered out for the
  // header label but still appear as line rows.
  feeMonths: string[]
  slipNumber: string
  slipDate: Date
  // Bucketed lines as produced by buildSlipLines(). The renderer doesn't
  // re-bucket — callers decide what data feeds the bucketing.
  lines: SlipBucketedLine[]

  // ── receipt-only ─────────────────────────────────────────
  paymentMethod?: PaymentMethod
  splits?: SlipReceiptSplit[] | null
  collectedByName?: string | null
  totalPaid?: number
  discountAmount?: number
  duesAmount?: number

  // ── demand-only ──────────────────────────────────────────
  subtotal?: number          // this month's items sum (post-bucket)
  previousBalance?: number   // sum of prior unpaid debits
  totalDemanded?: number     // subtotal + previousBalance
  paidSoFar?: number         // typically 0; non-zero on partial-paid demand slips
  amountDue?: number         // totalDemanded - paidSoFar
  dueDate?: Date | null      // shown in the meta row
  notes?: string | null
}

function renderLinesHtml(lines: SlipBucketedLine[], variant: 'receipt' | 'demand'): string {
  return lines
    .map((line) => {
      const total = line.paid + line.discount + line.due
      const periodCount = line.months.length
      const rate = periodCount > 0 ? total / periodCount : total
      const rateRounded = Math.round((rate + Number.EPSILON) * 100) / 100
      const amountCell =
        rateRounded > 0
          ? periodCount > 1
            ? `${receiptMoney(rateRounded)} × ${periodCount} = ${receiptMoney(total)}`
            : receiptMoney(rateRounded)
          : '-'

      // For demand slips: show Description | Rate×Count | Amount
      // For receipts: show Description | Amount (with rate×count=total) | Paid | Due
      if (variant === 'demand') {
        return `
      <tr>
        <td>${escapeHtml(line.label)}</td>
        <td class="amt">${amountCell}</td>
        <td class="amt">${receiptMoney(total)}</td>
      </tr>`
      } else {
        return `
      <tr>
        <td>${escapeHtml(line.label)}</td>
        <td class="amt">${amountCell}</td>
        <td class="amt">${line.paid > 0 ? receiptMoney(line.paid) : '-'}</td>
        <td class="amt">${line.due > 0 ? receiptMoney(line.due) : '-'}</td>
      </tr>`
      }
    })
    .join('')
}

export function buildSlipHtml(input: SlipHtmlInput): string {
  const mode = input.mode || 'single'
  const isReceipt = input.variant === 'receipt'

  const headerHtml = buildPrintHeaderHtml(input.school, { fallbackToAutoHeader: true })

  const sName =
    (input.student.fullName && input.student.fullName.trim()) ||
    `${input.student.firstName} ${input.student.lastName}`.trim()
  const admNo = input.student.admissionNumber || '-'
  const classLabel =
    [input.student.class?.name, input.student.section?.name].filter(Boolean).join(' / ') || '-'
  const rollNo = input.student.rollNumber || '-'
  const fatherName = input.fatherName || '-'
  const phone = input.phone || '-'

  const feeMonthLabel = input.feeMonths.filter(isMonthPeriod).join(', ') || '-'
  const dateStr = formatReceiptDate(input.slipDate)
  const timeStr = formatReceiptTime(input.slipDate)
  const slipNo = input.slipNumber.replace(/^RCP-/, '')

  const linesHtml = renderLinesHtml(input.lines, input.variant)

  // Subtotal row sums the on-slip rows. For receipts this is paid+discount+due; for
  // demand slips this is the total before discount is applied.
  const subtotalNum =
    Math.round((input.lines.reduce((sum, l) => sum + l.paid + l.discount + l.due, 0) + Number.EPSILON) * 100) / 100
  // Use discountAmount from input if provided, otherwise calculate from lines
  const totalDiscount = input.discountAmount !== undefined
    ? Math.round((input.discountAmount + Number.EPSILON) * 100) / 100
    : Math.round((input.lines.reduce((sum, l) => sum + l.discount, 0) + Number.EPSILON) * 100) / 100

  // ── totals block (variant-specific) ─────────────────────────
  const totalsHtml = isReceipt
    ? `
        <div class="totals">
          <table>
            <tr><td class="lbl">Sub Total</td><td class="amt">${receiptMoney(subtotalNum)}</td></tr>
            ${totalDiscount > 0 ? `<tr><td class="lbl">Discount</td><td class="amt">- ${receiptMoney(totalDiscount)}</td></tr>` : ''}
            <tr class="grand"><td class="lbl">TOTAL PAID</td><td class="amt">${receiptMoney(input.totalPaid || 0)}</td></tr>
            <tr class="due-row"><td class="lbl">BALANCE DUE</td><td class="amt">${receiptMoney(input.duesAmount || 0)}</td></tr>
          </table>
        </div>`
    : `
        <div class="totals">
          <table>
            <tr><td class="lbl">Sub Total</td><td class="amt">${receiptMoney(subtotalNum)}</td></tr>
            ${totalDiscount > 0 ? `<tr><td class="lbl">Discount</td><td class="amt">- ${receiptMoney(totalDiscount)}</td></tr>` : ''}
            <tr class="grand"><td class="lbl">TOTAL DEMANDED</td><td class="amt">${receiptMoney(input.totalDemanded || 0)}</td></tr>
            ${(input.paidSoFar || 0) > 0 ? `<tr><td class="lbl">Paid So Far</td><td class="amt">${receiptMoney(input.paidSoFar || 0)}</td></tr>` : ''}
            <tr class="due-row"><td class="lbl">AMOUNT DUE</td><td class="amt">${receiptMoney(input.amountDue || 0)}</td></tr>
          </table>
        </div>`

  // ── payment-info / notes block (variant-specific) ───────────
  let extraBlockHtml = ''
  if (isReceipt) {
    const splits =
      input.splits && input.splits.length > 1 ? input.splits : null
    const modeLabel = splits
      ? splits
          .map(
            (s) =>
              `${PAYMENT_METHOD_LABELS[s.paymentMethod as PaymentMethod] || s.paymentMethod} ${receiptMoney(s.amount)}`,
          )
          .join(' + ')
      : input.paymentMethod
        ? PAYMENT_METHOD_LABELS[input.paymentMethod] || input.paymentMethod
        : '-'
    const collectedByName = input.collectedByName || ''
    const wordsStr = numberToWords(input.totalPaid || 0)
    extraBlockHtml = `
        <div class="payment-info">
          <div><span class="lbl">Mode:</span> <strong>${escapeHtml(modeLabel)}</strong></div>
          ${collectedByName ? `<div><span class="lbl">Collected By:</span> <strong>${escapeHtml(collectedByName)}</strong></div>` : ''}
          <div><span class="lbl">Amount in words:</span> <strong>${escapeHtml(wordsStr)}</strong></div>
        </div>`
  } else if (input.notes) {
    extraBlockHtml = `
        <div class="payment-info">
          <div><span class="lbl">Notes:</span> <strong>${escapeHtml(input.notes)}</strong></div>
        </div>`
  }

  // ── meta row (variant-specific) ─────────────────────────────
  const dueDateStr = input.dueDate ? formatReceiptDate(input.dueDate) : '-'
  const metaHtml = isReceipt
    ? `
        <div class="meta">
          <div><span class="lbl">Receipt #:</span><span class="val">${escapeHtml(slipNo)}</span></div>
          <div><span class="lbl">Date:</span><span class="val">${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</span></div>
          <div><span class="lbl">Session:</span><span class="val">${escapeHtml(input.academicYear)}</span></div>
          <div><span class="lbl">Fee Month:</span><span class="val">${escapeHtml(feeMonthLabel)}</span></div>
        </div>`
    : `
        <div class="meta">
          <div><span class="lbl">Slip #:</span><span class="val">${escapeHtml(slipNo)}</span></div>
          <div><span class="lbl">Issued:</span><span class="val">${escapeHtml(dateStr)}</span></div>
          <div><span class="lbl">Due by:</span><span class="val">${escapeHtml(dueDateStr)}</span></div>
          <div><span class="lbl">Session:</span><span class="val">${escapeHtml(input.academicYear)}</span></div>
          <div><span class="lbl">Fee Month:</span><span class="val">${escapeHtml(feeMonthLabel)}</span></div>
        </div>`

  const titleText = isReceipt ? 'Fee Receipt' : 'Fee Demand Slip'
  const footerStamp = isReceipt
    ? 'This is a computer-generated receipt.'
    : 'This is a computer-generated demand slip.'

  const renderCopy = (label: string | null) => `
      <div class="slip-root">
        ${headerHtml ? `<div class="slip-header">${headerHtml}</div>` : ''}
        ${label ? `<div class="copy-label">${escapeHtml(label)}</div>` : ''}
        <div class="slip-title">${escapeHtml(titleText)}</div>
        ${metaHtml}
        <div class="student-row">
          <div><span class="lbl">Student:</span> <strong>${escapeHtml(sName)}</strong></div>
          <div><span class="lbl">Adm. No.:</span> <strong>${escapeHtml(admNo)}</strong></div>
          <div><span class="lbl">Father:</span> <strong>${escapeHtml(fatherName)}</strong></div>
          <div><span class="lbl">Class:</span> <strong>${escapeHtml(classLabel)}</strong></div>
          <div><span class="lbl">Phone:</span> <strong>${escapeHtml(phone)}</strong></div>
          <div><span class="lbl">Roll No.:</span> <strong>${escapeHtml(rollNo)}</strong></div>
        </div>
        <table class="lines">
          <thead>
            <tr>
              <th>Description</th>
              ${isReceipt ? '<th class="amt">Amount</th><th class="amt">Paid</th><th class="amt">Due</th>' : '<th class="amt"></th><th class="amt">Amount</th>'}
            </tr>
          </thead>
          <tbody>${linesHtml}</tbody>
        </table>
        ${totalsHtml}
        ${extraBlockHtml}
        <div class="footer">
          <div class="stamp">${footerStamp}</div>
          <div class="signature"><div class="line">Authorised Signatory</div></div>
        </div>
      </div>
    `

  let body = ''
  if (mode === 'single') body = renderCopy(null)
  else if (mode === 'office') body = renderCopy('OFFICE COPY')
  else if (mode === 'parent') body = renderCopy('PARENT COPY')
  else body = `${renderCopy('OFFICE COPY')}${renderCopy('PARENT COPY')}`

  const docTitle = isReceipt ? `Fee Receipt ${slipNo}` : `Demand Slip ${slipNo}`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  .slip-root { width: 100%; max-width: 186mm; margin: 0 auto; }
  .slip-header { margin-top: 8mm; margin-bottom: 8px; }
  .copy-label {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    padding: 4px 0;
    margin: 6px 0 0;
    border: 1.5px dashed #000;
    text-transform: uppercase;
  }
  .slip-title {
    text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; padding: 6px 0; margin: 8px 0 0;
    border-top: 2px solid #000; border-bottom: 2px solid #000;
  }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; padding: 8px 0; border-bottom: 1px dashed #000; }
  .meta div { display: flex; gap: 6px; }
  .meta .lbl { color: #444; min-width: 80px; }
  .meta .val { font-weight: 600; }
  .student-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; padding: 8px 0; border-bottom: 1px dashed #000; }
  .student-row .lbl { color: #444; min-width: 80px; display: inline-block; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.lines th, table.lines td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 12px; }
  table.lines th { background: #eee; font-weight: 700; text-transform: uppercase; font-size: 11px; }
  table.lines th.amt { text-align: right; }
  table.lines td.amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .totals { margin-top: 0; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 4px 8px; font-size: 12px; }
  .totals td.lbl { text-align: right; color: #444; }
  .totals td.amt { text-align: right; width: 130px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .totals tr.grand td { border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 13px; font-weight: 800; padding: 6px 8px; }
  .totals tr.due-row td { font-size: 13px; font-weight: 700; }
  .payment-info { margin-top: 12px; padding: 8px; border: 1px dashed #000; font-size: 11px; line-height: 1.7; }
  .payment-info .lbl { color: #444; min-width: 110px; display: inline-block; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 36px; }
  .footer .stamp { font-size: 11px; color: #555; }
  .footer .signature { text-align: center; min-width: 200px; }
  .footer .signature .line { border-top: 1px solid #000; padding-top: 4px; font-size: 11px; font-weight: 600; }
  .slip-root + .slip-root { margin-top: 14mm; }
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body { padding: 0; }
    .slip-root { page-break-inside: avoid; }
    .slip-root + .slip-root { margin-top: 0; page-break-before: always; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`
}
