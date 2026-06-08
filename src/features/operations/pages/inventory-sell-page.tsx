'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ShoppingCart, Loader2, Plus, Minus, X, Search, UserCheck, Receipt } from 'lucide-react'

interface Student { id: string; firstName: string; lastName: string; admissionNumber: string | null; rollNumber: string | null }
interface ApiVariant { id: string; label: string | null; quantity: number; sellingPrice: number | null; unitPrice: number | null }
interface SellableItem { id: string; name: string; unit: string | null; variantLabel: string | null; variants: ApiVariant[] }
interface Tile { variantId: string; name: string; available: number; unitPrice: number; unit: string | null }
interface CartLine { variantId: string; name: string; available: number; unitPrice: number; quantity: number }

function inr(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
}

// Flatten sellable items into one tile per variant.
function toTiles(items: SellableItem[]): Tile[] {
  const tiles: Tile[] = []
  for (const item of items) {
    for (const v of item.variants) {
      const price = v.sellingPrice ?? v.unitPrice ?? 0
      tiles.push({
        variantId: v.id,
        name: v.label ? `${item.name} · ${item.variantLabel || ''} ${v.label}`.replace('  ', ' ').trim() : item.name,
        available: v.quantity,
        unitPrice: price,
        unit: item.unit,
      })
    }
  }
  return tiles
}

