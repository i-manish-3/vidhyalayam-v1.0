'use client'

/**
 * Bulk print sheet for exam report cards. URL-driven so the admin UI can
 * `window.open(...)` a new tab and trigger the native print dialog without
 * needing a backend PDF service — the browser's "Save as PDF" path covers
 * the download case, same UX as the ID-card print page.
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'
import { ReportCardRenderer } from '@/features/exams/components/report-card-renderer'
import type { ReportCardData } from '@/features/exams/lib/report-card-generator'

interface GenerateResponse {
  template: { id: string; name: string; format: string }
  exam: { id: string; name: string; academicYear: string }
  school: { name: string; academicYear: string }
  cards: Array<{ studentId: string; data: ReportCardData }>
}

export default function PrintReportCardsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading report cards…
        </div>
      }
    >
      <PrintReportCardsContent />
    </Suspense>
  )
}

function PrintReportCardsContent() {
  const params = useParams<{ examId: string }>()
  const searchParams = useSearchParams()
  const examId = params?.examId ?? ''
  const templateId = searchParams.get('template') || ''
  const studentIdsParam = searchParams.get('students') || ''
  const action = (searchParams.get('action') as 'print' | 'download') || 'print'
  const scope = searchParams.get('scope') === 'parent' ? 'parent' : 'school'

  const [data, setData] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printedOnce = useRef(false)
  const studentIds = studentIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
  const validationError = !examId
    ? 'Missing exam ID.'
    : !studentIdsParam || studentIds.length === 0
      ? 'Please select at least one student.'
      : null

  useEffect(() => {
    if (validationError) return
    let cancelled = false
    const endpoint = scope === 'parent'
      ? `/api/parent/exams/${examId}/report-card/generate`
      : `/api/school/exams/${examId}/report-cards/generate`

    api
      .post<GenerateResponse>(endpoint, {
        templateId: templateId || undefined,
        studentIds,
        action,
      })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load report cards.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [examId, templateId, studentIdsParam, action, scope, validationError])

  useEffect(() => {
    if (!data || printedOnce.current) return
    if (action !== 'print' && action !== 'download') return
    printedOnce.current = true
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [data, action])

  if (!validationError && loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading report cards…
      </div>
    )
  }

  if (validationError || error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn&apos;t load report cards</p>
            <p className="mt-0.5 text-xs">{validationError || error || 'Data unavailable.'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .report-page { page-break-after: always; }
          .report-page:last-child { page-break-after: auto; }
        }
      `}</style>

      <div className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
        <div className="mx-auto max-w-5xl">
          <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">
                {data.exam.name} — {data.template.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.cards.length} report card{data.cards.length === 1 ? '' : 's'} · A4 portrait · Academic year{' '}
                {data.exam.academicYear}
              </p>
            </div>
            <Button onClick={() => window.print()} size="sm">
              <Printer className="mr-1.5 size-4" /> Print
            </Button>
          </div>

          {data.cards.map((c) => (
            <div
              key={c.studentId}
              className="report-page mx-auto mb-6 bg-white p-3 shadow-sm print:m-0 print:p-0 print:shadow-none"
            >
              <ReportCardRenderer data={c.data} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
