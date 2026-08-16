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
  TrendingUp,
  Search,
  PlusCircle,
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  HandCoins,
  CalendarDays,
  Wallet,
  BadgeCheck,
  Clock,
  FileQuestion,
} from 'lucide-react'
import { StaffPicker, type PickableStaff } from '@/features/salary/components/staff-picker'
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

interface AdvanceRequest {
  id: string
  staffType: string
  staffId: string
  staff?: ResolvedStaff | null
  staffName?: string
  amount: number
  reason?: string | null
  requestDate: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  deductionMonth?: number | null
  deductionYear?: number | null
}

interface AdvanceStats {
  total: number
  approved: number
  pending: number
  rejected: number
  outstanding: number
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

const STATUS_META: Record<string, { label: string; badge: string; dot: string }> = {
  pending: {
    label: 'Pending',
    badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'Approved',
    badge: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    badge: 'bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-300',
    dot: 'bg-red-500',
  },
}

export function SalaryAdvancePage() {
  const { toast } = useToast()
  const now = new Date()
  const [requests, setRequests] = useState<AdvanceRequest[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [stats, setStats] = useState<AdvanceStats>({ total: 0, approved: 0, pending: 0, rejected: 0, outstanding: 0 })
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const [showRequest, setShowRequest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<PickableStaff | null>(null)
  const [form, setForm] = useState({
    amount: '',
    reason: '',
    deductionMonth: String(now.getMonth() + 1),
    deductionYear: String(now.getFullYear()),
  })
  const [approveTarget, setApproveTarget] = useState<AdvanceRequest | null>(null)

  const fetchData = useCallback(async (targetPage: number, targetLimit: number) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(targetPage),
        limit: String(targetLimit),
      }
      if (statusFilter !== ALL) params.approvalStatus = statusFilter
      const res = await api.get<{ requests: AdvanceRequest[]; pagination: PaginationInfo; stats: AdvanceStats }>(
        '/api/school/salary/advance',
        params
      )
      setRequests(res.requests || [])
      if (res.pagination) setPagination(res.pagination)
      if (res.stats) setStats(res.stats)
    } catch {
      toast({
        title: "Couldn't Load Advances",
        description: "We couldn't load the salary advances. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, toast])

  useEffect(() => {
    fetchData(page, limit)
  }, [fetchData])

  const handleRequest = async () => {
    if (!picked) return
    setSaving(true)
    try {
      await api.post('/api/school/salary/advance', {
        staffType: picked.staffType,
        staffId: picked.id,
        amount: Number(form.amount),
        reason: form.reason || undefined,
        deductionMonth: Number(form.deductionMonth),
        deductionYear: Number(form.deductionYear),
      })
      toast({ title: 'Submitted', description: 'Advance request submitted.' })
      setShowRequest(false)
      setPicked(null)
      setForm((f) => ({ ...f, amount: '', reason: '' }))
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

  const handleStatusChange = async (target: AdvanceRequest, approvalStatus: 'approved' | 'rejected') => {
    try {
      await api.patch(`/api/school/salary/advance/${target.id}`, { approvalStatus })
      toast({ title: 'Updated', description: `Advance ${approvalStatus}.` })
      setApproveTarget(null)
      fetchData(page, limit)
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const visibleRequests = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return requests
    return requests.filter(
      (r) =>
        (r.staffName || '').toLowerCase().includes(q) ||
        (r.staff?.employeeId || '').toLowerCase().includes(q)
    )
  }, [requests, search])

  const resetFilters = () => {
    setStatusFilter(ALL)
    setSearch('')
    setPage(1)
  }

  if (loading && requests.length === 0) return <LoadingState />

  return (
    <div className="space-y-4">
      <SalaryHero
        icon={TrendingUp}
        title="Salary Advances"
        description="Advance requests and recovery planning"
        badge={`${stats.total.toLocaleString('en-IN')} requests`}
        action={{ label: 'Request Advance', icon: PlusCircle, onClick: () => setShowRequest(true) }}
      />

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SalaryStatCard title="Total Requests" value={stats.total.toLocaleString('en-IN')} description="All-time requests" icon={FileQuestion} tone="sky" />
        <SalaryStatCard title="Approved" value={money(stats.approved)} description="Approved amount" icon={CheckCircle2} tone="emerald" />
        <SalaryStatCard title="Pending" value={stats.pending.toLocaleString('en-IN')} description="Awaiting decision" icon={Clock} tone="amber" />
        <SalaryStatCard title="Outstanding" value={money(stats.outstanding)} description="Yet to recover" icon={HandCoins} tone="violet" />
      </div>

      {/* List */}
      <SalaryTableCard
        title="Advance Requests"
        icon={TrendingUp}
        badge={`${pagination.total.toLocaleString('en-IN')} total`}
        footer={
          <>
            <LegendItem color="bg-emerald-500" label="Approved" />
            <LegendItem color="bg-amber-500" label="Pending" />
            <LegendItem color="bg-red-500" label="Rejected" />
            <LegendItem color="bg-violet-500" label={`Outstanding ${money(stats.outstanding)}`} />
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
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {statusFilter !== ALL && (
            <Button variant="ghost" size="sm" className="h-9 text-xs text-destructive" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {requests.length === 0 ? (
          <div className="py-8">
            <EmptyState
              icon={Wallet}
              title="No Salary Advances"
              description="Request salary advances for any teacher, staff member, or driver."
              action={{ label: 'Request Advance', onClick: () => setShowRequest(true) }}
            />
          </div>
        ) : visibleRequests.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No staff match &ldquo;{search}&rdquo; on this page. Try a different search.
          </div>
        ) : (
          <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
            <Table>
              <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Staff Member</TableHead>
                  <TableHead className="py-3 text-right text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Amount</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Requested</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Status</TableHead>
                  <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Recovery</span>
                  </TableHead>
                  <TableHead className="w-12 py-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRequests.map((r, idx) => (
                  <TableRow
                    key={r.id}
                    className={cn('transition-colors hover:bg-sky-500/[0.04]', idx % 2 === 0 ? 'bg-transparent' : 'bg-sky-500/[0.02]')}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-bold text-white shadow-sm">
                          {(r.staffName || '?').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{r.staffName || 'Unknown'}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.staff?.roleLabel}
                            {r.staff?.employeeId ? ` · ${r.staff.employeeId}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-right text-sm font-semibold tabular-nums">{money(r.amount)}</TableCell>
                    <TableCell className="py-3 text-sm text-muted-foreground">
                      {r.requestDate ? new Date(r.requestDate).toLocaleDateString('en-IN') : '-'}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge className={STATUS_META[r.approvalStatus].badge}>
                        {STATUS_META[r.approvalStatus].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-sm">
                      {r.deductionMonth ? `${MONTHS[r.deductionMonth - 1] || ''} ${r.deductionYear || ''}` : '-'}
                    </TableCell>
                    <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {r.approvalStatus === 'pending' ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5">
                              <MoreHorizontal className="size-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 border-primary/10 shadow-xl">
                            <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Decide</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setApproveTarget(r)}
                              className="gap-2.5 text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                            >
                              <CheckCircle2 className="size-4" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(r, 'rejected')}
                              className="gap-2.5 text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                            >
                              <XCircle className="size-4" /> Reject
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button variant="ghost" size="icon" className="size-8 cursor-default" disabled>
                          <BadgeCheck className={cn('size-4', r.approvalStatus === 'approved' ? 'text-emerald-500' : 'text-muted-foreground/40')} />
                        </Button>
                      )}
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
            label="requests"
          />
        )}
      </SalaryTableCard>

      {/* Request dialog */}
      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className={MODAL_CONTENT_CLASSES}>
          <ModalHeader
            icon={TrendingUp}
            title="Request Salary Advance"
            description="The approved amount is recovered from the chosen month's payslip."
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <ModalSection icon={BadgeCheck} title="Staff Member" subtitle="Who is requesting the advance?">
              <StaffPicker value={picked ? { staffType: picked.staffType, staffId: picked.id } : undefined} onChange={setPicked} />
            </ModalSection>
            <ModalSection icon={Wallet} title="Advance Details" subtitle="Amount, reason, and recovery schedule">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    className="h-9 text-xs"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="Enter advance amount"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Recover In Month</Label>
                    <Select value={form.deductionMonth} onValueChange={(v) => setForm((f) => ({ ...f, deductionMonth: v }))}>
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
                      value={form.deductionYear}
                      onChange={(e) => setForm((f) => ({ ...f, deductionYear: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">Reason (optional)</Label>
                  <Input
                    className="h-9 text-xs"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="Medical, travel, emergency..."
                  />
                </div>
              </div>
            </ModalSection>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button size="sm" variant="outline" className="h-8 px-4 text-xs" onClick={() => setShowRequest(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-4 text-xs" onClick={handleRequest} disabled={saving || !picked || !form.amount}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve confirm */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => !o && setApproveTarget(null)}>
        <DialogContent className={MODAL_CONTENT_CLASSES}>
          <ModalHeader
            icon={CheckCircle2}
            title="Approve Advance"
            description={`${approveTarget?.staffName || 'Staff member'} — ${money(approveTarget?.amount)}`}
          />
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <p className="text-sm text-muted-foreground">
              The amount will be recovered from the{' '}
              <span className="font-semibold text-foreground">
                {approveTarget?.deductionMonth ? MONTHS[(approveTarget.deductionMonth || 1) - 1] : ''}{' '}
                {approveTarget?.deductionYear || ''}
              </span>{' '}
              payslip.
            </p>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button size="sm" variant="outline" className="h-8 px-4 text-xs" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-700"
              onClick={() => approveTarget && handleStatusChange(approveTarget, 'approved')}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}