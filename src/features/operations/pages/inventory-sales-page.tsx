'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Receipt, Printer, Ban, Undo2, Loader2, IndianRupee } from 'lucide-react'
import { buildInventoryReceiptHtml } from '@/lib/inventory-receipt-template'
import type { SchoolForPrintHeader } from '@/lib/print-header'

interface SaleItem { id: string; itemName: string; variantLabel: string | null; quantity: number; unitPrice: number; lineTotal: number; returnedQty: number }
interface SaleReturn {
  id: string
  createdAt: string
  refundAmount: number
  ledgerReduction: number
  cashRefund: number
  refundStatus: string // none | pending | settled
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
  // Refund tracking (void of a paid sale).
  refundMode?: string | null
  refundAmount?: number
  refundStatus?: string // none | advanced | pending | settled
  // Total cash still owed back to the student (unsettled void + return refunds).
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

// Refund obligation a user can mark as paid out.
interface SettleTarget { target: 'void' | 'return'; returnId?: string; amount: number; label: string }

// Maps a sale's settlement state to a labelled badge.
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

export function InventorySalesPage() {
  const { toast } = useToast()
  const [sales, setSales] = useState<SaleListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  const [school, setSchool] = useState<SchoolInfo | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [voiding, setVoiding] = useState(false)
  // Void dialog (offers advance vs cash refund when money was collected).
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidMode, setVoidMode] = useState<'advance' | 'cash'>('advance')
  const [returnMode, setReturnMode] = useState(false)
  const [returnQty, setReturnQty] = useState<Record<string, string>>({})
  const [returning, setReturning] = useState(false)
  // Settle-refund dialog (mark a pending cash refund as physically paid).
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null)
  const [settleMethod, setSettleMethod] = useState('cash')
  const [settling, setSettling] = useState(false)
  // Collect-due dialog state.
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
        // refundMode only matters when money was collected.
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
      // Refresh the open receipt so the updated status shows, plus the list.
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

  // Print the store receipt in the same A4 format as the fee receipt, in a
  // dedicated window (so we don't print the whole app page).
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
      <PageHeader title="Sales History" description="Review store receipts, dues, returns, and reversed sales." />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
        {[
          { label: 'Sales', value: stats.count.toLocaleString('en-IN'), highlight: false },
          { label: 'Total', value: inr(stats.totalAmount), highlight: false },
          { label: 'Collected', value: inr(stats.collected), highlight: false },
          { label: 'Due', value: inr(stats.due), highlight: false },
          { label: 'Reversed', value: stats.voided.toLocaleString('en-IN'), highlight: false },
          { label: 'Refunds Due', value: inr(stats.refundsDue), highlight: stats.refundsDue > 0 },
        ].map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${
              item.highlight ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : 'bg-muted/35'
            }`}
          >
            <span className={item.highlight ? 'text-rose-600/80 dark:text-rose-300/80' : 'text-muted-foreground'}>{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>

      {sales.length === 0 ? (
        <EmptyState icon={Receipt} title="No sales yet" description="Sales made on the Sell screen will appear here." />
      ) : (
        <Card className="gap-0 overflow-hidden py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/30 px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Receipt className="size-4 text-primary" />
              Sales Records
              <Badge variant="secondary" className="ml-auto text-xs">
                {sales.length.toLocaleString('en-IN')} records
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">#{s.receiptNumber}</TableCell>
                  <TableCell>{fmtDate(s.saleDate)}</TableCell>
                  <TableCell>{s.student ? `${s.student.firstName} ${s.student.lastName}` : '—'}</TableCell>
                  <TableCell>{s.items.reduce((n, i) => n + i.quantity, 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inr(s.totalAmount)}
                    {s.status !== 'voided' && s.totalAmount - s.amountPaid > 0 && (
                      <span className="block text-[11px] font-normal text-amber-600">{inr(s.totalAmount - s.amountPaid)} due</span>
                    )}
                    {(s.pendingRefund || 0) > 0 && (
                      <span className="block text-[11px] font-normal text-rose-600">{inr(s.pendingRefund!)} refund due</span>
                    )}
                  </TableCell>
                  <TableCell>{(() => { const b = dueBadge(s); return <Badge variant="outline" className={b.cls}>{b.label}</Badge> })()}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {s.status !== 'voided' && s.totalAmount - s.amountPaid > 0.001 && (
                        <Button variant="outline" size="sm" onClick={() => openCollect(s)}>
                          <IndianRupee className="mr-1 size-4" />Collect Due
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openReceipt(s.id)}><Receipt className="mr-1 size-4" />Receipt</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detailLoading || !detail ? (
            <>
              <DialogHeader className="sr-only">
                <DialogTitle>Loading receipt</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center py-10"><Loader2 className="size-5 animate-spin" /></div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Receipt #{detail.receiptNumber}</DialogTitle>
                <DialogDescription>{fmtDate(detail.saleDate)} · {dueBadge(detail).label}</DialogDescription>
              </DialogHeader>

              <div id="inv-receipt" className="space-y-3 text-sm">
                <div className="text-center">
                  <div className="font-semibold">{school?.name}</div>
                  {school?.address && <div className="text-xs text-muted-foreground">{school.address}{school.city ? `, ${school.city}` : ''}</div>}
                  <div className="mt-1 text-xs">Store Receipt</div>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Receipt: <strong>#{detail.receiptNumber}</strong></span>
                  <span>{fmtDate(detail.saleDate)}</span>
                </div>
                {detail.student && (
                  <div className="text-xs">Student: <strong>{detail.student.firstName} {detail.student.lastName}</strong>{detail.student.admissionNumber ? ` (${detail.student.admissionNumber})` : ''}</div>
                )}
                <Table>
                  <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-center">Qty</TableHead><TableHead className="text-right">Amt</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {detail.items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="py-1">{i.itemName}{i.variantLabel && <span className="text-muted-foreground"> ({i.variantLabel})</span>}{i.returnedQty > 0 && <span className="ml-1 text-xs text-amber-600">({i.returnedQty} returned)</span>}</TableCell>
                        <TableCell className="py-1 text-center">{i.quantity} × {inr(i.unitPrice)}</TableCell>
                        <TableCell className="py-1 text-right tabular-nums">{inr(i.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="space-y-1 border-t pt-2 text-xs">
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{inr(detail.subtotal)}</span></div>
                  {detail.discount > 0 && <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">− {inr(detail.discount)}</span></div>}
                  <div className="flex justify-between text-sm font-semibold"><span>Total</span><span className="tabular-nums">{inr(detail.totalAmount)}</span></div>
                  {detail.status !== 'voided' && (detail.totalAmount - detail.amountPaid > 0) && (
                    <>
                      <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{inr(detail.amountPaid)}</span></div>
                      <div className="flex justify-between font-semibold text-amber-600"><span>Due</span><span className="tabular-nums">{inr(detail.totalAmount - detail.amountPaid)}</span></div>
                    </>
                  )}
                  <div className="flex justify-between"><span>Payment</span><span className="capitalize">{detail.paymentMethod}</span></div>
                </div>
              </div>

              {/* Void outcome — what happened to the money on a voided sale. */}
              {detail.status === 'voided' && (
                <div className="space-y-2 rounded-md border border-muted-foreground/20 bg-muted/30 p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-muted-foreground">
                    <Ban className="size-3.5" /> Reversed{detail.voidReason ? ` — ${detail.voidReason}` : ''}
                  </div>
                  {detail.refundStatus === 'none' || !detail.refundStatus ? (
                    <p className="text-muted-foreground">No payment was collected — items were restocked. Nothing to refund.</p>
                  ) : detail.refundStatus === 'advanced' ? (
                    <p>{inr(detail.refundAmount || 0)} returned as a <strong>refundable advance</strong> on the student&apos;s fee account.</p>
                  ) : detail.refundStatus === 'settled' ? (
                    <p className="text-emerald-700 dark:text-emerald-400">{inr(detail.refundAmount || 0)} cash refund <strong>paid</strong>{detail.refundMethod ? ` (${detail.refundMethod})` : ''}{detail.refundSettledAt ? ` on ${fmtDate(detail.refundSettledAt)}` : ''}.</p>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-rose-600">{inr(detail.refundAmount || 0)} cash refund pending</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => { setSettleMethod('cash'); setSettleTarget({ target: 'void', amount: detail.refundAmount || 0, label: `reversal refund for #${detail.receiptNumber}` }) }}>
                        <IndianRupee className="mr-1 size-3.5" />Mark Refunded
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Returns history + their refunds. */}
              {detail.returns && detail.returns.length > 0 && (
                <div className="space-y-2 rounded-md border p-3 text-xs">
                  <div className="flex items-center gap-2 font-semibold"><Undo2 className="size-3.5" /> Returns &amp; Refunds</div>
                  {detail.returns.map((r) => (
                    <div key={r.id} className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">{fmtDate(r.createdAt)}{r.reason ? ` · ${r.reason}` : ''}</span>
                        <span className="tabular-nums font-medium">{inr(r.refundAmount)} returned</span>
                      </div>
                      {r.ledgerReduction > 0 && (
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Cleared from due</span><span className="tabular-nums">{inr(r.ledgerReduction)}</span></div>
                      )}
                      {r.cashRefund > 0 && (
                        <div className="flex items-center justify-between">
                          <span>Cash refund</span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums">{inr(r.cashRefund)}</span>
                            {r.refundStatus === 'settled' ? (
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">Paid{r.refundMethod ? ` · ${r.refundMethod}` : ''}</Badge>
                            ) : (
                              <Button size="sm" variant="outline" className="h-7" onClick={() => { setSettleMethod('cash'); setSettleTarget({ target: 'return', returnId: r.id, amount: r.cashRefund, label: `return refund on #${detail.receiptNumber}` }) }}>
                                <IndianRupee className="mr-1 size-3.5" />Mark Refunded
                              </Button>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {returnMode && detail.status !== 'voided' && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-medium">Enter quantity to return per item:</p>
                  {detail.items.map((i) => {
                    const remaining = i.quantity - i.returnedQty
                    return (
                      <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{i.itemName} <span className="text-xs text-muted-foreground">({remaining} left)</span></span>
                        <Input type="number" min={0} max={remaining} className="h-7 w-20" value={returnQty[i.id] || ''} onChange={(e) => setReturnQty((q) => ({ ...q, [i.id]: e.target.value }))} disabled={remaining <= 0} />
                      </div>
                    )
                  })}
                </div>
              )}

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={printReceipt}><Printer className="mr-1 size-4" />Print</Button>
                {detail.status !== 'voided' && (
                  <>
                    {returnMode ? (
                      <Button variant="outline" size="sm" onClick={handleReturn} disabled={returning}>{returning ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Undo2 className="mr-1 size-4" />}Confirm Return</Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setReturnMode(true)}><Undo2 className="mr-1 size-4" />Return Items</Button>
                    )}
                    <Button variant="outline" size="sm" className="text-destructive" onClick={openVoid} disabled={voiding}><Ban className="mr-1 size-4" />Reverse</Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!collectFor} onOpenChange={(o) => !o && setCollectFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Collect Store Due</DialogTitle>
            <DialogDescription>
              {collectFor && (
                <>Receipt #{collectFor.receiptNumber} · {collectFor.student ? `${collectFor.student.firstName} ${collectFor.student.lastName}` : 'Student'}</>
              )}
            </DialogDescription>
          </DialogHeader>

          {collectFor && (() => {
            const due = Math.max(0, (collectFor.totalAmount || 0) - (collectFor.amountPaid || 0))
            return (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{inr(due)}</span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="collect-amount">Amount to collect</Label>
                  <Input
                    id="collect-amount"
                    type="number"
                    min={0}
                    max={due}
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment method</Label>
                  <Select value={collectMethod} onValueChange={setCollectMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank / UPI</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCollectFor(null)} disabled={collecting}>Cancel</Button>
            <Button onClick={handleCollect} disabled={collecting}>
              {collecting ? <Loader2 className="mr-1 size-4 animate-spin" /> : <IndianRupee className="mr-1 size-4" />}
              Collect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirmation — offers advance vs cash refund when money was collected. */}
      <Dialog open={voidOpen} onOpenChange={(o) => !o && setVoidOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reverse Sale</DialogTitle>
            <DialogDescription>
              {detail && <>Receipt #{detail.receiptNumber} · items will be restocked.</>}
            </DialogDescription>
          </DialogHeader>

          {detail && (() => {
            const collected = detail.amountPaid || 0
            const hasPayment = collected > 0
            return (
              <div className="space-y-3 text-sm">
                {hasPayment ? (
                  <>
                    <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
                      <span className="text-muted-foreground">Collected so far</span>
                      <span className="font-semibold tabular-nums">{inr(collected)}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label>How should this {inr(collected)} be refunded?</Label>
                      <Select value={voidMode} onValueChange={(v) => setVoidMode(v as 'advance' | 'cash')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="advance">Keep as account advance (use for future fees)</SelectItem>
                          <SelectItem value="cash">Cash refund to student (pay back physically)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {voidMode === 'advance'
                          ? 'The amount stays as a refundable credit on the student’s fee account.'
                          : 'Recorded as a pending cash refund — mark it paid once you hand over the cash.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No payment was collected on this sale. Reversing will simply restock the items — nothing to refund.</p>
                )}
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voiding}>Cancel</Button>
            <Button variant="destructive" onClick={handleVoid} disabled={voiding}>
              {voiding ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Ban className="mr-1 size-4" />}
              Confirm Reverse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settle a pending cash refund (void or return). */}
      <Dialog open={!!settleTarget} onOpenChange={(o) => !o && setSettleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Refund Paid</DialogTitle>
            <DialogDescription>{settleTarget?.label}</DialogDescription>
          </DialogHeader>

          {settleTarget && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Cash refund</span>
                <span className="font-semibold tabular-nums text-rose-600">{inr(settleTarget.amount)}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Paid via</Label>
                <Select value={settleMethod} onValueChange={setSettleMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank / UPI</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">This records that the money was handed back. It does not move ledger balances — those were already settled by the reversal/return.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)} disabled={settling}>Cancel</Button>
            <Button onClick={handleSettleRefund} disabled={settling}>
              {settling ? <Loader2 className="mr-1 size-4 animate-spin" /> : <IndianRupee className="mr-1 size-4" />}
              Confirm Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
