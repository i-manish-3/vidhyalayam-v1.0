'use client'

import React, { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Banknote, Wallet, ArrowUpRight, AlertTriangle, RotateCcw, Users, ReceiptText, TrendingUp, BadgePercent,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend,
  XAxis, YAxis, Tooltip as RTooltip, CartesianGrid,
} from 'recharts'
import { KpiCard } from './kpi-card'
import { ReconciliationBar } from './reconciliation-bar'
import { formatCurrency } from '../audit-field-list'
import { cn } from '@/lib/utils'
import { ReportCard, reportTableHeaderRowClass } from './report-ui'

interface SummaryData {
  generatedAt: string
  range: { startDate: string; endDate: string }
  kpis: {
    todayCollected: number
    todayReceiptCount: number
    monthCollected: number
    yearCollected: number
    outstanding: number
    overdue: number
    totalBilled: number
    totalCollected: number
    waived: number
    refundsIssued: number
    refundCount: number
    collectionRate: number
    activeStudents: number
  }
  dailySeries: Array<{ date: string; amount: number; count: number }>
  monthlySeries: Array<{ month: string; billed: number; collected: number }>
  serviceBreakdown: Array<{
    service: 'fees' | 'transport' | 'hostel'
    label: string
    billed: number
    collected: number
    outstanding: number
    collectionRate: number
  }>
  paymentModeBreakdown: Array<{ method: string; amount: number; count: number }>
}

interface SummaryTabProps {
  startDate?: string
  endDate?: string
  academicYear?: string
}

