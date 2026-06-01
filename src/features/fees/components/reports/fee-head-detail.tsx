'use client'

import React, { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ReceiptText, Users, AlertTriangle, TrendingUp, Layers } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend,
} from 'recharts'
import { KpiCard } from './kpi-card'
import { formatCurrency } from '../audit-field-list'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  headName: string | null
  academicYear?: string
  startDate?: string
  endDate?: string
}

interface ClassRow {
  classId: string
  className: string
  billed: number
  collected: number
  outstanding: number
  studentCount: number
  defaulterCount: number
  collectionRate: number
}

interface Defaulter {
  studentId: string
  name: string
  admissionNumber: string | null
  rollNumber: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  billed: number
  collected: number
  outstanding: number
  oldestDueDate: string | null
}

interface DetailResponse {
  headName: string
  kpis: {
    billed: number
    collected: number
    outstanding: number
    refunded: number
    collectionRate: number
    studentsBilled: number
    defaulterCount: number
  }
  byClass: ClassRow[]
  topDefaulters: Defaulter[]
  monthlySeries: Array<{ month: string; billed: number; collected: number }>
  defaultersTruncated: boolean
}

export function FeeHeadDetail({ open, onOpenChange, headName, academicYear, startDate, endDate }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !headName) return
    let alive = true
    setLoading(true)
    setError(null)
    setData(null)

    const params = new URLSearchParams()
    params.set('headName', headName)
    if (academicYear) params.set('academicYear', academicYear)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    fetch(`/api/school/fees/reports/fee-head?${params}`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then(d => { if (alive) setData(d) })
      .catch(e => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })

    return () => { alive = false }
  }, [open, headName, academicYear, startDate, endDate])

  const k = data?.kpis

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b sticky top-0 bg-white z-10">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-4 text-emerald-600" />
            {headName || 'Fee Head'}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Per-class split, top defaulters, and monthly trend for this head
          </SheetDescription>
        </SheetHeader>

        <div className="p-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Billed" value={loading || !k ? '—' : formatCurrency(k.billed)} icon={ReceiptText} tone="muted" loading={loading} />
            <KpiCard label="Collected" value={loading || !k ? '—' : formatCurrency(k.collected)} tone="success" loading={loading} />
            <KpiCard label="Outstanding" value={loading || !k ? '—' : formatCurrency(k.outstanding)} icon={AlertTriangle} tone="warning" loading={loading} />
            <KpiCard
              label="Collection Rate"
              value={loading || !k ? '—' : `${k.collectionRate}%`}
              hint={k ? `${k.defaulterCount} defaulter${k.defaulterCount === 1 ? '' : 's'} / ${k.studentsBilled} billed` : undefined}
              tone="primary"
              loading={loading}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Monthly trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="size-4 text-blue-600" />
                Monthly Trend
              </CardTitle>
              <p className="text-xs text-muted-foreground">Billed vs collected across the academic year</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : data && data.monthlySeries.some(m => m.billed > 0 || m.collected > 0) ? (
                <ResponsiveContainer width="100%" height={200}>
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
                    <RTooltip content={<MonthlyTooltip />} cursor={{ fill: '#f8fafc' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="billed" name="Billed" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                  No activity for this head in the academic year
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Class */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Layers className="size-4 text-blue-600" />
                By Class
              </CardTitle>
              <p className="text-xs text-muted-foreground">Classes that have any activity for this head</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="text-xs">Class</TableHead>
                      <TableHead className="text-xs text-right">Defaulters</TableHead>
                      <TableHead className="text-xs text-right">Billed</TableHead>
                      <TableHead className="text-xs text-right">Collected</TableHead>
                      <TableHead className="text-xs text-right">Outstanding</TableHead>
                      <TableHead className="text-xs text-right w-28">Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                      ))
                    ) : data && data.byClass.length > 0 ? (
                      data.byClass.map(c => (
                        <TableRow key={c.classId} className="text-sm">
                          <TableCell className="py-2 font-medium">{c.className}</TableCell>
                          <TableCell className="py-2 text-right tabular-nums">
                            {c.defaulterCount > 0
                              ? <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-200 bg-amber-50">{c.defaulterCount}/{c.studentCount}</Badge>
                              : <span className="text-xs text-gray-400">0</span>}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums">{formatCurrency(c.billed)}</TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-emerald-700">{formatCurrency(c.collected)}</TableCell>
                          <TableCell className={cn('py-2 text-right tabular-nums', c.outstanding > 0 ? 'text-amber-700 font-medium' : 'text-gray-400')}>
                            {c.outstanding > 0 ? formatCurrency(c.outstanding) : '—'}
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs tabular-nums font-medium">{c.collectionRate.toFixed(0)}%</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                          No class-level activity for this head
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Top Defaulters */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="size-4 text-amber-600" />
                Top Defaulters
                {data?.defaultersTruncated && (
                  <Badge variant="secondary" className="text-[10px] ml-1">showing top {data.topDefaulters.length}</Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Students with open balance against this head, largest first</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50">
                      <TableHead className="text-xs">Student</TableHead>
                      <TableHead className="text-xs">Class</TableHead>
                      <TableHead className="text-xs text-right">Outstanding</TableHead>
                      <TableHead className="text-xs">Oldest Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                      ))
                    ) : data && data.topDefaulters.length > 0 ? (
                      data.topDefaulters.map(d => (
                        <TableRow key={d.studentId} className="text-sm">
                          <TableCell className="py-2">
                            <div className="font-medium leading-tight">{d.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {d.admissionNumber || '—'}
                              {d.rollNumber ? ` · Roll ${d.rollNumber}` : ''}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {d.class?.name || '—'}
                            {d.section?.name ? ` · ${d.section.name}` : ''}
                          </TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-amber-700 font-medium">
                            {formatCurrency(d.outstanding)}
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {d.oldestDueDate ? new Date(d.oldestDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">
                          No defaulters — this head is fully collected
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MonthlyTooltip({ active, payload, label }: any) {
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
            {variance > 0 ? `${formatCurrency(variance)} unpaid` : `${formatCurrency(-variance)} pre-paid`}
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

function formatCompact(v: number): string {
  if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`
  return v.toString()
}
