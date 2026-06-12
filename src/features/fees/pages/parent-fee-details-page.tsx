'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Receipt } from 'lucide-react'

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
        <PageHeader title="Fee Details" description="Fees for your children" />
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
    <div className="space-y-3">
      <PageHeader title="Fee Details" description="Fees for your children" />

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selected?.studentName || 'Student'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected?.admissionNumber ? `Admission no. ${selected.admissionNumber}` : 'Fee summary'}
            </p>
          </div>

          {data.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto sm:justify-end">
              {data.map((d) => {
                const active = d.studentId === selectedId
                return (
                  <button
                    key={d.studentId}
                    type="button"
                    onClick={() => setSelectedId(d.studentId)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs font-medium transition',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted',
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
                    {d.studentName}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 border-t text-xs sm:grid-cols-4">
          <div className="border-r px-3 py-2">
            <p className="text-muted-foreground">Due</p>
            <p className={cn('mt-0.5 font-bold tabular-nums', pending > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {inr(pending)}
            </p>
          </div>
          <div className="border-r px-3 py-2">
            <p className="text-muted-foreground">Paid</p>
            <p className="mt-0.5 font-bold text-emerald-600 tabular-nums">{inr(paid)}</p>
          </div>
          <div className="px-3 py-2 sm:border-r">
            <p className="text-muted-foreground">Total</p>
            <p className="mt-0.5 font-bold tabular-nums">{inr(total)}</p>
          </div>
          <div className="col-span-3 flex items-center gap-2 border-t px-3 py-2 sm:col-span-1 sm:border-t-0">
            {pending > 0 ? (
              <AlertCircle className="size-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            )}
            <span className={cn('text-xs font-medium', pending > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {pending > 0 ? `${paidPct}% paid${overdue > 0 ? `, ${inr(overdue)} overdue` : ''}` : 'All clear'}
            </span>
          </div>
        </div>
        <div className="h-1 w-full bg-muted">
          <div className="h-full rounded-full bg-brand" style={{ width: `${paidPct}%` }} />
        </div>
      </div>

      {/* Slips & receipts — collapsed by default to keep the page short */}
      <details className="group overflow-hidden rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-semibold">
          <span className="flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            Slips &amp; Receipts
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {slips.length} slips · {receipts.length} receipts
            </span>
          </span>
          <span className="text-xs text-muted-foreground transition group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t px-2 pb-2">
          <Tabs defaultValue="slips" className="w-full">
            <TabsList className="mt-2 grid h-8 w-full grid-cols-2 sm:w-64">
              <TabsTrigger value="slips">Demand Slips</TabsTrigger>
              <TabsTrigger value="receipts">Receipts</TabsTrigger>
            </TabsList>

            <TabsContent value="slips" className="mt-2">
              {slips.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No demand slips.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {slips.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-2.5 py-2 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.billingMonth ? `${MONTHS[s.billingMonth - 1]} ${s.billingYear ?? ''}` : s.invoiceNumber}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{s.invoiceNumber}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(s.totalAmount)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-primary"
                        onClick={() => window.open(`/api/parent/demand-slips/${s.id}/view`, '_blank', 'noopener')}
                      >
                        <ExternalLink className="mr-1 size-3.5" /> View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="receipts" className="mt-2">
              {receipts.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No receipts yet.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {receipts.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 px-2.5 py-2 hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-medium">{r.receiptNumber}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {formatDate(r.paymentDate)}
                          {r.paymentMethod ? ` · ${r.paymentMethod}` : ''}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">{inr(r.amount)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-primary"
                        onClick={() => window.open(`/api/parent/receipts/${r.id}/view`, '_blank', 'noopener')}
                      >
                        <ExternalLink className="mr-1 size-3.5" /> View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </details>

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
