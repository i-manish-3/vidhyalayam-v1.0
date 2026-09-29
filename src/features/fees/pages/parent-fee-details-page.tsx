'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { EmptyState, LoadingState, GradientHero } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, FileText, IndianRupee, Receipt, Wallet } from 'lucide-react'

interface FeeLine {
  id: string
  feeHead: string
  installment: string
  amount: number
  paid: number
  discount: number
  fine: number
  pending: number
  status: string
  dueDate: string | null
  paymentDate: string | null
  receiptNumber: string | null
}

interface StudentFees {
  studentId: string
  studentName: string
  admissionNumber: string | null
  fees: FeeLine[]
  summary: { total: number; paid: number; pending: number; overdue: number }
}

interface DemandSlipRow {
  id: string
  invoiceNumber: string
  billingMonth: number | null
  billingYear: number | null
  totalAmount: number
  amountDue: number
  status: string
}

interface ReceiptRow {
  id: string
  receiptNumber: string
  amount: number
  paymentMethod: string | null
  paymentDate: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Academic-year month order (Apr → Mar) used for the calendar grid.
const ACADEMIC_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

const inr = (n: number) => `Rs. ${(n || 0).toLocaleString('en-IN')}`

const STATUS: Record<string, { label: string; text: string; dot: string }> = {
  paid: { label: 'Paid', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  partial: { label: 'Partial', text: 'text-amber-600', dot: 'bg-amber-500' },
  unpaid: { label: 'Unpaid', text: 'text-red-600', dot: 'bg-red-500' },
}

// Per-status cell styling for the fee calendar.
const CELL_STYLE: Record<string, string> = {
  paid: 'border-emerald-500/30 bg-emerald-500/5',
  partial: 'border-amber-500/30 bg-amber-500/5',
  unpaid: 'border-red-500/30 bg-red-500/5',
}

const SORT_ORDER: Record<string, number> = { unpaid: 0, partial: 1, paid: 2 }

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

// Map an installment label ("Apr", "April", "Apr 2025"…) to an academic-month
// index (0 = Apr). Returns -1 for non-month installments (Admission, Exam, etc.).
function monthIndexOf(installment: string | null | undefined): number {
  if (!installment) return -1
  const lower = installment.toLowerCase()
  return ACADEMIC_MONTHS.findIndex((m) => lower.startsWith(m.toLowerCase()))
}

interface MonthCell {
  month: string
  total: number
  paid: number
  pending: number
  status: 'paid' | 'partial' | 'unpaid'
  count: number
  // Per-head breakdown for this month (e.g. Tuition, Transport) so the parent
  // sees them separately instead of one confusing combined total.
  lines: FeeLine[]
}

function rollUpStatus(total: number, paid: number, pending: number): 'paid' | 'partial' | 'unpaid' {
  if (pending <= 0) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ParentFeeDetailsPage() {
  const searchParams = useSearchParams()
  const queryStudentId = searchParams.get('studentId')
  const { toast } = useToast()

  const [data, setData] = useState<StudentFees[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [slips, setSlips] = useState<DemandSlipRow[]>([])
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [showSlipsReceipts, setShowSlipsReceipts] = useState(false)

  const fetchFees = useCallback(async () => {
    try {
      const res = await api.get<{ fees: StudentFees[] }>('/api/parent/fees')
      setData(res?.fees || [])
    } catch {
      toast({
        title: "Couldn't load fee details",
        description: 'Please refresh the page. If this continues, contact the school.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchFees()
  }, [fetchFees])

  useEffect(() => {
    if (data.length === 0) return
    const valid = queryStudentId && data.some((d) => d.studentId === queryStudentId)
    // An explicit ?studentId deep-link (e.g. clicking a child on My Children)
    // always wins, even if a different sibling was previously selected. Only
    // fall back to the current/first child when there's no valid URL student.
    setSelectedId((prev) =>
      valid ? queryStudentId! : prev && data.some((d) => d.studentId === prev) ? prev : data[0].studentId,
    )
  }, [data, queryStudentId])

  // Load the selected child's demand slips + receipts whenever the child changes.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    ;(async () => {
      try {
        const [slipRes, receiptRes] = await Promise.all([
          api.get<{ slips: DemandSlipRow[] }>('/api/parent/demand-slips', { studentId: selectedId }),
          api.get<{ receipts: ReceiptRow[] }>('/api/parent/receipts', { studentId: selectedId }),
        ])
        if (cancelled) return
        setSlips(slipRes?.slips || [])
        setReceipts(receiptRes?.receipts || [])
      } catch {
        if (!cancelled) {
          setSlips([])
          setReceipts([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selected = useMemo(() => data.find((d) => d.studentId === selectedId), [data, selectedId])

  const sortedFees = useMemo(() => {
    if (!selected) return []
    return [...selected.fees].sort((a, b) => (SORT_ORDER[a.status] ?? 1) - (SORT_ORDER[b.status] ?? 1))
  }, [selected])

  // Group monthly fees into calendar cells (Apr→Mar); non-month fees (Admission,
  // Exam, Annual…) fall into a separate "Other fees" list shown below the grid.
  const { monthCells, otherFees } = useMemo(() => {
    const cells = new Map<number, MonthCell>()
    const others: FeeLine[] = []
    for (const f of selected?.fees || []) {
      const idx = monthIndexOf(f.installment)
      if (idx === -1) {
        others.push(f)
        continue
      }
      const month = ACADEMIC_MONTHS[idx]
      const cur = cells.get(idx) || { month, total: 0, paid: 0, pending: 0, status: 'unpaid' as const, count: 0, lines: [] }
      cur.total += f.amount
      cur.paid += f.paid
      cur.pending += f.pending
      cur.count += 1
      cur.lines.push(f)
      cur.status = rollUpStatus(cur.total, cur.paid, cur.pending)
      cells.set(idx, cur)
    }
    const ordered = ACADEMIC_MONTHS.map((_, i) => cells.get(i)).filter((c): c is MonthCell => !!c)
    return { monthCells: ordered, otherFees: others.sort((a, b) => (SORT_ORDER[a.status] ?? 1) - (SORT_ORDER[b.status] ?? 1)) }
  }, [selected])

  if (loading) return <LoadingState />

  if (data.length === 0) {
    return (
      <div className="space-y-5">
        <GradientHero
          icon={Receipt}
          title="Fee Details"
          description="Fees for your children"
        />
        <EmptyState icon={Receipt} title="No fee records" description="There are no fee records for your children yet." />
      </div>
    )
  }

  const s = selected?.summary
  const total = s?.total || 0
  const paid = s?.paid || 0
  const pending = s?.pending || 0
  const overdue = s?.overdue || 0
  const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : pending === 0 ? 100 : 0

  return (
    <div className="space-y-5">
      <GradientHero
        icon={Receipt}
        title="Fee Details"
        description="Fee statements, monthly breakdown, demand slips and payment receipts."
        gradientClassName="bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#0284c7_100%)]"
        badge={pending > 0 ? `Due: ${inr(pending)}` : 'All Fees Clear'}
      />

      {/* Child Switcher (if multiple children) */}
      {data.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0">Child:</span>
          {data.map((d) => {
            const active = d.studentId === selectedId
            return (
              <button
                key={d.studentId}
                type="button"
                onClick={() => setSelectedId(d.studentId)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition shadow-sm',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-primary/20'
                    : 'border-border/70 bg-card hover:border-primary/40 hover:bg-muted/50 text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[9px] font-bold',
                    active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary',
                  )}
                >
                  {initials(d.studentName)}
                </span>
                <span>{d.studentName}</span>
                {d.admissionNumber && (
                  <span className={cn('text-[10px] opacity-75 font-mono', active ? 'text-white/80' : 'text-muted-foreground')}>
                    #{d.admissionNumber}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-card to-sky-50/30 p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-500/10 dark:via-card dark:to-sky-500/5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Fee Assessment</p>
          <p className="mt-1.5 text-xl font-extrabold tracking-tight text-foreground tabular-nums">{inr(total)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Full academic session</p>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-card to-emerald-50/30 p-4 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-card dark:to-emerald-500/5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Paid Amount</p>
          <p className="mt-1.5 text-xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">{inr(paid)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{paidPct}% collected</p>
        </div>

        <div className="rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-card to-rose-50/30 p-4 shadow-sm dark:border-rose-500/20 dark:from-rose-500/10 dark:via-card dark:to-rose-500/5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Pending Balance</p>
          <p className={cn('mt-1.5 text-xl font-extrabold tracking-tight tabular-nums', pending > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
            {inr(pending)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{overdue > 0 ? `${inr(overdue)} overdue` : 'No overdue fine'}</p>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Payment Progress</span>
            {pending > 0 ? (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px]">
                Pending
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]">
                Fully Cleared
              </Badge>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-muted-foreground">Overall</span>
              <span>{paidPct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                style={{ width: `${paidPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Slips & receipts — modern collapsible card */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setShowSlipsReceipts(!showSlipsReceipts)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-muted/30"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">Demand Slips &amp; Receipts</p>
              <p className="text-xs text-muted-foreground">
                {slips.length} demand slip{slips.length === 1 ? '' : 's'} • {receipts.length} payment receipt{receipts.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-semibold">
              {showSlipsReceipts ? 'Hide Details' : 'View Slips & Receipts'}
            </Badge>
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform duration-200', showSlipsReceipts && 'rotate-180')} />
          </div>
        </button>

        {showSlipsReceipts && (
          <div className="border-t border-border/60 p-4">
            <Tabs defaultValue="slips" className="w-full">
              <TabsList className="grid h-9 w-full grid-cols-2 sm:w-64">
                <TabsTrigger value="slips" className="text-xs font-semibold">Demand Slips ({slips.length})</TabsTrigger>
                <TabsTrigger value="receipts" className="text-xs font-semibold">Receipts ({receipts.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="slips" className="mt-3">
                {slips.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No demand slips issued yet.</p>
                ) : (
                  <div className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
                    {slips.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/40 transition">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {s.billingMonth ? `${MONTHS[s.billingMonth - 1]} ${s.billingYear ?? ''}` : s.invoiceNumber}
                          </p>
                          <p className="truncate font-mono text-[10px] text-muted-foreground">{s.invoiceNumber}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">{inr(s.totalAmount)}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2.5 text-xs text-primary font-semibold hover:bg-primary/10"
                          onClick={() => window.open(`/api/parent/demand-slips/${s.id}/view`, '_blank', 'noopener')}
                        >
                          <ExternalLink className="mr-1.5 size-3.5" /> View Slip
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="receipts" className="mt-3">
                {receipts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No payment receipts yet.</p>
                ) : (
                  <div className="divide-y divide-border/60 rounded-xl border border-border/70 overflow-hidden">
                    {receipts.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-muted/40 transition">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-semibold text-foreground">{r.receiptNumber}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {formatDate(r.paymentDate)}
                            {r.paymentMethod ? ` • ${r.paymentMethod}` : ''}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{inr(r.amount)}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2.5 text-xs text-primary font-semibold hover:bg-primary/10"
                          onClick={() => window.open(`/api/parent/receipts/${r.id}/view`, '_blank', 'noopener')}
                        >
                          <ExternalLink className="mr-1.5 size-3.5" /> View Receipt
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Fee calendar — compact month grid */}
      {sortedFees.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          No fee records for this child.
        </p>
      ) : (
        <div className="space-y-3">
          {monthCells.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 px-1">
                <h3 className="text-sm font-semibold">Monthly Fees</h3>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {Object.entries(STATUS).map(([key, st]) => (
                    <span key={key} className="flex items-center gap-1">
                      <span className={cn('size-1.5 rounded-full', st.dot)} />
                      {st.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {monthCells.map((c) => {
                  const st = STATUS[c.status]
                  const multi = c.lines.length > 1
                  const isOpen = openMonth === c.month
                  return (
                    <button
                      key={c.month}
                      type="button"
                      onClick={() => setOpenMonth(isOpen ? null : c.month)}
                      className={cn(
                        'min-h-16 rounded-lg border px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:shadow-sm',
                        CELL_STYLE[c.status],
                        isOpen && 'ring-2 ring-primary/40',
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={cn('size-1.5 shrink-0 rounded-full', st.dot)} />
                        <span className="text-xs font-semibold">{c.month}</span>
                        <span className="ml-auto text-xs font-bold tabular-nums">{inr(c.total)}</span>
                      </div>
                      <p className={cn('mt-1 pl-3 text-[10px] font-medium leading-4', st.text)}>
                        {c.status === 'paid' ? 'Paid' : `${inr(c.pending)} due`}
                      </p>
                      {multi && <p className="pl-3 text-[10px] text-muted-foreground">{c.lines.length} heads</p>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Head-wise breakdown for the tapped month (Tuition, Transport…) */}
          {openMonth && (() => {
            const cell = monthCells.find((c) => c.month === openMonth)
            if (!cell) return null
            return (
              <div className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-3 py-1.5">
                  <span className="text-xs font-semibold">{cell.month} · breakdown</span>
                  <button
                    type="button"
                    onClick={() => setOpenMonth(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Close ✕
                  </button>
                </div>
                <div className="divide-y">
                  {cell.lines.map((f) => {
                    const st = STATUS[f.status] || STATUS.unpaid
                    return (
                      <div key={f.id} className="flex items-center gap-2 px-3 py-1.5">
                        <span className={cn('size-1.5 shrink-0 rounded-full', st.dot)} />
                        <p className="min-w-0 flex-1 truncate text-sm">{f.feeHead}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(f.amount)}</p>
                        <p className={cn('w-24 shrink-0 text-right text-[10px] font-medium', st.text)}>
                          {f.status === 'paid' ? 'Paid' : `${inr(f.pending)} due`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {otherFees.length > 0 && (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-semibold">Other Fees</h3>
              <div className="divide-y rounded-xl border bg-card">
                {otherFees.map((f) => {
                  const st = STATUS[f.status] || STATUS.unpaid
                  return (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
                      <span className={cn('size-1.5 shrink-0 rounded-full', st.dot)} />
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {f.feeHead}
                        {f.installment && <span className="text-muted-foreground"> · {f.installment}</span>}
                      </p>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(f.amount)}</p>
                      <p className={cn('w-24 shrink-0 text-right text-[10px] font-medium', st.text)}>
                        {f.status === 'paid' ? 'Paid' : `${inr(f.pending)} due`}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
