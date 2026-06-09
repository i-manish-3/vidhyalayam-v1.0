'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { PlusCircle, Banknote } from 'lucide-react'
import { StaffPicker, type PickableStaff } from '@/features/salary/components/staff-picker'
import { openPayslipPrint, type PayslipData } from '@/features/salary/lib/payslip'

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface SalaryPayment {
  id: string
  staffType: string
  staffId: string
  staff?: ResolvedStaff | null
  month: number
  year: number
  grossEarnings: number
  totalDeductions: number
  netPayable: number
  paymentStatus: string
  paymentDate?: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function SalaryPaymentsPage() {
  const { toast } = useToast()
  const [payments, setPayments] = useState<SalaryPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<PickableStaff | null>(null)
  const [form, setForm] = useState({
    month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()),
    lopDays: '0',
  })
  const [payTarget, setPayTarget] = useState<SalaryPayment | null>(null)
  const [payForm, setPayForm] = useState({ paymentMethod: 'bank_transfer', transactionRef: '' })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ payments: SalaryPayment[] }>('/api/school/salary/payments')
      setPayments(res.payments || [])
    } catch {
      toast({
        title: "Couldn't Load Payments",
        description: "We couldn't load the salary payments. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleGenerate = async () => {
    if (!picked) return
    setSaving(true)
    try {
      await api.post('/api/school/salary/payments', {
        staffType: picked.staffType,
        staffId: picked.id,
        month: Number(form.month),
        year: Number(form.year),
        lopDays: Number(form.lopDays) || 0,
      })
      toast({ title: 'Generated', description: 'Salary payslip generated.' })
      setShowGenerate(false)
      setPicked(null)
      setForm((f) => ({ ...f, lopDays: '0' }))
      fetchData()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handlePay = async () => {
    if (!payTarget) return
    setSaving(true)
    try {
      await api.patch(`/api/school/salary/payments/${payTarget.id}`, {
        action: 'pay',
        paymentMethod: payForm.paymentMethod,
        transactionRef: payForm.transactionRef || undefined,
      })
      toast({ title: 'Paid', description: 'Salary marked as paid.' })
      setPayTarget(null)
      setPayForm({ paymentMethod: 'bank_transfer', transactionRef: '' })
      fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Mark Paid",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const viewPayslip = async (p: SalaryPayment) => {
    try {
      const data = await api.get<PayslipData>(`/api/school/salary/payments/${p.id}/payslip`)
      openPayslipPrint(data)
    } catch {
      toast({ title: "Couldn't Open Payslip", description: 'Please try again.', variant: 'destructive' })
    }
  }

  const columns: Column<SalaryPayment>[] = [
    {
      key: 'staff',
      label: 'Staff Member',
      render: (p) => (
        <div className="flex flex-col">
          <span className="font-medium">{p.staff?.fullName || 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">
            {p.staff?.roleLabel}
            {p.staff?.employeeId ? ` · ${p.staff.employeeId}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'period', label: 'Month/Year', render: (p) => `${MONTHS[p.month - 1] || ''} ${p.year}` },
    { key: 'grossEarnings', label: 'Gross', render: (p) => money(p.grossEarnings) },
    { key: 'totalDeductions', label: 'Deductions', render: (p) => money(p.totalDeductions) },
    { key: 'netPayable', label: 'Net', render: (p) => <span className="font-semibold">{money(p.netPayable)}</span> },
    {
      key: 'paymentStatus',
      label: 'Status',
      render: (p) => (
        <Badge
          className={
            p.paymentStatus === 'paid'
              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
              : 'bg-amber-100 text-amber-800 hover:bg-amber-100'
          }
        >
          {p.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
        </Badge>
      ),
    },
    {
      key: 'paymentDate',
      label: 'Payment Date',
      render: (p) => (p.paymentDate ? new Date(p.paymentDate).toLocaleDateString('en-IN') : '-'),
    },
  ]

  const actions = (p: SalaryPayment): ActionItem[] => {
    const items: ActionItem[] = [{ label: 'View Payslip', onClick: () => viewPayslip(p) }]
    if (p.paymentStatus !== 'paid') items.push({ label: 'Mark as Paid', onClick: () => setPayTarget(p) })
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Payments"
        description={`${payments.length} payment records`}
        action={{ label: 'Generate Payslip', icon: PlusCircle, onClick: () => setShowGenerate(true) }}
      />

      {payments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="No Salary Payments"
          description="Generate a payslip for any staff member, or run payroll for the whole month."
          action={{ label: 'Generate Payslip', onClick: () => setShowGenerate(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={payments}
          searchKey="staffId"
          searchPlaceholder="Search payments..."
          actions={actions}
        />
      )}

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Payslip</DialogTitle>
            <DialogDescription>Create a single payslip. For everyone at once, use Run Payroll.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Staff Member</Label>
              <StaffPicker value={picked ? { staffType: picked.staffType, staffId: picked.id } : undefined} onChange={setPicked} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={form.month} onValueChange={(v) => setForm((f) => ({ ...f, month: v }))}>
                  <SelectTrigger>
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
                <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>LOP Days</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.lopDays}
                  onChange={(e) => setForm((f) => ({ ...f, lopDays: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={saving || !picked}>
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Salary Paid</DialogTitle>
            <DialogDescription>
              {payTarget?.staff?.fullName} — net {money(payTarget?.netPayable)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payForm.paymentMethod} onValueChange={(v) => setPayForm((f) => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input
                value={payForm.transactionRef}
                onChange={(e) => setPayForm((f) => ({ ...f, transactionRef: e.target.value }))}
                placeholder="Transaction / cheque no."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handlePay} disabled={saving}>
              Mark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
