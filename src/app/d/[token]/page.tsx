import { db } from '@/lib/db'
import { SlipPrintButton } from './print-button'
import { buildDemandSlipDoc } from '@/lib/fee-slip-render'

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
          parentLinks: {
            include: {
              parent: {
                select: {
                  fatherName: true,
                  motherName: true,
                  phone: true,
                },
              },
            },
          },
        },
      },
      // Pull assignmentItem → assignment so each line knows its academicYear
      // (used by buildSlipLines to bucket cross-session debits).
      lines: {
        include: {
          assignmentItem: {
            select: { assignment: { select: { academicYear: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
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

  // Demand-slip rendering (previous-dues lookup, bucketing, layout) lives in the
  // shared helper so the parent portal and this public page stay identical.
  const html = await buildDemandSlipDoc(slip)

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
        <div
          className="print-root bg-white rounded-lg sm:rounded-xl border shadow-sm p-4 sm:p-6"
          // buildSlipHtml returns a full HTML document. For embedding inside
          // this page we strip the <html>/<head> wrapper to a body-only
          // fragment so the inline <style> still scopes to the slip.
          dangerouslySetInnerHTML={{ __html: extractBodyAndStyle(html) }}
        />
      </div>

      <div className="no-print fixed bottom-0 inset-x-0 bg-white border-t shadow-lg">
        <div className="max-w-[720px] mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600 hidden sm:block">Tap &ldquo;Save as PDF&rdquo; to keep a copy on your phone.</div>
          <SlipPrintButton />
        </div>
      </div>
    </div>
  )
}

// The shared template returns a full <!doctype html> document. When embedded
// inside an existing React page we only want the <style> and <body> contents,
// because the outer page already has its own <html>/<head>. Extract both and
// concatenate.
function extractBodyAndStyle(fullHtml: string): string {
  const styleMatch = fullHtml.match(/<style>([\s\S]*?)<\/style>/i)
  const bodyMatch = fullHtml.match(/<body>([\s\S]*?)<\/body>/i)
  const style = styleMatch ? `<style>${styleMatch[1]}</style>` : ''
  const body = bodyMatch ? bodyMatch[1] : fullHtml
  return `${style}${body}`
}
