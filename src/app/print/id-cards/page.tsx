'use client'

/**
 * A4 print sheet for student ID cards. Driven entirely by URL params so the
 * generate UI can `window.open(...)` a new tab and trigger the browser's
 * native print dialog without needing a backend PDF service. Browsers can
 * "save as PDF" from the same dialog, which we surface as the "Download PDF"
 * action — same UX path, no extra dependencies.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Loader2, Printer, AlertTriangle } from 'lucide-react'
import {
  IdCardRenderer,
  type CardRenderData,
  type RenderTemplate,
} from '@/features/id-cards/components/id-card-renderer'
import {
  IdCardHtmlRenderer,
  type HtmlRenderData,
  type HtmlRenderTemplate,
} from '@/features/id-cards/components/id-card-html-renderer'
import type { CardElement } from '@/lib/id-card-types'

interface GenerateResponse {
  template: RenderTemplate & {
    id: string
    name: string
    templateMode: 'html' | 'element'
    orientation: 'portrait' | 'landscape'
    frontHtml?: string | null
    backHtml?: string | null
    frontCss?: string | null
    backCss?: string | null
  }
  school: {
    id: string
    name: string
    logo: string | null
    address: string
    phone: string | null
    email: string | null
    website: string | null
    academicYear: string
  }
  cards: CardRenderData[]
}

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297
const PAGE_MARGIN_MM = 8
const CARD_GAP_MM = 4

// Compute how many cards fit per row given the card width + page margins.
function cardsPerRow(cardWidthMm: number): number {
  const available = A4_WIDTH_MM - PAGE_MARGIN_MM * 2
  return Math.max(1, Math.floor((available + CARD_GAP_MM) / (cardWidthMm + CARD_GAP_MM)))
}

export default function PrintIdCardsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading ID cards…
        </div>
      }
    >
      <PrintIdCardsContent />
    </Suspense>
  )
}

function PrintIdCardsContent() {
  const searchParams = useSearchParams()
  const templateId = searchParams.get('template') || ''
  const studentIdsParam = searchParams.get('students') || ''
  const academicYear = searchParams.get('academicYear') || ''
  const action = (searchParams.get('action') as 'print' | 'download') || 'print'
  const side = (searchParams.get('side') as 'front' | 'back' | 'both') || 'both'

  const [data, setData] = useState<GenerateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const printedOnce = useRef(false)

  useEffect(() => {
    if (!templateId || !studentIdsParam) {
      setError('Missing template or student selection.')
      setLoading(false)
      return
    }
    const studentIds = studentIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    if (!studentIds.length) {
      setError('Please select at least one student.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .post<GenerateResponse>('/api/school/id-cards/generate', {
        templateId,
        studentIds,
        academicYear: academicYear || undefined,
        action,
      })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load ID cards.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [templateId, studentIdsParam, academicYear, action])

  // Auto-print once data is on-screen for print/download actions.
  useEffect(() => {
    if (!data || printedOnce.current) return
    if (action !== 'print' && action !== 'download') return
    printedOnce.current = true
    const t = setTimeout(() => {
      window.print()
    }, 500)
    return () => clearTimeout(t)
  }, [data, action])

  const isHtmlMode = data?.template.templateMode === 'html' && !!data?.template.frontHtml

  const elementTpl = useMemo<RenderTemplate | null>(() => {
    if (!data) return null
    return {
      widthMm: data.template.widthMm,
      heightMm: data.template.heightMm,
      backgroundColor: data.template.backgroundColor,
      frontBackground: data.template.frontBackground,
      backBackground: data.template.backBackground,
      hasBackSide: data.template.hasBackSide,
      frontLayout: data.template.frontLayout as CardElement[],
      backLayout: (data.template.backLayout as CardElement[] | null) || null,
    }
  }, [data])

  const htmlTpl = useMemo<HtmlRenderTemplate | null>(() => {
    if (!data || !isHtmlMode) return null
    return {
      widthMm: data.template.widthMm,
      heightMm: data.template.heightMm,
      frontHtml: data.template.frontHtml || '',
      frontCss: data.template.frontCss || '',
      backHtml: data.template.backHtml || null,
      backCss: data.template.backCss || null,
      hasBackSide: data.template.hasBackSide,
    }
  }, [data, isHtmlMode])

  const perRow = data ? cardsPerRow(data.template.widthMm) : 4
  const showBack = data?.template.hasBackSide && (side === 'back' || side === 'both')
  const showFront = side === 'front' || side === 'both' || !data?.template.hasBackSide

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading ID cards…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Couldn&apos;t load ID cards</p>
            <p className="mt-0.5 text-xs">{error || 'Data unavailable.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const cardWidthMm = data.template.widthMm
  const cardHeightMm = data.template.heightMm

  return (
    <>
      <style jsx global>{`
        @page {
          size: A4;
          margin: ${PAGE_MARGIN_MM}mm;
        }
        @media print {
          html, body { background: white !important; }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
        }
        .id-card-grid {
          display: grid;
          grid-template-columns: repeat(${perRow}, ${cardWidthMm}mm);
          gap: ${CARD_GAP_MM}mm;
          justify-content: center;
        }
        .id-card-cell {
          width: ${cardWidthMm}mm;
          height: ${cardHeightMm}mm;
          overflow: hidden;
        }
        /* Renderer outputs px content matching mm at 96 DPI baseline; mm units in template
           CSS map to physical mm on paper without extra scaling. */
        .id-card-cell > * {
          width: ${cardWidthMm * 3.78}px !important;
          height: ${cardHeightMm * 3.78}px !important;
        }
      `}</style>

      <div className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
        <div className="mx-auto max-w-5xl">
          <div className="no-print mb-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
            <div>
              <p className="text-sm font-semibold">{data.template.name}</p>
              <p className="text-xs text-muted-foreground">
                {data.cards.length} card{data.cards.length === 1 ? '' : 's'} · {perRow} per row · A4 sheet
              </p>
            </div>
            <Button onClick={() => window.print()} size="sm">
              <Printer className="mr-1.5 size-4" /> Print
            </Button>
          </div>

          {showFront && (
            <PrintSheet
              title="Front"
              cards={data.cards}
              elementTpl={elementTpl}
              htmlTpl={htmlTpl}
              schoolLogo={data.school.logo}
              perRow={perRow}
              cardHeightMm={cardHeightMm}
              side="front"
            />
          )}
          {showBack && (
            <PrintSheet
              title="Back"
              cards={data.cards}
              elementTpl={elementTpl}
              htmlTpl={htmlTpl}
              schoolLogo={data.school.logo}
              perRow={perRow}
              cardHeightMm={cardHeightMm}
              side="back"
            />
          )}
        </div>
      </div>
    </>
  )
}

interface PrintSheetProps {
  title: string
  cards: CardRenderData[]
  elementTpl: RenderTemplate | null
  htmlTpl: HtmlRenderTemplate | null
  schoolLogo: string | null
  perRow: number
  cardHeightMm: number
  side: 'front' | 'back'
}

function PrintSheet({
  title,
  cards,
  elementTpl,
  htmlTpl,
  schoolLogo,
  perRow,
  cardHeightMm,
  side,
}: PrintSheetProps) {
  // Group cards by page so we get clean page breaks. Rows-per-page based on
  // A4 height minus margins.
  const availableHeight = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2
  const rowsPerPage = Math.max(1, Math.floor((availableHeight + CARD_GAP_MM) / (cardHeightMm + CARD_GAP_MM)))
  const cardsPerPage = perRow * rowsPerPage
  const pages: CardRenderData[][] = []
  for (let i = 0; i < cards.length; i += cardsPerPage) {
    pages.push(cards.slice(i, i + cardsPerPage))
  }

  return (
    <>
      {pages.map((pageCards, pageIdx) => (
        <div
          key={`${side}-${pageIdx}`}
          className="print-page mx-auto mb-6 bg-white p-3 shadow-sm print:m-0 print:p-0 print:shadow-none"
        >
          <div className="no-print mb-2 flex items-center justify-between px-1 text-xs text-muted-foreground">
            <span>
              {title} side · Page {pageIdx + 1} / {pages.length}
            </span>
          </div>
          <div className="id-card-grid">
            {pageCards.map((c) =>
              htmlTpl ? (
                <div key={`${c.studentId}-${side}`} className="id-card-cell">
                  <IdCardHtmlRenderer
                    template={htmlTpl}
                    card={c as HtmlRenderData}
                    schoolLogo={schoolLogo || null}
                    scale={1}
                    side={side}
                  />
                </div>
              ) : elementTpl ? (
                <div key={`${c.studentId}-${side}`} className="id-card-cell">
                  <IdCardRenderer
                    template={elementTpl}
                    card={c}
                    schoolLogo={schoolLogo || undefined}
                    scale={1}
                    side={side}
                  />
                </div>
              ) : null,
            )}
          </div>
        </div>
      ))}
    </>
  )
}
