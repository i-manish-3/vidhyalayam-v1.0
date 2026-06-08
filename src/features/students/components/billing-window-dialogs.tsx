'use client'

/**
 * Billing-window dialogs: TC issuance, transport add, transport discontinue.
 *
 * Each dialog calls its `/preview` endpoint on every input change to render
 * the impact panel BEFORE the cashier commits. The commit click POSTs to the
 * matching write endpoint. All three are co-located here because they share
 * the same patterns and helpers.
 */

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Loader2, CheckCircle2, XCircle, Bus, FileX2, Undo2, Receipt, Building2 } from 'lucide-react'

// ─── shared types ──────────────────────────────────────────────────────────

interface PreviewItem {
  itemId: string
  feeHeadName: string
  installmentName: string | null
  amount: number
  dueDate: string | null
}
interface SkippedItem extends PreviewItem {
  paidAmount: number
  refundable: number
}

interface WithdrawPreview {
  success: boolean
  effectiveDate: string
  academicYear: string
  reason: string
  cancelledItems: PreviewItem[]
  cancelledAmount: number
  requiresRefund: SkippedItem[]
  totalRefundDue: number
  academicAssignmentsClosed: number
  transportAllocationsClosed: number
}

interface TransportPreview {
  success: boolean
  canCommit: boolean
  blockers: string[]
  billableMonths: string[]
  droppedMonths: string[]
  fare: number
  totalAmount: number
  academicYear: string
  effectiveFrom: string
}

interface TransportWithdrawPreview {
  success: boolean
  canCommit: boolean
  blockers: string[]
  allocationId?: string
  stopName?: string
  effectiveDate: string
  cancelledItems: PreviewItem[]
  cancelledAmount: number
  requiresRefund: SkippedItem[]
  totalRefundDue: number
}

interface RouteOption {
  id: string
  routeName: string
  routeNumber: string | null
  stops: string | null
}
interface StopOption {
  name: string
  fare: number
}

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'TC', label: 'Transfer Certificate (TC)' },
  { value: 'DROPOUT', label: 'Dropout' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'COMPLETED', label: 'Course Completed' },
  { value: 'OTHER', label: 'Other' },
]

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Debounce a value by `ms` — keeps the preview endpoint from being called on
// every keystroke. 250ms feels live without spamming the server.
function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// ─── 1. TC / withdrawal dialog ─────────────────────────────────────────────

interface WithdrawDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  onSuccess?: () => void
}

