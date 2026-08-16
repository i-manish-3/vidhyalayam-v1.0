'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Banknote, Download, Printer, CalendarDays, Store } from 'lucide-react'
import { formatCurrency } from '../audit-field-list'
import { KpiCard } from './kpi-card'
import { exportCsv } from '@/lib/csv-export'
import { useToast } from '@/hooks/use-toast'
import { ReportCard, ReportFilterField, ReportFilters, reportTableHeaderRowClass } from './report-ui'

interface ClassOption { id: string; name: string }

interface RegisterRow {
  receiptNumber: string | null
  time: string
  mode: string
  source: 'fees' | 'store'
  amount: number
  unapplied: number
  reference: string | null
  student: {
    id: string
    name: string
    admissionNumber: string | null
    rollNumber: string | null
    className: string | null
    sectionName: string | null
  }
  heads: Array<{ name: string; amount: number }>
}

interface RegisterData {
  generatedAt: string
  date: string
  timezone: string
  rows: RegisterRow[]
  modeTotals: Array<{ mode: string; amount: number; count: number; fees: number; store: number }>
  grandTotal: number
  feesTotal: number
  storeTotal: number
  receiptCount: number
}

interface DailyRegisterTabProps {
  classes: ClassOption[]
}

function todayLocalISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function DailyRegisterTab({ classes }: DailyRegisterTabProps) {
  const { toast } = useToast()
  const [date, setDate] = useState<string>(todayLocalISODate())
  const [mode, setMode] = useState<string>('all')
  const [source, setSource] = useState<string>('all')
  const [classId, setClassId] = useState<string>('all')
  const [data, setData] = useState<RegisterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (date) params.set('date', new Date(date).toISOString())
      if (mode !== 'all') params.set('mode', mode)
      if (source !== 'all') params.set('source', source)
      if (classId !== 'all') params.set('classId', classId)
      try {
        const res = await fetch(`/api/school/fees/reports/daily-register?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error('Failed to load register')
        const next = await res.json()
        if (alive) setData(next)
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Failed to load register')
          setData(null)
        }
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [date, mode, source, classId])

  const dateLabel = useMemo(
    () => new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    [date],
  )

  const handleExport = () => {
    if (!data) return
    const headers = ['Time', 'Receipt #', 'Student', 'Admission #', 'Class', 'Section', 'Source', 'Mode', 'Fee Heads', 'Amount', 'Reference']
    const rows = data.rows.map(r => [
      new Date(r.time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
      r.receiptNumber || '',
      r.student.name,
      r.student.admissionNumber || '',
      r.student.className || '',
      r.student.sectionName || '',
      r.source === 'store' ? 'Store' : 'Fees',
      r.mode,
      r.heads.map(h => `${h.name}: ${h.amount}`).join(' | '),
      r.amount,
      r.reference || '',
    ])
    const preamble: string[][] = [
      ['Daily Collection Register'],
      [`Date: ${dateLabel}`],
      [`Total: ${data.grandTotal}`, `Fees: ${data.feesTotal}`, `Store: ${data.storeTotal}`, `Receipts: ${data.receiptCount}`],
      ...data.modeTotals.map(m => [`${m.mode}`, `${m.amount}`, `Fees ${m.fees}`, `Store ${m.store}`, `${m.count} receipts`]),
    ]
    exportCsv(`daily-collection-${date}`, headers, rows, preamble)
    toast({ title: 'Export started', description: 'The CSV download should begin shortly.' })
  }

  const handlePrint = () => {
    const params = new URLSearchParams()
    params.set('date', date)
    if (mode !== 'all') params.set('mode', mode)
    if (source !== 'all') params.set('source', source)
    if (classId !== 'all') params.set('classId', classId)
    window.open(`/print/daily-collection?${params}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <ReportFilters
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.rows.length === 0} className="gap-1.5">
              <Download className="size-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data || data.rows.length === 0} className="gap-1.5">
              <Printer className="size-3.5" /> Print
            </Button>
          </>
        )}
      >
        <ReportFilterField label="Date">
          <div className="relative">
            <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input type="date" value={date} max={todayLocalISODate()} onChange={(e) => setDate(e.target.value)} className="h-9 w-full pl-7" />
          </div>
        </ReportFilterField>
        <ReportFilterField label="Source">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Fees + Store</SelectItem>
              <SelectItem value="fees">Fees only</SelectItem>
              <SelectItem value="store">Store only</SelectItem>
            </SelectContent>
          </Select>
        </ReportFilterField>
        <ReportFilterField label="Mode">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {['CASH', 'UPI', 'CHEQUE', 'ONLINE', 'CARD', 'NEFT', 'RTGS', 'ADJUSTMENT'].map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ReportFilterField>
        <ReportFilterField label="Class">
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </ReportFilterField>
      </ReportFilters>

      {/* Split 1 — by what was paid for (source) */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          By source — what the money was for
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard label="Total Collected" value={loading ? '—' : formatCurrency(data?.grandTotal ?? 0)} hint={data ? `${data.receiptCount} receipts` : undefined} icon={Banknote} tone="success" loading={loading} />
          <KpiCard label="Fees Collection" value={loading ? '—' : formatCurrency(data?.feesTotal ?? 0)} hint="Tuition, transport, hostel" tone="primary" loading={loading} />
          <KpiCard label="Store Collection" value={loading ? '—' : formatCurrency(data?.storeTotal ?? 0)} hint="Inventory / shop sales" icon={Store} tone="muted" loading={loading} />
        </div>
      </div>

      {/* Split 2 — by how it was paid (mode) */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          By payment mode — how it came in
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <KpiCard key={i} label="" value="—" loading tone="muted" />)
          ) : (data?.modeTotals ?? []).length > 0 ? (
            data!.modeTotals.map(m => (
              <KpiCard key={m.mode} label={m.mode} value={formatCurrency(m.amount)} hint={`${m.count} ${m.count === 1 ? 'receipt' : 'receipts'}`} tone={m.mode === 'CASH' ? 'success' : 'muted'} loading={false} />
            ))
          ) : (
            <div className="col-span-full text-sm text-muted-foreground">No collections this day</div>
          )}
        </div>
      </div>

      {/* Register table */}
      <ReportCard
        title={`Collection Register - ${dateLabel}`}
        icon={Banknote}
        iconClassName="text-emerald-600"
        description="Every receipt collected on this day. &quot;Adjustment&quot; = advance applied to dues."
      >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className={reportTableHeaderRowClass}>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Receipt #</TableHead>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Class</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Fee Heads</TableHead>
                  <TableHead className="text-xs">Mode</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-7 w-full" /></TableCell></TableRow>
                  ))
                ) : error ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-red-600 py-10">{error}</TableCell></TableRow>
                ) : data && data.rows.length > 0 ? (
                  data.rows.map((r, i) => (
                    <TableRow key={`${r.receiptNumber}-${i}`} className="text-sm">
                      <TableCell className="py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(r.time).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-xs">{r.receiptNumber || '—'}</TableCell>
                      <TableCell className="py-2">
                        <div className="font-medium">{r.student.name}</div>
                        <div className="text-xs text-muted-foreground">{r.student.admissionNumber}</div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {r.student.className}{r.student.sectionName ? ` · ${r.student.sectionName}` : ''}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant={r.source === 'store' ? 'outline' : 'secondary'} className="text-[10px]">
                          {r.source === 'store' ? 'Store' : 'Fees'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        {r.heads.length > 0
                          ? r.heads.map(h => `${h.name} (${formatCurrency(h.amount)})`).join(', ')
                          : <span className="text-muted-foreground">Advance / unapplied</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="secondary" className="text-[10px]">{r.mode}</Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums font-semibold">{formatCurrency(r.amount)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-10">No collections recorded on this day</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
      </ReportCard>
    </div>
  )
}
