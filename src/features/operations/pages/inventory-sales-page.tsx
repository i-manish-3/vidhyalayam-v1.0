'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Receipt, Printer, Ban, Undo2, Loader2 } from 'lucide-react'

interface SaleItem { id: string; itemName: string; variantLabel: string | null; quantity: number; unitPrice: number; lineTotal: number; returnedQty: number }
interface SaleListRow {
  id: string
  receiptNumber: string
  saleDate: string
  totalAmount: number
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

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Sales History" description={`${sales.length} sale(s)`} />

      {sales.length === 0 ? (
        <EmptyState icon={Receipt} title="No sales yet" description="Sales made on the Sell screen will appear here." />
      ) : (
        <div className="rounded-md border">
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
                  <TableCell className="text-right tabular-nums">{inr(s.totalAmount)}</TableCell>
                  <TableCell><Badge variant={s.status === 'voided' ? 'outline' : 'secondary'}>{s.status}</Badge></TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => openReceipt(s.id)}><Receipt className="mr-1 size-4" />Receipt</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!detail || detailLoading} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          {detailLoading || !detail ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="size-5 animate-spin" /></div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Receipt #{detail.receiptNumber}</DialogTitle>
                <DialogDescription>{fmtDate(detail.saleDate)} · {detail.status}</DialogDescription>
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
                  <div className="flex justify-between text-sm font-semibold"><span>Total Paid</span><span className="tabular-nums">{inr(detail.totalAmount)}</span></div>
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
    </div>
  )
}
