'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ReceiptText,
  Search,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  ListFilter,
} from 'lucide-react'
import {
  PAYMENT_METHOD_LABELS,
  receiptMoney,
  sortPeriods,
  buildSlipLines,
  buildSlipHtml,
  type SlipInputLine,
  type SlipBucketedLine,
} from '@/lib/fee-slip-template'

type PaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'UPI' | 'SPLIT'

interface ReceiptLine {
  feeHeadName: string
  installmentName: string | null
  academicYear: string | null
  isTransport: boolean
  dueDate: string | null
  paidInReceipt: number
  balanceAfter: number
}

interface ReceiptRow {
  id: string
  receiptNumber: string | null
  receiptId: string | null
  studentName: string
  className: string
  feeMonth: string
  transportMonth: string
  hostelMonth: string
  date: string
  submittedAt: string
  discount: number
  paid: number
  dues: number
  paymentMethod: string | null
  notes: string | null
  splits: Array<{ paymentMethod: string; amount: number }> | null
  collectedBy: { id: string; name: string } | null
  session: string | null
  lines: ReceiptLine[]
}

interface ReceiptSummary {
  receiptNumber: string
  receiptDate: Date
  studentName: string
  className: string
  feeMonths: string[]
  lines: SlipBucketedLine[]
  totalPaid: number
  discountAmount: number
  duesAmount: number
  paymentMethod: string
  splits: Array<{ paymentMethod: string; amount: number }> | null
  collectedBy: { id: string; name: string } | null
  notes: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function FeeListPage() {
  const { currentSchool } = useAppStore()
  const { toast } = useToast()

  const academicYear = useAppStore((s) => s.viewingAcademicYear) || currentSchool?.academicYear || getCurrentAcademicYear()

  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [receiptSummary, setReceiptSummary] = useState<ReceiptSummary | null>(null)
  const [receiptHtml, setReceiptHtml] = useState<string | null>(null)
  const printFrameRef = useRef<HTMLIFrameElement>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        listReceipts: 'true',
        page: String(page),
        limit: '25',
        academicYear,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)

