'use client'

/**
 * Refund dialog + history table.
 *
 * IssueRefundDialog — fetches the live obligation from
 *   GET /api/school/students/[id]/refunds/preview?withdrawalId=...
 * and lets the cashier issue a partial or full refund. The amount field
 * is gated against the `outstanding` figure so the API's hard-stop never
 * needs to fire in the happy path.
 *
 * RefundHistorySection — lists all refunds for a student, separates active
 * from voided rows visually, and offers void + print-receipt actions for
 * the active ones.
 */

import { useEffect, useState, useCallback } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Loader2, Receipt, Undo2, Printer, Ban } from 'lucide-react'

function formatINR(n: number): string {
  return Number(n || 0).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  })
}

function formatDate(s: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Issue dialog ──────────────────────────────────────────────────────────

interface RefundPreviewResponse {
  success: boolean
  withdrawal: {
    id: string
    effectiveDate: string
    reason: string
    reversedAt: string | null
  }
  obligation: {
    totalDue: number
    alreadyRefunded: number
    outstanding: number
  }
}

interface IssueRefundDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  studentName: string
  withdrawalId: string
  onSuccess?: () => void
}

export function IssueRefundDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  withdrawalId,
  onSuccess,
}: IssueRefundDialogProps) {
  const { toast } = useToast()
  const [preview, setPreview] = useState<RefundPreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setPreview(null)
      setPreviewError(null)
      setAmount('')
      setNotes('')
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .get<RefundPreviewResponse>(
        `/api/school/students/${studentId}/refunds/preview?withdrawalId=${encodeURIComponent(withdrawalId)}`,
      )
      .then((data) => {
        if (cancelled) return
        setPreview(data)
        // Default amount to the outstanding obligation — the most common case
        // is "refund the whole thing in one go".
        setAmount(String(data.obligation.outstanding || 0))
      })
      .catch((err) => {
        if (cancelled) return
        setPreviewError(err instanceof Error ? err.message : 'Could not load refund preview')
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, studentId, withdrawalId])

  const outstanding = preview?.obligation.outstanding ?? 0
  const amountNum = Number(amount)
  const amountValid =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum <= outstanding + 0.001
  const reversed = !!preview?.withdrawal.reversedAt

  const handleSubmit = async () => {
    if (!preview || !amountValid || reversed) return
    setSubmitting(true)
    try {
      await api.post(`/api/school/students/${studentId}/refunds`, {
        withdrawalId,
        amount: amountNum,
        paymentMethod: 'cash',
        notes: notes.trim() || undefined,
      })
      toast({
        title: 'Refund issued',
        description: `${formatINR(amountNum)} refunded to ${studentName}.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't issue refund",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-4" /> Issue refund
          </DialogTitle>
          <DialogDescription>
            Cash refund to {studentName} against their withdrawal. The amount is capped at the
            outstanding obligation shown below.
          </DialogDescription>
        </DialogHeader>

        {previewLoading && (
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading obligation…
          </div>
        )}

        {previewError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{previewError}</span>
          </div>
        )}

        {preview && reversed && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              This withdrawal has been reversed. New refunds cannot be issued against it.
            </span>
          </div>
        )}

        {preview && !reversed && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total due
                </div>
                <div className="font-semibold">{formatINR(preview.obligation.totalDue)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Already refunded
                </div>
                <div className="font-semibold">
                  {formatINR(preview.obligation.alreadyRefunded)}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Outstanding
                </div>
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatINR(preview.obligation.outstanding)}
                </div>
              </div>
            </div>

            <div className="grid gap-3 py-1">
              <div className="grid gap-1.5">
                <Label htmlFor="refund-amount">Refund amount (₹)</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  max={outstanding}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={submitting || outstanding <= 0}
                />
                {!amountValid && amount && (
                  <p className="text-xs text-destructive">
                    Enter an amount between ₹0.01 and {formatINR(outstanding)}.
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="refund-notes">Notes (optional)</Label>
                <Textarea
                  id="refund-notes"
                  rows={2}
                  placeholder="Mode of payment, parent acknowledgement, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting ||
              previewLoading ||
              !preview ||
              reversed ||
              !amountValid ||
              outstanding <= 0
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Void dialog (small, internal) ─────────────────────────────────────────

interface VoidDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId: string
  refundId: string
  receiptNumber: string
  amount: number
  onSuccess?: () => void
}

function VoidRefundDialog({
  open,
  onOpenChange,
  studentId,
  refundId,
  receiptNumber,
  amount,
  onSuccess,
}: VoidDialogProps) {
  const { toast } = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setReason('')
    }
  }, [open])

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      await api.post(
        `/api/school/students/${studentId}/refunds/${refundId}/void`,
        { reason: trimmed },
      )
      toast({
        title: 'Refund voided',
        description: `Receipt ${receiptNumber} (${formatINR(amount)}) reversed.`,
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        title: "Couldn't void refund",
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
            <Ban className="size-4" /> Void refund {receiptNumber}
          </DialogTitle>
          <DialogDescription>
            Reverses {formatINR(amount)} on the student ledger. The original receipt stays
            visible for audit, marked as voided.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="void-reason">Reason</Label>
          <Textarea
            id="void-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong amount entered, parent returned cash, etc."
            disabled={submitting}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Void refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── History section ───────────────────────────────────────────────────────

interface RefundRow {
  id: string
  schoolId: string
  studentId: string
  withdrawalId: string
  scope: string
  academicYear: string
  amount: number
  paymentMethod: string
  receiptNumber: string
  issuedDate: string
  issuedBy: string | null
  notes: string | null
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
}

interface RefundsListResponse {
  success: boolean
  refunds: RefundRow[]
}

interface RefundHistoryProps {
  studentId: string
  refreshKey?: number
  canVoid?: boolean
  onChanged?: () => void
}

export function RefundHistorySection({
  studentId,
  refreshKey = 0,
  canVoid = false,
  onChanged,
}: RefundHistoryProps) {
  const [rows, setRows] = useState<RefundRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [voidTarget, setVoidTarget] = useState<RefundRow | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)

  const reload = useCallback(() => {
    setLocalRefresh((n) => n + 1)
    onChanged?.()
  }, [onChanged])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get<RefundsListResponse>(`/api/school/students/${studentId}/refunds`)
      .then((data) => {
        if (!cancelled) setRows(data.refunds || [])
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId, refreshKey, localRefresh])

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading refunds…
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    return null
  }

  return (
    <div className="rounded-md border border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Receipt className="size-4" /> Refund history
        </div>
        <Badge variant="outline" className="text-[10px] uppercase">
          {rows.length} record{rows.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => {
          const voided = !!r.voidedAt
          return (
            <div
              key={r.id}
              className={
                voided
                  ? 'flex flex-wrap items-start gap-3 px-3 py-2 text-sm opacity-70'
                  : 'flex flex-wrap items-start gap-3 px-3 py-2 text-sm'
              }
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{r.receiptNumber}</span>
                  <span className="font-semibold">{formatINR(r.amount)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(r.issuedDate)}
                  </span>
                  {voided && (
                    <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px] uppercase">
                      Voided
                    </Badge>
                  )}
                </div>
                {r.notes && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">"{r.notes}"</p>
                )}
                {voided && r.voidReason && (
                  <p className="mt-0.5 text-xs text-destructive">
                    Voided{r.voidedAt ? ` on ${formatDate(r.voidedAt)}` : ''}: {r.voidReason}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() =>
                    window.open(
                      `/print/refund-receipt/${r.id}`,
                      '_blank',
                      'noopener,noreferrer',
                    )
                  }
                >
                  <Printer className="size-3.5" /> Receipt
                </Button>
                {canVoid && !voided && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 border-destructive/30 px-2 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setVoidTarget(r)}
                  >
                    <Undo2 className="size-3.5" /> Void
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {voidTarget && (
        <VoidRefundDialog
          open={!!voidTarget}
          onOpenChange={(v) => {
            if (!v) setVoidTarget(null)
          }}
          studentId={studentId}
          refundId={voidTarget.id}
          receiptNumber={voidTarget.receiptNumber}
          amount={voidTarget.amount}
          onSuccess={reload}
        />
      )}
    </div>
  )
}
