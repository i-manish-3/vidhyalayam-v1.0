'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Receipt,
  Printer,
  Ban,
  Undo2,
  Loader2,
  IndianRupee,
  History,
  Banknote,
  ArrowLeftRight,
  RotateCcw,
  Wallet,
  Landmark,
  Scale,
  FileText,
  User,
  type LucideIcon,
} from 'lucide-react'
import { buildInventoryReceiptHtml } from '@/lib/inventory-receipt-template'
import type { SchoolForPrintHeader } from '@/lib/print-header'

interface SaleItem { id: string; itemName: string; variantLabel: string | null; quantity: number; unitPrice: number; lineTotal: number; returnedQty: number }
interface SaleReturn {
  id: string
  createdAt: string
  refundAmount: number
  ledgerReduction: number
  cashRefund: number
  refundStatus: string
  refundMethod: string | null
  refundSettledAt: string | null
  reason: string | null
  itemsJson: string | null
}
interface SaleListRow {
  id: string
  receiptNumber: string
  saleDate: string
  totalAmount: number
  amountPaid: number
  dueStatus: string
  discount: number
  status: string
  paymentMethod: string
  academicYear?: string | null
  refundMode?: string | null
  refundAmount?: number
  refundStatus?: string
  pendingRefund?: number
  student: { id: string; firstName: string; lastName: string; admissionNumber: string | null } | null
  items: SaleItem[]
}
interface SaleDetail extends SaleListRow {
  subtotal: number
  notes: string | null
  voidReason: string | null
  refundMethod: string | null
  refundSettledAt: string | null
  returns: SaleReturn[]
  student: { id: string; firstName: string; lastName: string; admissionNumber: string | null; rollNumber: string | null } | null
}

interface SettleTarget { target: 'void' | 'return'; returnId?: string; amount: number; label: string }

