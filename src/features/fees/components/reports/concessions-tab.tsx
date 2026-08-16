'use client'

import React, { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { BadgePercent, Download, Search } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { KpiCard } from './kpi-card'
import { exportCsv } from '@/lib/csv-export'
import { useToast } from '@/hooks/use-toast'
import { ReportCard, ReportFilterField, ReportFilters, reportTableHeaderRowClass } from './report-ui'

interface ClassOption { id: string; name: string }

interface WaiverRow {
  date: string
  amount: number
  feeHeadName: string
  installmentName: string | null
  reason: string | null
  grantedBy: string | null
  student: { id: string; name: string; admissionNumber: string | null; rollNumber: string | null; className: string | null; sectionName: string | null }
}

interface WaiverData {
  generatedAt: string
  rows: WaiverRow[]
  byHead: Array<{ feeHeadName: string; amount: number }>
  pagination: { page: number; limit: number; total: number; totalPages: number }
  totals: { count: number; amount: number }
}

interface ConcessionsTabProps {
  academicYear?: string
  startDate?: string
  endDate?: string
  classes: ClassOption[]
}

export function ConcessionsTab({ academicYear, startDate, endDate, classes }: ConcessionsTabProps) {
  const { toast } = useToast()
  const [data, setData] = useState<WaiverData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [classId, setClassId] = useState('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [classId, debounced, academicYear, startDate, endDate])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (academicYear) params.set('academicYear', academicYear)
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (classId !== 'all') params.set('classId', classId)
      if (debounced) params.set('search', debounced)
      params.set('page', String(page))
      try {
        const res = await fetch(`/api/school/fees/reports/waivers?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load concessions')
        const next = await res.json()
        if (alive) setData(next)
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : 'Failed to load concessions'); setData(null) }
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [academicYear, startDate, endDate, classId, debounced, page])

  const handleExport = async () => {
    const base = new URLSearchParams()
    if (academicYear) base.set('academicYear', academicYear)
    if (startDate) base.set('startDate', startDate)
    if (endDate) base.set('endDate', endDate)
    if (classId !== 'all') base.set('classId', classId)
    if (debounced) base.set('search', debounced)
    base.set('limit', '200')
    const all: WaiverRow[] = []
    let totals = { amount: 0, count: 0 }
    let pageNum = 1
    let totalPages = 1
    do {
      base.set('page', String(pageNum))
      const res = await fetch(`/api/school/fees/reports/waivers?${base}`, { credentials: 'include' })
      if (!res.ok) break
      const full: WaiverData = await res.json()
      all.push(...full.rows)
      totals = full.totals
      totalPages = full.pagination.totalPages
      pageNum += 1
    } while (pageNum <= totalPages)

    const headers = ['Date', 'Student', 'Admission #', 'Class', 'Section', 'Fee Head', 'Installment', 'Amount', 'Reason', 'Granted By']
    const rows = all.map(r => [
      new Date(r.date).toLocaleDateString('en-IN'),
      r.student.name, r.student.admissionNumber || '', r.student.className || '', r.student.sectionName || '',
      r.feeHeadName, r.installmentName || '', r.amount, r.reason || '', r.grantedBy || '',
    ])
    exportCsv(`concession-register`, headers, rows, [['Concession / Waiver Register'], [`Total: ${totals.amount}`, `Count: ${totals.count}`]])
    toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
  }

  return (
    <div className="space-y-4">
      <ReportFilters
        actions={(
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.totals.count === 0} className="gap-1.5">
            <Download className="size-3.5" /> CSV
          </Button>
        )}
        className="lg:items-end"
      >
        <ReportFilterField label="Class">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </ReportFilterField>
        <ReportFilterField label="Search" className="sm:col-span-2 lg:col-span-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or admission no." className="h-9 pl-7" />
          </div>
        </ReportFilterField>
      </ReportFilters>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Waived" value={loading ? '—' : formatCurrency(data?.totals.amount ?? 0)} icon={BadgePercent} tone="primary" loading={loading} />
        <KpiCard label="Concessions" value={loading ? '—' : String(data?.totals.count ?? 0)} hint="grants in range" tone="muted" loading={loading} />
        {(data?.byHead ?? []).slice(0, 2).map(h => (
          <KpiCard key={h.feeHeadName} label={h.feeHeadName} value={loading ? '—' : formatCurrency(h.amount)} tone="muted" loading={loading} />
        ))}
      </div>

      <ReportCard
        title="Concession / Waiver Register"
        icon={BadgePercent}
        iconClassName="text-violet-600"
        description="Every discount, concession and scholarship applied to a due in this range."
      >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={reportTableHeaderRowClass}>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs">Fee Head</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                  ))
                ) : error ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-red-600 py-10">{error}</TableCell></TableRow>
                ) : data && data.rows.length > 0 ? (
                  data.rows.map((r, i) => (
                    <TableRow key={i} className="text-sm">
                      <TableCell className="py-2 whitespace-nowrap text-muted-foreground">{new Date(r.date).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell className="py-2">
                        <div className="font-medium">{r.student.name}</div>
                        <div className="text-xs text-muted-foreground">{r.student.admissionNumber}</div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">{r.student.className}{r.student.sectionName ? ` · ${r.student.sectionName}` : ''}</TableCell>
                      <TableCell className="py-2">
                        {r.feeHeadName}
                        {r.installmentName ? <Badge variant="secondary" className="ml-1 text-[10px]">{r.installmentName}</Badge> : null}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">{r.reason || '—'}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums font-semibold text-violet-700">{formatCurrency(r.amount)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">No concessions granted in this range</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-xs text-muted-foreground">Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} grants</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
      </ReportCard>
    </div>
  )
}
