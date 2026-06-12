'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Layers, ReceiptText, TrendingDown, Grid3x3, ChevronRight } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { KpiCard } from './kpi-card'
import { cn } from '@/lib/utils'
import { FeeHeadDetail } from './fee-head-detail'

interface ClassRow {
  classId: string
  className: string
  billed: number
  collected: number
  outstanding: number
  refunded: number
  studentCount: number
  collectionRate: number
}

interface HeadRow {
  feeHeadName: string
  billed: number
  collected: number
  outstanding: number
  collectionRate: number
}

interface ServiceRow {
  service: 'fees' | 'transport' | 'hostel'
  label: string
  billed: number
  collected: number
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
  byClass: ClassRow[]
  byService: ServiceRow[]
  byFeeHead: HeadRow[]
  matrix: MatrixData
  totals: { billed: number; collected: number; outstanding: number; refunded: number }
}

type MatrixMetric = 'billed' | 'collected' | 'outstanding'

interface AggregationsTabProps {
  academicYear?: string
  startDate?: string
  endDate?: string
}

export function AggregationsTab({ academicYear, startDate, endDate }: AggregationsTabProps) {
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [matrixMetric, setMatrixMetric] = useState<MatrixMetric>('outstanding')
  const [detailHead, setDetailHead] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    const loadAggregations = async () => {
      setLoading(true)
      const params = new URLSearchParams()
      if (academicYear) params.set('academicYear', academicYear)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)

      try {
        const response = await fetch(`/api/school/fees/reports/aggregations?${params}`, { credentials: 'include' })
        const nextData = await response.json()
        if (alive) setData(nextData)
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadAggregations()

    return () => { alive = false }
  }, [academicYear, startDate, endDate])

  const t = data?.totals

  return (
    <div className="space-y-4">
      {/* Totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Billed" value={loading ? '—' : formatCurrency(t!.billed)} tone="muted" icon={ReceiptText} loading={loading} />
        <KpiCard label="Total Collected" value={loading ? '—' : formatCurrency(t!.collected)} tone="success" loading={loading} />
        <KpiCard label="Total Outstanding" value={loading ? '—' : formatCurrency(t!.outstanding)} tone="warning" loading={loading} />
        <KpiCard label="Total Refunded" value={loading ? '—' : formatCurrency(t!.refunded)} tone="danger" icon={TrendingDown} loading={loading} />
      </div>

      {/* By Service */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ReceiptText className="size-4 text-indigo-600" />
            By Service
          </CardTitle>
          <p className="text-xs text-muted-foreground">Academic, transport, and hostel fees shown separately</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
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
        </CardContent>
      </Card>

      {/* By Class */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Layers className="size-4 text-blue-600" />
            By Class
          </CardTitle>
          <p className="text-xs text-muted-foreground">Billing and collection performance across classes</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
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
        </CardContent>
      </Card>

      {/* By Fee Head */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ReceiptText className="size-4 text-emerald-600" />
            By Fee Head
          </CardTitle>
          <p className="text-xs text-muted-foreground">Which fee categories are driving collections (and dues) — click a row for deep-dive</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
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
                      className="text-sm cursor-pointer group hover:bg-emerald-50/40"
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
        </CardContent>
      </Card>

      {/* Class × Head pivot */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Grid3x3 className="size-4 text-violet-600" />
                Class × Fee Head
              </CardTitle>
              <p className="text-xs text-muted-foreground">Pivot of {matrixMetric} across classes and heads — scroll horizontally for more heads</p>
            </div>
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3"><Skeleton className="h-32 w-full" /></div>
          ) : data && data.matrix.classes.length > 0 && data.matrix.heads.length > 0 ? (
            <MatrixTable matrix={data.matrix} metric={matrixMetric} onHeadClick={setDetailHead} />
          ) : (
            <div className="text-center text-sm text-muted-foreground py-10">
              Not enough data for a pivot yet
            </div>
          )}
        </CardContent>
      </Card>

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
          <TableRow className="bg-gray-50 hover:bg-gray-50">
            <TableHead className="text-xs sticky left-0 bg-gray-50 z-10 min-w-[140px]">Class</TableHead>
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
          <TableRow className="bg-gray-50 hover:bg-gray-50 font-semibold">
            <TableCell className="py-2 text-xs uppercase tracking-wide sticky left-0 bg-gray-50 z-10">Total</TableCell>
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
