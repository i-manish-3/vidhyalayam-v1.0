'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ShoppingCart,
  Loader2,
  Plus,
  Minus,
  X,
  Search,
  UserCheck,
  Receipt,
  Package,
  Banknote,
  Users,
  Percent,
  Store,
  Wallet,
  Landmark,
  Scale,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

interface Student { id: string; firstName: string; lastName: string; admissionNumber: string | null; rollNumber: string | null }
interface ApiVariant { id: string; label: string | null; quantity: number; sellingPrice: number | null; unitPrice: number | null }
interface SellableItem { id: string; name: string; unit: string | null; variantLabel: string | null; variants: ApiVariant[] }
interface Tile { variantId: string; name: string; available: number; unitPrice: number; unit: string | null }
interface CartLine { variantId: string; name: string; available: number; unitPrice: number; quantity: number }

function inr(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
}

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
  tone: 'sky' | 'emerald' | 'amber' | 'violet'
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

export function InventorySellPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canSell = hasPermission(PERMISSIONS.INVENTORY_SELL) || hasPermission(PERMISSIONS.FEES_COLLECT)

  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<Student[]>([])
  const [student, setStudent] = useState<Student | null>(null)

  const [tiles, setTiles] = useState<Tile[]>([])
  const [itemSearch, setItemSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [paymentMode, setPaymentMode] = useState<'paid' | 'partial' | 'due'>('paid')
  const [amountPaid, setAmountPaid] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<{ receiptNumber: string; total: number; paid: number; due: number; saleId: string } | null>(null)

  const loadItems = useCallback(() => {
    api.get<{ items: SellableItem[] }>('/api/school/inventory', { sellable: '1', limit: '500' })
      .then((r) => setTiles(toTiles(r.items || [])))
      .catch(() => setTiles([]))
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

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
  const filteredTiles = useMemo(() => {
    const query = itemSearch.trim().toLowerCase()
    if (!query) return tiles
    return tiles.filter((tile) => tile.name.toLowerCase().includes(query))
  }, [itemSearch, tiles])

  const collectNow = paymentMode === 'due'
    ? 0
    : paymentMode === 'partial'
      ? Math.max(0, Math.min(Number(amountPaid) || 0, total))
      : total
  const dueNow = Math.max(0, total - collectNow)

  const handleCheckout = async () => {
    if (!student) { toast({ title: 'Select a student', variant: 'destructive' }); return }
    if (cart.length === 0) { toast({ title: 'Cart is empty', variant: 'destructive' }); return }
    if (paymentMode === 'partial' && collectNow <= 0) { toast({ title: 'Enter an amount to collect', description: 'Or switch to "On due" to bill the whole amount.', variant: 'destructive' }); return }
    try {
      setSubmitting(true)
      const res = await api.post<{ saleId: string; receiptNumber: string; totalAmount: number; amountPaid: number; dueAmount: number }>('/api/school/inventory/sales', {
        studentId: student.id,
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        discount: discountNum,
        paymentMethod,
        paymentMode,
        amountPaid: collectNow,
      })
      const desc = res.dueAmount > 0
        ? `Receipt #${res.receiptNumber} · ${inr(res.amountPaid)} collected, ${inr(res.dueAmount)} kept as a store due for ${student.firstName}. Collect it later from Inventory → Sales.`
        : `Receipt #${res.receiptNumber} · ${inr(res.totalAmount)} collected from ${student.firstName}.`
      toast({ title: res.dueAmount > 0 ? 'Sale completed — store due pending' : 'Sale completed', description: desc })
      setLastReceipt({ receiptNumber: res.receiptNumber, total: res.totalAmount, paid: res.amountPaid, due: res.dueAmount, saleId: res.saleId })
      setCart([])
      setDiscount('')
      setAmountPaid('')
      setPaymentMode('paid')
      loadItems()
    } catch (err) {
      toast({ title: "Couldn't complete sale", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const inStockTiles = tiles.filter((t) => t.available > 0).length
  const outOfStockTiles = tiles.length - inStockTiles
  const cartValue = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0)

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <ShoppingCart className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Sell to Student</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {tiles.length.toLocaleString('en-IN')} items
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Sell store items to a student. Collect now, take part payment, or put it on due.</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sellable Items"
          value={tiles.length.toLocaleString('en-IN')}
          description="Total inventory items"
          icon={Package}
          tone="sky"
        />
        <StatCard
          title="In Stock"
          value={inStockTiles.toLocaleString('en-IN')}
          description="Available for sale"
          icon={Store}
          tone="emerald"
        />
        <StatCard
          title="Out of Stock"
          value={outOfStockTiles.toLocaleString('en-IN')}
          description="Unavailable items"
          icon={X}
          tone="amber"
        />
        <StatCard
          title="Cart Value"
          value={inr(cartValue)}
          description={cart.length > 0 ? `${cart.length} items in cart` : 'Cart is empty'}
          icon={Banknote}
          tone="violet"
        />
      </div>

      {/* Receipt Banner */}
      {lastReceipt && (
        <Card className={cn('overflow-hidden border shadow-sm', lastReceipt.due > 0 ? 'border-amber-300' : 'border-emerald-300')}>
          <div className={cn('h-1 w-full', lastReceipt.due > 0 ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-emerald-400 to-emerald-600')} />
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Receipt className={cn('size-4', lastReceipt.due > 0 ? 'text-amber-600' : 'text-emerald-600')} />
              {lastReceipt.due > 0 ? (
                <span>Sale complete — Receipt <strong>#{lastReceipt.receiptNumber}</strong>. {inr(lastReceipt.paid)} collected, <strong className="text-amber-600">{inr(lastReceipt.due)} store due</strong> pending. Collect it from Inventory → Sales.</span>
              ) : (
                <span>Sale complete — Receipt <strong>#{lastReceipt.receiptNumber}</strong>, {inr(lastReceipt.total)} collected.</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => router.push('/inventory/sales')}>
              {lastReceipt.due > 0 ? 'Collect in Sales' : 'View in Sales History'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Item picker */}
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                  <Package className="size-4" />
                </span>
                Sellable Items
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {filteredTiles.length.toLocaleString('en-IN')} records
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search item by name..."
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredTiles.map((tile) => {
                const out = tile.available <= 0
                const lowStock = !out && tile.available <= 5
                return (
                  <button
                    key={tile.variantId}
                    type="button"
                    disabled={out}
                    onClick={() => addToCart(tile)}
                    className={cn(
                      'group relative flex flex-col rounded-lg border bg-background p-2.5 text-left transition-all',
                      'hover:-translate-y-0.5 hover:shadow-md',
                      'disabled:opacity-50 disabled:hover:shadow-none disabled:hover:translate-y-0',
                      out
                        ? 'border-red-200 dark:border-red-900/30'
                        : lowStock
                          ? 'border-amber-200 dark:border-amber-900/40 hover:border-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-950/20'
                          : 'border-sky-200 dark:border-sky-900/30 hover:border-sky-400 hover:bg-sky-50/30 dark:hover:bg-sky-950/20'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-md',
                        out
                          ? 'bg-red-100 text-red-500 dark:bg-red-950/50'
                          : lowStock
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50'
                            : 'bg-sky-100 text-sky-600 dark:bg-sky-950/50'
                      )}>
                        <Package className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="line-clamp-1 text-xs font-medium leading-snug">{tile.name}</span>
                        <div className="mt-0.5 flex items-baseline gap-1">
                          <span className="text-sm font-bold tracking-tight text-foreground">{inr(tile.unitPrice)}</span>
                          {tile.unit && <span className="text-[10px] text-muted-foreground">/{tile.unit}</span>}
                        </div>
                      </div>
                    </div>

                    <div className={cn(
                      'mt-1.5 flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      out
                        ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
                        : lowStock
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    )}>
                      <span className={cn(
                        'size-1.5 rounded-full',
                        out ? 'bg-red-500' : lowStock ? 'bg-amber-500' : 'bg-emerald-500'
                      )} />
                      {out ? 'Out of stock' : `${tile.available} in stock`}
                    </div>
                  </button>
                )
              })}
              {tiles.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Package className="size-10 text-muted-foreground/30" />
                  <span>No sellable items.</span>
                  <span className="text-xs">Mark items as sellable in the <button type="button" className="text-primary underline underline-offset-2" onClick={() => router.push('/inventory/catalog')}>Items screen</button>.</span>
                </div>
              )}
              {tiles.length > 0 && filteredTiles.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Search className="size-10 text-muted-foreground/30" />
                  <span>No items match your search.</span>
                  <button type="button" className="text-xs text-primary underline underline-offset-2" onClick={() => setItemSearch('')}>Clear search</button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cart / checkout */}
        <Card className="h-fit gap-0 overflow-hidden border-violet-500/15 bg-gradient-to-br from-card via-card to-violet-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-violet-500/15 bg-gradient-to-r from-violet-500/[0.10] via-primary/[0.05] to-amber-500/[0.08] px-4 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-primary text-white shadow-sm shadow-violet-500/20">
                  <ShoppingCart className="size-4" />
                </span>
                Cart
              </CardTitle>
              <Badge variant="secondary" className="text-xs">
                {cart.length.toLocaleString('en-IN')} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {/* Student picker */}
            {student ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.10] via-card to-emerald-500/[0.05] p-2.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                    <UserCheck className="size-4" />
                  </span>
                  <span className="font-medium">{student.firstName} {student.lastName}</span>
                  {student.admissionNumber && <span className="text-muted-foreground">· {student.admissionNumber}</span>}
                </span>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => { setStudent(null); setStudentQuery('') }}><X className="size-4" /></Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <Users className="size-3.5 text-muted-foreground" />
                  Student
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search by name / admission no…" value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} />
                </div>
                {studentResults.length > 0 && (
                  <div className="max-h-48 overflow-auto rounded-md border">
                    {studentResults.map((s) => (
                      <button key={s.id} type="button" onClick={() => { setStudent(s); setStudentResults([]) }} className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-sky-500/[0.08]">
                        <span className="font-medium">{s.firstName} {s.lastName}</span>
                        <span className="text-muted-foreground ml-1">{s.admissionNumber || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <div className="flex size-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/40">
                  <ShoppingCart className="size-6 text-violet-400" />
                </div>
                <span className="font-medium">Cart is empty</span>
                <span className="text-xs">Tap items on the left to add them here.</span>
              </div>
            ) : (
              <div className="themed-scrollbar max-h-72 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
                {cart.map((l) => {
                  const lineTotal = l.unitPrice * l.quantity
                  return (
                    <div
                      key={l.variantId}
                      className="group rounded-lg border border-violet-500/15 bg-gradient-to-br from-violet-500/[0.04] via-card to-violet-500/[0.02] p-2 transition-colors hover:border-violet-500/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-tight">{l.name}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {inr(l.unitPrice)} each
                            {l.available <= (l.quantity + 5) && (
                              <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400">{Math.max(0, l.available - l.quantity)} left</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(l.variantId)}
                          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQty(l.variantId, l.quantity - 1)}
                            className="flex size-6 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="flex w-7 items-center justify-center text-sm tabular-nums font-semibold">{l.quantity}</span>
                          <button
                            type="button"
                            onClick={() => setQty(l.variantId, l.quantity + 1)}
                            disabled={l.quantity >= l.available}
                            className="flex size-6 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <span className="truncate text-sm font-semibold tabular-nums text-violet-700 dark:text-violet-300">{inr(lineTotal)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-2.5 rounded-xl border border-violet-500/10 bg-gradient-to-br from-violet-500/[0.03] to-transparent p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums font-medium">{inr(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Percent className="size-3.5" />
                  Discount
                </span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-28 pl-5 text-right tabular-nums"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-violet-500/10 pt-2.5 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums text-primary">{inr(total)}</span>
              </div>
            </div>

            {/* Settlement mode */}
            <div className="space-y-2.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Banknote className="size-3.5 text-muted-foreground" />
                Settlement
              </Label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  { key: 'paid', label: 'Collect now', hint: 'Pay in full', icon: Wallet, tone: 'emerald' },
                  { key: 'partial', label: 'Partial', hint: 'Part now', icon: Percent, tone: 'amber' },
                  { key: 'due', label: 'On due', hint: 'Store due', icon: Store, tone: 'violet' },
                ] as const).map((opt) => {
                  const selected = paymentMode === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPaymentMode(opt.key)}
                      className={cn(
                        'flex flex-col items-center gap-0.5 rounded-md border px-1.5 py-1.5 text-center transition-all',
                        selected
                          ? [
                              'shadow-xs',
                              opt.tone === 'emerald' && 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20',
                              opt.tone === 'amber' && 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/20',
                              opt.tone === 'violet' && 'border-violet-500 bg-violet-50/50 dark:bg-violet-950/20',
                            ]
                          : 'border-transparent bg-muted/30 hover:bg-muted/60'
                      )}
                    >
                      <opt.icon className={cn(
                        'size-3.5',
                        selected
                          ? opt.tone === 'emerald' ? 'text-emerald-600' : opt.tone === 'amber' ? 'text-amber-600' : 'text-violet-600'
                          : 'text-muted-foreground'
                      )} />
                      <span className={cn(
                        'text-[11px] font-semibold leading-tight',
                        selected ? 'text-foreground' : 'text-muted-foreground'
                      )}>{opt.label}</span>
                      <span className="text-[9px] text-muted-foreground leading-none">{opt.hint}</span>
                    </button>
                  )
                })}
              </div>

              {paymentMode === 'partial' && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-sm dark:border-amber-900/30 dark:bg-amber-950/15">
                  <span className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
                    <Banknote className="size-4" />
                    Collect now
                  </span>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-amber-600 dark:text-amber-400">₹</span>
                    <Input
                      type="number"
                      min={0}
                      max={total}
                      className="h-8 w-28 border-amber-200 pl-5 text-right tabular-nums dark:border-amber-900/30"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {dueNow > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-50/30 px-3 py-2.5 text-sm dark:border-amber-900/30 dark:from-amber-950/20 dark:to-amber-950/10">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xs">
                      <Store className="size-3.5" />
                    </span>
                    <span className="font-semibold text-amber-800 dark:text-amber-300">Store due</span>
                  </div>
                  <span className="text-base font-bold tabular-nums text-amber-800 dark:text-amber-300">{inr(dueNow)}</span>
                </div>
              )}

              {paymentMode !== 'due' && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Banknote className="size-3.5 text-muted-foreground" />
                    Payment method
                  </Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="h-9 border-violet-200 bg-background/80 text-sm shadow-xs dark:border-violet-900/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">
                        <div className="flex items-center gap-2">
                          <Wallet className="size-4 text-emerald-600" />
                          <span>Cash</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="bank">
                        <div className="flex items-center gap-2">
                          <Landmark className="size-4 text-blue-600" />
                          <span>Bank / UPI</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="adjustment">
                        <div className="flex items-center gap-2">
                          <Scale className="size-4 text-amber-600" />
                          <span>Adjustment</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Button
              className={cn(
                'w-full gap-2 bg-gradient-to-r shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg',
                paymentMode === 'due'
                  ? 'from-violet-600 to-primary hover:from-violet-500 hover:to-primary'
                  : paymentMode === 'partial'
                    ? 'from-amber-600 to-primary hover:from-amber-500 hover:to-primary'
                    : 'from-emerald-600 to-primary hover:from-emerald-500 hover:to-primary'
              )}
              onClick={handleCheckout}
              disabled={submitting || !canSell || !student || cart.length === 0 || total <= 0 || (paymentMode === 'partial' && collectNow <= 0)}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Receipt className="size-4" />}
              {paymentMode === 'due'
                ? `Put ${inr(total)} on Store Due`
                : paymentMode === 'partial'
                  ? `Collect ${inr(collectNow)} · ${inr(dueNow)} due`
                  : `Collect ${inr(total)} & Generate Receipt`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