export function InventorySellPage() {
  const { toast } = useToast()
  const router = useRouter()

  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<Student[]>([])
  const [student, setStudent] = useState<Student | null>(null)

  const [tiles, setTiles] = useState<Tile[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [submitting, setSubmitting] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<{ receiptNumber: string; total: number; saleId: string } | null>(null)

  const loadItems = useCallback(() => {
    api.get<{ items: SellableItem[] }>('/api/school/inventory', { sellable: '1', limit: '500' })
      .then((r) => setTiles(toTiles(r.items || [])))
      .catch(() => setTiles([]))
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  // Student search.
  useEffect(() => {
    if (student || studentQuery.trim().length < 2) { setStudentResults([]); return }
    const t = window.setTimeout(async () => {
      try {
        const r = await api.get<{ students: Student[] }>('/api/school/students', { search: studentQuery.trim(), limit: '15' })
        setStudentResults(r.students || [])
      } catch { /* quiet */ }
    }, 300)
    return () => window.clearTimeout(t)
  }, [studentQuery, student])

  const addToCart = useCallback((tile: Tile) => {
    if (tile.unitPrice <= 0) { toast({ title: `${tile.name} has no selling price`, variant: 'destructive' }); return }
    if (tile.available <= 0) { toast({ title: `${tile.name} is out of stock`, variant: 'destructive' }); return }
    setCart((c) => {
      const existing = c.find((l) => l.variantId === tile.variantId)
      if (existing) {
        if (existing.quantity >= tile.available) { toast({ title: `Only ${tile.available} in stock` }); return c }
        return c.map((l) => l.variantId === tile.variantId ? { ...l, quantity: l.quantity + 1 } : l)
      }
      return [...c, { variantId: tile.variantId, name: tile.name, available: tile.available, unitPrice: tile.unitPrice, quantity: 1 }]
    })
  }, [toast])

  const setQty = (variantId: string, q: number) => setCart((c) => c.map((l) => l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(q, l.available)) } : l))
  const removeLine = (variantId: string) => setCart((c) => c.filter((l) => l.variantId !== variantId))

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart])
  const discountNum = Math.max(0, Math.min(Number(discount) || 0, subtotal))
  const total = subtotal - discountNum

  const handleCheckout = async () => {
    if (!student) { toast({ title: 'Select a student', variant: 'destructive' }); return }
    if (cart.length === 0) { toast({ title: 'Cart is empty', variant: 'destructive' }); return }
    try {
      setSubmitting(true)
      const res = await api.post<{ saleId: string; receiptNumber: string; totalAmount: number }>('/api/school/inventory/sales', {
        studentId: student.id,
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        discount: discountNum,
        paymentMethod,
      })
      toast({ title: 'Sale completed', description: `Receipt #${res.receiptNumber} · ${inr(res.totalAmount)} posted to ${student.firstName}'s account.` })
      setLastReceipt({ receiptNumber: res.receiptNumber, total: res.totalAmount, saleId: res.saleId })
      setCart([])
      setDiscount('')
      loadItems()
    } catch (err) {
      toast({ title: "Couldn't complete sale", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sell to Student" description="Sell store items to a student — the charge is collected and posted to their fee account with a receipt." />

      {lastReceipt && (
        <Card className="border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2 text-sm">
              <Receipt className="size-4 text-emerald-600" />
              Sale complete — Receipt <strong>#{lastReceipt.receiptNumber}</strong>, {inr(lastReceipt.total)}.
            </div>
            <Button size="sm" variant="outline" onClick={() => router.push('/inventory/sales')}>View in Sales History</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Item picker */}
        <Card>
          <CardHeader><CardTitle>Items</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tiles.map((tile) => {
                const out = tile.available <= 0
                return (
                  <button
                    key={tile.variantId}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(tile)}
                    className="flex flex-col items-start rounded-md border p-3 text-left transition hover:border-primary disabled:opacity-50"
                  >
                    <span className="text-sm font-medium leading-tight">{tile.name}</span>
                    <span className="mt-1 text-sm font-semibold">{inr(tile.unitPrice)}</span>
                    <Badge variant={out ? 'destructive' : 'secondary'} className="mt-1">{out ? 'Out of stock' : `${tile.available} in stock`}</Badge>
                  </button>
                )
              })}
              {tiles.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No sellable items. Mark items as sellable in the Items screen.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Cart / checkout */}
        <Card className="h-fit">
          <CardHeader><CardTitle className="flex items-center gap-2"><ShoppingCart className="size-4" /> Cart</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Student picker */}
            {student ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/30 p-2 text-sm">
                <span className="flex items-center gap-1.5"><UserCheck className="size-4 text-emerald-600" />{student.firstName} {student.lastName}{student.admissionNumber ? ` · ${student.admissionNumber}` : ''}</span>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => { setStudent(null); setStudentQuery('') }}><X className="size-4" /></Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Student</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search by name / admission no…" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} />
                </div>
                {studentResults.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-md border">
                    {studentResults.map((s) => (
                      <button key={s.id} type="button" onClick={() => { setStudent(s); setStudentResults([]) }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {s.firstName} {s.lastName} <span className="text-muted-foreground">{s.admissionNumber || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tap items to add them.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {cart.map((l) => (
                    <TableRow key={l.variantId}>
                      <TableCell className="py-1">
                        <div className="text-sm font-medium leading-tight">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{inr(l.unitPrice)}</div>
                      </TableCell>
                      <TableCell className="py-1">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="size-6" onClick={() => setQty(l.variantId, l.quantity - 1)}><Minus className="size-3" /></Button>
                          <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                          <Button variant="outline" size="icon" className="size-6" onClick={() => setQty(l.variantId, l.quantity + 1)} disabled={l.quantity >= l.available}><Plus className="size-3" /></Button>
                        </div>
                      </TableCell>
                      <TableCell className="py-1 text-right tabular-nums">{inr(l.unitPrice * l.quantity)}</TableCell>
                      <TableCell className="py-1"><Button variant="ghost" size="icon" className="size-6" onClick={() => removeLine(l.variantId)}><X className="size-3" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="space-y-2 border-t pt-3">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{inr(subtotal)}</span></div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Discount</span>
                <Input type="number" min={0} className="h-8 w-28 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span className="tabular-nums">{inr(total)}</span></div>
              <div className="space-y-1">
                <Label>Payment</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank / UPI</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" onClick={handleCheckout} disabled={submitting || !student || cart.length === 0 || total <= 0}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Receipt className="mr-2 size-4" />}
              Collect {inr(total)} &amp; Generate Receipt
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