function dueBadge(s: { status: string; dueStatus?: string; totalAmount: number; amountPaid: number }): { label: string; cls: string } {
  if (s.status === 'voided') return { label: 'Reversed', cls: 'border-muted-foreground/30 text-muted-foreground' }
  const due = Math.max(0, (s.totalAmount || 0) - (s.amountPaid || 0))
  if (s.dueStatus === 'due' || (due > 0 && (s.amountPaid || 0) <= 0)) return { label: 'On Due', cls: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300' }
  if (s.dueStatus === 'partial' || due > 0) return { label: 'Partial', cls: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300' }
  return { label: 'Paid', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300' }
}
type SchoolInfo = SchoolForPrintHeader

function inr(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose'
}) {
  const styles = {
    sky: {
      card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]',
      icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20',
      accent: 'from-sky-500 via-sky-400',
      bubble: 'bg-sky-500/[0.10]',
    },
    emerald: {
      card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]',
      icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
      accent: 'from-emerald-500 via-emerald-400',
      bubble: 'bg-emerald-500/[0.10]',
    },
    amber: {
      card: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.14] via-card to-amber-500/[0.05]',
      icon: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20',
      accent: 'from-amber-500 via-amber-400',
      bubble: 'bg-amber-500/[0.10]',
    },
    violet: {
      card: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05]',
      icon: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20',
      accent: 'from-violet-500 via-violet-400',
      bubble: 'bg-violet-500/[0.10]',
    },
    rose: {
      card: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05]',
      icon: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20',
      accent: 'from-rose-500 via-rose-400',
      bubble: 'bg-rose-500/[0.10]',
    },
  }[tone]

  return (
    <Card className={cn('group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div aria-hidden className={cn('absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125', styles.bubble)} />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function InventorySalesPage() {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canSell = hasPermission(PERMISSIONS.INVENTORY_SELL) || hasPermission(PERMISSIONS.FEES_COLLECT)
  const [sales, setSales] = useState<SaleListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [school, setSchool] = useState<SchoolInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidMode, setVoidMode] = useState<'advance' | 'cash'>('advance')
  const [returnMode, setReturnMode] = useState(false)
  const [returnQty, setReturnQty] = useState<Record<string, string>>({})
  const [returning, setReturning] = useState(false)
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null)
  const [settleMethod, setSettleMethod] = useState('cash')
  const [settling, setSettling] = useState(false)
  const [collectFor, setCollectFor] = useState<SaleListRow | null>(null)
  const [collectAmount, setCollectAmount] = useState('')
  const [collectMethod, setCollectMethod] = useState('cash')
  const [collecting, setCollecting] = useState(false)

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true)
      const r = await api.get<{ sales: SaleListRow[] }>('/api/school/inventory/sales', { limit: '50' })
      setSales(r.sales || [])
    } catch {
      toast({ title: "Couldn't load sales", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchSales() }, [fetchSales])

  const stats = useMemo(() => {
    const totalAmount = sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
    const collected = sales.reduce((sum, sale) => sum + sale.amountPaid, 0)
    const due = sales.reduce((sum, sale) => sum + Math.max(0, sale.totalAmount - sale.amountPaid), 0)
    const voided = sales.filter((sale) => sale.status === 'voided').length
    const refundsDue = sales.reduce((sum, sale) => sum + (sale.pendingRefund || 0), 0)
    return { count: sales.length, totalAmount, collected, due, voided, refundsDue }
  }, [sales])

  const openReceipt = async (id: string) => {
    setDetailLoading(true)
    setReturnMode(false)
    setReturnQty({})
    try {
      const r = await api.get<{ sale: SaleDetail; school: SchoolInfo }>(`/api/school/inventory/sales/${id}`)
      setDetail(r.sale)
      setSchool(r.school)
    } catch {
      toast({ title: "Couldn't load receipt", variant: 'destructive' })
    } finally { setDetailLoading(false) }
  }

  const openVoid = () => {
    setVoidMode('advance')
    setVoidOpen(true)
  }

  const handleVoid = async () => {
    if (!detail) return
    const hasPayment = (detail.amountPaid || 0) > 0
    try {
      setVoiding(true)
      const r = await api.post<{ message: string }>(`/api/school/inventory/sales/${detail.id}/void`, {
        reason: 'Voided from sales history',
        refundMode: hasPayment ? voidMode : 'advance',
      })
      toast({ title: 'Sale reversed', description: r.message })
      setVoidOpen(false)
      setDetail(null)
      fetchSales()
    } catch (err) {
      toast({ title: "Couldn't reverse", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally { setVoiding(false) }
  }

  const handleSettleRefund = async () => {
    if (!settleTarget || !detail) return
    try {
      setSettling(true)
      const r = await api.patch<{ message: string }>(`/api/school/inventory/sales/${detail.id}`, {
        action: 'settleRefund',
        target: settleTarget.target,
        returnId: settleTarget.returnId,
        method: settleMethod,
      })
      toast({ title: 'Refund settled', description: r.message })
      setSettleTarget(null)
      await openReceipt(detail.id)
      fetchSales()
    } catch (err) {
      toast({ title: "Couldn't settle refund", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally { setSettling(false) }
  }

  const handleReturn = async () => {
    if (!detail) return
    const items = detail.items
      .map((i) => ({ saleItemId: i.id, quantity: Number(returnQty[i.id] || 0) }))
      .filter((i) => i.quantity > 0)
    if (items.length === 0) { toast({ title: 'Enter quantities to return', variant: 'destructive' }); return }
    try {
      setReturning(true)
      const r = await api.post<{ message: string }>(`/api/school/inventory/sales/${detail.id}/return`, { items })
      toast({ title: 'Return processed', description: r.message })
      setDetail(null)
      fetchSales()
    } catch (err) {
      toast({ title: "Couldn't return", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally { setReturning(false) }
  }

  const printReceipt = () => {
    if (!detail) return
    const html = buildInventoryReceiptHtml({
      school,
      receiptNumber: detail.receiptNumber,
      saleDate: new Date(detail.saleDate),
      student: detail.student,
      items: detail.items.map((i) => ({
        itemName: i.itemName, variantLabel: i.variantLabel, quantity: i.quantity,
        unitPrice: i.unitPrice, lineTotal: i.lineTotal, returnedQty: i.returnedQty,
      })),
      subtotal: detail.subtotal,
      discount: detail.discount,
      totalAmount: detail.totalAmount,
      amountPaid: detail.amountPaid,
      paymentMethod: detail.paymentMethod,
      status: detail.status,
      academicYear: detail.academicYear ?? null,
    })
    const printWindow = window.open('', '_blank', 'width=900,height=1100')
    if (!printWindow) { window.print(); return }
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.onafterprint = () => printWindow.close()
    setTimeout(() => {
      try { printWindow.focus(); printWindow.print() } catch { /* noop */ }
    }, 300)
  }

  const openCollect = (s: SaleListRow) => {
    const due = Math.max(0, (s.totalAmount || 0) - (s.amountPaid || 0))
    setCollectFor(s)
    setCollectAmount(due > 0 ? String(due) : '')
    setCollectMethod('cash')
  }

  const handleCollect = async () => {
    if (!collectFor) return
    const due = Math.max(0, (collectFor.totalAmount || 0) - (collectFor.amountPaid || 0))
    const amount = Number(collectAmount)
    if (!Number.isFinite(amount) || amount <= 0) { toast({ title: 'Enter an amount to collect', variant: 'destructive' }); return }
    if (amount > due + 0.001) { toast({ title: 'Amount exceeds the due', description: `Only ${inr(due)} is outstanding.`, variant: 'destructive' }); return }
    try {
      setCollecting(true)
      const r = await api.post<{ receiptNumber: string; collected: number; dueAmount: number }>(`/api/school/inventory/sales/${collectFor.id}/collect`, {
        amount,
        paymentMethod: collectMethod,
      })
      toast({
        title: 'Payment collected',
        description: `Receipt #${r.receiptNumber} · ${inr(r.collected)} collected${r.dueAmount > 0 ? `, ${inr(r.dueAmount)} still due` : ' — fully paid'}.`,
      })
      setCollectFor(null)
      fetchSales()
    } catch (err) {
      toast({ title: "Couldn't collect", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setCollecting(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Receipt className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Sales History</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {stats.count.toLocaleString('en-IN')} sales
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Review store receipts, dues, returns, and reversed sales.</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Sales" value={stats.count.toLocaleString('en-IN')} description="Total transactions" icon={Receipt} tone="sky" />
        <StatCard title="Total Amount" value={inr(stats.totalAmount)} description="Gross sales value" icon={Banknote} tone="violet" />
        <StatCard title="Collected" value={inr(stats.collected)} description="Cash received" icon={Wallet} tone="emerald" />
        <StatCard title="Due" value={inr(stats.due)} description="Outstanding payments" icon={ArrowLeftRight} tone="amber" />
        <StatCard title="Reversed" value={stats.voided.toLocaleString('en-IN')} description="Voided sales" icon={RotateCcw} tone="rose" />
        <StatCard title="Refunds Due" value={inr(stats.refundsDue)} description={stats.refundsDue > 0 ? 'Pending cash payouts' : 'All settled'} icon={Undo2} tone={stats.refundsDue > 0 ? 'rose' : 'emerald'} />
      </div>

      {sales.length === 0 ? (
        <EmptyState icon={Receipt} title="No sales yet" description="Sales made on the Sell screen will appear here." />
      ) : (
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                  <History className="size-4" />
                </span>
                Sales Records
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {sales.length.toLocaleString('en-IN')} records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Receipt</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</TableHead>
                    <TableHead className="py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Amount</TableHead>
                    <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="w-44 py-2.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id} className="transition-colors hover:bg-sky-500/[0.04]">
                      <TableCell className="py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                          <FileText className="size-3" />
                          #{s.receiptNumber}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-sm text-muted-foreground">{fmtDate(s.saleDate)}</TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-md bg-sky-100 text-sky-600 dark:bg-sky-950/40">
                            <User className="size-3.5" />
                          </span>
                          <span className="text-sm font-medium">{s.student ? `${s.student.firstName} ${s.student.lastName}` : '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="tabular-nums text-sm font-medium">{s.items.reduce((n, i) => n + i.quantity, 0)}</span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        <div className="text-sm font-semibold tabular-nums">{inr(s.totalAmount)}</div>
                        {s.status !== 'voided' && s.totalAmount - s.amountPaid > 0 && (
                          <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 tabular-nums">{inr(s.totalAmount - s.amountPaid)} due</div>
                        )}
                        {(s.pendingRefund || 0) > 0 && (
                          <div className="text-[10px] font-medium text-rose-600 dark:text-rose-400 tabular-nums">{inr(s.pendingRefund!)} refund</div>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5">{(() => { const b = dueBadge(s); return <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0.5', b.cls)}>{b.label}</Badge> })()}</TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.status !== 'voided' && s.totalAmount - s.amountPaid > 0.001 && canSell && (
                            <Button
                              size="sm"
                              className="h-7 gap-1 border-amber-200 bg-amber-50 text-amber-700 text-xs shadow-xs hover:bg-amber-100 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300"
                              variant="outline"
                              onClick={() => openCollect(s)}
                            >
                              <IndianRupee className="size-3" />Collect
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => openReceipt(s.id)}>
                            <Receipt className="size-3" />Receipt
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Receipt detail dialog */}
      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-lg [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          {detailLoading || !detail ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>Loading receipt</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center py-10"><Loader2 className="size-5 animate-spin" /></div>
            </>
          ) : (
            <>
              <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
                <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
                <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
                <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
                <div className="relative flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                    <Receipt className="size-5 text-white" />
                  </span>
                  <div>
                    <DialogTitle className="text-lg font-bold tracking-normal text-white">Receipt #{detail.receiptNumber}</DialogTitle>
                    <DialogDescription className="mt-0.5 text-xs text-white/75">
                      {fmtDate(detail.saleDate)} · <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm', dueBadge(detail).label === 'Paid' ? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-100' : dueBadge(detail).label === 'Partial' ? 'border-orange-300/60 bg-orange-400/20 text-orange-100' : dueBadge(detail).label === 'On Due' ? 'border-amber-300/60 bg-amber-400/20 text-amber-100' : 'border-white/30 bg-white/10 text-white/80')}>{dueBadge(detail).label}</span>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
                {/* School header */}
                <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 text-center shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                  <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
                  <div className="relative">
                    <div className="font-bold text-base">{school?.name}</div>
                    {school?.address && <div className="text-xs text-muted-foreground">{school.address}{school.city ? `, ${school.city}` : ''}</div>}
                    <div className="mt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Store Receipt</div>
                  </div>
                </div>

                {/* Receipt & Student */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-sky-500/20 dark:bg-background/35">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                      <Receipt className="size-3" />
                      Receipt
                    </div>
                    <p className="mt-0.5 text-xs font-semibold">#{detail.receiptNumber}</p>
                  </div>
                  <div className="rounded-lg border border-sky-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-sky-500/20 dark:bg-background/35">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-sky-700 dark:text-sky-300">
                      <User className="size-3" />
                      Student
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold">
                      {detail.student ? `${detail.student.firstName} ${detail.student.lastName}` : '—'}
                      {detail.student?.admissionNumber && <span className="text-muted-foreground"> ({detail.student.admissionNumber})</span>}
                    </p>
                  </div>
                </div>

                {/* Items table */}
                <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-4">
                  <div aria-hidden className="absolute -bottom-10 left-12 size-24 rounded-full bg-violet-200/30 blur-xl dark:bg-violet-500/10" />
                  <div className="relative space-y-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                      <Receipt className="size-3" />
                      Items
                    </div>
                    <div className="overflow-hidden rounded-lg border shadow-xs">
                      <Table>
                        <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                          <TableRow>
                            <TableHead className="py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                            <TableHead className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</TableHead>
                            <TableHead className="py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amt</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.items.map((i) => (
                            <TableRow key={i.id} className="hover:bg-sky-500/[0.03]">
                              <TableCell className="py-1.5 text-xs">{i.itemName}{i.variantLabel && <span className="text-muted-foreground"> ({i.variantLabel})</span>}{i.returnedQty > 0 && <span className="ml-1 text-xs text-amber-600">({i.returnedQty} returned)</span>}</TableCell>
                              <TableCell className="py-1.5 text-center text-xs">{i.quantity} × {inr(i.unitPrice)}</TableCell>
                              <TableCell className="py-1.5 text-right tabular-nums text-xs font-semibold">{inr(i.lineTotal)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Totals */}
                    <div className="space-y-1 border-t pt-2 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums font-medium">{inr(detail.subtotal)}</span></div>
                      {detail.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums font-medium text-rose-600">− {inr(detail.discount)}</span></div>}
                      <div className="flex justify-between border-t pt-1 text-sm font-bold"><span>Total</span><span className="tabular-nums text-primary">{inr(detail.totalAmount)}</span></div>
                      {detail.status !== 'voided' && (detail.totalAmount - detail.amountPaid > 0) && (
                        <>
                          <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums font-medium text-emerald-600">{inr(detail.amountPaid)}</span></div>
                          <div className="flex justify-between font-bold text-amber-600"><span>Due</span><span className="tabular-nums">{inr(detail.totalAmount - detail.amountPaid)}</span></div>
                        </>
                      )}
                      <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="font-medium capitalize">{detail.paymentMethod}</span></div>
                    </div>
                  </div>
                </div>

                {/* Void outcome */}
                {detail.status === 'voided' && (
                  <div className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-orange-500/10">
                    <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-rose-200/35 blur-xl dark:bg-rose-500/15" />
                    <div className="relative space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-md bg-rose-100 text-rose-600 dark:bg-rose-950/50">
                          <Ban className="size-3.5" />
                        </span>
                        <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">Reversed</span>
                        {detail.voidReason && <span className="text-xs text-muted-foreground">· {detail.voidReason}</span>}
                      </div>

                      {detail.refundStatus === 'none' || !detail.refundStatus ? (
                        <div className="flex items-center gap-2 rounded-lg border border-muted bg-white/60 px-3 py-2 text-xs text-muted-foreground dark:bg-background/40">
                          <Ban className="size-3.5 shrink-0 text-muted-foreground/50" />
                          No payment was collected on this sale. Reversing restocked the items — nothing to refund.
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 rounded-lg border bg-white/60 px-3 py-2.5 dark:bg-background/40">
                          <div className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-lg',
                            detail.refundStatus === 'settled' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50' :
                            detail.refundStatus === 'advanced' ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/50' :
                            'bg-rose-100 text-rose-600 dark:bg-rose-950/50'
                          )}>
                            <IndianRupee className="size-4.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'font-bold text-base tabular-nums',
                                detail.refundStatus === 'settled' ? 'text-emerald-700 dark:text-emerald-400' :
                                detail.refundStatus === 'advanced' ? 'text-violet-700 dark:text-violet-400' :
                                'text-rose-700 dark:text-rose-400'
                              )}>{inr(detail.refundAmount || 0)}</span>
                              <span className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                detail.refundStatus === 'settled' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                                detail.refundStatus === 'advanced' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' :
                                'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                              )}>
                                {detail.refundStatus === 'advanced' ? 'Advance' : detail.refundStatus === 'settled' ? 'Paid' : 'Pending'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {detail.refundStatus === 'advanced'
                                ? 'Refundable advance on fee account'
                                : detail.refundStatus === 'settled'
                                  ? `Cash refund paid${detail.refundMethod ? ` via ${detail.refundMethod}` : ''}${detail.refundSettledAt ? ` on ${fmtDate(detail.refundSettledAt)}` : ''}`
                                  : 'Cash refund pending — collect from counter'}
                            </p>
                          </div>
                          {detail.refundStatus !== 'settled' && detail.refundStatus !== 'advanced' && canSell && (
                            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 border-rose-200 bg-white text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/30 dark:bg-transparent dark:text-rose-400" onClick={() => { setSettleMethod('cash'); setSettleTarget({ target: 'void', amount: detail.refundAmount || 0, label: `reversal refund for #${detail.receiptNumber}` }) }}>
                              <IndianRupee className="size-3.5" />Mark Paid
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Returns history */}
                {detail.returns && detail.returns.length > 0 && (
                  <div className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-yellow-500/10">
                    <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-amber-200/35 blur-xl dark:bg-amber-500/15" />
                    <div className="relative space-y-2">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="flex size-5 items-center justify-center rounded bg-amber-100 text-amber-600 dark:bg-amber-950/50">
                          <Undo2 className="size-3" />
                        </span>
                        Returns &amp; Refunds
                      </div>
                      {detail.returns.map((r) => (
                        <div key={r.id} className="space-y-1 border-t border-amber-200/50 pt-2 first:border-t-0 first:pt-0 dark:border-amber-900/20">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">{fmtDate(r.createdAt)}{r.reason ? ` · ${r.reason}` : ''}</span>
                            <span className="tabular-nums font-semibold">{inr(r.refundAmount)} returned</span>
                          </div>
                          {r.ledgerReduction > 0 && (
                            <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Cleared from due</span><span className="tabular-nums">{inr(r.ledgerReduction)}</span></div>
                          )}
                          {r.cashRefund > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Cash refund</span>
                              <span className="flex items-center gap-2">
                                <span className="tabular-nums font-medium">{inr(r.cashRefund)}</span>
                                {r.refundStatus === 'settled' ? (
                                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[9px] px-1.5 dark:bg-emerald-950/20 dark:text-emerald-300">Paid{r.refundMethod ? ` · ${r.refundMethod}` : ''}</Badge>
                                ) : canSell ? (
                                  <Button size="sm" variant="outline" className="h-6 gap-1 border-amber-200 text-[10px]" onClick={() => { setSettleMethod('cash'); setSettleTarget({ target: 'return', returnId: r.id, amount: r.cashRefund, label: `return refund on #${detail.receiptNumber}` }) }}>
                                    <IndianRupee className="size-3" />Pay
                                  </Button>
                                ) : null}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {returnMode && detail.status !== 'voided' && (
                  <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.03] via-card to-primary/[0.02] p-4 shadow-sm">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <Undo2 className="size-3.5 text-primary" />
                      Enter quantity to return per item:
                    </p>
                    <div className="mt-3 space-y-2">
                      {detail.items.map((i) => {
                        const remaining = i.quantity - i.returnedQty
                        return (
                          <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-xs">{i.itemName} <span className="text-muted-foreground">({remaining} left)</span></span>
                            <Input type="number" min={0} max={remaining} className="h-7 w-20 text-xs" value={returnQty[i.id] || ''} onChange={(e) => setReturnQty((q) => ({ ...q, [i.id]: e.target.value }))} disabled={remaining <= 0} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] to-transparent px-5 py-3 sm:px-6">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={printReceipt}><Printer className="size-3.5" />Print</Button>
                {detail.status !== 'voided' && canSell && (
                  <>
                    {returnMode ? (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleReturn} disabled={returning}>
                        {returning ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}Confirm Return
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/30 dark:text-amber-300" onClick={() => setReturnMode(true)}>
                        <Undo2 className="size-3.5" />Return Items
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:text-red-400" onClick={openVoid} disabled={voiding}>
                      <Ban className="size-3.5" />Reverse
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Collect due dialog */}
      <Dialog open={!!collectFor} onOpenChange={(o) => !o && setCollectFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
                <IndianRupee className="size-5" />
              </span>
              <div>
                <DialogTitle>Collect Store Due</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {collectFor && (
                    <>Receipt #{collectFor.receiptNumber} · {collectFor.student ? `${collectFor.student.firstName} ${collectFor.student.lastName}` : 'Student'}</>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {collectFor && (() => {
            const due = Math.max(0, (collectFor.totalAmount || 0) - (collectFor.amountPaid || 0))
            return (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/30 px-3 py-2.5 dark:border-amber-900/30 dark:from-amber-950/15 dark:to-amber-950/5">
                  <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-medium text-xs">
                    <Banknote className="size-3.5" />
                    Outstanding
                  </span>
                  <span className="font-bold tabular-nums text-amber-800 dark:text-amber-300">{inr(due)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="collect-amount" className="text-xs font-medium">Amount to collect</Label>
                  <Input
                    id="collect-amount"
                    type="number"
                    min={0}
                    max={due}
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    placeholder="0"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Payment method</Label>
                  <Select value={collectMethod} onValueChange={setCollectMethod}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        <div className="flex items-center gap-2"><Wallet className="size-4 text-emerald-600" /><span>Cash</span></div>
                      </SelectItem>
                      <SelectItem value="bank">
                        <div className="flex items-center gap-2"><Landmark className="size-4 text-blue-600" /><span>Bank / UPI</span></div>
                      </SelectItem>
                      <SelectItem value="adjustment">
                        <div className="flex items-center gap-2"><Scale className="size-4 text-amber-600" /><span>Adjustment</span></div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectFor(null)} disabled={collecting}>Cancel</Button>
            <Button onClick={handleCollect} disabled={collecting || !canSell} className="gap-2">
              {collecting ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />}
              Collect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirmation */}
      <Dialog open={voidOpen} onOpenChange={(o) => !o && setVoidOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm">
                <Ban className="size-5" />
              </span>
              <div>
                <DialogTitle>Reverse Sale</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {detail && <>Receipt #{detail.receiptNumber} · items will be restocked.</>}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {detail && (() => {
            const collected = detail.amountPaid || 0
            const hasPayment = collected > 0
            return (
              <div className="space-y-3 text-sm">
                {hasPayment ? (
                  <>
                    <div className="flex items-center justify-between rounded-lg border border-muted px-3 py-2.5">
                      <span className="text-xs text-muted-foreground">Collected so far</span>
                      <span className="font-bold tabular-nums">{inr(collected)}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">How should this {inr(collected)} be refunded?</Label>
                      <Select value={voidMode} onValueChange={(v) => setVoidMode(v as 'advance' | 'cash')}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="advance">
                            <div className="flex items-center gap-2"><Scale className="size-4 text-violet-600" /><span>Keep as account advance</span></div>
                          </SelectItem>
                          <SelectItem value="cash">
                            <div className="flex items-center gap-2"><Wallet className="size-4 text-amber-600" /><span>Cash refund to student</span></div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {voidMode === 'advance'
                          ? 'The amount stays as a refundable credit on the student\'s fee account.'
                          : 'Recorded as a pending cash refund — mark it paid once you hand over the cash.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                    <Ban className="size-4 shrink-0 text-muted-foreground/50" />
                    No payment was collected on this sale. Reversing will simply restock the items — nothing to refund.
                  </div>
                )}
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voiding}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voiding || !canSell} className="gap-2">
              {voiding ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              Confirm Reverse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle refund dialog */}
      <Dialog open={!!settleTarget} onOpenChange={(o) => !o && setSettleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                <IndianRupee className="size-5" />
              </span>
              <div>
                <DialogTitle>Mark Refund Paid</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">{settleTarget?.label}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {settleTarget && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-50/30 px-3 py-2.5 dark:border-rose-900/30 dark:from-rose-950/15">
                <span className="flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                  <Wallet className="size-3.5" />
                  Cash refund
                </span>
                <span className="font-bold tabular-nums text-rose-600">{inr(settleTarget.amount)}</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Paid via</Label>
                <Select value={settleMethod} onValueChange={setSettleMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      <div className="flex items-center gap-2"><Wallet className="size-4 text-emerald-600" /><span>Cash</span></div>
                    </SelectItem>
                    <SelectItem value="bank">
                      <div className="flex items-center gap-2"><Landmark className="size-4 text-blue-600" /><span>Bank / UPI</span></div>
                    </SelectItem>
                    <SelectItem value="adjustment">
                      <div className="flex items-center gap-2"><Scale className="size-4 text-amber-600" /><span>Adjustment</span></div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">This records that the money was handed back. It does not move ledger balances — those were already settled by the reversal/return.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)} disabled={settling}>Cancel</Button>
            <Button onClick={handleSettleRefund} disabled={settling || !canSell} className="gap-2">
              {settling ? <Loader2 className="size-4 animate-spin" /> : <IndianRupee className="size-4" />}
              Confirm Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
