'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { PlusCircle, Banknote, Info } from 'lucide-react'

interface Teacher {
  id: string
  firstName: string
  lastName: string
}

interface SalaryPayment {
  id: string
  teacherId: string
  teacher?: Teacher
  month: number
  year: number
  gross: number
  deductions: number
  net: number
  status: 'PAID' | 'PENDING'
  paymentDate?: string
}

export function SalaryPaymentsPage() {
  const { toast } = useToast()
  const [payments, setPayments] = useState<SalaryPayment[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [form, setForm] = useState({ teacherId: '', month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) })

  const fetchData = useCallback(async () => {
    try {
      const [payRes, teachRes] = await Promise.all([
        api.get<{ payments: SalaryPayment[] }>('/api/school/salary/payments'),
        api.get<{ teachers: Teacher[] }>('/api/school/teachers'),
      ])
      setPayments(payRes.payments || [])
      setTeachers(teachRes.teachers || [])
    } catch {
      toast({ title: 'Couldn\'t Load Payments', description: 'We couldn\'t load the salary payments. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async () => {
    try {
      await api.post('/api/school/salary/payments', {
        teacherId: form.teacherId || undefined,
        month: Number(form.month),
        year: Number(form.year),
      })
      toast({ title: 'Success', description: 'Salary generated successfully' })
      setShowGenerate(false)
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const monthName = (m: number) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] || ''

  const columns: Column<SalaryPayment>[] = [
    { key: 'teacher', label: 'Teacher', render: (p: SalaryPayment) => p.teacher ? `${p.teacher.firstName} ${p.teacher.lastName}` : '-' },
    { key: 'month', label: 'Month/Year', render: (p: SalaryPayment) => `${monthName(p.month)} ${p.year}` },
    { key: 'gross', label: 'Gross', render: (p: SalaryPayment) => `₹${p.gross?.toLocaleString() || 0}` },
    { key: 'deductions', label: 'Deductions', render: (p: SalaryPayment) => `₹${p.deductions?.toLocaleString() || 0}` },
    { key: 'net', label: 'Net', render: (p: SalaryPayment) => <span className="font-semibold">₹{p.net?.toLocaleString() || 0}</span> },
    { key: 'status', label: 'Status', render: (p: SalaryPayment) => (
      <Badge className={p.status === 'PAID' ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100' : 'bg-amber-100 text-amber-800 hover:bg-amber-100'}>
        {p.status === 'PAID' ? 'Paid' : 'Pending'}
      </Badge>
    )},
    { key: 'paymentDate', label: 'Payment Date', render: (p: SalaryPayment) => p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : '-' },
  ]

  const actions = (p: SalaryPayment): ActionItem[] => {
    const items: ActionItem[] = [{ label: 'View Details', onClick: () => {} }]
    if (p.status === 'PENDING') items.push({ label: 'Mark as Paid', onClick: () => {} })
    return items
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Salary Payments" description={`${payments.length} payment records`} action={{ label: 'Generate Salary', icon: PlusCircle, onClick: () => setShowGenerate(true) }} />

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="size-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Business Rules</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-700">
              <li>Salary is auto-generated on the 5th of every month</li>
              <li>Salary advance can be requested between 5th–25th (max 50% of net salary)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {payments.length === 0 ? (
        <EmptyState icon={Banknote} title="No Salary Payments" description="Generate salary payments for the current month." action={{ label: 'Generate Salary', onClick: () => setShowGenerate(true) }} />
      ) : (
        <DataTable columns={columns} data={payments} searchKey="teacherId" searchPlaceholder="Search payments..." actions={actions} />
      )}

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Salary</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Teacher (leave empty for all)</Label>
              <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger><SelectValue placeholder="All Teachers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Teachers</SelectItem>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Year</Label><Input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>Cancel</Button>
            <Button onClick={handleGenerate}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
