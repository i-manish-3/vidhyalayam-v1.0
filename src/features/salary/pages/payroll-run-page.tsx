'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Play, CalendarClock, ArrowLeft, CheckCircle2, Trash2 } from 'lucide-react'

interface PayrollRun {
  id: string
  month: number
  year: number
  status: 'draft' | 'generated' | 'finalized'
  totalStaff: number
  totalGross: number
  totalNet: number
  finalizedAt?: string | null
}

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface RunPayment {
  id: string
  staff?: ResolvedStaff | null
  grossEarnings: number
  totalDeductions: number
  netPayable: number
  paymentStatus: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function PayrollRunPage() {
  const { toast } = useToast()
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
  })

  const [activeRun, setActiveRun] = useState<PayrollRun | null>(null)
  const [runPayments, setRunPayments] = useState<RunPayment[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [confirmPay, setConfirmPay] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [busy, setBusy] = useState(false)

  const fetchRuns = useCallback(async () => {
    try {
      const res = await api.get<{ runs: PayrollRun[] }>('/api/school/salary/payroll-runs')
      setRuns(res.runs || [])
    } catch {
      toast({ title: "Couldn't Load Payroll Runs", description: 'Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  const openRun = useCallback(
    async (runId: string) => {
      setDetailLoading(true)
      try {
        const res = await api.get<{ run: PayrollRun; payments: RunPayment[] }>(
          `/api/school/salary/payroll-runs/${runId}`
        )
        setActiveRun(res.run)
        setRunPayments(res.payments || [])
      } catch {
        toast({ title: "Couldn't Load Run", description: 'Please try again.', variant: 'destructive' })
      } finally {
        setDetailLoading(false)
      }
    },
    [toast]
  )

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.post<{ run: PayrollRun; created: number }>('/api/school/salary/payroll-runs', {
        month: Number(form.month),
        year: Number(form.year),
      })
      toast({ title: 'Payroll Generated', description: `${res.created} new payslip(s) created.` })
      await fetchRuns()
      openRun(res.run.id)
    } catch (err) {
      toast({
        title: "Couldn't Generate Payroll",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  const handlePayAll = async () => {
    if (!activeRun) return
    setBusy(true)
    try {
      await api.patch(`/api/school/salary/payroll-runs/${activeRun.id}`, { action: 'pay-all' })
      toast({ title: 'Payroll Paid', description: 'All payslips marked paid and the run is finalized.' })
      setConfirmPay(false)
      await fetchRuns()
      openRun(activeRun.id)
    } catch (err) {
      toast({
        title: "Couldn't Finalize",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDiscard = async () => {
    if (!activeRun) return
    setBusy(true)
    try {
      await api.delete(`/api/school/salary/payroll-runs/${activeRun.id}`)
      toast({ title: 'Run Discarded', description: 'The draft payroll run was removed.' })
      setConfirmDiscard(false)
      setActiveRun(null)
      fetchRuns()
    } catch (err) {
      toast({
        title: "Couldn't Discard",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
      generated: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      finalized: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    }
    return <Badge className={map[status] || ''}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
  }

  if (loading) return <LoadingState />

  // ---- Run detail view ----
  if (activeRun) {
    const paymentColumns: Column<RunPayment>[] = [
      {
        key: 'staff',
        label: 'Staff Member',
        render: (p) => (
          <div className="flex flex-col">
            <span className="font-medium">{p.staff?.fullName || 'Unknown'}</span>
            <span className="text-xs text-muted-foreground">{p.staff?.roleLabel}</span>
          </div>
        ),
      },
      { key: 'grossEarnings', label: 'Gross', render: (p) => money(p.grossEarnings) },
      { key: 'totalDeductions', label: 'Deductions', render: (p) => money(p.totalDeductions) },
      { key: 'netPayable', label: 'Net', render: (p) => <span className="font-semibold">{money(p.netPayable)}</span> },
      {
        key: 'paymentStatus',
        label: 'Status',
        render: (p) => statusBadge(p.paymentStatus === 'paid' ? 'finalized' : 'generated'),
      },
    ]

    return (
      <div className="space-y-6">
        <PageHeader
          title={`Payroll — ${MONTHS[activeRun.month - 1]} ${activeRun.year}`}
          description={`${activeRun.totalStaff} staff · net ${money(activeRun.totalNet)}`}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setActiveRun(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Runs
          </Button>
          {activeRun.status !== 'finalized' && (
            <>
              <Button onClick={() => setConfirmPay(true)}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Pay All & Finalize
              </Button>
              <Button variant="outline" onClick={() => setConfirmDiscard(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Discard Run
              </Button>
            </>
          )}
        </div>

        {detailLoading ? (
          <LoadingState />
        ) : (
          <DataTable columns={paymentColumns} data={runPayments} searchKey="id" showSearch={false} />
        )}

        <AlertDialog open={confirmPay} onOpenChange={setConfirmPay}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pay all and finalize?</AlertDialogTitle>
              <AlertDialogDescription>
                This marks every pending payslip in this run as paid and finalizes the run. Finalized runs can&apos;t be
                regenerated or discarded.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handlePayAll} disabled={busy}>
                Pay All & Finalize
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this payroll run?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the run and its pending payslips. Already-paid payslips block discarding.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscard} disabled={busy}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ---- Runs list view ----
  const columns: Column<PayrollRun>[] = [
    { key: 'period', label: 'Period', render: (r) => `${MONTHS[r.month - 1] || ''} ${r.year}` },
    { key: 'totalStaff', label: 'Staff', render: (r) => r.totalStaff },
    { key: 'totalGross', label: 'Gross', render: (r) => money(r.totalGross) },
    { key: 'totalNet', label: 'Net', render: (r) => <span className="font-semibold">{money(r.totalNet)}</span> },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
  ]

  const actions = (r: PayrollRun): ActionItem[] => [{ label: 'Open', onClick: () => openRun(r.id) }]

  return (
    <div className="space-y-6">
      <PageHeader title="Run Payroll" description="Generate and finalize monthly payroll for all staff" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Monthly Payroll</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={form.month} onValueChange={(v) => setForm((f) => ({ ...f, month: v }))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Input
                type="number"
                className="w-28"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating}>
              <Play className="mr-2 h-4 w-4" /> {generating ? 'Generating...' : 'Generate Payroll'}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Generates pending payslips for every active staff member that has a salary structure. Re-running a month
            only adds the missing staff.
          </p>
        </CardContent>
      </Card>

      {runs.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No Payroll Runs Yet"
          description="Generate payroll for a month to create payslips for all staff at once."
        />
      ) : (
        <DataTable columns={columns} data={runs} searchKey="year" showSearch={false} actions={actions} />
      )}
    </div>
  )
}
