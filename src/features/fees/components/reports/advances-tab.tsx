'use client'

import React, { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Wallet, Download, Search } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { KpiCard } from './kpi-card'
import { exportCsv } from '@/lib/csv-export'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { ReportCard, ReportFilterField, ReportFilters, reportTableHeaderRowClass } from './report-ui'

interface ClassOption { id: string; name: string }

interface AdvanceRow {
  studentId: string
  name: string
  admissionNumber: string | null
  rollNumber: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  advance: number
  lastPaymentDate: string | null
}

interface AdvanceData {
  generatedAt: string
  rows: AdvanceRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  totals: { studentCount: number; advance: number }
}

interface AdvancesTabProps {
  academicYear?: string
  classes: ClassOption[]
  onOpenStudent?: (id: string) => void
}

export function AdvancesTab({ academicYear, classes, onOpenStudent }: AdvancesTabProps) {
  const { toast } = useToast()
  const [data, setData] = useState<AdvanceData | null>(null)
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

  useEffect(() => { setPage(1) }, [classId, debounced, academicYear])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (academicYear) params.set('academicYear', academicYear)
      if (classId !== 'all') params.set('classId', classId)
      if (debounced) params.set('search', debounced)
      params.set('page', String(page))
      try {
        const res = await fetch(`/api/school/fees/reports/advances?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load advances')
        const next = await res.json()
        if (alive) setData(next)
      } catch (e) {
        if (alive) { setError(e instanceof Error ? e.message : 'Failed to load advances'); setData(null) }
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [academicYear, classId, debounced, page])

  const handleExport = async () => {
    const base = new URLSearchParams()
    if (academicYear) base.set('academicYear', academicYear)
    if (classId !== 'all') base.set('classId', classId)
    if (debounced) base.set('search', debounced)
    base.set('limit', '200')
    const all: AdvanceRow[] = []
    let totals = { advance: 0, studentCount: 0 }
    let pageNum = 1
    let totalPages = 1
    do {
      base.set('page', String(pageNum))
      const res = await fetch(`/api/school/fees/reports/advances?${base}`, { credentials: 'include' })
      if (!res.ok) break
      const full: AdvanceData = await res.json()
      all.push(...full.rows)
      totals = full.totals
      totalPages = full.pagination.totalPages
      pageNum += 1
    } while (pageNum <= totalPages)

    const headers = ['Student', 'Admission #', 'Class', 'Section', 'Advance Balance', 'Last Payment']
    const rows = all.map(r => [
      r.name, r.admissionNumber || '', r.class?.name || '', r.section?.name || '', r.advance,
      r.lastPaymentDate ? new Date(r.lastPaymentDate).toLocaleDateString('en-IN') : '',
    ])
    exportCsv('advance-balances', headers, rows, [['Advance (Prepaid) Balance Report'], [`Total: ${totals.advance}`, `Students: ${totals.studentCount}`]])
    toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
  }

  return (
    <div className="space-y-4">
      <ReportFilters
        actions={(
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.rows.length === 0} className="gap-1.5">
            <Download className="size-3.5" /> CSV
          </Button>
        )}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard label="Total Advance Held" value={loading ? '—' : formatCurrency(data?.totals.advance ?? 0)} hint="Prepaid credit not yet applied to dues" icon={Wallet} tone="primary" loading={loading} />
        <KpiCard label="Students with Advance" value={loading ? '—' : String(data?.totals.studentCount ?? 0)} tone="muted" loading={loading} />
      </div>

      <ReportCard
        title="Advance (Prepaid) Balances"
        icon={Wallet}
        iconClassName="text-blue-600"
        description="Money received but not yet applied to any due. Apply it from Collect Fee > Apply Advance."
      >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={reportTableHeaderRowClass}>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs">Last Payment</TableHead>
                  <TableHead className="text-xs text-right">Advance Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={4}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                  ))
                ) : error ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-red-600 py-10">{error}</TableCell></TableRow>
                ) : data && data.rows.length > 0 ? (
                  data.rows.map((r) => (
                    <TableRow
                      key={r.studentId}
                      className={cn('text-sm', onOpenStudent && 'cursor-pointer hover:bg-primary/5')}
                      onClick={onOpenStudent ? () => onOpenStudent(r.studentId) : undefined}
                    >
                      <TableCell className="py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.admissionNumber}</div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">{r.class?.name}{r.section?.name ? ` · ${r.section.name}` : ''}</TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">{r.lastPaymentDate ? new Date(r.lastPaymentDate).toLocaleDateString('en-IN') : '—'}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums font-semibold text-blue-700">{formatCurrency(r.advance)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-10">No advance balances</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-xs text-muted-foreground">Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} students</span>
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
