'use client'

/* eslint-disable react-hooks/set-state-in-effect */

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
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
import { AlertTriangle, Loader2, CheckCircle2, XCircle, Bus, FileX2, Undo2, Receipt, Building2, CalendarDays, FileText } from 'lucide-react'

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
  refundEligible: boolean
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
  refundEligible?: boolean
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

const AY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function sortAcademicMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const ai = AY_MONTHS.findIndex((month) => month.toLowerCase() === a.toLowerCase())
    const bi = AY_MONTHS.findIndex((month) => month.toLowerCase() === b.toLowerCase())
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function BillingMonthSequence({
  billableMonths,
  droppedMonths,
}: {
  billableMonths: string[]
  droppedMonths: string[]
}) {
  const dropped = new Set(droppedMonths.map((month) => month.toLowerCase()))
  const months = sortAcademicMonths(Array.from(new Set([...billableMonths, ...droppedMonths])))

  if (months.length === 0) return <>-</>

  return (
    <>
      {months.map((month, index) => (
        <span key={month} className={dropped.has(month.toLowerCase()) ? 'line-through opacity-70' : undefined}>
          {index > 0 ? ', ' : ''}
          {month}
        </span>
      ))}
    </>
  )
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
        refundEligible,
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
  }, [open, studentId, debouncedDate, debouncedReason, refundEligible])

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <FileX2 className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Issue Transfer Certificate</DialogTitle>
              <DialogDescription>
                Withdraw {studentName} from the school and review billing impact before confirming.
              </DialogDescription>
            </div>
          </div>
          <div className="rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>This will close active academic assignments and mark the student as withdrawn or transferred.</span>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-muted-foreground" />
                Certificate details
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="space-y-1.5">
              <Label htmlFor="wd-effdate">Effective Date</Label>
              <DatePicker
                value={effectiveDate}
                onChange={setEffectiveDate}
                disableFuture
                placeholder="Select TC date"
                triggerClassName="w-full"
              />
            </div>
            <div className="space-y-1.5">
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

            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="wd-tc">TC Number</Label>
              <Input
                id="wd-tc"
                value={transferCertNo}
                onChange={(e) => setTransferCertNo(e.target.value)}
                placeholder="e.g. TC/2026/0123"
              />
            </div>
              </div>
            </div>

            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Receipt className="size-4 text-muted-foreground" />
                Refund handling
              </div>
              <label htmlFor="wd-refund" className="flex cursor-pointer items-start gap-3 rounded-md border bg-muted/20 p-3">
              <Checkbox
                id="wd-refund"
                checked={refundEligible}
                onCheckedChange={(checked) => setRefundEligible(checked === true)}
                className="mt-0.5"
              />
              <span className="grid gap-1 text-sm">
                <span className="font-medium">Mark paid future fees as refund eligible</span>
                <span className="text-xs text-muted-foreground">Paid future items stay intact and appear in refund follow-up.</span>
              </span>
              </label>
            </div>

          <div className="rounded-md border bg-background p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-muted-foreground" />
              Notes
            </div>
            <Textarea
              id="wd-notes"
              rows={4}
              value={reasonNotes}
              onChange={(e) => setReasonNotes(e.target.value)}
              placeholder="Reason for withdrawal, parent communication, approval reference..."
            />
            </div>
          </div>

          <PreviewPanel loading={previewLoading} error={previewError} preview={preview} />
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || previewLoading || !preview || !!previewError}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Issue Transfer Certificate
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
      <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Calculating impact…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <XCircle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-medium">Preview failed</div>
          <div className="mt-1 text-xs">{error}</div>
        </div>
      </div>
    )
  }
  if (!preview) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Select an effective date to preview billing and allocation impact.
      </div>
    )
  }

  const { cancelledItems, cancelledAmount, requiresRefund, totalRefundDue } = preview
  const empty = cancelledItems.length === 0 && requiresRefund.length === 0

  return (
    <div className="space-y-4 rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-emerald-600" />
            Impact preview
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Academic year {preview.academicYear}</p>
        </div>
        {loading && (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="size-3 animate-spin" />
            Updating
          </Badge>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ImpactMetric label="Unpaid items cancelled" value={String(cancelledItems.length)} />
        <ImpactMetric label="Cancelled amount" value={formatINR(cancelledAmount)} />
        <ImpactMetric label="Refund follow-up" value={String(requiresRefund.length)} />
        <ImpactMetric label="Refund due" value={formatINR(totalRefundDue)} tone={totalRefundDue > 0 ? 'warning' : 'default'} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Academic assignments closed</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{preview.academicAssignmentsClosed}</div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="text-xs text-muted-foreground">Transport allocations closed</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{preview.transportAllocationsClosed}</div>
        </div>
      </div>
      {empty && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
          No future-dated billing changes are required for this TC.
        </div>
      )}
      {cancelledItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Unpaid items to cancel</span>
            <Badge variant="secondary">{formatINR(cancelledAmount)}</Badge>
          </div>
          <ItemTable items={cancelledItems} />
        </div>
      )}
      {requiresRefund.length > 0 && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
              <AlertTriangle className="size-4" />
              Paid items need refund review
            </span>
            <Badge variant="outline" className="border-amber-400 text-amber-900 dark:text-amber-200">
              {formatINR(totalRefundDue)}
            </Badge>
          </div>
          <ItemTable items={requiresRefund} showPaid />
        </div>
      )}
    </div>
  )
}

function ImpactMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          tone === 'warning'
            ? 'mt-1 font-semibold text-amber-700 dark:text-amber-300'
            : 'mt-1 font-semibold tabular-nums'
        }
      >
        {value}
      </div>
    </div>
  )
}

function ItemTable({ items, showPaid = false }: { items: Array<PreviewItem | SkippedItem>; showPaid?: boolean }) {
  return (
    <div className="max-h-48 overflow-auto rounded-md border bg-background">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Head</th>
            <th className="px-3 py-2 text-left font-medium">Period</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            {showPaid && <th className="px-3 py-2 text-right font-medium">Paid</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemId} className="border-t">
              <td className="px-3 py-2 font-medium">{item.feeHeadName}</td>
              <td className="px-2 py-1 text-muted-foreground">{item.installmentName || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(item.amount)}</td>
              {showPaid && 'paidAmount' in item && (
                <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bus className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Add Transport</DialogTitle>
          <DialogDescription>
            Allocate a transport route to {studentName}. Months prior to the effective date will be skipped automatically.
            </DialogDescription>
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Months before the effective date are skipped automatically for academic year {academicYear}.
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Bus className="size-4 text-muted-foreground" />
                Route details
              </div>
              <div className="space-y-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="at-route">Route</Label>
            <Select value={routeId} onValueChange={setRouteId} disabled={routesLoading || routes.length === 0}>
              <SelectTrigger id="at-route" className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
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
          <div className="min-w-0 space-y-1.5">
              <Label htmlFor="at-stop">Stop</Label>
              <Select value={stopName} onValueChange={setStopName} disabled={!routeId || stopsForRoute.length === 0}>
                <SelectTrigger id="at-stop" className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
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
              </div>
            </div>

            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-muted-foreground" />
                Billing start
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-1.5">
                  <Label htmlFor="at-effdate">Effective From</Label>
                  <DatePicker
                    value={effectiveFrom}
                    onChange={setEffectiveFrom}
                    placeholder="Select start date"
                    triggerClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="at-reason">Reason</Label>
                  <Input
                    id="at-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Mid-year transport opt-in"
                  />
                </div>
              </div>
            </div>
          </div>

          <TransportPreviewPanel loading={previewLoading} error={previewError} preview={preview} />
        </div>

        <DialogFooter className="border-t pt-4">
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
      <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Calculating fare…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <XCircle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-medium">Preview failed</div>
          <div className="mt-1 text-xs">{error}</div>
        </div>
      </div>
    )
  }
  if (!preview) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Select a route and stop to preview transport billing.
      </div>
    )
  }
  return (
    <div className="space-y-4 rounded-md border bg-background p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <CheckCircle2 className={preview.canCommit ? 'size-4 text-emerald-600' : 'size-4 text-amber-600'} />
        Fare preview
      </div>
      {preview.blockers.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
          <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
            {preview.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        </div>
      )}
      {preview.canCommit && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <ImpactMetric label="Per month" value={formatINR(preview.fare)} />
            <ImpactMetric label="Billable months" value={String(preview.billableMonths.length)} />
            <ImpactMetric label="Total" value={formatINR(preview.totalAmount)} />
          </div>
          <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
            <span className="font-medium">Billing:</span>{' '}
            <BillingMonthSequence billableMonths={preview.billableMonths} droppedMonths={preview.droppedMonths} />
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
  const [refundEligible, setRefundEligible] = useState(false)
  const [refundMode, setRefundMode] = useState<'advance' | 'cash'>('advance')
  const [preview, setPreview] = useState<TransportWithdrawPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveDate, 300)

  useEffect(() => {
    if (!open) {
      setEffectiveDate(todayISO())
      setReason('')
      setRefundEligible(false)
      setRefundMode('advance')
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
        refundEligible,
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
  }, [open, studentId, debouncedDate, refundEligible])

  const handleSubmit = async () => {
    if (!preview?.canCommit) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/transport/withdraw`, {
        effectiveDate,
        reason: reason.trim() || undefined,
        refundEligible,
        refundMode: refundEligible ? refundMode : undefined,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <Bus className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Discontinue Transport</DialogTitle>
              <DialogDescription>
                Stop transport billing for {studentName} from the effective date forward. The student remains enrolled.
              </DialogDescription>
            </div>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Future unpaid transport months will be cancelled. Paid future months stay intact and can be marked for refund review.</span>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-muted-foreground" />
                Discontinue details
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-1.5">
                  <Label htmlFor="dt-effdate">Effective Date</Label>
                  <DatePicker
                    value={effectiveDate}
                    onChange={setEffectiveDate}
                    placeholder="Select discontinue date"
                    triggerClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dt-reason">Reason</Label>
                  <Input
                    id="dt-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Family moved closer to school"
                  />
                </div>
              </div>
              <label htmlFor="dt-refund" className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border bg-muted/20 p-3">
                <Checkbox
                  id="dt-refund"
                  checked={refundEligible}
                  onCheckedChange={(checked) => setRefundEligible(checked === true)}
                  className="mt-0.5"
                />
                <span className="grid gap-1 text-sm">
                  <span className="font-medium">Refund the paid future transport fees</span>
                  <span className="text-xs text-muted-foreground">Cancels the paid future months too and returns the money as below.</span>
                </span>
              </label>
              {refundEligible && (
                <div className="mt-2 space-y-1.5 rounded-md border bg-muted/20 p-3">
                  <Label>How should the refund be handled?</Label>
                  <Select value={refundMode} onValueChange={(v) => setRefundMode(v as 'advance' | 'cash')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="advance">Keep as account advance (use for other fees)</SelectItem>
                      <SelectItem value="cash">Cash refund to parent (pay back physically)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {refundMode === 'advance'
                      ? 'Money becomes a credit on the student’s fee account — apply it to other dues from Collect Fee.'
                      : 'Recorded as a pending cash refund — mark it paid from the student’s profile once handed over.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-md border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Impact preview
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Transport billing changes from selected date.</p>
              </div>
              {previewLoading && preview && (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Updating
                </Badge>
              )}
            </div>

          {previewLoading && !preview && (
            <div className="flex min-h-48 items-center justify-center rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Calculating impact…
            </div>
          )}
          {previewError && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <XCircle className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="font-medium">Preview failed</div>
                <div className="mt-1 text-xs">{previewError}</div>
              </div>
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
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <ImpactMetric label="Months cancelled" value={String(preview.cancelledItems.length)} />
                <ImpactMetric label="Cancelled amount" value={formatINR(preview.cancelledAmount)} />
                <ImpactMetric label="Refund follow-up" value={String(preview.requiresRefund.length)} />
                <ImpactMetric label="Refund due" value={formatINR(preview.totalRefundDue)} tone={preview.totalRefundDue > 0 ? 'warning' : 'default'} />
              </div>
              {preview.cancelledItems.length === 0 && preview.requiresRefund.length === 0 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  No future months to cancel — transport will be marked closed without billing changes.
                </div>
              )}
              {preview.cancelledItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Future unpaid months to cancel</span>
                    <Badge variant="secondary">{formatINR(preview.cancelledAmount)}</Badge>
                  </div>
                  <ItemTable items={preview.cancelledItems} />
                </div>
              )}
              {preview.requiresRefund.length > 0 && (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="size-4" />
                      Paid months need refund review
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
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || previewLoading || !preview?.canCommit}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Discontinue Transport
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <Undo2 className="size-5" /> Reverse Withdrawal
          </DialogTitle>
          <DialogDescription>
            Restore {studentName} to active status. Cancelled fee items remain cancelled — re-bill them via the
            structure assignment flow if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <div className="font-medium">Billing will not be rebuilt automatically</div>
                <p className="mt-1 text-xs">
                  Cancelled fee items remain cancelled. Re-bill through fee assignment if the student should be charged again.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-md border bg-background p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Label htmlFor="rv-notes">Reason for reversal</Label>
              <Badge variant={notes.trim() ? 'secondary' : 'outline'}>Required</Badge>
            </div>
            <Textarea
              id="rv-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. TC issued in error — wrong student selected"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              This note is stored with the reversal audit trail.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !notes.trim()}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Reverse Withdrawal
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
  refundEligible?: boolean
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
  const selectedHostel = useMemo(() => hostels.find((h) => h.id === hostelId) || null, [hostels, hostelId])
  const selectedRoom = useMemo(() => roomsForHostel.find((r) => r.id === roomId) || null, [roomsForHostel, roomId])
  const selectedBed = useMemo(() => bedsForRoom.find((b) => b.id === bedId) || null, [bedsForRoom, bedId])

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Add Hostel</DialogTitle>
              <DialogDescription>
                Allocate a hostel bed to {studentName}. Months prior to the effective date will be skipped automatically.
              </DialogDescription>
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Months before the effective date are skipped automatically for academic year {academicYear}.
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Building2 className="size-4 text-muted-foreground" />
                Accommodation details
              </div>
              <div className="space-y-3">
                <div className="min-w-0 space-y-1.5">
            <Label htmlFor="ah-hostel">Hostel</Label>
            <Select value={hostelId} onValueChange={setHostelId} disabled={hostelsLoading || hostels.length === 0}>
              <SelectTrigger id="ah-hostel" className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="ah-room">Room</Label>
              <Select value={roomId} onValueChange={setRoomId} disabled={!hostelId || roomsForHostel.length === 0}>
                <SelectTrigger id="ah-room" className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
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
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="ah-bed">Bed</Label>
              <Select value={bedId} onValueChange={setBedId} disabled={!roomId || bedsForRoom.length === 0}>
                <SelectTrigger id="ah-bed" className="w-full min-w-0 [&_[data-slot=select-value]]:truncate">
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
              </div>
            </div>

            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-muted-foreground" />
                Billing start
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-1.5">
                  <Label htmlFor="ah-effdate">Effective From</Label>
                  <DatePicker
                    value={effectiveFrom}
                    onChange={setEffectiveFrom}
                    placeholder="Select start date"
                    triggerClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ah-reason">Reason</Label>
                  <Input id="ah-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Mid-year hostel opt-in" />
                </div>
              </div>
            </div>
          </div>

          <HostelPreviewPanel
            loading={previewLoading}
            error={previewError}
            preview={preview}
            hostelName={selectedHostel?.name}
            roomLabel={selectedRoom ? `${selectedRoom.roomNumber}${selectedRoom.roomType ? ` - ${selectedRoom.roomType}` : ''}` : undefined}
            bedLabel={selectedBed?.bedNumber}
          />
        </div>

        <DialogFooter className="border-t pt-4">
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
  hostelName,
  roomLabel,
  bedLabel,
}: {
  loading: boolean
  error: string | null
  preview: HostelPreview | null
  hostelName?: string
  roomLabel?: string
  bedLabel?: string
}) {
  if (loading && !preview) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Calculating fare…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        <XCircle className="mt-0.5 size-5 shrink-0" />
        <div>
          <div className="font-medium">Preview failed</div>
          <div className="mt-1 text-xs">{error}</div>
        </div>
      </div>
    )
  }
  if (!preview) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Select a hostel, room, and available bed to preview billing.
      </div>
    )
  }
  return (
    <div className="space-y-4 rounded-md border bg-background p-4 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <CheckCircle2 className={preview.canCommit ? 'size-4 text-emerald-600' : 'size-4 text-amber-600'} />
        Fare preview
      </div>
      {(hostelName || roomLabel || bedLabel) && (
        <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">Hostel</div>
            <div className="mt-1 font-medium">{hostelName || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Room</div>
            <div className="mt-1 font-medium">{roomLabel || '-'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Bed</div>
            <div className="mt-1 font-medium">{bedLabel || '-'}</div>
          </div>
        </div>
      )}
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
            <BillingMonthSequence billableMonths={preview.billableMonths} droppedMonths={preview.droppedMonths} />
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
  const [refundEligible, setRefundEligible] = useState(false)
  const [refundMode, setRefundMode] = useState<'advance' | 'cash'>('advance')
  const [preview, setPreview] = useState<HostelWithdrawPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const debouncedDate = useDebounced(effectiveDate, 300)

  useEffect(() => {
    if (!open) {
      setEffectiveDate(todayISO())
      setReason('')
      setRefundEligible(false)
      setRefundMode('advance')
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
        refundEligible,
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
  }, [open, studentId, debouncedDate, refundEligible])

  const handleSubmit = async () => {
    if (!preview?.canCommit) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/hostel/withdraw`, {
        effectiveDate,
        reason: reason.trim() || undefined,
        refundEligible,
        refundMode: refundEligible ? refundMode : undefined,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <Building2 className="size-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>Discontinue Hostel</DialogTitle>
              <DialogDescription>
                Stop hostel billing for {studentName} from the effective date forward. The student remains enrolled.
              </DialogDescription>
            </div>
          </div>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Future unpaid hostel months will be cancelled. Paid future months stay intact and can be marked for refund review.</span>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4 text-muted-foreground" />
                Discontinue details
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-1.5">
                  <Label htmlFor="dh-effdate">Effective Date</Label>
                  <DatePicker
                    value={effectiveDate}
                    onChange={setEffectiveDate}
                    placeholder="Select discontinue date"
                    triggerClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dh-reason">Reason</Label>
                  <Input id="dh-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Shifted to day-scholar" />
                </div>
              </div>
              <label htmlFor="dh-refund" className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border bg-muted/20 p-3">
                <Checkbox
                  id="dh-refund"
                  checked={refundEligible}
                  onCheckedChange={(checked) => setRefundEligible(checked === true)}
                  className="mt-0.5"
                />
                <span className="grid gap-1 text-sm">
                  <span className="font-medium">Refund the paid future hostel fees</span>
                  <span className="text-xs text-muted-foreground">Cancels the paid future months too and returns the money as below.</span>
                </span>
              </label>
              {refundEligible && (
                <div className="mt-2 space-y-1.5 rounded-md border bg-muted/20 p-3">
                  <Label>How should the refund be handled?</Label>
                  <Select value={refundMode} onValueChange={(v) => setRefundMode(v as 'advance' | 'cash')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="advance">Keep as account advance (use for other fees)</SelectItem>
                      <SelectItem value="cash">Cash refund to parent (pay back physically)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {refundMode === 'advance'
                      ? 'Money becomes a credit on the student’s fee account — apply it to other dues from Collect Fee.'
                      : 'Recorded as a pending cash refund — mark it paid from the student’s profile once handed over.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-md border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Impact preview
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Hostel billing changes from selected date.</p>
              </div>
              {previewLoading && preview && (
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Updating
                </Badge>
              )}
            </div>

          {previewLoading && !preview && (
            <div className="flex min-h-48 items-center justify-center rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Calculating impact…
            </div>
          )}
          {previewError && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              <XCircle className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="font-medium">Preview failed</div>
                <div className="mt-1 text-xs">{previewError}</div>
              </div>
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
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <ImpactMetric label="Months cancelled" value={String(preview.cancelledItems.length)} />
                <ImpactMetric label="Cancelled amount" value={formatINR(preview.cancelledAmount)} />
                <ImpactMetric label="Refund follow-up" value={String(preview.requiresRefund.length)} />
                <ImpactMetric label="Refund due" value={formatINR(preview.totalRefundDue)} tone={preview.totalRefundDue > 0 ? 'warning' : 'default'} />
              </div>
              {preview.cancelledItems.length === 0 && preview.requiresRefund.length === 0 && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  No future months to cancel — hostel will be marked closed without billing changes.
                </div>
              )}
              {preview.cancelledItems.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">Future unpaid months to cancel</span>
                    <Badge variant="secondary">{formatINR(preview.cancelledAmount)}</Badge>
                  </div>
                  <ItemTable items={preview.cancelledItems} />
                </div>
              )}
              {preview.requiresRefund.length > 0 && (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="size-4" />
                      Paid months need refund review
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
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting || previewLoading || !preview?.canCommit}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Discontinue Hostel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
