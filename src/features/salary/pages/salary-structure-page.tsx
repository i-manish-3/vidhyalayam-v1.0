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
import { PlusCircle, DollarSign } from 'lucide-react'

interface Teacher {
  id: string
  firstName: string
  lastName: string
}

interface SalaryStructure {
  id: string
  teacherId: string
  teacher?: Teacher
  basic: number
  hra: number
  da: number
  ta: number
  medical: number
  special: number
  pf: number
  esi: number
  gross: number
  net: number
}

export function SalaryStructurePage() {
  const { toast } = useToast()
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    teacherId: '', basic: '', hra: '', da: '', ta: '', medical: '', special: '', pf: '', esi: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const [structRes, teachRes] = await Promise.all([
        api.get<{ structures: SalaryStructure[] }>('/api/school/salary/structures'),
        api.get<{ teachers: Teacher[] }>('/api/school/teachers'),
      ])
      setStructures(structRes.structures || [])
      setTeachers(teachRes.teachers || [])
    } catch {
      toast({ title: 'Couldn\'t Load Data', description: 'We couldn\'t load the salary structures. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const gross = Number(form.basic || 0) + Number(form.hra || 0) + Number(form.da || 0) + Number(form.ta || 0) + Number(form.medical || 0) + Number(form.special || 0)
  const net = gross - Number(form.pf || 0) - Number(form.esi || 0)

  const handleAdd = async () => {
    try {
      await api.post('/api/school/salary/structures', {
        teacherId: form.teacherId,
        basic: Number(form.basic), hra: Number(form.hra), da: Number(form.da),
        ta: Number(form.ta), medical: Number(form.medical), special: Number(form.special),
        pf: Number(form.pf), esi: Number(form.esi), gross, net,
      })
      toast({ title: 'Success', description: 'Salary structure created' })
      setShowAdd(false)
      setForm({ teacherId: '', basic: '', hra: '', da: '', ta: '', medical: '', special: '', pf: '', esi: '' })
      fetchData()
    } catch (err) {
      toast({ title: 'Something Went Wrong', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const columns: Column<SalaryStructure>[] = [
    { key: 'teacher', label: 'Teacher Name', render: (s: SalaryStructure) => s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : '-' },
    { key: 'basic', label: 'Basic', render: (s: SalaryStructure) => `₹${s.basic?.toLocaleString() || 0}` },
    { key: 'hra', label: 'HRA', render: (s: SalaryStructure) => `₹${s.hra?.toLocaleString() || 0}` },
    { key: 'da', label: 'DA', render: (s: SalaryStructure) => `₹${s.da?.toLocaleString() || 0}` },
    { key: 'gross', label: 'Gross', render: (s: SalaryStructure) => <span className="font-semibold">₹{s.gross?.toLocaleString() || 0}</span> },
    { key: 'deductions', label: 'PF/ESI', render: (s: SalaryStructure) => `₹${((s.pf || 0) + (s.esi || 0)).toLocaleString()}` },
    { key: 'net', label: 'Net Salary', render: (s: SalaryStructure) => <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">₹{s.net?.toLocaleString() || 0}</Badge> },
  ]

  const actions = (_s: SalaryStructure): ActionItem[] => [
    { label: 'View Details', onClick: () => {} },
    { label: 'Edit', onClick: () => {} },
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader title="Salary Structures" description={`${structures.length} structures configured`} action={{ label: 'Add Structure', icon: PlusCircle, onClick: () => setShowAdd(true) }} />

      {structures.length === 0 ? (
        <EmptyState icon={DollarSign} title="No Salary Structures" description="Create salary structures to define compensation for teachers." action={{ label: 'Add Structure', onClick: () => setShowAdd(true) }} />
      ) : (
        <DataTable columns={columns} data={structures} searchKey="teacherId" searchPlaceholder="Search structures..." actions={actions} />
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle>Add Salary Structure</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Teacher</Label>
              <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Basic</Label><Input type="number" value={form.basic} onChange={e => setForm(f => ({ ...f, basic: e.target.value }))} /></div>
              <div className="space-y-2"><Label>HRA</Label><Input type="number" value={form.hra} onChange={e => setForm(f => ({ ...f, hra: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>DA</Label><Input type="number" value={form.da} onChange={e => setForm(f => ({ ...f, da: e.target.value }))} /></div>
              <div className="space-y-2"><Label>TA</Label><Input type="number" value={form.ta} onChange={e => setForm(f => ({ ...f, ta: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Medical</Label><Input type="number" value={form.medical} onChange={e => setForm(f => ({ ...f, medical: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Special Allowance</Label><Input type="number" value={form.special} onChange={e => setForm(f => ({ ...f, special: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>PF</Label><Input type="number" value={form.pf} onChange={e => setForm(f => ({ ...f, pf: e.target.value }))} /></div>
              <div className="space-y-2"><Label>ESI</Label><Input type="number" value={form.esi} onChange={e => setForm(f => ({ ...f, esi: e.target.value }))} /></div>
            </div>
            <div className="rounded-lg border p-3 space-y-1 bg-muted/50">
              <div className="flex justify-between text-sm"><span>Gross Salary</span><span className="font-semibold">₹{gross.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Deductions</span><span>₹{(Number(form.pf || 0) + Number(form.esi || 0)).toLocaleString()}</span></div>
              <div className="flex justify-between text-sm font-bold border-t pt-1"><span>Net Salary</span><span className="text-emerald-700">₹{net.toLocaleString()}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.teacherId || !form.basic}>Create Structure</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
