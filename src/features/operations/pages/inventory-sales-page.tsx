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

interface SaleItem { id: string; itemName: string; variantLabel: string | null; quantity: number; unitPrice: number; lineTotal: number; returnedQty: number }
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
  student: { id: string; firstName: string; lastName: string; admissionNumber: string | null } | null
  items: SaleItem[]
}
interface SaleDetail extends SaleListRow {
  subtotal: number
  notes: string | null
  student: { id: string; firstName: string; lastName: string; admissionNumber: string | null; rollNumber: string | null } | null
}

// Maps a sale's settlement state to a labelled badge.
function dueBadge(s: { status: string; dueStatus?: string; totalAmount: number; amountPaid: number }): { label: string; cls: string } {
  if (s.status === 'voided') return { label: 'Voided', cls: 'border-muted-foreground/30 text-muted-foreground' }
  const due = Math.max(0, (s.totalAmount || 0) - (s.amountPaid || 0))
  if (s.dueStatus === 'due' || (due > 0 && (s.amountPaid || 0) <= 0)) return { label: 'On Due', cls: 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300' }
  if (s.dueStatus === 'partial' || due > 0) return { label: 'Partial', cls: 'border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300' }
  return { label: 'Paid', cls: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300' }
}
interface SchoolInfo { name: string; address: string | null; city: string | null; contactPhone: string | null }

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
  const [returnMode, setReturnMode] = useState(false)
  const [returnQty, setReturnQty] = useState<Record<string, string>>({})
  const [returning, setReturning] = useState(false)
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
    return { count: sales.length, totalAmount, collected, due, voided }
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

  const handleVoid = async () => {
    if (!detail) return
    if (!window.confirm(`Void sale ${detail.receiptNumber}? Items will be restocked and the amount becomes a refundable advance.`)) return
    try {
      setVoiding(true)
      const r = await api.post<{ message: string }>(`/api/school/inventory/sales/${detail.id}/void`, { reason: 'Voided from sales history' })
      toast({ title: 'Sale voided', description: r.message })
      setDetail(null)
      fetchSales()
    } catch (err) {
      toast({ title: "Couldn't void", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally { setVoiding(false) }
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
      <PageHeader title="Sales History" description="Review store receipts, dues, returns, and voided sales." />

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 shadow-sm">
        {[
          { label: 'Sales', value: stats.count.toLocaleString('en-IN') },
          { label: 'Total', value: inr(stats.totalAmount) },
          { label: 'Collected', value: inr(stats.collected) },
          { label: 'Due', value: inr(stats.due) },
          { label: 'Voided', value: stats.voided.toLocaleString('en-IN') },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2 rounded-md bg-muted/35 px-2.5 py-1.5 text-xs">
            <span className="text-muted-foreground">{item.label}</span>
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
                <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 size-4" />Print</Button>
                {detail.status !== 'voided' && (
                  <>
                    {returnMode ? (
                      <Button variant="outline" size="sm" onClick={handleReturn} disabled={returning}>{returning ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Undo2 className="mr-1 size-4" />}Confirm Return</Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setReturnMode(true)}><Undo2 className="mr-1 size-4" />Return Items</Button>
                    )}
                    <Button variant="outline" size="sm" className="text-destructive" onClick={handleVoid} disabled={voiding}>{voiding ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Ban className="mr-1 size-4" />}Void</Button>
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
    </div>
  )
}
