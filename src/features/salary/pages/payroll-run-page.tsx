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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  Receipt,
  Search,
  Play,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Eye,
  MoreHorizontal,
  CalendarClock,
  Users,
  Wallet,
  IndianRupee,
  HandCoins,
  CalendarDays,
  FileCheck2,
} from 'lucide-react'
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

interface PayrollRun {
  id: string
  month: number
  year: number
  status: 'draft' | 'generated' | 'finalized'
  totalStaff: number
  totalGross: number
  totalNet: number
  finalizedAt?: string | null
  createdAt?: string
}

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface RunPayment {
  id: string
  staff?: ResolvedStaff | null
  staffName?: string
  grossEarnings: number
  totalDeductions: number
  netPayable: number
  paymentStatus: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ALL = '__all__'
const PAGE_SIZES = [10, 25, 50, 100]
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  draft: {
    label: 'Draft',
    badge: 'bg-slate-100 text-slate-700 hover:bg-slate-100 dark:bg-slate-500/15 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  generated: {
    label: 'Generated',
    badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  finalized: {
    label: 'Finalized',
    badge: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
}

const periodLabel = (month: number, year: number) => `${MONTHS[month - 1] || ''} ${year}`

export function PayrollRunPage() {
  const { toast } = useToast()
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
  })

  const [activeRun, setActiveRun] = useState<PayrollRun | null>(null)
  const [runPayments, setRunPayments] = useState<RunPayment[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmPay, setConfirmPay] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [busy, setBusy] = useState(false)

  // List controls
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [detailPage, setDetailPage] = useState(1)
  const [detailLimit, setDetailLimit] = useState(10)

  const fetchRuns = useCallback(async () => {
    try {
      const res = await api.get<{ runs: PayrollRun[] }>('/api/school/salary/payroll-runs')
      setRuns(res.runs || [])
    } catch {
      toast({ title: "Couldn't Load Payroll Runs", description: 'Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  const openRun = useCallback(
    async (runId: string) => {
      setDetailLoading(true)
      try {
        const res = await api.get<{ run: PayrollRun; payments: RunPayment[] }>(
          `/api/school/salary/payroll-runs/${runId}`
        )
        setActiveRun(res.run)
        setRunPayments(res.payments || [])
        setDetailPage(1)
      } catch {
        toast({ title: "Couldn't Load Run", description: 'Please try again.', variant: 'destructive' })
      } finally {
        setDetailLoading(false)
      }
    },
    [toast]
  )

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.post<{ run: PayrollRun; created: number }>('/api/school/salary/payroll-runs', {
        month: Number(form.month),
        year: Number(form.year),
      })
      toast({ title: 'Payroll Generated', description: `${res.created} new payslip(s) created.` })
      setShowGenerate(false)
      await fetchRuns()
      openRun(res.run.id)
    } catch (err) {
      toast({
        title: "Couldn't Generate Payroll",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  const handlePayAll = async () => {
    if (!activeRun) return
    setBusy(true)
    try {
      await api.patch(`/api/school/salary/payroll-runs/${activeRun.id}`, { action: 'pay-all' })
      toast({ title: 'Payroll Paid', description: 'All payslips marked paid and the run is finalized.' })
      setConfirmPay(false)
      await fetchRuns()
      openRun(activeRun.id)
    } catch (err) {
      toast({
        title: "Couldn't Finalize",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDiscard = async () => {
    if (!activeRun) return
    setBusy(true)
    try {
      await api.delete(`/api/school/salary/payroll-runs/${activeRun.id}`)
      toast({ title: 'Run Discarded', description: 'The draft payroll run was removed.' })
      setConfirmDiscard(false)
      setActiveRun(null)
      fetchRuns()
    } catch (err) {
      toast({
        title: "Couldn't Discard",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  // ---- Runs list filtering (client-side) ----
  const filteredRuns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return runs.filter((r) => {
      if (statusFilter !== ALL && r.status !== statusFilter) return false
      if (!q) return true
      return periodLabel(r.month, r.year).toLowerCase().includes(q)
    })
  }, [runs, search, statusFilter])

  const runsTotalPages = Math.max(Math.ceil(filteredRuns.length / (limit || filteredRuns.length)), 1)
  const paginatedRuns = limit === 0 ? filteredRuns : filteredRuns.slice((page - 1) * limit, page * limit)

  const runsStats = useMemo(
    () => ({
      total: runs.length,
      generated: runs.filter((r) => r.status === 'generated').length,
      finalized: runs.filter((r) => r.status === 'finalized').length,
      net: runs.reduce((a, r) => a + (r.totalNet || 0), 0),
    }),
    [runs]
  )

  const detailTotalPages = Math.max(Math.ceil(runPayments.length / (detailLimit || runPayments.length)), 1)
  const paginatedPayments = detailLimit === 0 ? runPayments : runPayments.slice((detailPage - 1) * detailLimit, detailPage * detailLimit)
  const paidCount = runPayments.filter((p) => p.paymentStatus === 'paid').length

  const statusBadge = (status: string) => (
    <Badge className={STATUS_META[status]?.badge || ''}>{STATUS_META[status]?.label || status}</Badge>
  )

  if (loading) return <LoadingState />

  // ============================================
  // Run detail view
  // ============================================
  if (activeRun) {
    return (
      <div className="space-y-4">
        <SalaryHero
          icon={Receipt}
          title={`Payroll — ${periodLabel(activeRun.month, activeRun.year)}`}
          description={`${activeRun.totalStaff} staff · net ${money(activeRun.totalNet)}`}
          badge={STATUS_META[activeRun.status]?.label}
          action={{
            label: 'Pay All & Finalize',
            icon: CheckCircle2,
            onClick: () => setConfirmPay(true),
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-2 text-xs" onClick={() => setActiveRun(null)}>
            <ArrowLeft className="size-4" /> Back to Runs
          </Button>
          {activeRun.status !== 'finalized' && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setConfirmDiscard(true)}
            >
              <Trash2 className="size-4" /> Discard Run
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SalaryStatCard title="Staff in Run" value={activeRun.totalStaff.toLocaleString('en-IN')} description="Payslips in this run" icon={Users} tone="sky" />
          <SalaryStatCard title="Total Gross" value={money(activeRun.totalGross)} description="Gross earnings" icon={Wallet} tone="violet" />
          <SalaryStatCard title="Total Net" value={money(activeRun.totalNet)} description="Net payable" icon={IndianRupee} tone="emerald" />
          <SalaryStatCard title="Paid" value={paidCount.toLocaleString('en-IN')} description={`${runPayments.length - paidCount} pending`} icon={HandCoins} tone="amber" />
        </div>

        {detailLoading ? (
          <LoadingState />
        ) : (
          <SalaryTableCard
            title="Run Payslips"
            icon={Receipt}
            badge={`${runPayments.length} payslips`}
            footer={
              <>
                <LegendItem color="bg-emerald-500" label={`Paid ${paidCount}`} />
                <LegendItem color="bg-amber-500" label={`Pending ${runPayments.length - paidCount}`} />
                <LegendItem color="bg-sky-500" label={`Net ${money(activeRun.totalNet)}`} />
              </>
            }
          >
            {runPayments.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={CalendarClock}
                  title="No Payslips in This Run"
                  description="This run has no payslips yet."
                />
              </div>
            ) : (
              <>
                <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
                  <Table>
                    <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                      <TableRow>
                        <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Staff Member</TableHead>
                        <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Gross</TableHead>
                        <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Deductions</TableHead>
                        <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Net</TableHead>
                        <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPayments.map((p, idx) => (
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
                                <p className="truncate text-sm font-semibold text-foreground">{p.staffName || p.staff?.fullName || 'Unknown'}</p>
                                <p className="truncate text-xs text-muted-foreground">{p.staff?.roleLabel}</p>
                              </div>
                            </div>
                          </TableCell>
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {runPayments.length > 0 && (
                  <SalaryPagination
                    page={detailPage}
                    limit={detailLimit}
                    total={runPayments.length}
                    totalPages={detailTotalPages}
                    onPageChange={setDetailPage}
                    onPageSizeChange={(size) => { setDetailLimit(size); setDetailPage(1) }}
                    label="payslips"
                    sizes={PAGE_SIZES}
                    includeAll
                  />
                )}
              </>
            )}
          </SalaryTableCard>
        )}

        <AlertDialog open={confirmPay} onOpenChange={setConfirmPay}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pay all and finalize?</AlertDialogTitle>
              <AlertDialogDescription>
                This marks every pending payslip in this run as paid and finalizes the run. Finalized runs can&apos;t be
                regenerated or discarded.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handlePayAll} disabled={busy}>
                Pay All & Finalize
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this payroll run?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the run and its pending payslips. Already-paid payslips block discarding.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscard} disabled={busy}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ============================================
  // Runs list view
  // ============================================
  return (
    <div className="space-y-4">
      <SalaryHero
        icon={Receipt}
        title="Run Payroll"
        description="Generate and finalize monthly payroll for all staff"
        badge={`${runsStats.total.toLocaleString('en-IN')} runs`}
        action={{ label: 'New Payroll Run', icon: Play, onClick: () => setShowGenerate(true) }}
      />

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SalaryStatCard title="Total Runs" value={runsStats.total.toLocaleString('en-IN')} description="All payroll runs" icon={CalendarClock} tone="sky" />
        <SalaryStatCard title="Generated" value={runsStats.generated.toLocaleString('en-IN')} description="Awaiting finalize" icon={FileCheck2} tone="amber" />
        <SalaryStatCard title="Finalized" value={runsStats.finalized.toLocaleString('en-IN')} description="Completed runs" icon={CheckCircle2} tone="emerald" />
        <SalaryStatCard title="Total Net" value={money(runsStats.net)} description="Across all runs" icon={IndianRupee} tone="violet" />
      </div>

      <SalaryTableCard
        title="Payroll Runs"
        icon={Receipt}
        badge={`${filteredRuns.length} shown`}
        footer={
          <>
            <LegendItem color="bg-slate-400" label="Draft" />
            <LegendItem color="bg-amber-500" label="Generated" />
            <LegendItem color="bg-emerald-500" label="Finalized" />
            <LegendItem color="bg-sky-500" label={`Net ${money(runsStats.net)}`} />
          </>
        }
      >
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search period (e.g. Mar 2026)..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-56"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="generated">Generated</SelectItem>
              <SelectItem value="finalized">Finalized</SelectItem>
            </SelectContent>
          </Select>
          {statusFilter !== ALL && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive" onClick={() => { setStatusFilter(ALL); setPage(1) }}>
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {filteredRuns.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={CalendarClock}
              title="No Payroll Runs Yet"
              description="Generate payroll for a month to create payslips for all staff at once."
              action={{ label: 'New Payroll Run', onClick: () => setShowGenerate(true) }}
            />
          </div>
        ) : (
          <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
            <Table>
              <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Period</span>
                  </TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Staff</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Gross</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Net</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Status</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Created</TableHead>
                  <TableHead className="w-12 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRuns.map((r, idx) => (
                  <TableRow
                    key={r.id}
                    className={cn('cursor-pointer transition-colors hover:bg-sky-500/[0.04]', idx % 2 === 0 ? 'bg-transparent' : 'bg-sky-500/[0.02]')}
                    onClick={() => openRun(r.id)}
                  >
                    <TableCell className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                          <CalendarClock className="size-4" />
                        </span>
                        {periodLabel(r.month, r.year)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{r.totalStaff}</TableCell>
                    <TableCell className="py-3 text-right text-sm tabular-nums">{money(r.totalGross)}</TableCell>
                    <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">{money(r.totalNet)}</TableCell>
                    <TableCell className="py-3">{statusBadge(r.status)}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '-'}
                    </TableCell>
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5">
                            <MoreHorizontal className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 border-primary/10 shadow-xl">
                          <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openRun(r.id)} className="gap-2.5 text-sky-700 focus:text-sky-700 dark:text-sky-400 dark:focus:text-sky-400">
                            <Eye className="size-4" /> Open Run
                          </DropdownMenuItem>
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
        {filteredRuns.length > 0 && (
          <SalaryPagination
            page={page}
            limit={limit}
            total={filteredRuns.length}
            totalPages={runsTotalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setLimit(size); setPage(1) }}
            label="runs"
            sizes={PAGE_SIZES}
            includeAll
          />
        )}
      </SalaryTableCard>

      {/* Generate dialog */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className={MODAL_CONTENT_CLASSES}>
          <ModalHeader
            icon={Play}
            title="New Payroll Run"
            description="Generates pending payslips for every active staff member with a salary structure."
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <ModalSection icon={CalendarDays} title="Pay Period" subtitle="Which month is this payroll for?">
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <p className="mt-3 rounded-lg border border-emerald-200/70 bg-emerald-500/[0.05] px-3 py-2 text-[11px] text-muted-foreground">
                Re-running a month only adds the missing staff. Finalized months can&apos;t be regenerated.
              </p>
            </ModalSection>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button size="sm" variant="outline" className="h-8 px-4 text-xs" onClick={() => setShowGenerate(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Payroll'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}