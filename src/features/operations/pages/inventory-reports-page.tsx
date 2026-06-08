'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package, IndianRupee, TrendingUp, AlertTriangle } from 'lucide-react'

interface ReportData {
  valuation: { itemCount: number; totalUnits: number; costValue: number; retailValue: number; potentialMargin: number }
  lowStock: Array<{ id: string; name: string; quantity: number; reorderLevel: number }>
  sales: { count: number; revenue: number; discount: number }
  topSellers: Array<{ itemId: string; itemName: string; quantity: number; revenue: number }>
}

function inr(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
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

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory Reports" description="Stock valuation, low-stock alerts, and sales performance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Items / Units" value={`${data?.valuation.itemCount ?? 0} / ${data?.valuation.totalUnits ?? 0}`} />
        <StatCard icon={IndianRupee} label="Stock at Cost" value={inr(data?.valuation.costValue ?? 0)} />
        <StatCard icon={IndianRupee} label="Stock at Retail" value={inr(data?.valuation.retailValue ?? 0)} />
        <StatCard icon={TrendingUp} label="Potential Margin" value={inr(data?.valuation.potentialMargin ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" className="h-8" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" className="h-8" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Sales" value={String(data?.sales.count ?? 0)} />
            <StatCard label="Revenue" value={inr(data?.sales.revenue ?? 0)} />
            <StatCard label="Discounts given" value={inr(data?.sales.discount ?? 0)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" /> Low Stock</CardTitle></CardHeader>
          <CardContent>
            {(data?.lowStock.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">All items are above their reorder level.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">On hand</TableHead><TableHead className="text-right">Reorder at</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data!.lowStock.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.name}</TableCell>
                      <TableCell className="text-right"><Badge variant="destructive">{l.quantity}</Badge></TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.reorderLevel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-4" /> Top Sellers</CardTitle></CardHeader>
          <CardContent>
            {(data?.topSellers.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this period.</p>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Qty sold</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data!.topSellers.map((t) => (
                    <TableRow key={t.itemId}>
                      <TableCell>{t.itemName}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(t.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon?: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        {Icon && <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="size-5" /></div>}
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}
