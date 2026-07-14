'use client'

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared'
import { DatePicker } from '@/components/date-picker'
import {
  ReceiptText,
  Search,
  Printer,
  RefreshCw,
  ListFilter,
  X,
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
type ReceiptStatusFilter = 'ALL' | 'COLLECTED' | 'CANCELLED'

interface ReceiptLine {
  feeHeadName: string
  installmentName: string | null
  academicYear: string | null
  isTransport: boolean
  dueDate: string | null
  paidInReceipt: number
  discountInReceipt?: number
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
  receiptStatus: 'collected' | 'cancelled'
  cancelledAt?: string | null
  cancellationReason?: string | null
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

function formatDateInput(value = new Date()) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSelectedDate(value: string) {
  if (!value) return 'selected date'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function paymentMethodKey(value?: string | null): PaymentMethod | null {
  if (!value) return null
  const key = value.toUpperCase()
  return ['CASH', 'ONLINE', 'CHEQUE', 'UPI', 'SPLIT'].includes(key) ? key as PaymentMethod : null
}

function paymentMethodLabel(value?: string | null) {
  if (!value) return '-'
  const key = paymentMethodKey(value)
  return key ? PAYMENT_METHOD_LABELS[key] : value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export function FeeListPage({ headerActions }: { headerActions?: ReactNode }) {
  const { currentSchool } = useAppStore()
  const { toast } = useToast()

  const academicYear = useAppStore((s) => s.viewingAcademicYear) || currentSchool?.academicYear || getCurrentAcademicYear()

  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL')
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<ReceiptStatusFilter>('COLLECTED')
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput())
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
        limit: 'all',
        academicYear,
        date: selectedDate,
        receiptStatus: receiptStatusFilter.toLowerCase(),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)

      const data = await api.get<{ receiptHistory: ReceiptRow[]; pagination: Pagination }>(
        `/api/school/fees/collections?${params}`
      )
      let rows = data.receiptHistory || []
      if (paymentMethodFilter !== 'ALL') {
        rows = rows.filter((r) => {
          if (r.splits && r.splits.length > 0) return paymentMethodFilter === 'SPLIT'
          return paymentMethodKey(r.paymentMethod) === paymentMethodFilter
        })
      }
      setReceipts(rows)
      setPagination(data.pagination || { page: 1, limit: rows.length, total: rows.length, totalPages: 1 })
    } catch (err) {
      toast({ title: 'Failed to load receipts', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, academicYear, paymentMethodFilter, receiptStatusFilter, selectedDate, toast])

  useEffect(() => { void fetchReceipts() }, [fetchReceipts])

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
        discount: Number(line.discountInReceipt || 0),
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
      collectedByName: summary.collectedBy?.name ?? null,
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

  const totalCollected = useMemo(
    () => receipts.reduce((sum, receipt) => receipt.receiptStatus === 'cancelled' ? sum : sum + receipt.paid, 0),
    [receipts],
  )

  const paymentMethodBadge = (row: ReceiptRow) => {
    if (row.splits && row.splits.length > 0) {
      return <Badge variant="outline" className="text-[10px]">Split</Badge>
    }
    const methodKey = paymentMethodKey(row.paymentMethod)
    const label = paymentMethodLabel(row.paymentMethod)
    const colorMap: Record<string, string> = {
      CASH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      UPI: 'bg-violet-50 text-violet-700 border-violet-200',
      ONLINE: 'bg-blue-50 text-blue-700 border-blue-200',
      CHEQUE: 'bg-amber-50 text-amber-700 border-amber-200',
    }
    const cls = methodKey ? (colorMap[methodKey] || 'bg-muted text-muted-foreground') : 'bg-muted text-muted-foreground'
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  }

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <ReceiptText className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Fee Receipts</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                {pagination.total.toLocaleString('en-IN')} total
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Daily collection register for {formatSelectedDate(selectedDate)} ({academicYear})
            </p>
          </div>
        </div>
        <div className="relative flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={fetchReceipts}
            disabled={loading}
            className="gap-2 border border-white/60 shadow-md"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          {headerActions}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="group relative w-full overflow-hidden rounded-xl border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500 via-sky-400 to-transparent" />
          <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-sky-500/[0.10] transition-transform group-hover:scale-125" />
          <CardContent className="relative p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Total Receipts</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{pagination.total.toLocaleString('en-IN')}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">All receipts on this date</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/20">
                <ReceiptText className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative w-full overflow-hidden rounded-xl border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-violet-400 to-transparent" />
          <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-violet-500/[0.10] transition-transform group-hover:scale-125" />
          <CardContent className="relative p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Shown</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{receipts.length.toLocaleString('en-IN')}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">After current filters</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm shadow-violet-500/20">
                <ListFilter className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative w-full overflow-hidden rounded-xl border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />
          <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-emerald-500/[0.10] transition-transform group-hover:scale-125" />
          <CardContent className="relative p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Day Collected</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{receiptMoney(totalCollected)}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">Total collected amount</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20">
                <ReceiptText className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative w-full overflow-hidden rounded-xl border-amber-500/20 bg-gradient-to-br from-amber-500/[0.14] via-card to-amber-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 via-amber-400 to-transparent" />
          <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-amber-500/[0.10] transition-transform group-hover:scale-125" />
          <CardContent className="relative p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Date</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{formatSelectedDate(selectedDate)}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">Selected date</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm shadow-amber-500/20">
                <ReceiptText className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table Card */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <ReceiptText className="size-4" />
            </span>
            Receipt Register
          </CardTitle>
          <div className="flex items-center gap-2">
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              triggerClassName="h-9 w-40"
              align="start"
            />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search receipt no. or student..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-56"
              />
            </div>
            <Select value={receiptStatusFilter} onValueChange={(value) => setReceiptStatusFilter(value as ReceiptStatusFilter)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Receipts</SelectItem>
                <SelectItem value="COLLECTED">Collected</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
              <SelectTrigger className="h-9 w-36">
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
            {!loading && (
              <Badge variant="secondary" className="h-9 rounded-md px-3 text-xs">
                {receipts.length.toLocaleString('en-IN')} records
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="mr-2 size-5 animate-spin" />
              Loading receipts...
            </div>
          ) : receipts.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={ReceiptText}
                title="No Receipts Found"
                description="Try adjusting the search or filter."
              />
            </div>
          ) : (
            <>
              <div className="mx-4 mt-4 mb-0 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Receipt No.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Fee Month</TableHead>
                      <TableHead>Tr. Month</TableHead>
                      <TableHead>Hostel</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Payment Mode</TableHead>
                      <TableHead>Collected By</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right text-emerald-700">Paid</TableHead>
                      <TableHead className="text-right text-red-700">Dues</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((row, idx) => (
                      <TableRow
                        key={row.id}
                        className={cn(
                          'transition-colors hover:bg-sky-500/[0.055]',
                          row.receiptStatus === 'cancelled' && 'opacity-60 bg-rose-500/[0.035]',
                        )}
                      >
                        <TableCell className="py-2.5 text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-mono text-[11px] font-semibold text-primary">{row.receiptNumber || '-'}</span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              row.receiptStatus === 'cancelled'
                                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
                            )}
                            title={row.cancellationReason || undefined}
                          >
                            {row.receiptStatus === 'cancelled' ? 'Cancelled' : 'Collected'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 font-medium">{row.studentName}</TableCell>
                        <TableCell className="py-2.5 text-muted-foreground">{row.className || '-'}</TableCell>
                        <TableCell className="py-2.5">{row.feeMonth || '-'}</TableCell>
                        <TableCell className="py-2.5">{row.transportMonth || '-'}</TableCell>
                        <TableCell className="py-2.5">{row.hostelMonth || '-'}</TableCell>
                        <TableCell className="py-2.5 text-[11px] text-muted-foreground">
                          {formatDateTime(row.submittedAt || row.date)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {row.splits && row.splits.length > 0 ? (
                            <div className="space-y-0.5">
                              {row.splits.map((split, si) => (
                                <div key={si} className="flex items-center justify-between gap-2 rounded bg-muted/60 px-1.5 py-0.5">
                                  <span className="font-medium">{paymentMethodLabel(split.paymentMethod)}</span>
                                  <span className="tabular-nums">{receiptMoney(split.amount)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            paymentMethodBadge(row)
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-[11px]">
                          {row.collectedBy?.name || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="max-w-[180px] py-2.5 text-[11px]">
                          {row.notes ? (
                            <span className="block truncate" title={row.notes}>{row.notes}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-right tabular-nums text-muted-foreground">
                          {row.discount > 0 ? receiptMoney(row.discount) : '-'}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-bold tabular-nums text-emerald-700">
                          {receiptMoney(row.paid)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-semibold tabular-nums text-red-600">
                          {row.dues > 0 ? receiptMoney(row.dues) : '-'}
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2.5 text-[11px] hover:bg-primary/10 hover:text-primary hover:border-primary/40"
                            onClick={() => openReceipt(row)}
                          >
                            <Printer className="size-3" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mx-4 mb-4 mt-0 flex items-center justify-end gap-4 rounded-b-xl border-x border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] via-primary/[0.03] to-violet-500/[0.05] px-6 py-3">
                <span className="text-sm font-bold text-muted-foreground">Day Total Collected:</span>
                <span className="text-base font-bold tabular-nums text-emerald-700">{receiptMoney(totalCollected)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Receipt Preview Dialog */}
      <Dialog open={!!receiptSummary} onOpenChange={(open) => { if (!open) { setReceiptSummary(null); setReceiptHtml(null) } }}>
        <DialogContent className="max-h-[92vh] max-w-3xl border-sky-200/80 bg-gradient-to-br from-white via-sky-50/45 to-cyan-50/60 p-0 shadow-xl dark:border-sky-500/25 dark:from-card dark:via-sky-500/10 dark:to-cyan-500/10">
          <DialogHeader className="relative overflow-hidden rounded-t-lg border-b border-sky-500/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 p-5 text-white">
            <div aria-hidden className="absolute -right-10 -top-12 size-32 rounded-full border-[16px] border-white/15" />
            <div aria-hidden className="absolute bottom-0 right-32 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
                <ReceiptText className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-white">Fee Receipt</DialogTitle>
                <DialogDescription className="text-white/80">
                  {receiptSummary && <span className="font-mono">#{receiptSummary.receiptNumber}</span>}
                </DialogDescription>
              </div>
              <DialogClose className="absolute top-3 right-3 z-20 flex size-8 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-white/30 hover:text-white">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
          </DialogHeader>
          {receiptSummary && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {[
                  { label: 'Student', value: receiptSummary.studentName },
                  { label: 'Class', value: receiptSummary.className },
                  { label: 'Receipt Date', value: formatDate(receiptSummary.receiptDate.toISOString()) },
                  { label: 'Collected By', value: receiptSummary.collectedBy?.name || '-' },
                ].map((m) => (
                  <div key={m.label} className="rounded-md border bg-muted/25 px-2.5 py-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                    <p className="mt-0.5 truncate font-semibold">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Amounts */}
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-700">Amount Paid</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-700">{receiptMoney(receiptSummary.totalPaid)}</p>
                </div>
                <div className="rounded-md border bg-muted/25 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Discount</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">{receiptSummary.discountAmount > 0 ? receiptMoney(receiptSummary.discountAmount) : '-'}</p>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-red-600">Balance Due</p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-red-600">{receiptSummary.duesAmount > 0 ? receiptMoney(receiptSummary.duesAmount) : '-'}</p>
                </div>
              </div>

              {/* Fee lines */}
              {receiptSummary.lines.length > 0 && (
                <div className="overflow-hidden rounded-md border">
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
                <div className="rounded-md border bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">Note: </span>{receiptSummary.notes}
                </div>
              )}

              {/* Print button */}
              <div className="flex shrink-0 justify-end gap-2">
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
