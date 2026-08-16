'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Banknote,
  Search,
  PlusCircle,
  Eye,
  HandCoins,
  MoreHorizontal,
  CalendarDays,
  Wallet,
  IndianRupee,
  BadgeCheck,
  Receipt,
} from 'lucide-react'
import { StaffPicker, type PickableStaff } from '@/features/salary/components/staff-picker'
import { openPayslipPrint, type PayslipData } from '@/features/salary/lib/payslip'
import {
  SalaryHero,
  SalaryStatCard,
  SalaryTableCard,
  SalaryPagination,
  LegendItem,
  MODAL_CONTENT_CLASSES,
  ModalHeader,
  ModalSection,
} from '@/features/salary/components/salary-ui'

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface SalaryPayment {
  id: string
  staffType: string
  staffId: string
  staff?: ResolvedStaff | null
  staffName?: string
  month: number
  year: number
  grossEarnings: number
  totalDeductions: number
  netPayable: number
  paymentStatus: string
  paymentDate?: string | null
}

interface PaymentStats {
  total: number
  paid: number
  pending: number
  gross: number
  net: number
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ALL = '__all__'
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function SalaryPaymentsPage() {
  const { toast } = useToast()
  const now = new Date()
  const [payments, setPayments] = useState<SalaryPayment[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [stats, setStats] = useState<PaymentStats>({ total: 0, paid: 0, pending: 0, gross: 0, net: 0 })
  const [loading, setLoading] = useState(true)

  // Filters (server-side)
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState(ALL)
  const [yearFilter, setYearFilter] = useState(String(now.getFullYear()))
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const [showGenerate, setShowGenerate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<PickableStaff | null>(null)
  const [form, setForm] = useState({
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    lopDays: '0',
  })
  const [payTarget, setPayTarget] = useState<SalaryPayment | null>(null)
  const [payForm, setPayForm] = useState({ paymentMethod: 'bank_transfer', transactionRef: '' })

  const fetchData = useCallback(async (targetPage: number, targetLimit: number) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(targetPage),
        limit: String(targetLimit),
      }
      if (monthFilter !== ALL) params.month = monthFilter
      if (yearFilter) params.year = yearFilter
      if (statusFilter !== ALL) params.paymentStatus = statusFilter
      const res = await api.get<{ payments: SalaryPayment[]; pagination: PaginationInfo; stats: PaymentStats }>(
        '/api/school/salary/payments',
        params
      )
      setPayments(res.payments || [])
      if (res.pagination) setPagination(res.pagination)
      if (res.stats) setStats(res.stats)
    } catch {
      toast({
        title: "Couldn't Load Payments",
        description: "We couldn't load the salary payments. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [monthFilter, yearFilter, statusFilter, toast])

  useEffect(() => {
    fetchData(page, limit)
  }, [fetchData])

  const handleGenerate = async () => {
    if (!picked) return
    setSaving(true)
    try {
      await api.post('/api/school/salary/payments', {
        staffType: picked.staffType,
        staffId: picked.id,
        month: Number(form.month),
        year: Number(form.year),
        lopDays: Number(form.lopDays) || 0,
      })
      toast({ title: 'Generated', description: 'Salary payslip generated.' })
      setShowGenerate(false)
      setPicked(null)
      setForm((f) => ({ ...f, lopDays: '0' }))
      fetchData(page, limit)
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePay = async () => {
    if (!payTarget) return
    setSaving(true)
    try {
      await api.patch(`/api/school/salary/payments/${payTarget.id}`, {
        action: 'pay',
        paymentMethod: payForm.paymentMethod,
        transactionRef: payForm.transactionRef || undefined,
      })
      toast({ title: 'Paid', description: 'Salary marked as paid.' })
      setPayTarget(null)
      setPayForm({ paymentMethod: 'bank_transfer', transactionRef: '' })
      fetchData(page, limit)
    } catch (err) {
      toast({
        title: "Couldn't Mark Paid",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const viewPayslip = async (p: SalaryPayment) => {
    try {
      const data = await api.get<PayslipData>(`/api/school/salary/payments/${p.id}/payslip`)
      openPayslipPrint(data)
    } catch {
      toast({ title: "Couldn't Open Payslip", description: 'Please try again.', variant: 'destructive' })
    }
  }

  const resetFilters = () => {
    setMonthFilter(ALL)
    setYearFilter(String(now.getFullYear()))
    setStatusFilter(ALL)
    setSearch('')
    setPage(1)
  }

  const visiblePayments = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        (p.staffName || '').toLowerCase().includes(q) ||
        (p.staff?.employeeId || '').toLowerCase().includes(q)
    )
  }, [payments, search])

  const hasActiveFilters = monthFilter !== ALL || statusFilter !== ALL

  if (loading && payments.length === 0) return <LoadingState />

  return (
    <div className="space-y-4">
      <SalaryHero
        icon={Banknote}
        title="Salary Payments"
        description="Payslips, payments, and salary slips"
        badge={`${stats.total.toLocaleString('en-IN')} payslips`}
        action={{ label: 'Generate Payslip', icon: PlusCircle, onClick: () => setShowGenerate(true) }}
      />

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SalaryStatCard title="Total Payslips" value={stats.total.toLocaleString('en-IN')} description="Matching current filters" icon={Receipt} tone="sky" />
        <SalaryStatCard title="Total Gross" value={money(stats.gross)} description="Gross earnings" icon={Wallet} tone="violet" />
        <SalaryStatCard title="Total Net" value={money(stats.net)} description="Net payable" icon={IndianRupee} tone="emerald" />
        <SalaryStatCard title="Paid" value={stats.paid.toLocaleString('en-IN')} description={`${stats.pending.toLocaleString('en-IN')} still pending`} icon={HandCoins} tone="amber" />
      </div>

      {/* List */}
      <SalaryTableCard
        title="Payslip Records"
        icon={Banknote}
        badge={`${pagination.total.toLocaleString('en-IN')} total`}
        footer={
          <>
            <LegendItem color="bg-emerald-500" label={`Paid ${stats.paid.toLocaleString('en-IN')}`} />
            <LegendItem color="bg-amber-500" label={`Pending ${stats.pending.toLocaleString('en-IN')}`} />
            <LegendItem color="bg-sky-500" label={`Net ₹${Math.round(stats.net).toLocaleString('en-IN')}`} />
          </>
        }
      >
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search staff..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-52"
            />
          </div>
          <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="All Months" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Months</SelectItem>
              {MONTHS.map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={yearFilter}
            onChange={(e) => { setYearFilter(e.target.value); setPage(1) }}
            className="h-9 w-24 bg-background/90 text-xs shadow-sm"
          />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {payments.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={Banknote}
              title="No Salary Payments"
              description="Generate a payslip for any staff member, or run payroll for the whole month."
              action={{ label: 'Generate Payslip', onClick: () => setShowGenerate(true) }}
            />
          </div>
        ) : visiblePayments.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No staff match &ldquo;{search}&rdquo; on this page. Try a different search.
          </div>
        ) : (
          <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
            <Table>
              <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Staff Member</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Period</span>
                  </TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Gross</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Deductions</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Net</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Status</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Payment Date</TableHead>
                  <TableHead className="w-12 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePayments.map((p, idx) => (
                  <TableRow
                    key={p.id}
                    className={cn('transition-colors hover:bg-sky-500/[0.04]', idx % 2 === 0 ? 'bg-transparent' : 'bg-sky-500/[0.02]')}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-bold text-white shadow-sm">
                          {(p.staffName || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{p.staffName || 'Unknown'}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.staff?.roleLabel}
                            {p.staff?.employeeId ? ` · ${p.staff.employeeId}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-sm">{`${MONTHS[p.month - 1] || ''} ${p.year}`}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{money(p.grossEarnings)}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums text-rose-600 dark:text-rose-400">{money(p.totalDeductions)}</TableCell>
                    <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">{money(p.netPayable)}</TableCell>
                    <TableCell className="py-3">
                      <Badge
                        className={
                          p.paymentStatus === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300'
                        }
                      >
                        {p.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN') : '-'}
                    </TableCell>
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5">
                            <MoreHorizontal className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 border-primary/10 shadow-xl">
                          <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => viewPayslip(p)} className="gap-2.5 text-sky-700 focus:text-sky-700 dark:text-sky-400 dark:focus:text-sky-400">
                            <Eye className="size-4" /> View Payslip
                          </DropdownMenuItem>
                          {p.paymentStatus !== 'paid' && (
                            <DropdownMenuItem onClick={() => setPayTarget(p)} className="gap-2.5 text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400">
                              <HandCoins className="size-4" /> Mark as Paid
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {pagination.total > 0 && (
          <SalaryPagination
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPageChange={(p) => { setPage(p); fetchData(p, limit) }}
            onPageSizeChange={(size) => { setLimit(size); setPage(1); fetchData(1, size) }}
            label="payslips"
          />
        )}
      </SalaryTableCard>

      {/* Generate Payslip dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className={MODAL_CONTENT_CLASSES}>
          <ModalHeader
            icon={PlusCircle}
            title="Generate Payslip"
            description="Create a single payslip. For everyone at once, use Run Payroll."
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <ModalSection icon={BadgeCheck} title="Staff Member" subtitle="Who is this payslip for?">
              <StaffPicker value={picked ? { staffType: picked.staffType, staffId: picked.id } : undefined} onChange={setPicked} />
            </ModalSection>
            <ModalSection icon={CalendarDays} title="Pay Period" subtitle="Month and year this salary covers">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Month</Label>
                  <Select value={form.month} onValueChange={(v) => setForm((f) => ({ ...f, month: v }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Year</Label>
                  <Input
                    type="number"
                    className="h-9 text-xs"
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">LOP Days</Label>
                  <Input
                    type="number"
                    min="0"
                    className="h-9 text-xs"
                    value={form.lopDays}
                    onChange={(e) => setForm((f) => ({ ...f, lopDays: e.target.value }))}
                  />
                </div>
              </div>
            </ModalSection>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button size="sm" variant="outline" className="h-8 px-4 text-xs" onClick={() => setShowGenerate(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={handleGenerate} disabled={saving || !picked}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid dialog */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className={MODAL_CONTENT_CLASSES}>
          <ModalHeader
            icon={HandCoins}
            title="Mark Salary Paid"
            description={`${payTarget?.staffName || 'Staff member'} — net ${money(payTarget?.netPayable)}`}
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <ModalSection icon={Wallet} title="Payment Details" subtitle="How was this salary paid?">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Payment Method</Label>
                  <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm((f) => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Reference (optional)</Label>
                  <Input
                    className="h-9 text-xs"
                    value={payForm.transactionRef}
                    onChange={(e) => setPayForm((f) => ({ ...f, transactionRef: e.target.value }))}
                    placeholder="Transaction / cheque no."
                  />
                </div>
              </div>
            </ModalSection>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button size="sm" variant="outline" className="h-8 px-4 text-xs" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={handlePay} disabled={saving}>
              Mark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}