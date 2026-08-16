'use client'

import React, { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Layers, ReceiptText, Grid3x3, ChevronRight, Download } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { ReconciliationBar } from './reconciliation-bar'
import { cn } from '@/lib/utils'
import { FeeHeadDetail } from './fee-head-detail'
import { exportCsv } from '@/lib/csv-export'
import { useToast } from '@/hooks/use-toast'
import { ReportCard, reportTableHeaderRowClass } from './report-ui'

interface ClassRow {
  classId: string
  className: string
  billed: number
  collected: number
  waived: number
  outstanding: number
  refunded: number
  studentCount: number
  collectionRate: number
}

interface HeadRow {
  feeHeadName: string
  billed: number
  collected: number
  waived: number
  outstanding: number
  collectionRate: number
}

interface ServiceRow {
  service: 'fees' | 'transport' | 'hostel'
  label: string
  billed: number
  collected: number
  waived: number
  outstanding: number
  collectionRate: number
}

interface MatrixCell {
  billed: number
  collected: number
  outstanding: number
}

interface MatrixData {
  classes: Array<{ classId: string; className: string }>
  heads: string[]
  cells: Record<string, Record<string, MatrixCell>>
}

interface Response {
  generatedAt?: string
  collectionWindowed?: boolean
  byClass: ClassRow[]
  byService: ServiceRow[]
  byFeeHead: HeadRow[]
  matrix: MatrixData
  totals: { billed: number; collected: number; waived: number; outstanding: number; refunded: number }
}

type MatrixMetric = 'billed' | 'collected' | 'outstanding'

interface AggregationsTabProps {
  academicYear?: string
  startDate?: string
  endDate?: string
}

