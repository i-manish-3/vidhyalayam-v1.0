import { db } from '@/lib/db'
import { SchoolPrintHeader } from '@/lib/print-header'
import { SlipPrintButton } from './print-button'

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtINR(value: number): string {
  return `₹${(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '-'
  try {
    const d = typeof value === 'string' ? new Date(value) : value
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '-' }
}

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function PublicDemandSlipPage({ params }: PageProps) {
  const { token } = await params

  const slip = await db.studentFeeInvoice.findFirst({
    where: { publicAccessToken: token, deletedAt: null },
    include: {
      school: true,
      student: {
        include: {
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
        },
      },
      lines: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!slip) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg border p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Link not found</h1>
          <p className="text-sm text-gray-600">This demand-slip link is invalid or has been revoked. Please contact your school for a fresh link.</p>
        </div>
      </div>
    )
  }

  if (slip.publicTokenExpiresAt && slip.publicTokenExpiresAt < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg border p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Link expired</h1>
          <p className="text-sm text-gray-600">This demand-slip link has expired. Please contact your school for a fresh link.</p>
        </div>
      </div>
    )
  }

  const studentName = `${slip.student.firstName} ${slip.student.lastName}`.trim()
  const classLabel = [slip.student.class?.name, slip.student.section?.name].filter(Boolean).join(' / ') || '-'
  const monthLabel = MONTH_LABELS[(slip.billingMonth || 1) - 1]
  const amountDue = (slip.totalAmount || 0) - (slip.paidAmount || 0)

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          .print-root { box-shadow: none !important; border: none !important; padding: 0 !important; max-width: none !important; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>

      <div className="max-w-[720px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-28 print:px-0 print:py-0 print:pb-0">
        <div className="print-root bg-white rounded-lg sm:rounded-xl border shadow-sm p-4 sm:p-6">
          <SchoolPrintHeader school={slip.school} />

          <div className="text-center mt-4 mb-2">
            <h1 className="text-base sm:text-lg font-bold uppercase tracking-wider border-y-2 border-black py-1.5">
              Monthly Fee Demand Slip
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs sm:text-sm py-2 border-b border-dashed border-gray-400">
            <div><span className="text-gray-600">Slip #: </span><span className="font-semibold">{slip.invoiceNumber}</span></div>
            <div><span className="text-gray-600">Period: </span><span className="font-semibold">{monthLabel} {slip.billingYear}</span></div>
            <div><span className="text-gray-600">Issued: </span><span className="font-semibold">{fmtDate(slip.invoiceDate)}</span></div>
            <div><span className="text-gray-600">Due by: </span><span className="font-semibold">{fmtDate(slip.dueDate)}</span></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs sm:text-sm py-2 border-b border-dashed border-gray-400">
            <div><span className="text-gray-600">Student: </span><strong>{studentName}</strong></div>
            <div><span className="text-gray-600">Adm. No.: </span><strong>{slip.student.admissionNumber || '-'}</strong></div>
            <div><span className="text-gray-600">Class: </span><strong>{classLabel}</strong></div>
            <div><span className="text-gray-600">Status: </span><strong className="capitalize">{slip.status}</strong></div>
          </div>

          <div className="overflow-x-auto mt-3">
            <table className="w-full border-collapse text-xs sm:text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border border-black px-2 py-1.5 text-left text-[10px] sm:text-xs uppercase">Fee Head</th>
                  <th className="border border-black px-2 py-1.5 text-left text-[10px] sm:text-xs uppercase">Installment</th>
                  <th className="border border-black px-2 py-1.5 text-left text-[10px] sm:text-xs uppercase whitespace-nowrap">Due</th>
                  <th className="border border-black px-2 py-1.5 text-right text-[10px] sm:text-xs uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {slip.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="border border-black px-2 py-1.5">{line.feeHeadName}</td>
                    <td className="border border-black px-2 py-1.5 text-gray-600">{line.installmentName}</td>
                    <td className="border border-black px-2 py-1.5 text-[11px] whitespace-nowrap">{fmtDate(line.dueDate)}</td>
                    <td className="border border-black px-2 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">{fmtINR(line.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <table className="w-full mt-2 text-xs sm:text-sm">
            <tbody>
              <tr><td className="text-right text-gray-600 py-0.5 pr-2">Subtotal</td><td className="text-right font-medium tabular-nums w-32 py-0.5">{fmtINR(slip.subtotal)}</td></tr>
              <tr><td className="text-right text-gray-600 py-0.5 pr-2">Previous Balance</td><td className="text-right font-medium tabular-nums py-0.5">{fmtINR(slip.previousBalance)}</td></tr>
              <tr className="border-y-2 border-black"><td className="text-right font-bold py-1 pr-2 text-sm sm:text-base">TOTAL DEMANDED</td><td className="text-right font-extrabold tabular-nums py-1 text-sm sm:text-base">{fmtINR(slip.totalAmount)}</td></tr>
              <tr><td className="text-right text-gray-600 py-0.5 pr-2">Paid So Far</td><td className="text-right font-medium tabular-nums py-0.5">{fmtINR(slip.paidAmount)}</td></tr>
              <tr><td className="text-right font-bold py-1 pr-2 text-sm">AMOUNT DUE</td><td className="text-right font-extrabold tabular-nums py-1 text-sm">{fmtINR(amountDue)}</td></tr>
            </tbody>
          </table>

          {slip.notes && (
            <div className="mt-3 p-2 border border-dashed border-gray-400 text-xs">
              <strong>Notes:</strong> {slip.notes}
            </div>
          )}

          <div className="mt-8 flex items-end justify-between text-xs">
            <div className="text-gray-500">This is a computer-generated demand slip.</div>
            <div className="text-center min-w-[180px]">
              <div className="border-t border-black pt-1 font-semibold">Authorised Signatory</div>
            </div>
          </div>
        </div>
      </div>

      <div className="no-print fixed bottom-0 inset-x-0 bg-white border-t shadow-lg">
        <div className="max-w-[720px] mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 hidden sm:block">Tap "Save as PDF" to keep a copy on your phone.</div>
          <SlipPrintButton />
        </div>
      </div>
    </div>
  )
}
