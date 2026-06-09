interface PayslipPayment {
  month: number
  year: number
  basicSalary: number
  hra: number
  da: number
  ta: number
  medicalAllowance: number
  specialAllowance: number
  grossEarnings: number
  pf: number
  esi: number
  tax: number
  advanceDeduction: number
  lopDeduction: number
  lopDays: number
  paidDays: number | null
  otherDeductions: number
  totalDeductions: number
  netPayable: number
  paymentStatus: string
  paymentDate: string | null
  paymentMethod: string | null
  transactionRef: string | null
}

interface PayslipStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface PayslipSchool {
  name: string
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  contactPhone: string | null
  contactEmail: string | null
}

export interface PayslipData {
  payment: PayslipPayment
  staff: PayslipStaff | null
  school: PayslipSchool | null
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const inr = (n: number) =>
  '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

function row(label: string, value: string, bold = false): string {
  const style = bold ? 'font-weight:600;' : ''
  return `<tr><td style="padding:4px 8px;${style}">${esc(label)}</td><td style="padding:4px 8px;text-align:right;${style}">${value}</td></tr>`
}

/**
 * Build a self-contained payslip HTML document and open it in a print window.
 * Kept as plain HTML (no PDF dependency) so the browser handles print/save-as-PDF.
 */
export function openPayslipPrint(data: PayslipData): void {
  const { payment: p, staff, school } = data
  const period = `${MONTHS[p.month - 1] || ''} ${p.year}`
  const addressLine = [school?.address, school?.city, school?.state, school?.pincode].filter(Boolean).join(', ')

  const earnings = [
    row('Basic Salary', inr(p.basicSalary)),
    row('HRA', inr(p.hra)),
    row('DA', inr(p.da)),
    row('TA', inr(p.ta)),
    row('Medical Allowance', inr(p.medicalAllowance)),
    row('Special Allowance', inr(p.specialAllowance)),
    row('Gross Earnings', inr(p.grossEarnings), true),
  ].join('')

  const deductions = [
    row('PF', inr(p.pf)),
    row('ESI', inr(p.esi)),
    row('Tax (TDS)', inr(p.tax)),
    row('Advance Recovery', inr(p.advanceDeduction)),
    row(`Loss of Pay (${p.lopDays} day${p.lopDays === 1 ? '' : 's'})`, inr(p.lopDeduction)),
    row('Other Deductions', inr(p.otherDeductions)),
    row('Total Deductions', inr(p.totalDeductions), true),
  ].join('')

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip - ${esc(staff?.fullName || '')} - ${esc(period)}</title>
<style>
  *{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;}
  body{margin:0;padding:24px;color:#1a1a1a;}
  .sheet{max-width:720px;margin:0 auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;}
  .head{padding:20px 24px;border-bottom:2px solid #1a1a1a;text-align:center;}
  .head h1{margin:0;font-size:20px;}
  .head p{margin:2px 0;font-size:12px;color:#555;}
  .title{background:#f4f4f5;padding:8px 24px;font-weight:600;text-align:center;letter-spacing:.5px;}
  .meta{display:flex;justify-content:space-between;padding:16px 24px;font-size:13px;gap:16px;flex-wrap:wrap;}
  .meta div{min-width:200px;}
  .cols{display:flex;gap:0;border-top:1px solid #eee;}
  .col{flex:1;}
  .col h3{margin:0;padding:8px 12px;background:#fafafa;font-size:13px;border-bottom:1px solid #eee;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  .net{padding:16px 24px;background:#ecfdf5;display:flex;justify-content:space-between;font-size:16px;font-weight:700;border-top:2px solid #10b981;}
  .foot{padding:16px 24px;font-size:11px;color:#777;display:flex;justify-content:space-between;}
  @media print{body{padding:0;} .sheet{border:none;}}
</style></head><body>
  <div class="sheet">
    <div class="head">
      <h1>${esc(school?.name || 'Salary Slip')}</h1>
      ${addressLine ? `<p>${esc(addressLine)}</p>` : ''}
      ${school?.contactPhone || school?.contactEmail ? `<p>${esc([school?.contactPhone, school?.contactEmail].filter(Boolean).join(' · '))}</p>` : ''}
    </div>
    <div class="title">PAYSLIP — ${esc(period)}</div>
    <div class="meta">
      <div>
        <strong>${esc(staff?.fullName || 'Unknown')}</strong><br/>
        ${esc(staff?.roleLabel || '')}${staff?.employeeId ? ` · ${esc(staff.employeeId)}` : ''}
      </div>
      <div style="text-align:right;">
        Status: <strong>${p.paymentStatus === 'paid' ? 'PAID' : 'PENDING'}</strong><br/>
        ${p.paymentDate ? `Paid on ${esc(new Date(p.paymentDate).toLocaleDateString('en-IN'))}<br/>` : ''}
        ${p.paymentMethod ? `Via ${esc(p.paymentMethod)}` : ''}
        ${p.transactionRef ? ` (${esc(p.transactionRef)})` : ''}
      </div>
    </div>
    <div class="cols">
      <div class="col"><h3>Earnings</h3><table>${earnings}</table></div>
      <div class="col"><h3>Deductions</h3><table>${deductions}</table></div>
    </div>
    <div class="net"><span>Net Payable</span><span>${inr(p.netPayable)}</span></div>
    <div class="foot">
      <span>This is a computer-generated payslip and does not require a signature.</span>
    </div>
  </div>
  <script>window.onload=function(){window.print();}</script>
</body></html>`

  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}