      const data = await api.get<{ receiptHistory: ReceiptRow[]; pagination: Pagination }>(
        `/api/school/fees/collections?${params}`
      )
      let rows = data.receiptHistory || []
      if (paymentMethodFilter !== 'ALL') {
        rows = rows.filter((r) => {
          if (r.splits && r.splits.length > 0) return paymentMethodFilter === 'SPLIT'
          return r.paymentMethod === paymentMethodFilter
        })
      }
      setReceipts(rows)
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, totalPages: 0 })
    } catch (err) {
      toast({ title: 'Failed to load receipts', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, academicYear, paymentMethodFilter, toast])

  useEffect(() => { void fetchReceipts() }, [fetchReceipts])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [debouncedSearch, paymentMethodFilter, academicYear])

  const openReceipt = (row: ReceiptRow) => {
    const receiptDate = row.date ? new Date(row.date) : new Date()
    const apiLines = row.lines || []
    let lines: SlipBucketedLine[]
    let feeMonths: string[]
    if (apiLines.length > 0) {
      const slipInputs: SlipInputLine[] = apiLines.map((line) => ({
        feeHeadName: line.feeHeadName,
        installmentName: line.installmentName,
        academicYear: line.academicYear,
        isTransport: line.isTransport,
        dueDate: line.dueDate || null,
        paid: line.paidInReceipt,
        discount: 0,
        due: line.balanceAfter,
      }))
      lines = buildSlipLines(slipInputs, academicYear, receiptDate)
      feeMonths = sortPeriods(
        Array.from(new Set(apiLines.map((l) => l.installmentName).filter((p): p is string => !!p)))
      )
    } else {
      const fallbackMonths = [
        row.feeMonth,
        row.transportMonth ? `Transport: ${row.transportMonth}` : '',
        row.hostelMonth ? `Hostel: ${row.hostelMonth}` : '',
      ].filter(Boolean)
      lines = [{ label: 'Fee Payment', months: fallbackMonths.length > 0 ? fallbackMonths : ['-'], paid: row.paid, discount: row.discount || 0, due: 0 }]
      feeMonths = fallbackMonths.length > 0 ? fallbackMonths : ['-']
    }

    const summary: ReceiptSummary = {
      receiptNumber: row.receiptId || row.receiptNumber || 'Receipt',
      receiptDate,
      studentName: row.studentName,
      className: row.className,
      feeMonths: feeMonths.length > 0 ? feeMonths : ['-'],
      lines,
      totalPaid: row.paid,
      discountAmount: row.discount || 0,
      duesAmount: row.dues,
      paymentMethod: row.paymentMethod || 'CASH',
      splits: row.splits ?? null,
      collectedBy: row.collectedBy ?? null,
      notes: row.notes || null,
    }
    setReceiptSummary(summary)

    const html = buildSlipHtml({
      variant: 'receipt',
      mode: 'both',
      school: currentSchool,
      student: { id: '', firstName: row.studentName, lastName: '', class: { id: '', name: row.className }, section: null } as never,
      fatherName: null,
      phone: null,
      academicYear,
      feeMonths: summary.feeMonths,
      slipNumber: summary.receiptNumber,
      slipDate: summary.receiptDate,
      lines: summary.lines,
      paymentMethod: summary.paymentMethod as PaymentMethod,
      splits: summary.splits ?? null,
      totalPaid: summary.totalPaid,
      discountAmount: summary.discountAmount,
      duesAmount: summary.duesAmount,
      collectedBy: summary.collectedBy?.name ?? null,
      notes: summary.notes,
    })
    setReceiptHtml(html)
  }

  const handlePrint = () => {
    if (!receiptHtml) return
    const frame = printFrameRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.document.open()
    frame.contentWindow.document.write(receiptHtml)
    frame.contentWindow.document.close()
    setTimeout(() => frame.contentWindow?.print(), 400)
  }

  const totalCollected = useMemo(() => receipts.reduce((s, r) => s + r.paid, 0), [receipts])

  const paymentMethodBadge = (row: ReceiptRow) => {
    if (row.splits && row.splits.length > 0) {
      return <Badge variant="outline" className="text-[10px]">Split</Badge>
    }
    const label = row.paymentMethod ? (PAYMENT_METHOD_LABELS[row.paymentMethod as PaymentMethod] || row.paymentMethod) : '-'
    const colorMap: Record<string, string> = {
      CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      UPI: 'bg-violet-50 text-violet-700 border-violet-200',
      ONLINE: 'bg-blue-50 text-blue-700 border-blue-200',
      CHEQUE: 'bg-amber-50 text-amber-700 border-amber-200',
    }
    const cls = row.paymentMethod ? (colorMap[row.paymentMethod] || 'bg-muted text-muted-foreground') : 'bg-muted text-muted-foreground'
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fee Receipts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All collected fee receipts for session <span className="font-semibold text-foreground">{academicYear}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchReceipts} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total Receipts', value: pagination.total.toLocaleString('en-IN'), color: 'text-primary' },
          { label: 'On This Page', value: receipts.length.toLocaleString('en-IN'), color: 'text-foreground' },
          { label: 'Page Collected', value: `₹${(totalCollected / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, color: 'text-emerald-600' },
          { label: 'Page', value: `${page} / ${pagination.totalPages || 1}`, color: 'text-muted-foreground' },
        ].map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3">
          <ListFilter className="size-4 shrink-0 text-muted-foreground" />
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by receipt no. or student name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Payment mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Modes</SelectItem>
              <SelectItem value="CASH">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="ONLINE">Online</SelectItem>
              <SelectItem value="CHEQUE">Cheque</SelectItem>
              <SelectItem value="SPLIT">Split</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/30 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <ReceiptText className="size-4 text-primary" />
            Receipt Register
            {!loading && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {pagination.total.toLocaleString('en-IN')} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="mr-2 size-5 animate-spin" />
              Loading receipts…
            </div>
          ) : receipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ReceiptText className="mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No receipts found</p>
              <p className="mt-1 text-xs text-muted-foreground">Try adjusting the search or filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="w-10 px-3 py-2.5 text-left font-semibold text-muted-foreground">#</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Receipt No.</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Student</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Class</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Fee Month</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Tr. Month</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Hostel</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Date & Time</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Payment Mode</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Collected By</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Comment</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Discount</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-emerald-700">Paid</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-red-700">Dues</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {receipts.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="group transition-colors hover:bg-primary/5 align-top"
                    >
                      <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                        {(page - 1) * 25 + idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] font-semibold text-primary">
                          {row.receiptNumber || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium">{row.studentName}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.className || '-'}</td>
                      <td className="px-3 py-2.5">{row.feeMonth || '-'}</td>
                      <td className="px-3 py-2.5">{row.transportMonth || '-'}</td>
                      <td className="px-3 py-2.5">{row.hostelMonth || '-'}</td>
                      <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                        {formatDateTime(row.submittedAt || row.date)}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.splits && row.splits.length > 0 ? (
                          <div className="space-y-0.5">
                            {row.splits.map((split, si) => (
                              <div key={si} className="flex items-center justify-between gap-2 rounded bg-muted/60 px-1.5 py-0.5">
                                <span className="font-medium">{PAYMENT_METHOD_LABELS[split.paymentMethod as PaymentMethod] || split.paymentMethod}</span>
                                <span className="tabular-nums">{receiptMoney(split.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          paymentMethodBadge(row)
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        {row.collectedBy?.name || <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="max-w-[180px] px-3 py-2.5 text-[11px]">
                        {row.notes ? (
                          <span className="block truncate" title={row.notes}>{row.notes}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.discount > 0 ? receiptMoney(row.discount) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold tabular-nums text-emerald-700">
                        {receiptMoney(row.paid)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-red-600">
                        {row.dues > 0 ? receiptMoney(row.dues) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 px-2.5 text-[11px] hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                          onClick={() => openReceipt(row)}
                        >
                          <Printer className="size-3" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Footer totals row */}
                <tfoot className="border-t-2 border-primary/20 bg-primary/5">
                  <tr>
                    <td colSpan={12} className="px-3 py-2.5 text-right text-xs font-bold text-muted-foreground">
                      Page Total Collected:
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-black tabular-nums text-emerald-700">
                      {receiptMoney(totalCollected)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, pagination.total)} of{' '}
              <span className="font-semibold text-foreground">{pagination.total.toLocaleString('en-IN')}</span> receipts
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft className="size-3.5" />
                Prev
              </Button>
              <span className="rounded-md border bg-background px-3 py-1 text-xs font-semibold">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || loading}
              >
                Next
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!receiptSummary} onOpenChange={(open) => { if (!open) { setReceiptSummary(null); setReceiptHtml(null) } }}>
        <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b pb-3">
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="size-5 text-primary" />
              Fee Receipt
              {receiptSummary && (
                <span className="ml-1 font-mono text-sm text-muted-foreground">#{receiptSummary.receiptNumber}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {receiptSummary && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                {[
                  { label: 'Student', value: receiptSummary.studentName },
                  { label: 'Class', value: receiptSummary.className },
                  { label: 'Receipt Date', value: formatDate(receiptSummary.receiptDate.toISOString()) },
                  { label: 'Collected By', value: receiptSummary.collectedBy?.name || '-' },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                    <p className="mt-0.5 font-semibold truncate">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-600">Amount Paid</p>
                  <p className="mt-1 text-xl font-black text-emerald-700">{receiptMoney(receiptSummary.totalPaid)}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Discount</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{receiptSummary.discountAmount > 0 ? receiptMoney(receiptSummary.discountAmount) : '—'}</p>
                </div>
                <div className="rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-red-600">Balance Due</p>
                  <p className="mt-1 text-xl font-bold text-red-600">{receiptSummary.duesAmount > 0 ? receiptMoney(receiptSummary.duesAmount) : '—'}</p>
                </div>
              </div>

              {/* Fee lines */}
              {receiptSummary.lines.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/50 border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fee Breakdown
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left font-semibold">Head</th>
                        <th className="px-3 py-2 text-left font-semibold">Month(s)</th>
                        <th className="px-3 py-2 text-right font-semibold text-emerald-700">Paid</th>
                        <th className="px-3 py-2 text-right font-semibold text-red-600">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {receiptSummary.lines.map((line, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{line.label}</td>
                          <td className="px-3 py-2 text-muted-foreground">{Array.isArray(line.months) ? line.months.join(', ') : '-'}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-700">{receiptMoney(line.paid)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600">{line.due > 0 ? receiptMoney(line.due) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes */}
              {receiptSummary.notes && (
                <div className="rounded-lg border bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">Note: </span>{receiptSummary.notes}
                </div>
              )}

              {/* Print button */}
              <div className="flex justify-end gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={!receiptHtml}>
                  <Printer className="size-4" />
                  Print Receipt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden print frame */}
      <iframe ref={printFrameRef} className="hidden" title="print-frame" />
    </div>
  )
}
