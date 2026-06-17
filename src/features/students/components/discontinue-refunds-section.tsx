'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bus, Building2, IndianRupee, Loader2, Wallet } from 'lucide-react'

interface DiscontinueRefund {
  id: string
  scope: 'transport' | 'hostel'
  refundMode: string | null
  refundAmount: number
  refundStatus: string // advanced | pending | settled
  refundMethod: string | null
  refundSettledAt: string | null
  createdAt: string
}

function inr(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DiscontinueRefundsSection({
  studentId,
  refreshKey,
  canSettle,
  onChanged,
}: {
  studentId: string
  refreshKey?: number
  canSettle?: boolean
  onChanged?: () => void
}) {
  const { toast } = useToast()
  const [refunds, setRefunds] = useState<DiscontinueRefund[]>([])
  const [loading, setLoading] = useState(true)
  const [settleFor, setSettleFor] = useState<DiscontinueRefund | null>(null)
  const [method, setMethod] = useState('cash')
  const [settling, setSettling] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ refunds: DiscontinueRefund[] }>(`/api/school/students/${studentId}/discontinue-refunds`)
      setRefunds(r.refunds || [])
    } catch {
      /* silent — section just stays hidden on error */
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { load() }, [load, refreshKey])

  const handleSettle = async () => {
    if (!settleFor) return
    setSettling(true)
    try {
      const path = settleFor.scope === 'transport'
        ? `/api/school/students/${studentId}/transport/withdraw`
        : `/api/school/students/${studentId}/hostel/withdraw`
      const r = await api.patch<{ message: string }>(path, { eventId: settleFor.id, method })
      toast({ title: 'Refund settled', description: r.message })
      setSettleFor(null)
      await load()
      onChanged?.()
    } catch (err) {
      toast({ title: "Couldn't settle refund", description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSettling(false)
    }
  }

  if (loading || refunds.length === 0) return null

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-sm">
      <CardHeader className="border-b bg-muted/30 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4 text-primary" />
          Transport / Hostel Refunds
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {refunds.map((r) => (
          <div key={`${r.scope}-${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              {r.scope === 'transport' ? <Bus className="size-4 text-muted-foreground" /> : <Building2 className="size-4 text-muted-foreground" />}
              <span className="capitalize">{r.scope} discontinued</span>
              <span className="text-xs text-muted-foreground">· {fmtDate(r.createdAt)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">{inr(r.refundAmount)}</span>
              {r.refundStatus === 'advanced' ? (
                <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-300">On account advance</Badge>
              ) : r.refundStatus === 'settled' ? (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">
                  Paid{r.refundMethod ? ` · ${r.refundMethod}` : ''}
                </Badge>
              ) : (
                <>
                  <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300">Cash refund pending</Badge>
                  {canSettle && (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => { setMethod('cash'); setSettleFor(r) }}>
                      <IndianRupee className="mr-1 size-3.5" />Mark Refunded
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!settleFor} onOpenChange={(o) => !o && setSettleFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Refund Paid</DialogTitle>
            <DialogDescription>{settleFor && `${settleFor.scope} discontinue refund`}</DialogDescription>
          </DialogHeader>
          {settleFor && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground">Cash refund</span>
                <span className="font-semibold tabular-nums text-rose-600">{inr(settleFor.refundAmount)}</span>
              </div>
              <div className="space-y-1.5">
                <Label>Paid via</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank / UPI</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Records that the money was handed back. Ledger balances were already settled by the discontinue.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleFor(null)} disabled={settling}>Cancel</Button>
            <Button onClick={handleSettle} disabled={settling}>
              {settling ? <Loader2 className="mr-1 size-4 animate-spin" /> : <IndianRupee className="mr-1 size-4" />}
              Confirm Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