export function AggregationsTab({ academicYear, startDate, endDate }: AggregationsTabProps) {
  const { toast } = useToast()
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [matrixMetric, setMatrixMetric] = useState<MatrixMetric>('outstanding')
  const [detailHead, setDetailHead] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    const loadAggregations = async () => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (academicYear) params.set('academicYear', academicYear)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      try {
        const response = await fetch(`/api/school/fees/reports/aggregations?${params}`, { credentials: 'include' })
        if (!response.ok) throw new Error('Failed to load aggregations')
        const nextData = await response.json()
        if (alive) setData(nextData)
      } catch (error) {
        if (alive) {
          setData(null)
          setError(error instanceof Error ? error.message : 'Failed to load aggregations')
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadAggregations()

    return () => { alive = false }
  }, [academicYear, startDate, endDate])

  const t = data?.totals

  const exportByClass = () => {
    if (!data) return
    const headers = ['Class', 'Students', 'Billed', 'Collected', 'Waived', 'Outstanding', 'Refunded', 'Collection Rate %']
    const rows = data.byClass.map(c => [c.className, c.studentCount, c.billed, c.collected, c.waived, c.outstanding, c.refunded, c.collectionRate])
    exportCsv('fees-by-class', headers, rows, [['Fees by Class'], [`Billed: ${t?.billed ?? 0}`, `Collected: ${t?.collected ?? 0}`, `Outstanding: ${t?.outstanding ?? 0}`]])
    toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
  }
  const exportByHead = () => {
    if (!data) return
    const headers = ['Fee Head', 'Billed', 'Collected', 'Waived', 'Outstanding', 'Collection Rate %']
    const rows = data.byFeeHead.map(h => [h.feeHeadName, h.billed, h.collected, h.waived, h.outstanding, h.collectionRate])
    exportCsv('fees-by-head', headers, rows, [['Fees by Fee Head']])
    toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
  }

  if (!loading && !data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error || 'Could not load fee aggregations'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Reconciliation identity — totals always add up */}
      <ReconciliationBar
        billed={t?.billed ?? 0}
        collected={t?.collected ?? 0}
        waived={t?.waived ?? 0}
        outstanding={t?.outstanding ?? 0}
        refunded={t?.refunded ?? 0}
        generatedAt={data?.generatedAt}
        collectionWindowed={data?.collectionWindowed}
        loading={loading}
      />

      {/* Export */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportByClass} disabled={!data || data.byClass.length === 0} className="gap-1.5">
          <Download className="size-3.5" /> Class CSV
        </Button>
        <Button variant="outline" size="sm" onClick={exportByHead} disabled={!data || data.byFeeHead.length === 0} className="gap-1.5">
          <Download className="size-3.5" /> Fee Head CSV
        </Button>
      </div>

      {/* By Service */}
      <ReportCard
        title="By Service"
        icon={ReceiptText}
        iconClassName="text-indigo-600"
        description="Academic, transport, and hostel fees shown separately"
      >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={reportTableHeaderRowClass}>
                  <TableHead className="text-xs">Service</TableHead>
                  <TableHead className="text-xs text-right">Billed</TableHead>
                  <TableHead className="text-xs text-right">Collected</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs text-right w-44">Collection Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                  ))
                ) : data && (data.byService || []).length > 0 ? (
                  data.byService.map(service => (
                    <TableRow key={service.service} className="text-sm">
                      <TableCell className="py-2 font-medium">{service.label}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{formatCurrency(service.billed)}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-emerald-700">
                        {formatCurrency(service.collected)}
                      </TableCell>
                      <TableCell className={cn('py-2 text-right tabular-nums', service.outstanding > 0 ? 'text-amber-700 font-medium' : 'text-gray-400')}>
                        {service.outstanding > 0 ? formatCurrency(service.outstanding) : '-'}
                      </TableCell>
                      <TableCell className="py-2">
                        <ProgressBar pct={service.collectionRate} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                      No service-level data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
      </ReportCard>

      {/* By Class */}
      <ReportCard
        title="By Class"
        icon={Layers}
        iconClassName="text-blue-600"
        description="Billing and collection performance across classes"
      >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={reportTableHeaderRowClass}>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs text-right">Students</TableHead>
                  <TableHead className="text-xs text-right">Billed</TableHead>
                  <TableHead className="text-xs text-right">Collected</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs text-right w-44">Collection Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                  ))
                ) : data && data.byClass.length > 0 ? (
                  data.byClass.map(c => (
                    <TableRow key={c.classId} className="text-sm">
                      <TableCell className="py-2 font-medium">{c.className}</TableCell>
                      <TableCell className="py-2 text-right text-xs text-muted-foreground tabular-nums">
                        {c.studentCount}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{formatCurrency(c.billed)}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-emerald-700">
                        {formatCurrency(c.collected)}
                      </TableCell>
                      <TableCell className={cn('py-2 text-right tabular-nums', c.outstanding > 0 ? 'text-amber-700 font-medium' : 'text-gray-400')}>
                        {c.outstanding > 0 ? formatCurrency(c.outstanding) : '—'}
                      </TableCell>
                      <TableCell className="py-2">
                        <ProgressBar pct={c.collectionRate} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                      No class-level data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
      </ReportCard>

      {/* By Fee Head */}
      <ReportCard
        title="By Fee Head"
        icon={ReceiptText}
        iconClassName="text-emerald-600"
        description="Which fee categories are driving collections and dues. Click a row for deep-dive."
      >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={reportTableHeaderRowClass}>
                  <TableHead className="text-xs">Fee Head</TableHead>
                  <TableHead className="text-xs text-right">Billed</TableHead>
                  <TableHead className="text-xs text-right">Collected</TableHead>
                  <TableHead className="text-xs text-right">Outstanding</TableHead>
                  <TableHead className="text-xs text-right w-44">Collection Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                  ))
                ) : data && data.byFeeHead.length > 0 ? (
                  data.byFeeHead.map((h, i) => (
                    <TableRow
                      key={`${h.feeHeadName}-${i}`}
                      className="text-sm cursor-pointer group hover:bg-primary/5"
                      onClick={() => setDetailHead(h.feeHeadName)}
                    >
                      <TableCell className="py-2">
                        <span className="font-medium group-hover:text-emerald-700 inline-flex items-center gap-1">
                          {h.feeHeadName}
                          <ChevronRight className="size-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{formatCurrency(h.billed)}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-emerald-700">
                        {formatCurrency(h.collected)}
                      </TableCell>
                      <TableCell className={cn('py-2 text-right tabular-nums', h.outstanding > 0 ? 'text-amber-700 font-medium' : 'text-gray-400')}>
                        {h.outstanding > 0 ? formatCurrency(h.outstanding) : '—'}
                      </TableCell>
                      <TableCell className="py-2">
                        <ProgressBar pct={h.collectionRate} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                      No fee-head data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
      </ReportCard>

      {/* Class × Head pivot */}
      <ReportCard
        title="Class x Fee Head"
        icon={Grid3x3}
        iconClassName="text-violet-600"
        description={`Pivot of ${matrixMetric} across classes and heads. Scroll horizontally for more heads.`}
        actions={(
            <Select value={matrixMetric} onValueChange={(v) => setMatrixMetric(v as MatrixMetric)}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="billed">Billed</SelectItem>
                <SelectItem value="collected">Collected</SelectItem>
              </SelectContent>
            </Select>
        )}
      >
          {loading ? (
            <div className="p-3"><Skeleton className="h-32 w-full" /></div>
          ) : data && data.matrix.classes.length > 0 && data.matrix.heads.length > 0 ? (
            <MatrixTable matrix={data.matrix} metric={matrixMetric} onHeadClick={setDetailHead} />
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">
              Not enough data for a pivot yet
            </div>
          )}
      </ReportCard>

      <FeeHeadDetail
        open={detailHead !== null}
        onOpenChange={(o) => { if (!o) setDetailHead(null) }}
        headName={detailHead}
        academicYear={academicYear}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  )
}

function MatrixTable({
  matrix, metric, onHeadClick,
}: {
  matrix: MatrixData
  metric: MatrixMetric
  onHeadClick: (head: string) => void
}) {
  // Column totals (per head) and row totals (per class) for the chosen metric.
  // These let the user verify the matrix at a glance without re-aggregating.
  const colTotals: Record<string, number> = {}
  const rowTotals: Record<string, number> = {}
  let grand = 0
  for (const cls of matrix.classes) {
    const row = matrix.cells[cls.classId] || {}
    let rowSum = 0
    for (const head of matrix.heads) {
      const v = row[head]?.[metric] || 0
      colTotals[head] = (colTotals[head] || 0) + v
      rowSum += v
    }
    rowTotals[cls.classId] = rowSum
    grand += rowSum
  }

  // Tone per cell based on metric and value
  const cellTone = (v: number): string => {
    if (v <= 0) return 'text-gray-300'
    if (metric === 'outstanding') return 'text-amber-700 font-medium'
    if (metric === 'collected') return 'text-emerald-700'
    return 'text-gray-700'
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className={reportTableHeaderRowClass}>
            <TableHead className="text-xs sticky left-0 bg-muted z-10 min-w-[140px]">Class</TableHead>
            {matrix.heads.map(h => (
              <TableHead
                key={h}
                className="text-xs text-right whitespace-nowrap cursor-pointer hover:text-emerald-700"
                onClick={() => onHeadClick(h)}
              >
                {h}
              </TableHead>
            ))}
            <TableHead className="text-xs text-right font-semibold whitespace-nowrap">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matrix.classes.map(cls => {
            const row = matrix.cells[cls.classId] || {}
            return (
              <TableRow key={cls.classId} className="text-sm">
                <TableCell className="py-2 font-medium sticky left-0 bg-white z-10">{cls.className}</TableCell>
                {matrix.heads.map(h => {
                  const v = row[h]?.[metric] || 0
                  return (
                    <TableCell key={h} className={cn('py-2 text-right tabular-nums whitespace-nowrap', cellTone(v))}>
                      {v > 0 ? formatCurrency(v) : '—'}
                    </TableCell>
                  )
                })}
                <TableCell className="py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                  {rowTotals[cls.classId] > 0 ? formatCurrency(rowTotals[cls.classId]) : '—'}
                </TableCell>
              </TableRow>
            )
          })}
          <TableRow className="bg-muted/60 hover:bg-muted/60 font-semibold">
            <TableCell className="py-2 text-xs uppercase tracking-wide sticky left-0 bg-muted z-10">Total</TableCell>
            {matrix.heads.map(h => (
              <TableCell key={h} className="py-2 text-right tabular-nums whitespace-nowrap">
                {colTotals[h] > 0 ? formatCurrency(colTotals[h]) : '—'}
              </TableCell>
            ))}
            <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
              {grand > 0 ? formatCurrency(grand) : '—'}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const color =
    clamped >= 90 ? 'bg-emerald-500'
    : clamped >= 75 ? 'bg-blue-500'
    : clamped >= 50 ? 'bg-amber-500'
    : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums font-medium w-12 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}
