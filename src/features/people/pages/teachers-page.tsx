'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DatePicker } from '@/components/date-picker'
import { UserPlus } from 'lucide-react'

interface Teacher {
  id: string; firstName: string; lastName: string; employeeId: string; gender: string; qualification: string; specialization: string; experience: number; isActive: boolean
}

export function TeachersPage() {
  const { toast } = useToast()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', employeeId: '', gender: 'Male', qualification: '', specialization: '', experience: 0, joinDate: '', phone: '', address: '' })

  const fetchTeachers = useCallback(async () => {
    try {
      const data = await api.get<{ teachers: Teacher[] }>('/api/school/teachers')
      setTeachers(data.teachers || [])
    } catch { toast({ title: "Couldn't Load Teachers", description: "We couldn't load the teachers list. Please refresh the page.", variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchTeachers() }, [fetchTeachers])

  const handleAdd = async () => {
    try {
      await api.post('/api/school/teachers', form)
      toast({ title: 'Success', description: 'Teacher added successfully' })
      setShowAdd(false)
      fetchTeachers()
    } catch (err) {
      toast({ title: "Couldn't Add Teacher", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    }
  }

  const columns: Column<Teacher>[] = [
    { key: 'employeeId', label: 'Emp ID', className: 'w-[80px]' },
    { key: 'name', label: 'Name', render: (t: Teacher) => `${t.firstName} ${t.lastName}` },
    { key: 'specialization', label: 'Subject', render: (t: Teacher) => <Badge variant="secondary">{t.specialization || '-'}</Badge> },
    { key: 'qualification', label: 'Qualification', render: (t: Teacher) => t.qualification || '-' },
    { key: 'experience', label: 'Exp (Yrs)', className: 'w-[90px]', render: (t: Teacher) => t.experience || 0 },
    { key: 'status', label: 'Status', render: (t: Teacher) => <Badge variant={t.isActive ? 'default' : 'destructive'}>{t.isActive ? 'Active' : 'Inactive'}</Badge> },
  ]

  const actions = (_t: Teacher): ActionItem[] => [{ label: 'View Details', onClick: () => {} }]

  return (
    <div className="space-y-6">
      <PageHeader title="Teachers" description={`${teachers.length} teachers`} action={{ label: 'Add Teacher', icon: UserPlus, onClick: () => setShowAdd(true) }} />
      <DataTable columns={columns} data={teachers} searchKey="firstName" searchPlaceholder="Search teachers..." actions={actions} isLoading={loading} />
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New Teacher</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>First Name</Label><Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Last Name</Label><Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Employee ID</Label><Input value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} placeholder="EMP001" /></div>
              <div className="space-y-2"><Label>Gender</Label>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Qualification</Label><Input value={form.qualification} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))} placeholder="M.Sc, B.Ed" /></div>
              <div className="space-y-2"><Label>Specialization</Label><Input value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} placeholder="Mathematics" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Experience (Years)</Label><Input type="number" value={form.experience} onChange={e => setForm(f => ({ ...f, experience: Number(e.target.value) }))} /></div>
              <div className="space-y-2"><Label>Join Date</Label><DatePicker value={form.joinDate} onChange={(v) => setForm(f => ({ ...f, joinDate: v }))} disableFuture placeholder="Select join date" triggerClassName="w-full" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!form.firstName}>Add Teacher</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
