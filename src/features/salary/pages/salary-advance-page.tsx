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
import { PlusCircle, Wallet } from 'lucide-react'
import { StaffPicker, type PickableStaff } from '@/features/salary/components/staff-picker'

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface AdvanceRequest {
  id: string
  staffType: string
  staffId: string
  staff?: ResolvedStaff | null
  amount: number
  reason?: string | null
  requestDate: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  deductionMonth?: number | null
  deductionYear?: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function SalaryAdvancePage() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<AdvanceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showRequest, setShowRequest] = useState(false)
  const [saving, setSaving] = useState(false)
  const [picked, setPicked] = useState<PickableStaff | null>(null)
  const [form, setForm] = useState({
    amount: '',
    reason: '',
    deductionMonth: String(new Date().getMonth() + 1),
    deductionYear: String(new Date().getFullYear()),
  })

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ requests: AdvanceRequest[] }>('/api/school/salary/advance')
      setRequests(res.requests || [])
    } catch {
      toast({
        title: "Couldn't Load Advances",
        description: "We couldn't load the salary advances. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRequest = async () => {
    if (!picked) return
    setSaving(true)
    try {
      await api.post('/api/school/salary/advance', {
        staffType: picked.staffType,
        staffId: picked.id,
        amount: Number(form.amount),
        reason: form.reason || undefined,
        deductionMonth: Number(form.deductionMonth),
        deductionYear: Number(form.deductionYear),
      })
      toast({ title: 'Submitted', description: 'Advance request submitted.' })
      setShowRequest(false)
      setPicked(null)
      setForm((f) => ({ ...f, amount: '', reason: '' }))
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

  const handleStatusChange = async (id: string, approvalStatus: 'approved' | 'rejected') => {
    try {
      await api.patch(`/api/school/salary/advance/${id}`, { approvalStatus })
      toast({ title: 'Updated', description: `Advance ${approvalStatus}.` })
      fetchData()
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      approved: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
      rejected: 'bg-red-100 text-red-800 hover:bg-red-100',
    }
    return <Badge className={map[status] || ''}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>
  }

  const columns: Column<AdvanceRequest>[] = [
    {
      key: 'staff',
      label: 'Staff Member',
      render: (a) => (
        <div className="flex flex-col">
          <span className="font-medium">{a.staff?.fullName || 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">
            {a.staff?.roleLabel}
            {a.staff?.employeeId ? ` · ${a.staff.employeeId}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'amount', label: 'Amount', render: (a) => <span className="font-semibold">{money(a.amount)}</span> },
    { key: 'requestDate', label: 'Requested', render: (a) => (a.requestDate ? new Date(a.requestDate).toLocaleDateString('en-IN') : '-') },
    { key: 'approvalStatus', label: 'Status', render: (a) => statusBadge(a.approvalStatus) },
    {
      key: 'deduction',
      label: 'Deduction',
      render: (a) => (a.deductionMonth ? `${MONTHS[a.deductionMonth - 1] || ''} ${a.deductionYear || ''}` : '-'),
    },
  ]

  const actions = (a: AdvanceRequest): ActionItem[] => {
    if (a.approvalStatus !== 'pending') return []
    return [
      { label: 'Approve', onClick: () => handleStatusChange(a.id, 'approved') },
      { label: 'Reject', onClick: () => handleStatusChange(a.id, 'rejected'), variant: 'destructive' },
    ]
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Advances"
        description={`${requests.length} advance records`}
        action={{ label: 'Request Advance', icon: PlusCircle, onClick: () => setShowRequest(true) }}
      />

      {requests.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No Salary Advances"
          description="Request salary advances for any teacher, staff member, or driver."
          action={{ label: 'Request Advance', onClick: () => setShowRequest(true) }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={requests}
          searchKey="staffId"
          searchPlaceholder="Search advances..."
          actions={actions}
        />
      )}

      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Salary Advance</DialogTitle>
            <DialogDescription>The approved amount is recovered from the chosen month&apos;s payslip.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Staff Member</Label>
              <StaffPicker value={picked ? { staffType: picked.staffType, staffId: picked.id } : undefined} onChange={setPicked} />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="Enter advance amount"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Recover In Month</Label>
                <Select value={form.deductionMonth} onValueChange={(v) => setForm((f) => ({ ...f, deductionMonth: v }))}>
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
                <Input
                  type="number"
                  value={form.deductionYear}
                  onChange={(e) => setForm((f) => ({ ...f, deductionYear: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequest(false)}>
              Cancel
            </Button>
            <Button onClick={handleRequest} disabled={saving || !picked || !form.amount}>
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