export function SummaryTab({ startDate, endDate, academicYear }: SummaryTabProps) {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    const loadSummary = async () => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (academicYear) params.set('academicYear', academicYear)

      try {
        const response = await fetch(`/api/school/fees/reports/summary?${params}`, { credentials: 'include' })
        if (!response.ok) throw new Error('Failed to load summary')
        const nextData = await response.json()
        if (alive) setData(nextData)
      } catch (error) {
        if (alive) {
          setError(error instanceof Error ? error.message : 'Failed to load summary')
          setData(null)
        }
      } finally {
        if (alive) setLoading(false)
      }
    }

    void loadSummary()

    return () => { alive = false }
  }, [startDate, endDate, academicYear])

  const k = data?.kpis
  if (!loading && !data) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error || 'Could not load fee summary'}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ReconciliationBar
        billed={k?.totalBilled ?? 0}
        collected={k?.totalCollected ?? 0}
        waived={k?.waived ?? 0}
        outstanding={k?.outstanding ?? 0}
        refunded={k?.refundsIssued ?? 0}
        generatedAt={data?.generatedAt}
        loading={loading}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Today's Collection"
          value={loading ? '-' : formatCurrency(k!.todayCollected)}
          hint={k ? `${k.todayReceiptCount} ${k.todayReceiptCount === 1 ? 'receipt' : 'receipts'}` : undefined}
          icon={Banknote}
          tone="success"
          loading={loading}
        />
        <KpiCard
          label="This Month"
          value={loading ? '-' : formatCurrency(k!.monthCollected)}
          hint="Month-to-date collection"
          icon={TrendingUp}
          tone="primary"
          loading={loading}
        />
        <KpiCard
          label="Outstanding"
          value={loading ? '-' : formatCurrency(k!.outstanding)}
          hint={k && k.overdue > 0 ? (
            <span className="font-medium text-red-600">
              {formatCurrency(k.overdue)} past due date
            </span>
          ) : 'Nothing past due date yet'}
          icon={AlertTriangle}
          tone="warning"
          loading={loading}
        />
        <KpiCard
          label="Collection Rate"
          value={loading ? '-' : `${k!.collectionRate}%`}
          hint={k ? `${formatCurrency(k.yearCollected)} of ${formatCurrency(k.totalBilled)}` : undefined}
          icon={ArrowUpRight}
          tone="primary"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Year Collection"
          value={loading ? '-' : formatCurrency(k!.yearCollected)}
          hint="Received since April 1st"
          icon={Wallet}
          tone="muted"
          loading={loading}
        />
        <KpiCard
          label="Waived"
          value={loading ? '-' : formatCurrency(k!.waived)}
          hint="Discounts & concessions"
          icon={BadgePercent}
          tone="muted"
          loading={loading}
        />
        <KpiCard
          label="Refunds Issued"
          value={loading ? '-' : formatCurrency(k!.refundsIssued)}
          hint={k ? `${k.refundCount} cash ${k.refundCount === 1 ? 'refund' : 'refunds'}` : undefined}
          icon={RotateCcw}
          tone="danger"
          loading={loading}
        />
        <KpiCard
          label="Total Billed"
          value={loading ? '-' : formatCurrency(k!.totalBilled)}
          hint="All-time demand"
          icon={ReceiptText}
          tone="muted"
          loading={loading}
        />
        <KpiCard
          label="Active Students"
          value={loading ? '-' : k!.activeStudents.toLocaleString('en-IN')}
          hint="Currently enrolled"
          icon={Users}
          tone="muted"
          loading={loading}
        />
      </div>

      {/* Service breakdown */}
      <ReportCard
        title="By Service"
        icon={ReceiptText}
        iconClassName="text-indigo-600"
        description="Academic year billing split across academic, transport, and hostel fees"
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
                ) : data && (data.serviceBreakdown || []).length > 0 ? (
                  data.serviceBreakdown.map(service => (
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
                        <ServiceProgress pct={service.collectionRate} />
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

      {/* Chart + Payment Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Chart — 2/3 width */}
        <ReportCard
          title="Daily Collection Trend"
          icon={TrendingUp}
          iconClassName="text-blue-600"
          description="Receipts collected per day over the selected range"
          contentClassName="p-3"
          className="lg:col-span-2"
        >
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : error ? (
              <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
                Could not load chart
              </div>
            ) : data && data.dailySeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={224}>
                <AreaChart data={data.dailySeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collectGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="date"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b' }}
                    tickFormatter={(v: string) => {
                      const d = new Date(v)
                      return `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748b' }}
                    tickFormatter={(v: number) => formatCompact(v)}
                    width={50}
                  />
                  <RTooltip content={<ChartTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#collectGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
                No collections recorded in this range
              </div>
            )}
        </ReportCard>

        {/* Payment Mode Breakdown */}
        <ReportCard
          title="Payment Modes"
          icon={Wallet}
          iconClassName="text-emerald-600"
          description="How payments came in. Adjustment means advance applied to dues."
          contentClassName="p-3"
        >
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : data && data.paymentModeBreakdown.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  const totalAmt = data.paymentModeBreakdown.reduce((s, p) => s + p.amount, 0)
                  return data.paymentModeBreakdown.map(p => {
                    const pct = totalAmt > 0 ? (p.amount / totalAmt) * 100 : 0
                    const color = MODE_COLORS[p.method] || 'bg-gray-400'
                    return (
                      <div key={p.method}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={cn('size-2.5 rounded-full', color)} />
                            <span className="text-sm font-medium text-gray-700">{p.method}</span>
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {p.count}
                            </Badge>
                          </div>
                          <div className="text-sm font-semibold tabular-nums">
                            {formatCurrency(p.amount)}
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', color)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                No payments in range
              </div>
            )}
        </ReportCard>
      </div>

      {/* Monthly trend (AY-scoped) */}
      <ReportCard
        title="Monthly Trend (Academic Year)"
        icon={TrendingUp}
        iconClassName="text-violet-600"
        description="Billed vs collected each month, independent of the range filter above"
        contentClassName="p-3"
      >
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : data && data.monthlySeries.some(m => m.billed > 0 || m.collected > 0) ? (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={data.monthlySeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="month"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(v: string) => formatMonthLabel(v)}
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748b' }}
                  tickFormatter={(v: number) => formatCompact(v)}
                  width={50}
                />
                <RTooltip content={<MonthlyChartTooltip />} cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="billed" name="Billed" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
              No billing or collections recorded this academic year yet
            </div>
          )}
      </ReportCard>
    </div>
  )
}

function ServiceProgress({ pct }: { pct: number }) {
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

function MonthlyChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const billed = payload.find((p: any) => p.dataKey === 'billed')?.value || 0
  const collected = payload.find((p: any) => p.dataKey === 'collected')?.value || 0
  const variance = billed - collected
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      <div className="font-medium text-gray-700">{formatMonthLabel(label)}</div>
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-slate-400" />
          <span className="text-gray-600">Billed:</span>
          <span className="font-semibold tabular-nums">{formatCurrency(billed)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="text-gray-600">Collected:</span>
          <span className="font-semibold tabular-nums">{formatCurrency(collected)}</span>
        </div>
        {variance !== 0 && (
          <div className="text-[11px] text-muted-foreground pt-0.5 border-t mt-1">
            {variance > 0 ? `${formatCurrency(variance)} pending` : `${formatCurrency(-variance)} ahead`}
          </div>
        )}
      </div>
    </div>
  )
}

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  if (!y || !m) return yyyymm
  const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
  return d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })
}

const MODE_COLORS: Record<string, string> = {
  CASH: 'bg-emerald-500',
  UPI: 'bg-blue-500',
  CHEQUE: 'bg-purple-500',
  ONLINE: 'bg-cyan-500',
  CARD: 'bg-indigo-500',
  BANK: 'bg-violet-500',
  NEFT: 'bg-violet-500',
  RTGS: 'bg-violet-500',
  ADJUSTMENT: 'bg-amber-400',
  UNSPECIFIED: 'bg-gray-400',
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  const d = new Date(label)
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-md text-xs">
      <div className="font-medium text-gray-700">
        {d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-full bg-blue-500" />
        <span className="text-gray-600">Collection:</span>
        <span className="font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
      </div>
      <div className="text-gray-500">
        {p.count} {p.count === 1 ? 'receipt' : 'receipts'}
      </div>
    </div>
  )
}

function formatCompact(v: number): string {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`
  return v.toString()
}
