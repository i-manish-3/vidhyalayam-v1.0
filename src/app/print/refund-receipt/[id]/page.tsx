'use client'

/**
 * Printable refund receipt — opens in a new tab from the refund history
 * "Receipt" button. Auto-fires window.print() once the data has loaded so
 * the cashier just gets a print dialog. Falls back to a manual "Print"
 * button if auto-print is blocked.
 *
 * The slip dimensions and print CSS deliberately match the fee-collection
 * receipt style (380px wide, 10pt body, monospace amounts) so the same
 * receipt printer / cash-counter workflow handles both.
 */

import { use, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'

interface ReceiptData {
  success: boolean
  refund: {
    id: string
    receiptNumber: string
    amount: number
    paymentMethod: string
    scope: string
    academicYear: string
    issuedDate: string
    notes: string | null
    voidedAt: string | null
    voidReason: string | null
    issuedByName: string | null
    voidedByName: string | null
  }
  withdrawal: {
    id: string
    effectiveDate: string
    reason: string
    totalRefundDue: number
  } | null
  student: {
    id: string
    name: string
    admissionNumber: string | null
    rollNumber: string | null
    fatherName: string | null
    className: string | null
  }
  school: {
    name: string
    address: string | null
    city: string | null
    state: string | null
    pincode: string | null
    contactPhone: string | null
    contactEmail: string | null
    printHeader: string | null
  } | null
}

function formatINR(n: number): string {
  return Number(n || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  })
}