export function WithdrawStudentDialog({ open, onOpenChange, studentId, studentName, onSuccess }: WithdrawDialogProps) {
  const { toast } = useToast()
  const [effectiveDate, setEffectiveDate] = useState(todayISO())
  const [reason, setReason] = useState<'TC' | 'DROPOUT' | 'TRANSFER' | 'COMPLETED' | 'OTHER'>('TC')
  const [reasonNotes, setReasonNotes] = useState('')
  const [transferCertNo, setTransferCertNo] = useState('')
  const [refundEligible, setRefundEligible] = useState(false)
  const [preview, setPreview] = useState<WithdrawPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveDate, 300)
  const debouncedReason = useDebounced(reason, 300)

  // Reset state when dialog closes — avoids showing stale preview if reopened.
  useEffect(() => {
    if (!open) {
      setEffectiveDate(todayISO())
      setReason('TC')
      setReasonNotes('')
      setTransferCertNo('')
      setRefundEligible(false)
      setPreview(null)
      setPreviewError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!debouncedDate) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .post<WithdrawPreview>(`/api/school/students/${studentId}/withdraw/preview`, {
        effectiveDate: debouncedDate,
        reason: debouncedReason,
      })
      .then((data) => {
        if (cancelled) return
        setPreview(data)
      })
      .catch((err) => {
        if (cancelled) return
        setPreview(null)
        setPreviewError(err instanceof Error ? err.message : 'Preview failed')
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, studentId, debouncedDate, debouncedReason])

  const handleSubmit = async () => {
    if (!preview) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/withdraw`, {
        effectiveDate,
        reason,
        reasonNotes: reasonNotes.trim() || undefined,
        transferCertNo: transferCertNo.trim() || undefined,
        refundEligible,
      })
      toast({
        title: 'Student withdrawn',
        description: `${studentName} marked as ${reason}. ${preview.cancelledItems.length} fee item(s) cancelled.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't withdraw student",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileX2 className="size-4" /> Issue Transfer Certificate
          </DialogTitle>
          <DialogDescription>
            Withdraw {studentName} from the school. Future-dated unpaid fees will be cancelled. Already-paid future
            fees are flagged for manual refund.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wd-effdate">Effective Date</Label>
              <Input
                id="wd-effdate"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wd-reason">Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger id="wd-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wd-tc">TC Number (optional)</Label>
              <Input
                id="wd-tc"
                value={transferCertNo}
                onChange={(e) => setTransferCertNo(e.target.value)}
                placeholder="e.g. TC/2025/0123"
              />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input
                id="wd-refund"
                type="checkbox"
                checked={refundEligible}
                onChange={(e) => setRefundEligible(e.target.checked)}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="wd-refund" className="text-sm font-normal">
                Eligible for refund of paid fees
              </Label>
            </div>
          </div>

          <div>
            <Label htmlFor="wd-notes">Notes (required for backdated TCs)</Label>
            <Textarea
              id="wd-notes"
              rows={2}
              value={reasonNotes}
              onChange={(e) => setReasonNotes(e.target.value)}
              placeholder="Reason for withdrawal, parent communication, etc."
            />
          </div>

          <PreviewPanel loading={previewLoading} error={previewError} preview={preview} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || previewLoading || !preview || !!previewError}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Confirm Withdrawal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewPanel({
  loading,
  error,
  preview,
}: {
  loading: boolean
  error: string | null
  preview: WithdrawPreview | null
}) {
  if (loading && !preview) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Calculating impact…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
        <XCircle className="size-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-medium">Preview failed</div>
          <div className="text-xs mt-0.5">{error}</div>
        </div>
      </div>
    )
  }
  if (!preview) return null

  const { cancelledItems, cancelledAmount, requiresRefund, totalRefundDue } = preview
  const empty = cancelledItems.length === 0 && requiresRefund.length === 0

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="font-medium flex items-center gap-2 mb-2">
        <CheckCircle2 className="size-4 text-emerald-600" />
        Impact preview
      </div>
      {empty && (
        <div className="text-muted-foreground text-xs">
          No future-dated unpaid items to cancel. The student will be marked withdrawn but no billing changes.
        </div>
      )}
      {cancelledItems.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              Cancelling {cancelledItems.length} unpaid item(s)
            </span>
            <Badge variant="secondary">{formatINR(cancelledAmount)}</Badge>
          </div>
          <ItemTable items={cancelledItems} />
        </div>
      )}
      {requiresRefund.length > 0 && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              {requiresRefund.length} paid item(s) require manual refund
            </span>
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
              {formatINR(totalRefundDue)}
            </Badge>
          </div>
          <ItemTable items={requiresRefund} showPaid />
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        Closes {preview.academicAssignmentsClosed} academic assignment(s) and {preview.transportAllocationsClosed} transport
        allocation(s) for AY {preview.academicYear}.
      </div>
    </div>
  )
}

