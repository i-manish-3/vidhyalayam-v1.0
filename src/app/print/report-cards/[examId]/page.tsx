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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, Printer, AlertTriangle, Layers, Check } from 'lucide-react'
import { ReportCardRenderer } from '@/features/exams/components/report-card-renderer'
import type { ReportCardData } from '@/features/exams/lib/report-card-generator'
import { cn } from '@/lib/utils'

interface TermExamItem {
  id: string
  name: string
  shortCode: string | null
  status: string
}

interface GenerateResponse {
  template: { id: string; name: string; format: string }
  exam: { id: string; name: string; academicYear: string; groupName?: string; paradigmName?: string | null }
  school: { name: string; academicYear: string }
  termExams?: TermExamItem[]
  selectedExamIds?: string[]
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
  const examIdsParam = searchParams.get('examIds') || ''
  const action = (searchParams.get('action') as 'print' | 'download') || 'print'
  const scope = searchParams.get('scope') === 'parent' ? 'parent' : 'school'

  const [data, setData] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showHeaderBanner, setShowHeaderBanner] = useState(true)
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>(() => {
    if (examIdsParam) {
      return examIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return examId ? [examId] : []
  })

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

    setRefreshing(true)
    api
      .post<GenerateResponse>(endpoint, {
        templateId: templateId || undefined,
        studentIds,
        examIds: selectedExamIds.length > 0 ? selectedExamIds : undefined,
        action,
      })
      .then((res) => {
        if (!cancelled) {
          setData(res)
          if (res.selectedExamIds && res.selectedExamIds.length > 0) {
            setSelectedExamIds(res.selectedExamIds)
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load report cards.')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [examId, templateId, studentIdsParam, action, scope, validationError, selectedExamIds.join(',')])

  useEffect(() => {
    if (!data || printedOnce.current) return
    if (action !== 'print' && action !== 'download') return
    // Auto-trigger print on initial load only
    printedOnce.current = true
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [data, action])

  function handleToggleExam(toggledId: string) {
    if (selectedExamIds.includes(toggledId)) {
      if (selectedExamIds.length === 1) return // Keep at least one exam
      setSelectedExamIds(selectedExamIds.filter((id) => id !== toggledId))
    } else {
      setSelectedExamIds([...selectedExamIds, toggledId])
    }
  }

  function handleSelectAllExams() {
    if (!data?.termExams) return
    setSelectedExamIds(data.termExams.map((e) => e.id))
  }

  function handleResetExam() {
    setSelectedExamIds([examId])
  }

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

  const termExams = data.termExams || []
  const hasMultipleTermExams = termExams.length > 1

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 6mm 8mm;
        }
        @media print {
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .report-page {
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            box-shadow: none !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .report-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
        <div className="mx-auto max-w-5xl">
          <div className="no-print mb-4 space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2">
                  {data.exam.name} — {data.template.name}
                  {refreshing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.cards.length} report card{data.cards.length === 1 ? '' : 's'} · A4 portrait · Academic year{' '}
                  {data.exam.academicYear}
                  {data.exam.groupName && ` · ${data.exam.groupName}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-xs">
                  <Label htmlFor="toggle-header-banner" className="cursor-pointer text-xs font-medium text-foreground">
                    Header Banner
                  </Label>
                  <Switch
                    id="toggle-header-banner"
                    checked={showHeaderBanner}
                    onCheckedChange={setShowHeaderBanner}
                  />
                </div>
                <Button onClick={() => window.print()} size="sm">
                  <Printer className="mr-1.5 size-4" /> Print
                </Button>
              </div>
            </div>

            {/* Dynamic Term Exams Picker */}
            {hasMultipleTermExams && (
              <div className="border-t border-border/60 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    Choose Exams in {data.exam.groupName || 'Term'} ({selectedExamIds.length} of {termExams.length} selected):
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllExams}
                      className="text-[11px] text-primary hover:underline font-medium"
                    >
                      Select all
                    </button>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={handleResetExam}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Current only
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {termExams.map((te) => {
                    const isChecked = selectedExamIds.includes(te.id)
                    return (
                      <button
                        key={te.id}
                        type="button"
                        onClick={() => handleToggleExam(te.id)}
                        disabled={refreshing}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all border',
                          isChecked
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Check className={cn('size-3.5', isChecked ? 'opacity-100' : 'opacity-0')} />
                        <span>{te.name}</span>
                        {te.shortCode && <span className="opacity-75 text-[10px]">({te.shortCode})</span>}
                      </button>
                    )
                  })}
                </div>
                {selectedExamIds.length > 1 && (
                  <p className="mt-2 text-[11px] text-primary font-medium">
                    ✓ Dynamic term report card enabled: displays separate mark columns for each chosen exam and calculated term totals.
                  </p>
                )}
              </div>
            )}
          </div>

          {data.cards.map((c) => (
            <div
              key={c.studentId}
              className="report-page mx-auto mb-6 bg-white p-3 shadow-sm print:m-0 print:p-0 print:shadow-none"
            >
              <ReportCardRenderer data={c.data} showHeaderBanner={showHeaderBanner} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