function formatDate(s: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(s: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// Convert paise-precision number to "Rupees X only" words. Kept lightweight
// (handles up to 99,99,99,999) — receipts in India use Indian numbering.
function rupeesInWords(n: number): string {
  const rupees = Math.floor(Math.abs(n))
  if (rupees === 0) return 'Zero Rupees Only'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const twoDigits = (x: number): string => {
    if (x < 20) return ones[x]
    const t = Math.floor(x / 10)
    const o = x % 10
    return o ? `${tens[t]} ${ones[o]}` : tens[t]
  }
  const threeDigits = (x: number): string => {
    const h = Math.floor(x / 100)
    const r = x % 100
    const head = h ? `${ones[h]} Hundred${r ? ' ' : ''}` : ''
    return head + (r ? twoDigits(r) : '')
  }
  let r = rupees
  const crore = Math.floor(r / 10000000); r %= 10000000
  const lakh = Math.floor(r / 100000); r %= 100000
  const thousand = Math.floor(r / 1000); r %= 1000
  const hundred = r
  const parts: string[] = []
  if (crore) parts.push(`${twoDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (hundred) parts.push(threeDigits(hundred))
  return `${parts.join(' ').trim()} Rupees Only`
}

export default function RefundReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [data, setData] = useState<ReceiptData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printedOnce = useRef(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<ReceiptData>(`/api/school/refunds/${id}/receipt-data`)
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load receipt')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Auto-print once the data is on-screen. Guarded so React StrictMode
  // double-invocations don't fire two print dialogs.
  useEffect(() => {
    if (!data || printedOnce.current) return
    printedOnce.current = true
    // Defer one tick so the layout is painted before the dialog opens.
    const t = setTimeout(() => {
      window.print()
    }, 250)
    return () => clearTimeout(t)
  }, [data])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading receipt…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn't load receipt</p>
            <p className="mt-0.5 text-xs">{error || 'Receipt data unavailable.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const { refund, student, school, withdrawal } = data
  const voided = !!refund.voidedAt
  const issued = new Date(refund.issuedDate)
  const addressLine = school
    ? [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', ')
    : ''

  return (
    <div className="min-h-screen bg-white p-4 print:p-0">
      <div className="mx-auto flex max-w-md flex-col gap-3">
        <div className="flex justify-end gap-2 print:hidden">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 size-3.5" /> Print
          </Button>
        </div>

        <div className="refund-slip border-2 border-black bg-white text-[11px] leading-tight text-black">
          {school?.printHeader ? (
            <div className="border-b-2 border-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={school.printHeader}
                alt={school.name}
                className="block w-full"
              />
            </div>
          ) : (
            <div className="border-b-2 border-black p-2 text-center">
              <div className="text-base font-extrabold uppercase">{school?.name || 'School'}</div>
              {addressLine && <div className="text-[10px]">{addressLine}</div>}
              {(school?.contactPhone || school?.contactEmail) && (
                <div className="text-[10px]">
                  {[school?.contactPhone, school?.contactEmail].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          )}

          <div className="border-b-2 border-black bg-black/5 p-2 text-center">
            <div className="text-sm font-extrabold uppercase tracking-wide">Refund Receipt</div>
            <div className="text-[10px] uppercase">AY {refund.academicYear}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-b-2 border-black p-2">
            <Field label="Receipt No." value={<span className="font-mono">{refund.receiptNumber}</span>} />
            <Field
              label="Date"
              value={
                <>
                  {formatDate(issued)}
                  <span className="ml-1 text-[10px] text-black/70">{formatTime(issued)}</span>
                </>
              }
            />
            <Field label="Name" value={student.name} />
            <Field label="Adm. No." value={student.admissionNumber || '-'} />
            <Field label="Class" value={student.className || '-'} />
            <Field label="Roll No." value={student.rollNumber || '-'} />
            {student.fatherName && (
              <Field label="Father" value={student.fatherName} colSpan />
            )}
          </div>

          <div className="border-b-2 border-black p-2">
            <div className="text-[10px] uppercase tracking-wide text-black/70">Reason</div>
            <div className="font-semibold">
              Refund against withdrawal
              {withdrawal && (
                <>
                  {' '}({withdrawal.reason}, {formatDate(withdrawal.effectiveDate)})
                </>
              )}
            </div>
            {refund.notes && (
              <div className="mt-1 text-[10px] italic">{refund.notes}</div>
            )}
          </div>

          <div className="border-b-2 border-black">
            <div className="grid grid-cols-[1fr_120px] border-b-2 border-black bg-black/5">
              <div className="p-2 text-[10px] font-bold uppercase">Particulars</div>
              <div className="border-l-2 border-black p-2 text-right text-[10px] font-bold uppercase">
                Amount
              </div>
            </div>
            <div className="grid grid-cols-[1fr_120px]">
              <div className="p-2">
                Cash refund
                <div className="text-[10px] text-black/70">
                  Mode: {refund.paymentMethod.toUpperCase()}
                </div>
              </div>
              <div className="border-l-2 border-black p-2 text-right font-bold tabular-nums">
                {formatINR(refund.amount)}
              </div>
            </div>
            <div className="grid grid-cols-[1fr_120px] border-t-2 border-black bg-black/5">
              <div className="p-2 font-extrabold uppercase">Total Refunded</div>
              <div className="border-l-2 border-black p-2 text-right text-base font-extrabold tabular-nums">
                {formatINR(refund.amount)}
              </div>
            </div>
          </div>

          <div className="border-b-2 border-black p-2 text-[10px]">
            <span className="font-bold uppercase">In words: </span>
            {rupeesInWords(refund.amount)}
          </div>

          <div className="grid grid-cols-2 gap-3 p-2 text-[10px]">
            <div>
              <div className="text-black/70">Issued by</div>
              <div className="font-semibold">{refund.issuedByName || '-'}</div>
            </div>
            <div className="text-right">
              <div className="mt-6 border-t border-black pt-1">Authorised Signatory</div>
            </div>
          </div>

          {voided && (
            <div className="voided-stamp pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-18deg] rounded border-4 border-destructive px-6 py-2 text-3xl font-extrabold uppercase text-destructive opacity-80">
                Voided
              </span>
            </div>
          )}
        </div>

        {voided && (
          <div className="rounded-md border-2 border-destructive bg-destructive/5 p-2 text-xs text-destructive print:border print:bg-white print:text-black">
            <div className="font-bold uppercase">This receipt has been voided</div>
            <div className="mt-0.5">
              On {formatDate(refund.voidedAt!)}{refund.voidedByName ? ` by ${refund.voidedByName}` : ''}
              {refund.voidReason ? ` — ${refund.voidReason}` : ''}.
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .refund-slip {
          position: relative;
          width: 380px;
          max-width: 100%;
          margin: 0 auto;
        }
        @media print {
          html, body {
            background: white !important;
            margin: 0;
            padding: 0;
          }
          @page {
            margin: 8mm;
          }
          .refund-slip {
            box-shadow: none !important;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}

function Field({
  label,
  value,
  colSpan,
}: {
  label: string
  value: React.ReactNode
  colSpan?: boolean
}) {
  return (
    <div className={colSpan ? 'col-span-2 grid grid-cols-[80px_1fr] gap-2' : 'grid grid-cols-[70px_1fr] gap-2'}>
      <span className="text-[10px] font-bold uppercase text-black/70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
