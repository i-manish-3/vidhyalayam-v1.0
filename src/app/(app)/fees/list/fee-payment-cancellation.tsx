'use client'

import { useState } from 'react'
import { Ban, Loader2, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { usePermissions } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
      <div className="mb-3 flex justify-end">
        <Button variant="destructive" className="gap-2" onClick={() => setOpen(true)}>
          <Ban className="size-4" /> Cancel Collected Fee
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => { if (!cancelling) { setOpen(next); if (!next) reset() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Cancel Collected Fee</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cancel-receipt-number">Receipt number</Label>
              <div className="flex gap-2">
                <Input
                  id="cancel-receipt-number"
                  value={receiptNumber}
                  onChange={(event) => { setReceiptNumber(event.target.value); setMatch(null) }}
                  onKeyDown={(event) => { if (event.key === 'Enter') void findReceipt() }}
                  placeholder="e.g. 1042"
                  disabled={searching || cancelling}
                />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => void findReceipt()} disabled={searching || !receiptNumber.trim()}>
                  {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find
                </Button>
              </div>
            </div>

            {match && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="font-semibold">Receipt {match.receiptNumber}</div>
                <div className="mt-1 text-muted-foreground">{match.studentName} - {match.className || '-'}</div>
                <div className="mt-1 font-medium">Collected: Rs {Number(match.paid || 0).toLocaleString('en-IN')}</div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fee-cancellation-reason">Cancellation reason <span className="text-destructive">*</span></Label>
              <Textarea
                id="fee-cancellation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain the collection error or reason for cancellation"
                maxLength={500}
                disabled={!match || cancelling}
              />
              <p className="text-xs text-muted-foreground">This reason will be saved permanently in the fee audit trail.</p>
            </div>

            {match && (
              <p className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Cancelling will reopen the dues settled by this receipt. The original receipt will remain in the audit trail.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={cancelling}>Close</Button>
            <Button variant="destructive" className="gap-1.5" onClick={() => void cancelPayment()} disabled={!match || reason.trim().length < 5 || cancelling}>
              {cancelling && <Loader2 className="size-4 animate-spin" />} Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
