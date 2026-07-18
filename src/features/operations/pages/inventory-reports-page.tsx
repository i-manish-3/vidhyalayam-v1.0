'use client'

import { useState, useEffect, useCallback } from 'react'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'
import { Package, IndianRupee, TrendingUp, AlertTriangle, BarChart3, ShoppingCart, Percent, type LucideIcon } from 'lucide-react'

interface ReportData {
  valuation: { itemCount: number; totalUnits: number; costValue: number; retailValue: number; potentialMargin: number }
  lowStock: Array<{ id: string; name: string; quantity: number; reorderLevel: number }>
  sales: { count: number; revenue: number; discount: number }
  topSellers: Array<{ itemId: string; itemName: string; quantity: number; revenue: number }>
}

function inr(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
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
  description?: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo'
}) {
  const styles = {
    sky: { card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]', icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20', accent: 'from-sky-500 via-sky-400', bubble: 'bg-sky-500/[0.10]' },
    emerald: { card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]', icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20', accent: 'from-emerald-500 via-emerald-400', bubble: 'bg-emerald-500/[0.10]' },
    violet: { card: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05]', icon: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20', accent: 'from-violet-500 via-violet-400', bubble: 'bg-violet-500/[0.10]' },
    amber: { card: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.15] via-card to-amber-500/[0.05]', icon: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20', accent: 'from-amber-500 via-amber-400', bubble: 'bg-amber-500/[0.10]' },
    rose: { card: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05]', icon: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20', accent: 'from-rose-500 via-rose-400', bubble: 'bg-rose-500/[0.10]' },
    indigo: { card: 'border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.14] via-card to-indigo-500/[0.05]', icon: 'bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-500/20', accent: 'from-indigo-500 via-indigo-400', bubble: 'bg-indigo-500/[0.10]' },
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
            {description && <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>}
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function InventoryReportsPage() {
  const { toast } = useToast()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      const r = await api.get<ReportData>('/api/school/inventory/reports', params)
      setData(r)
    } catch {
      toast({ title: "Couldn't load reports", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [from, to, toast])

  useEffect(() => { fetchReports() }, [fetchReports])

  if (loading && !data) return <LoadingState />

  const marginPercent = data?.valuation.costValue
    ? ((data.valuation.potentialMargin / data.valuation.costValue) * 100).toFixed(1)
    : '0.0'

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <BarChart3 className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Inventory Reports</h1>
            <p className="mt-0.5 text-xs text-white/80">Stock valuation, low-stock alerts, and sales performance.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-emerald-300" />
            Last 30 days
          </span>
        </div>
      </div>

      {/* Valuation Stats */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Items / Units" value={`${data?.valuation.itemCount ?? 0} / ${data?.valuation.totalUnits ?? 0}`} description="Total inventory items and stock units" icon={Package} tone="sky" />
        <StatCard title="Stock at Cost" value={inr(data?.valuation.costValue ?? 0)} description="Total purchase value" icon={IndianRupee} tone="violet" />
        <StatCard title="Stock at Retail" value={inr(data?.valuation.retailValue ?? 0)} description="Total selling value" icon={IndianRupee} tone="emerald" />
        <StatCard title="Potential Margin" value={inr(data?.valuation.potentialMargin ?? 0)} description={`${marginPercent}% margin rate`} icon={TrendingUp} tone="amber" />
      </div>

      {/* Sales Summary Card */}
      <Card className="gap-0 overflow-hidden border-amber-500/15 bg-gradient-to-br from-card via-card to-amber-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-amber-500/15 bg-gradient-to-r from-amber-500/[0.10] via-primary/[0.05] to-rose-500/[0.08] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
              <ShoppingCart className="size-4" />
            </span>
            <CardTitle className="text-sm font-semibold">Sales Summary</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">From</Label>
              <DatePicker value={from} onChange={setFrom} triggerClassName="h-9 w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">To</Label>
              <DatePicker value={to} onChange={setTo} triggerClassName="h-9 w-40" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard title="Sales Count" value={String(data?.sales.count ?? 0)} description="Transactions in period" icon={ShoppingCart} tone="sky" />
            <StatCard title="Revenue" value={inr(data?.sales.revenue ?? 0)} description="Total collected" icon={IndianRupee} tone="emerald" />
            <StatCard title="Discounts Given" value={inr(data?.sales.discount ?? 0)} description="Total discounts applied" icon={Percent} tone="rose" />
          </div>
        </CardContent>
      </Card>

      {/* Low Stock + Top Sellers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 overflow-hidden border-rose-500/15 bg-gradient-to-br from-card via-card to-rose-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-rose-500/15 bg-gradient-to-r from-rose-500/[0.10] via-primary/[0.05] to-amber-500/[0.08] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-sm shadow-rose-500/20">
                <AlertTriangle className="size-4" />
              </span>
              <CardTitle className="text-sm font-semibold">Low Stock</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.lowStock.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <Package className="size-8 text-muted-foreground/30" />
                <span className="font-medium">All stocked up</span>
                <span className="text-xs">Every item is above its reorder level.</span>
              </div>
            ) : (
              <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-rose-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-rose-500/[0.08] via-primary/[0.04] to-amber-500/[0.07]">
                    <TableRow>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                      <TableHead className="py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Stock</TableHead>
                      <TableHead className="py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alert Level</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.lowStock.map((l) => (
                      <TableRow key={l.id} className="transition-colors hover:bg-rose-500/[0.04]">
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500/20 to-amber-500/20">
                              <Package className="size-4 text-rose-600" />
                            </span>
                            <span className="text-sm font-medium">{l.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <Badge variant="destructive" className="tabular-nums">{l.quantity}</Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-right tabular-nums text-muted-foreground">{l.reorderLevel}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden border-emerald-500/15 bg-gradient-to-br from-card via-card to-emerald-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.10] via-primary/[0.05] to-cyan-500/[0.08] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                <TrendingUp className="size-4" />
              </span>
              <CardTitle className="text-sm font-semibold">Top Sellers</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.topSellers.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                <BarChart3 className="size-8 text-muted-foreground/30" />
                <span className="font-medium">No sales yet</span>
                <span className="text-xs">Complete a sale to see top-selling items.</span>
              </div>
            ) : (
              <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-emerald-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-emerald-500/[0.08] via-primary/[0.04] to-cyan-500/[0.07]">
                    <TableRow>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</TableHead>
                      <TableHead className="py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Qty Sold</TableHead>
                      <TableHead className="py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.topSellers.map((t, idx) => (
                      <TableRow key={t.itemId} className="transition-colors hover:bg-emerald-500/[0.04]">
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-emerald-600">
                              <Package className="size-4" />
                            </span>
                            <div className="flex items-center gap-2">
                              {idx < 3 && (
                                <span className={cn(
                                  'inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white',
                                  idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700'
                                )}>
                                  {idx + 1}
                                </span>
                              )}
                              <span className="text-sm font-medium">{t.itemName}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-right tabular-nums font-semibold">{t.quantity}</TableCell>
                        <TableCell className="py-2.5 text-right tabular-nums font-semibold text-emerald-600">{inr(t.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
