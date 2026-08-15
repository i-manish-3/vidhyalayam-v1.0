'use client'

import { useState } from 'react'
import { Ban, Loader2, ReceiptText, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { usePermissions } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface ReceiptMatch {
  id: string
  receiptNumber: string | null
  studentName: string
  className: string
  paid: number
  cancellable?: boolean
}

interface FeePaymentCancellationProps {
  onCancelled?: () => void
}

export function FeePaymentCancellation({ onCancelled }: FeePaymentCancellationProps) {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const currentSchool = useAppStore((state) => state.currentSchool)
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchool?.academicYear || getCurrentAcademicYear()
  const [open, setOpen] = useState(false)
  const [receiptNumber, setReceiptNumber] = useState('')
  const [match, setMatch] = useState<ReceiptMatch | null>(null)
  const [reason, setReason] = useState('')
  const [searching, setSearching] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  if (!hasPermission('fees:refund')) return null

  const reset = () => {
    setReceiptNumber('')
    setMatch(null)
    setReason('')
  }

  const findReceipt = async () => {
    const query = receiptNumber.trim().replace(/^RCP-/i, '')
    if (!query) return
    setSearching(true)
    setMatch(null)
    try {
      const data = await api.get<{ receiptHistory: ReceiptMatch[] }>('/api/school/fees/collections', {
        listReceipts: 'true',
        limit: 'all',
        academicYear,
        search: query,
      })
      const found = (data.receiptHistory || []).find(
        (row) => (row.receiptNumber || '').replace(/^RCP-/i, '').toLowerCase() === query.toLowerCase(),
      )
      if (!found) {
        toast({ title: 'Receipt not found', description: `No active receipt ${receiptNumber.trim()} was found.`, variant: 'destructive' })
        return
      }
      if (!found.cancellable) {
        toast({
          title: 'Receipt cannot be cancelled here',
          description: 'Only payments collected from the fee collection screen can be cancelled with this option.',
          variant: 'destructive',
        })
        return
      }
      setMatch(found)
    } catch (error) {
      toast({ title: "Couldn't find receipt", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSearching(false)
    }
  }

  const cancelPayment = async () => {
    if (!match || reason.trim().length < 5) return
    setCancelling(true)
    try {
      const result = await api.post<{ message?: string }>(`/api/school/fees/collections/${match.id}/cancel`, {
        reason: reason.trim(),
      })
      toast({ title: 'Payment cancelled', description: result.message || 'The receipt was cancelled and the fee balance was restored.' })
      setOpen(false)
      reset()
      onCancelled?.()
    } catch (error) {
      toast({ title: "Couldn't cancel payment", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <>
      <Button variant="destructive" className="gap-2" onClick={() => setOpen(true)}>
        <Ban className="size-4" /> Cancel Collected Fee
      </Button>

      <Dialog open={open} onOpenChange={(next) => { if (!cancelling) { setOpen(next); if (!next) reset() } }}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-destructive/20 bg-card p-0 shadow-2xl shadow-destructive/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#dc2626_0%,#e11d48_48%,#7c3aed_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-rose-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-violet-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Ban className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Cancel Collected Fee</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Void a collected payment and restore the student&apos;s fee balance.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-destructive/[0.04] via-background to-violet-500/[0.05] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><Search className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Find Receipt</h3><p className="text-[10px] text-muted-foreground">Enter the receipt number printed on the payment slip</p></div>
              </div>
              <div className="relative flex gap-2">
                <Input
                  id="cancel-receipt-number"
                  value={receiptNumber}
                  onChange={(event) => { setReceiptNumber(event.target.value); setMatch(null) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') void findReceipt() }}
                  placeholder="e.g. 1042"
                  disabled={searching || cancelling}
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                />
                <Button type="button" variant="outline" className="h-9 gap-1.5 shadow-sm" onClick={() => void findReceipt()} disabled={searching || !receiptNumber.trim()}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find
                </Button>
              </div>
            </section>

            {match && (
              <section className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-red-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-red-500/10">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm"><ReceiptText className="size-4 text-white" /></span>
                  <div><h3 className="text-sm font-semibold">Receipt Found</h3><p className="text-[10px] text-muted-foreground">Verify these details before cancelling</p></div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-rose-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-rose-500/20 dark:bg-background/35">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300">
                      <ReceiptText className="size-3" /> Receipt No.
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold">{match.receiptNumber}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-rose-500/20 dark:bg-background/35">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300">
                      <Ban className="size-3" /> Student
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold">{match.studentName}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200/80 bg-white/80 px-3 py-2 shadow-sm dark:border-rose-500/20 dark:bg-background/35">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-rose-700 dark:text-rose-300">
                      <ReceiptText className="size-3" /> Class
                    </div>
                    <p className="mt-1 truncate text-xs font-semibold">{match.className || '-'}</p>
                  </div>
                </div>
                <p className="relative mt-3 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-rose-700 sm:justify-start sm:text-left dark:text-rose-300">
                  <ReceiptText className="size-3.5" />
                  Collected: Rs {Number(match.paid || 0).toLocaleString('en-IN')}
                </p>
              </section>
            )}

            <section className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Ban className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Cancellation Reason</h3><p className="text-[10px] text-muted-foreground">At least 5 characters required</p></div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fee-cancellation-reason" className="text-xs">Reason <span className="text-destructive">*</span></Label>
                <Textarea
                  id="fee-cancellation-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain the collection error or reason for cancellation"
                  maxLength={500}
                  disabled={!match || cancelling}
                  className="bg-white dark:bg-input/30"
                />
                <p className="text-xs text-muted-foreground">This reason will be saved permanently in the fee audit trail.</p>
              </div>
            </section>

            {match && (
              <p className="rounded-md border border-amber-200/80 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
                Cancelling will reopen the dues settled by this receipt. The original receipt will remain in the audit trail.
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setOpen(false)} disabled={cancelling}>Close</Button>
            <Button variant="destructive" size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => void cancelPayment()} disabled={!match || reason.trim().length < 5 || cancelling}>
              {cancelling && <Loader2 className="size-4 animate-spin" />} Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
