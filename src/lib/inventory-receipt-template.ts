// Printable store (inventory) sale receipt. Mirrors the fee receipt look
// (src/lib/fee-slip-template.ts) — same header, title bar, meta grid, bordered
// lines table, totals block, amount-in-words, and signature footer — so every
// printed document from the app feels consistent. Pure data in, HTML string out
// (no React), so it can print from a client window or render server-side.

import { receiptMoney, formatReceiptDate, formatReceiptTime, numberToWords, escapeHtml } from '@/lib/fee-slip-template'
import { buildPrintHeaderHtml, type SchoolForPrintHeader } from '@/lib/print-header'

export type InventoryReceiptItem = {
  itemName: string
  variantLabel?: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
  returnedQty?: number
}

export type InventoryReceiptStudent = {
  firstName: string
  lastName: string
  admissionNumber?: string | null
  rollNumber?: string | null
}

export type InventoryReceiptInput = {
  school: SchoolForPrintHeader | null
  receiptNumber: string
  saleDate: Date
  student: InventoryReceiptStudent | null
  items: InventoryReceiptItem[]
  subtotal: number
  discount: number
  totalAmount: number
  amountPaid: number
  paymentMethod: string
  status: string // completed | voided
  academicYear?: string | null
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank / UPI',
  adjustment: 'Adjustment',
  online: 'Online',
  cheque: 'Cheque',
}

function renderItemsHtml(items: InventoryReceiptItem[]): string {
  return items
    .map((it) => {
      const name =
        escapeHtml(it.itemName) +
        (it.variantLabel ? ` <span style="color:#555">(${escapeHtml(it.variantLabel)})</span>` : '') +
        ((it.returnedQty ?? 0) > 0 ? `<br/><span style="color:#555;font-size:11px">${it.returnedQty} returned</span>` : '')
      const qtyRate = `${it.quantity} × ${receiptMoney(it.unitPrice)}`
      return `
      <tr>
        <td>${name}</td>
        <td class="amt">${qtyRate}</td>
        <td class="amt">${receiptMoney(it.lineTotal)}</td>
      </tr>`
    })
    .join('')
}

export function buildInventoryReceiptHtml(input: InventoryReceiptInput): string {
  const headerHtml = buildPrintHeaderHtml(input.school, { fallbackToAutoHeader: true })

  const sName = input.student ? `${input.student.firstName} ${input.student.lastName}`.trim() : '-'
  const admNo = input.student?.admissionNumber || '-'
  const rollNo = input.student?.rollNumber || '-'

  const dateStr = formatReceiptDate(input.saleDate)
  const timeStr = formatReceiptTime(input.saleDate)
  const slipNo = input.receiptNumber.replace(/^RCP-/, '')
  const isVoided = input.status === 'voided'

  const due = Math.max(0, Math.round((input.totalAmount - input.amountPaid + Number.EPSILON) * 100) / 100)
  const methodLabel = METHOD_LABELS[input.paymentMethod] || input.paymentMethod || '-'
  const wordsStr = numberToWords(input.totalAmount || 0)

  const itemsHtml = renderItemsHtml(input.items)

  const totalsHtml = `
        <div class="totals">
          <table>
            <tr><td class="lbl">Sub Total</td><td class="amt">${receiptMoney(input.subtotal)}</td></tr>
            ${input.discount > 0 ? `<tr><td class="lbl">Discount</td><td class="amt">- ${receiptMoney(input.discount)}</td></tr>` : ''}
            <tr class="grand"><td class="lbl">TOTAL</td><td class="amt">${receiptMoney(input.totalAmount)}</td></tr>
            ${input.amountPaid > 0 ? `<tr><td class="lbl">Paid</td><td class="amt">${receiptMoney(input.amountPaid)}</td></tr>` : ''}
            ${due > 0 ? `<tr class="due-row"><td class="lbl">BALANCE DUE</td><td class="amt">${receiptMoney(due)}</td></tr>` : ''}
          </table>
        </div>`

  const metaHtml = `
        <div class="meta">
          <div><span class="lbl">Receipt #:</span><span class="val">${escapeHtml(slipNo)}</span></div>
          <div><span class="lbl">Date:</span><span class="val">${escapeHtml(dateStr)} · ${escapeHtml(timeStr)}</span></div>
          <div><span class="lbl">Payment:</span><span class="val">${escapeHtml(methodLabel)}</span></div>
          <div><span class="lbl">Session:</span><span class="val">${escapeHtml(input.academicYear || '-')}</span></div>
        </div>`

  const body = `
      <div class="slip-root">
        ${headerHtml ? `<div class="slip-header">${headerHtml}</div>` : ''}
        ${isVoided ? `<div class="copy-label">Reversed</div>` : ''}
        <div class="slip-title">Store Receipt</div>
        ${metaHtml}
        <div class="student-row">
          <div><span class="lbl">Student:</span> <strong>${escapeHtml(sName)}</strong></div>
          <div><span class="lbl">Adm. No.:</span> <strong>${escapeHtml(admNo)}</strong></div>
          <div><span class="lbl">Roll No.:</span> <strong>${escapeHtml(rollNo)}</strong></div>
        </div>
        <table class="lines">
          <thead>
            <tr>
              <th>Item</th>
              <th class="amt">Qty × Rate</th>
              <th class="amt">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        ${totalsHtml}
        <div class="payment-info">
          <div><span class="lbl">Mode:</span> <strong>${escapeHtml(methodLabel)}</strong></div>
          <div><span class="lbl">Amount in words:</span> <strong>${escapeHtml(wordsStr)}</strong></div>
        </div>
        <div class="footer">
          <div class="stamp">This is a computer-generated receipt.</div>
          <div class="signature"><div class="line">Authorised Signatory</div></div>
        </div>
      </div>`

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Store Receipt ${escapeHtml(slipNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 12mm; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
  .slip-root { width: 100%; max-width: 186mm; margin: 0 auto; }
  .slip-header { margin-top: 8mm; margin-bottom: 8px; }
  .copy-label {
    text-align: center; font-size: 11px; font-weight: 700; letter-spacing: 3px;
    padding: 4px 0; margin: 6px 0 0; border: 1.5px dashed #000; text-transform: uppercase;
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
  table.lines th, table.lines td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 12px; vertical-align: top; }
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
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body { padding: 0; }
    .slip-root { page-break-inside: avoid; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`
}