function ItemTable({ items, showPaid = false }: { items: Array<PreviewItem | SkippedItem>; showPaid?: boolean }) {
  return (
    <div className="max-h-40 overflow-auto rounded border bg-background">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1 font-medium">Head</th>
            <th className="text-left px-2 py-1 font-medium">Period</th>
            <th className="text-right px-2 py-1 font-medium">Amount</th>
            {showPaid && <th className="text-right px-2 py-1 font-medium">Paid</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId} className="border-t">
              <td className="px-2 py-1">{item.feeHeadName}</td>
              <td className="px-2 py-1 text-muted-foreground">{item.installmentName || '—'}</td>
              <td className="px-2 py-1 text-right tabular-nums">{formatINR(item.amount)}</td>
              {showPaid && 'paidAmount' in item && (
                <td className="px-2 py-1 text-right tabular-nums text-amber-700 dark:text-amber-400">
                  {formatINR(item.paidAmount)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── 2. Add transport dialog ───────────────────────────────────────────────

interface AddTransportDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  academicYear: string
  onSuccess?: () => void
}

export function AddTransportDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  academicYear,
  onSuccess,
}: AddTransportDialogProps) {
  const { toast } = useToast()
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [routesLoading, setRoutesLoading] = useState(false)
  const [routeId, setRouteId] = useState('')
  const [stopName, setStopName] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<TransportPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveFrom, 300)
  const debouncedRoute = useDebounced(routeId, 100)
  const debouncedStop = useDebounced(stopName, 100)

  useEffect(() => {
    if (!open) {
      setRouteId('')
      setStopName('')
      setEffectiveFrom(todayISO())
      setReason('')
      setPreview(null)
      setPreviewError(null)
    }
  }, [open])

  // Load routes when dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRoutesLoading(true)
    api
      .get<{ routes: RouteOption[] }>('/api/school/transport/routes', { academicYear })
      .then((data) => {
        if (!cancelled) setRoutes(data.routes || [])
      })
      .catch(() => {
        if (!cancelled) setRoutes([])
      })
      .finally(() => {
        if (!cancelled) setRoutesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, academicYear])

  const stopsForRoute = useMemo<StopOption[]>(() => {
    const route = routes.find((r) => r.id === routeId)
    if (!route?.stops) return []
    try {
      const parsed = JSON.parse(route.stops)
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((s) =>
          typeof s === 'string'
            ? { name: s, fare: 0 }
            : { name: String(s.name || ''), fare: Number(s.fare) || 0 },
        )
        .filter((s) => s.name)
    } catch {
      return []
    }
  }, [routes, routeId])

  // Reset stopName when route changes — old stop may not exist on new route.
  useEffect(() => {
    setStopName('')
  }, [routeId])

  useEffect(() => {
    if (!open || !debouncedRoute || !debouncedStop) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .post<TransportPreview>(`/api/school/students/${studentId}/transport/preview`, {
        routeId: debouncedRoute,
        stopName: debouncedStop,
        effectiveFrom: debouncedDate,
      })
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(err instanceof Error ? err.message : 'Preview failed')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, studentId, debouncedRoute, debouncedStop, debouncedDate])

  const handleSubmit = async () => {
    if (!preview?.canCommit) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/transport`, {
        routeId,
        stopName,
        effectiveFrom,
        reason: reason.trim() || undefined,
      })
      toast({
        title: 'Transport added',
        description: `${studentName} allocated to ${stopName}. ${preview.billableMonths.length} month(s) billed.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't add transport",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bus className="size-4" /> Add Transport
          </DialogTitle>
          <DialogDescription>
            Allocate a transport route to {studentName}. Months prior to the effective date will be skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="at-route">Route</Label>
            <Select value={routeId} onValueChange={setRouteId} disabled={routesLoading || routes.length === 0}>
              <SelectTrigger id="at-route">
                <SelectValue placeholder={routesLoading ? 'Loading routes…' : 'Select a route'} />
              </SelectTrigger>
              <SelectContent>
                {routes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.routeName} {r.routeNumber ? `(${r.routeNumber})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="at-stop">Stop</Label>
              <Select value={stopName} onValueChange={setStopName} disabled={!routeId || stopsForRoute.length === 0}>
                <SelectTrigger id="at-stop">
                  <SelectValue placeholder={routeId ? 'Select stop' : 'Pick a route first'} />
                </SelectTrigger>
                <SelectContent>
                  {stopsForRoute.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name} — {formatINR(s.fare)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="at-effdate">Effective From</Label>
              <Input
                id="at-effdate"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="at-reason">Reason (optional)</Label>
            <Input
              id="at-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Mid-year transport opt-in"
            />
          </div>

          <TransportPreviewPanel loading={previewLoading} error={previewError} preview={preview} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || previewLoading || !preview?.canCommit}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Add Transport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransportPreviewPanel({
  loading,
  error,
  preview,
}: {
  loading: boolean
  error: string | null
  preview: TransportPreview | null
}) {
  if (loading && !preview) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Calculating fare…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
        {error}
      </div>
    )
  }
  if (!preview) return null
  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="font-medium flex items-center gap-2 mb-2">
        <CheckCircle2 className={preview.canCommit ? 'size-4 text-emerald-600' : 'size-4 text-amber-600'} />
        Fare preview
      </div>
      {preview.blockers.length > 0 && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
          <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
            {preview.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}
      {preview.canCommit && (
        <>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Per-month</div>
              <div className="font-semibold tabular-nums">{formatINR(preview.fare)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Months</div>
              <div className="font-semibold">{preview.billableMonths.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total</div>
              <div className="font-semibold tabular-nums">{formatINR(preview.totalAmount)}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-medium">Billing:</span>{' '}
            {preview.billableMonths.join(', ') || '—'}
            {preview.droppedMonths.length > 0 && (
              <>
                {' · '}
                <span className="line-through opacity-70">{preview.droppedMonths.join(', ')}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── 3. Discontinue transport dialog ───────────────────────────────────────

interface DiscontinueTransportDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  onSuccess?: () => void
}

export function DiscontinueTransportDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onSuccess,
}: DiscontinueTransportDialogProps) {
  const { toast } = useToast()
  const [effectiveDate, setEffectiveDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<TransportWithdrawPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveDate, 300)

  useEffect(() => {
    if (!open) {
      setEffectiveDate(todayISO())
      setReason('')
      setPreview(null)
      setPreviewError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !debouncedDate) return
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .post<TransportWithdrawPreview>(`/api/school/students/${studentId}/transport/withdraw/preview`, {
        effectiveDate: debouncedDate,
      })
      .then((data) => {
        if (!cancelled) setPreview(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(err instanceof Error ? err.message : 'Preview failed')
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, studentId, debouncedDate])

  const handleSubmit = async () => {
    if (!preview?.canCommit) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/transport/withdraw`, {
        effectiveDate,
        reason: reason.trim() || undefined,
      })
      toast({
        title: 'Transport discontinued',
        description: `${preview.cancelledItems.length} month(s) cancelled${
          preview.totalRefundDue > 0 ? `, ${formatINR(preview.totalRefundDue)} flagged for refund` : ''
        }.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't discontinue transport",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bus className="size-4" /> Discontinue Transport
          </DialogTitle>
          <DialogDescription>
            Stop transport billing for {studentName} from the effective date forward. The student remains enrolled.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="dt-effdate">Effective Date</Label>
            <Input
              id="dt-effdate"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="dt-reason">Reason (optional)</Label>
            <Input
              id="dt-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Family moved closer to school"
            />
          </div>

          {previewLoading && !preview && (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Calculating impact…
            </div>
          )}
          {previewError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {previewError}
            </div>
          )}
          {preview && !preview.canCommit && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-200">
                {preview.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
          {preview && preview.canCommit && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="font-medium flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Impact preview
              </div>
              {preview.cancelledItems.length === 0 && preview.requiresRefund.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  No future months to cancel — transport will be marked closed without billing changes.
                </div>
              )}
              {preview.cancelledItems.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Cancelling {preview.cancelledItems.length} month(s)
                    </span>
                    <Badge variant="secondary">{formatINR(preview.cancelledAmount)}</Badge>
                  </div>
                  <ItemTable items={preview.cancelledItems} />
                </div>
              )}
              {preview.requiresRefund.length > 0 && (
                <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" />
                      {preview.requiresRefund.length} paid month(s) require manual refund
                    </span>
                    <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
                      {formatINR(preview.totalRefundDue)}
                    </Badge>
                  </div>
                  <ItemTable items={preview.requiresRefund} showPaid />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || previewLoading || !preview?.canCommit}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Discontinue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 4. Reverse withdrawal dialog ──────────────────────────────────────────

interface ReverseWithdrawalDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  onSuccess?: () => void
}

export function ReverseWithdrawalDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onSuccess,
}: ReverseWithdrawalDialogProps) {
  const { toast } = useToast()
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setNotes('')
    }
  }, [open])

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast({
        title: 'Notes required',
        description: 'A reason is required to reverse a withdrawal.',
        variant: 'destructive',
      })
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/withdraw/reverse`, {
        reversalNotes: notes.trim(),
      })
      toast({
        title: 'Withdrawal reversed',
        description: `${studentName} restored to active status.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't reverse withdrawal",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="size-4" /> Reverse Withdrawal
          </DialogTitle>
          <DialogDescription>
            Restore {studentName} to active status. Cancelled fee items remain cancelled — re-bill them via the
            structure assignment flow if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="rv-notes">Reason for reversal (required)</Label>
            <Textarea
              id="rv-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. TC issued in error — wrong student selected"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !notes.trim()}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── 5. Withdrawal status banner ───────────────────────────────────────────

interface WithdrawalStatus {
  success: boolean
  isWithdrawn: boolean
  admissionStatus: string | null
  isActive: boolean
  activeWithdrawal: {
    id: string
    academicYear: string
    effectiveDate: string
    reason: string
    reasonNotes: string | null
    cancelledAmount: number
    totalRefundDue: number
    createdAt: string
    reversedAt: string | null
  } | null
  history: Array<{
    id: string
    academicYear: string
    effectiveDate: string
    reason: string
    reversedAt: string | null
  }>
}

interface BannerProps {
  studentId: string
  refreshKey?: number
  onReverseClick?: () => void
  onIssueRefundClick?: (args: { withdrawalId: string; totalRefundDue: number }) => void
}

export function WithdrawalStatusBanner({
  studentId,
  refreshKey = 0,
  onReverseClick,
  onIssueRefundClick,
}: BannerProps) {
  const [status, setStatus] = useState<WithdrawalStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<WithdrawalStatus>(`/api/school/students/${studentId}/withdrawal-status`, undefined, {
        skipLogoutOn401: true,
      })
      .then((data) => {
        if (!cancelled) setStatus(data)
      })
      .catch(() => {
        if (!cancelled) setStatus(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId, refreshKey])

  if (loading || !status?.activeWithdrawal) return null

  const w = status.activeWithdrawal
  const dt = new Date(w.effectiveDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-3">
        <FileX2 className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-destructive">
              Student withdrawn ({w.reason}) on {dt}
            </p>
            <Badge variant="outline" className="border-destructive/30 text-[10px] uppercase">
              {w.academicYear}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Cancelled {formatINR(w.cancelledAmount)} of future fees.
            {w.totalRefundDue > 0
              ? ` ${formatINR(w.totalRefundDue)} flagged for manual refund.`
              : ' No paid items pending refund.'}
          </p>
          {w.reasonNotes && (
            <p className="mt-1 text-xs italic text-muted-foreground">"{w.reasonNotes}"</p>
          )}
        </div>
        {(onIssueRefundClick && w.totalRefundDue > 0 && !w.reversedAt) || onReverseClick ? (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {onIssueRefundClick && w.totalRefundDue > 0 && !w.reversedAt && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onIssueRefundClick({ withdrawalId: w.id, totalRefundDue: w.totalRefundDue })
                }
                className="h-8 gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
              >
                <Receipt className="size-3.5" /> Issue refund
              </Button>
            )}
            {onReverseClick && (
              <Button
                variant="outline"
                size="sm"
                onClick={onReverseClick}
                className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Undo2 className="size-3.5" /> Reverse
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── 6. Transport-history timeline ─────────────────────────────────────────

interface TransportHistoryEvent {
  id: string
  eventType: string
  fromStop: string | null
  toStop: string | null
  effectiveDate: string
  cancelledAmount: number
  reason: string | null
  cascadeFromWithdrawal: boolean
  createdAt: string
}

interface TransportHistoryAlloc {
  id: string
  stopName: string
  fareAmount: number
  isActive: boolean
  effectiveFrom: string | null
  effectiveTo: string | null
  changeReason: string | null
  route: { routeName: string; routeNumber: string | null; vehicleNumber: string | null } | null
}

interface TransportHistoryResponse {
  success: boolean
  academicYear: string
  events: TransportHistoryEvent[]
  allocations: TransportHistoryAlloc[]
}

const EVENT_LABEL: Record<string, string> = {
  CREATED: 'Transport added',
  REJOINED: 'Rejoined transport',
  CHANGED: 'Route changed',
  WITHDRAWN: 'Discontinued',
  FARE_REVISED: 'Fare revised',
}

const EVENT_TONE: Record<string, string> = {
  CREATED: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  REJOINED: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  CHANGED: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  WITHDRAWN: 'border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  FARE_REVISED: 'border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200',
}

interface HistoryProps {
  studentId: string
  academicYear?: string
  refreshKey?: number
}

export function TransportHistorySection({ studentId, academicYear, refreshKey = 0 }: HistoryProps) {
  const [data, setData] = useState<TransportHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = academicYear ? { academicYear } : undefined
    api
      .get<TransportHistoryResponse>(
        `/api/school/students/${studentId}/transport/history`,
        params,
        { skipLogoutOn401: true },
      )
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId, academicYear, refreshKey])

  if (loading) return null
  if (!data || (data.events.length === 0 && data.allocations.length === 0)) return null

  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Bus className="size-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Transport history</p>
        <Badge variant="outline" className="text-[10px] uppercase">
          {data.academicYear}
        </Badge>
      </div>
      <ol className="relative space-y-2 border-l border-border/60 pl-4">
        {data.events.map((ev) => {
          const tone = EVENT_TONE[ev.eventType] || 'border-border bg-muted/30 text-foreground'
          const dt = new Date(ev.effectiveDate).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
          return (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[19px] top-1.5 size-2.5 rounded-full border border-background bg-foreground/40" />
              <div className={`rounded border px-2.5 py-1.5 text-xs ${tone}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{EVENT_LABEL[ev.eventType] || ev.eventType}</span>
                  <span className="text-[11px] opacity-70">{dt}</span>
                  {ev.cascadeFromWithdrawal && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
                      via TC
                    </Badge>
                  )}
                </div>
                {(ev.fromStop || ev.toStop) && (
                  <p className="mt-0.5 text-[11px] opacity-90">
                    {ev.fromStop && <span>From: {ev.fromStop}</span>}
                    {ev.fromStop && ev.toStop && <span> → </span>}
                    {ev.toStop && <span>To: {ev.toStop}</span>}
                  </p>
                )}
                {ev.cancelledAmount > 0 && (
                  <p className="mt-0.5 text-[11px] opacity-90">
                    Cancelled: {formatINR(ev.cancelledAmount)}
                  </p>
                )}
                {ev.reason && <p className="mt-0.5 text-[11px] italic opacity-80">"{ev.reason}"</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── 5. Hostel dialogs ─────────────────────────────────────────────────────
// Symmetric to the transport dialogs, but the allocation unit is a BED. The
// picker cascades Hostel → Room → Bed; occupied beds are disabled.

interface HostelBedOption {
  id: string
  bedNumber: string
  occupied?: boolean
}
interface HostelRoomOption {
  id: string
  roomNumber: string
  roomType: string | null
  fare: number | null
  beds: HostelBedOption[]
}
interface HostelOption {
  id: string
  name: string
  type: string | null
  rooms: HostelRoomOption[]
}

interface HostelPreview {
  success: boolean
  canCommit: boolean
  blockers: string[]
  billableMonths: string[]
  droppedMonths: string[]
  fare: number
  totalAmount: number
  academicYear: string
  effectiveFrom: string
}

interface HostelWithdrawPreview {
  success: boolean
  canCommit: boolean
  blockers: string[]
  effectiveDate: string
  cancelledItems: PreviewItem[]
  cancelledAmount: number
  requiresRefund: SkippedItem[]
  totalRefundDue: number
}

interface AddHostelDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  academicYear: string
  onSuccess?: () => void
}

export function AddHostelDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  academicYear,
  onSuccess,
}: AddHostelDialogProps) {
  const { toast } = useToast()
  const [hostels, setHostels] = useState<HostelOption[]>([])
  const [hostelsLoading, setHostelsLoading] = useState(false)
  const [hostelId, setHostelId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [bedId, setBedId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<HostelPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveFrom, 300)
  const debouncedBed = useDebounced(bedId, 100)

  useEffect(() => {
    if (!open) {
      setHostelId('')
      setRoomId('')
      setBedId('')
      setEffectiveFrom(todayISO())
      setReason('')
      setPreview(null)
      setPreviewError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setHostelsLoading(true)
    api
      .get<{ hostels: HostelOption[] }>('/api/school/hostels', { academicYear })
      .then((data) => { if (!cancelled) setHostels(data.hostels || []) })
      .catch(() => { if (!cancelled) setHostels([]) })
      .finally(() => { if (!cancelled) setHostelsLoading(false) })
    return () => { cancelled = true }
  }, [open, academicYear])

  const roomsForHostel = useMemo<HostelRoomOption[]>(
    () => hostels.find((h) => h.id === hostelId)?.rooms || [],
    [hostels, hostelId],
  )
  const bedsForRoom = useMemo<HostelBedOption[]>(
    () => roomsForHostel.find((r) => r.id === roomId)?.beds || [],
    [roomsForHostel, roomId],
  )

  useEffect(() => { setRoomId(''); setBedId('') }, [hostelId])
  useEffect(() => { setBedId('') }, [roomId])

  useEffect(() => {
    if (!open || !debouncedBed) {
      setPreview(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .post<HostelPreview>(`/api/school/students/${studentId}/hostel/preview`, {
        bedId: debouncedBed,
        effectiveFrom: debouncedDate,
      })
      .then((data) => { if (!cancelled) setPreview(data) })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(err instanceof Error ? err.message : 'Preview failed')
        }
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [open, studentId, debouncedBed, debouncedDate])

  const handleSubmit = async () => {
    if (!preview?.canCommit) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/hostel`, {
        bedId,
        effectiveFrom,
        reason: reason.trim() || undefined,
      })
      toast({
        title: 'Hostel added',
        description: `${studentName} allocated a bed. ${preview.billableMonths.length} month(s) billed.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't add hostel",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-4" /> Add Hostel
          </DialogTitle>
          <DialogDescription>
            Allocate a hostel bed to {studentName}. Months prior to the effective date will be skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="ah-hostel">Hostel</Label>
            <Select value={hostelId} onValueChange={setHostelId} disabled={hostelsLoading || hostels.length === 0}>
              <SelectTrigger id="ah-hostel">
                <SelectValue placeholder={hostelsLoading ? 'Loading hostels…' : 'Select a hostel'} />
              </SelectTrigger>
              <SelectContent>
                {hostels.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name} {h.type ? `(${h.type})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ah-room">Room</Label>
              <Select value={roomId} onValueChange={setRoomId} disabled={!hostelId || roomsForHostel.length === 0}>
                <SelectTrigger id="ah-room">
                  <SelectValue placeholder={hostelId ? 'Select room' : 'Pick a hostel first'} />
                </SelectTrigger>
                <SelectContent>
                  {roomsForHostel.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.roomNumber}{r.roomType ? ` · ${r.roomType}` : ''}{r.fare != null ? ` — ${formatINR(r.fare)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ah-bed">Bed</Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!roomId || bedsForRoom.length === 0}>
                <SelectTrigger id="ah-bed">
                  <SelectValue placeholder={roomId ? 'Select bed' : 'Pick a room first'} />
                </SelectTrigger>
                <SelectContent>
                  {bedsForRoom.map((b) => (
                    <SelectItem key={b.id} value={b.id} disabled={b.occupied}>
                      {b.bedNumber}{b.occupied ? ' (occupied)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="ah-effdate">Effective From</Label>
            <Input id="ah-effdate" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ah-reason">Reason (optional)</Label>
            <Input id="ah-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Mid-year hostel opt-in" />
          </div>

          <HostelPreviewPanel loading={previewLoading} error={previewError} preview={preview} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || previewLoading || !preview?.canCommit}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Add Hostel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HostelPreviewPanel({
  loading,
  error,
  preview,
}: {
  loading: boolean
  error: string | null
  preview: HostelPreview | null
}) {
  if (loading && !preview) {
    return (
      <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Calculating fare…
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
    )
  }
  if (!preview) return null
  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="font-medium flex items-center gap-2 mb-2">
        <CheckCircle2 className={preview.canCommit ? 'size-4 text-emerald-600' : 'size-4 text-amber-600'} />
        Fare preview
      </div>
      {preview.blockers.length > 0 && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
          <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
            {preview.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}
      {preview.canCommit && (
        <>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Per-month</div>
              <div className="font-semibold tabular-nums">{formatINR(preview.fare)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Months</div>
              <div className="font-semibold">{preview.billableMonths.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total</div>
              <div className="font-semibold tabular-nums">{formatINR(preview.totalAmount)}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            <span className="font-medium">Billing:</span>{' '}
            {preview.billableMonths.join(', ') || '—'}
            {preview.droppedMonths.length > 0 && (
              <>
                {' · '}
                <span className="line-through opacity-70">{preview.droppedMonths.join(', ')}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface DiscontinueHostelDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  onSuccess?: () => void
}

export function DiscontinueHostelDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onSuccess,
}: DiscontinueHostelDialogProps) {
  const { toast } = useToast()
  const [effectiveDate, setEffectiveDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<HostelWithdrawPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveDate, 300)

  useEffect(() => {
    if (!open) {
      setEffectiveDate(todayISO())
      setReason('')
      setPreview(null)
      setPreviewError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !debouncedDate) return
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .post<HostelWithdrawPreview>(`/api/school/students/${studentId}/hostel/withdraw/preview`, {
        effectiveDate: debouncedDate,
      })
      .then((data) => { if (!cancelled) setPreview(data) })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewError(err instanceof Error ? err.message : 'Preview failed')
        }
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [open, studentId, debouncedDate])

  const handleSubmit = async () => {
    if (!preview?.canCommit) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/hostel/withdraw`, {
        effectiveDate,
        reason: reason.trim() || undefined,
      })
      toast({
        title: 'Hostel discontinued',
        description: `${preview.cancelledItems.length} month(s) cancelled${
          preview.totalRefundDue > 0 ? `, ${formatINR(preview.totalRefundDue)} flagged for refund` : ''
        }.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't discontinue hostel",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-4" /> Discontinue Hostel
          </DialogTitle>
          <DialogDescription>
            Stop hostel billing for {studentName} from the effective date forward. The student remains enrolled.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="dh-effdate">Effective Date</Label>
            <Input id="dh-effdate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="dh-reason">Reason (optional)</Label>
            <Input id="dh-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shifted to day-scholar" />
          </div>

          {previewLoading && !preview && (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Calculating impact…
            </div>
          )}
          {previewError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{previewError}</div>
          )}
          {preview && !preview.canCommit && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-200">
                {preview.blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}
          {preview && preview.canCommit && (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="font-medium flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Impact preview
              </div>
              {preview.cancelledItems.length === 0 && preview.requiresRefund.length === 0 && (
                <div className="text-muted-foreground text-xs">
                  No future months to cancel — hostel will be marked closed without billing changes.
                </div>
              )}
              {preview.cancelledItems.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Cancelling {preview.cancelledItems.length} month(s)
                    </span>
                    <Badge variant="secondary">{formatINR(preview.cancelledAmount)}</Badge>
                  </div>
                  <ItemTable items={preview.cancelledItems} />
                </div>
              )}
              {preview.requiresRefund.length > 0 && (
                <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" />
                      {preview.requiresRefund.length} paid month(s) require manual refund
                    </span>
                    <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
                      {formatINR(preview.totalRefundDue)}
                    </Badge>
                  </div>
                  <ItemTable items={preview.requiresRefund} showPaid />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting || previewLoading || !preview?.canCommit}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Discontinue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
