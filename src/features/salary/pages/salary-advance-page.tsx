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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusCircle, Wallet } from 'lucide-react'

interface Teacher {
  id: string
  firstName: string
  lastName: string
}

interface SalaryAdvance {
  id: string
  teacherId: string
  teacher?: Teacher
  amount: number
  requestDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  deductionMonth?: string
}

export function SalaryAdvancePage() {
  const { toast } = useToast()
  const [advances, setAdvances] = useState<SalaryAdvance[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [showRequest, setShowRequest] = useState(false)
  const [form, setForm] = useState({ teacherId: '', amount: '', deductionMonth: '' })

  const fetchData = useCallback(async () => {
    try {
      const [advRes, teachRes] = await Promise.all([
        api.get<{ advances: SalaryAdvance[] }>('/api/school/salary/advance'),
        api.get<{ teachers: Teacher[] }>('/api/school/teachers'),
      ])
      setAdvances(advRes.advances || [])
      setTeachers(teachRes.teachers || [])
    } catch {
      toast({ title: 'Couldn\'t Load Advances', description: 'We couldn\'t load the salary advances. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRequest = async () => {
    try {
      await api.post('/api/school/salary/advance', {
        teacherId: form.teacherId,
        amount: Number(form.amount),
        deductionMonth: form.deductionMonth || undefined,
      })
      toast({ title: 'Success', description: 'Advance request submitted' })
      setShowRequest(false)
      setForm({ teacherId: '', amount: '', deductionMonth: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.patch(`/api/school/salary/advance/${id}`, { status })
      toast({ title: 'Success', description: `Advance ${status.toLowerCase()}` })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      APPROVED: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
      REJECTED: 'bg-red-100 text-red-800 hover:bg-red-100',
    }
    return <Badge className={map[status] || ''}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>
  }

  const columns: Column<SalaryAdvance>[] = [
    { key: 'teacher', label: 'Teacher', render: (a: SalaryAdvance) => a.teacher ? `${a.teacher.firstName} ${a.teacher.lastName}` : '-' },
    { key: 'amount', label: 'Amount', render: (a: SalaryAdvance) => `₹${a.amount?.toLocaleString() || 0}` },
    { key: 'requestDate', label: 'Request Date', render: (a: SalaryAdvance) => a.requestDate ? new Date(a.requestDate).toLocaleDateString() : '-' },
    { key: 'status', label: 'Status', render: (a: SalaryAdvance) => statusBadge(a.status) },
    { key: 'deductionMonth', label: 'Deduction Month', render: (a: SalaryAdvance) => a.deductionMonth || '-' },
  ]

  const actions = (a: SalaryAdvance): ActionItem[] => {
    const items: ActionItem[] = [{ label: 'View Details', onClick: () => {} }]
    if (a.status === 'PENDING') {
      items.push({ label: 'Approve', onClick: () => handleStatusChange(a.id, 'APPROVED') })
      items.push({ label: 'Reject', onClick: () => handleStatusChange(a.id, 'REJECTED'), variant: 'destructive' })
    }
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Salary Advance" description={`${advances.length} advance records`} action={{ label: 'Request Advance', icon: PlusCircle, onClick: () => setShowRequest(true) }} />

      {advances.length === 0 ? (
        <EmptyState icon={Wallet} title="No Salary Advances" description="Request salary advances for teachers." action={{ label: 'Request Advance', onClick: () => setShowRequest(true) }} />
      ) : (
        <DataTable columns={columns} data={advances} searchKey="teacherId" searchPlaceholder="Search advances..." actions={actions} />
      )}

      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Request Salary Advance</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Teacher</Label>
              <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="Enter advance amount" /></div>
            <div className="space-y-2"><Label>Deduction Month</Label><Input type="month" value={form.deductionMonth} onChange={e => setForm(f => ({ ...f, deductionMonth: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">Advance is limited to max 50% of net salary. Requests between 5th–25th only.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequest(false)}>Cancel</Button>
            <Button onClick={handleRequest} disabled={!form.teacherId || !form.amount}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
