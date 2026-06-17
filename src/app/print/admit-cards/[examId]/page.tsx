'use client'

/**
 * Bulk print sheet for exam admit cards. URL-driven so the admin UI can
 * `window.open(...)` a new tab and trigger the native print dialog without a
 * backend PDF service — the browser's "Save as PDF" path covers the download
 * case. Same UX as the report-card and ID-card print pages.
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'
import { AdmitCardRenderer } from '@/features/exams/components/admit-card-renderer'
import type { AdmitCardData } from '@/features/exams/lib/admit-card-generator'
import type { AdmitCardTemplateConfig } from '@/features/exams/lib/admit-card-template'

interface GenerateResponse {
  exam: { id: string; name: string; academicYear: string }
  school: { name: string; academicYear: string }
  template?: AdmitCardTemplateConfig
  cards: Array<{ studentId: string; data: AdmitCardData }>
}

export default function PrintAdmitCardsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading admit cards…
        </div>
      }
    >
      <PrintAdmitCardsContent />
    </Suspense>
  )
}

function PrintAdmitCardsContent() {
  const params = useParams<{ examId: string }>()
  const searchParams = useSearchParams()
  const examId = params?.examId ?? ''
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
      ? `/api/parent/exams/${examId}/admit-card/generate`
      : `/api/school/exams/${examId}/admit-cards/generate`

    api
      .post<GenerateResponse>(endpoint, {
        studentIds,
        action,
      })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load admit cards.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [examId, studentIdsParam, action, scope, validationError])

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
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading admit cards…
      </div>
    )
  }

  if (validationError || error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn&apos;t load admit cards</p>
            <p className="mt-0.5 text-xs">{validationError || error || 'Data unavailable.'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@700&display=swap');
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .admit-page { page-break-after: always; }
          .admit-page:last-child { page-break-after: auto; }
          .admit-page { margin: 0 !important; padding: 0 !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
        <div className="mx-auto max-w-5xl">
          <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">{data.exam.name} — Admit Cards</p>
              <p className="text-xs text-muted-foreground">
                {data.cards.length} admit card{data.cards.length === 1 ? '' : 's'} · A4 portrait ·
                Academic year {data.exam.academicYear}
              </p>
            </div>
            <Button onClick={() => window.print()} size="sm">
              <Printer className="mr-1.5 size-4" /> Print
            </Button>
          </div>

          {data.cards.map((c) => (
            <div
              key={c.studentId}
              className="admit-page mx-auto mb-6 bg-white p-3 shadow-sm print:m-0 print:p-0 print:shadow-none"
            >
              <AdmitCardRenderer data={c.data} template={data.template} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
