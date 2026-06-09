'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, DataTable, type Column, type ActionItem, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { PlusCircle, DollarSign } from 'lucide-react'
import { StaffPicker, type PickableStaff } from '@/features/salary/components/staff-picker'

interface ResolvedStaff {
  fullName: string
  employeeId: string | null
  roleLabel: string
}

interface SalaryStructure {
  id: string
  staffType: string
  staffId: string
  staff?: ResolvedStaff | null
  basicSalary: number
  hra: number
  da: number
  ta: number
  medicalAllowance: number
  specialAllowance: number
  pf: number
  esi: number
  tax: number
  otherDeductions: number
  grossSalary: number
  netSalary: number
  standardDays: number
}

const EMPTY_FORM = {
  basicSalary: '',
  hra: '',
  da: '',
  ta: '',
  medicalAllowance: '',
  specialAllowance: '',
  pf: '',
  esi: '',
  tax: '',
  otherDeductions: '',
  standardDays: '30',
}

type FormState = typeof EMPTY_FORM

const money = (n: number | undefined) => `₹${(n || 0).toLocaleString('en-IN')}`

export function SalaryStructurePage() {
  const { toast } = useToast()
  const [structures, setStructures] = useState<SalaryStructure[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<SalaryStructure | null>(null)
  const [picked, setPicked] = useState<PickableStaff | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [toDelete, setToDelete] = useState<SalaryStructure | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ structures: SalaryStructure[] }>('/api/school/salary/structures')
      setStructures(res.structures || [])
    } catch {
      toast({
        title: "Couldn't Load Data",
        description: "We couldn't load the salary structures. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const num = (v: string) => Number(v || 0)
  const gross =
    num(form.basicSalary) +
    num(form.hra) +
    num(form.da) +
    num(form.ta) +
    num(form.medicalAllowance) +
    num(form.specialAllowance)
  const deductions = num(form.pf) + num(form.esi) + num(form.tax) + num(form.otherDeductions)
  const net = gross - deductions

  const openAdd = () => {
    setEditing(null)
    setPicked(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (s: SalaryStructure) => {
    setEditing(s)
    setPicked(null)
    setForm({
      basicSalary: String(s.basicSalary ?? ''),
      hra: String(s.hra ?? ''),
      da: String(s.da ?? ''),
      ta: String(s.ta ?? ''),
      medicalAllowance: String(s.medicalAllowance ?? ''),
      specialAllowance: String(s.specialAllowance ?? ''),
      pf: String(s.pf ?? ''),
      esi: String(s.esi ?? ''),
      tax: String(s.tax ?? ''),
      otherDeductions: String(s.otherDeductions ?? ''),
      standardDays: String(s.standardDays ?? 30),
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        basicSalary: num(form.basicSalary),
        hra: num(form.hra),
        da: num(form.da),
        ta: num(form.ta),
        medicalAllowance: num(form.medicalAllowance),
        specialAllowance: num(form.specialAllowance),
        pf: num(form.pf),
        esi: num(form.esi),
        tax: num(form.tax),
        otherDeductions: num(form.otherDeductions),
        standardDays: num(form.standardDays) || 30,
      }
      if (editing) {
        await api.patch(`/api/school/salary/structures/${editing.id}`, payload)
        toast({ title: 'Saved', description: 'Salary structure updated.' })
      } else {
        if (!picked) return
        await api.post('/api/school/salary/structures', {
          staffType: picked.staffType,
          staffId: picked.id,
          ...payload,
        })
        toast({ title: 'Created', description: 'Salary structure created.' })
      }
      setShowForm(false)
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

  const handleDelete = async () => {
    if (!toDelete) return
    try {
      await api.delete(`/api/school/salary/structures/${toDelete.id}`)
      toast({ title: 'Removed', description: 'Salary structure removed.' })
      setToDelete(null)
      fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Remove",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const columns: Column<SalaryStructure>[] = [
    {
      key: 'staff',
      label: 'Staff Member',
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-medium">{s.staff?.fullName || 'Unknown'}</span>
          <span className="text-xs text-muted-foreground">
            {s.staff?.roleLabel}
            {s.staff?.employeeId ? ` · ${s.staff.employeeId}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'basicSalary', label: 'Basic', render: (s) => money(s.basicSalary) },
    { key: 'grossSalary', label: 'Gross', render: (s) => <span className="font-semibold">{money(s.grossSalary)}</span> },
    {
      key: 'deductions',
      label: 'Deductions',
      render: (s) => money((s.pf || 0) + (s.esi || 0) + (s.tax || 0) + (s.otherDeductions || 0)),
    },
    {
      key: 'netSalary',
      label: 'Net Salary',
      render: (s) => (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{money(s.netSalary)}</Badge>
      ),
    },
  ]

  const actions = (s: SalaryStructure): ActionItem[] => [
    { label: 'Edit', onClick: () => openEdit(s) },
    { label: 'Remove', onClick: () => setToDelete(s), variant: 'destructive' },
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary Structures"
        description={`${structures.length} structures configured across all staff`}
        action={{ label: 'Add Structure', icon: PlusCircle, onClick: openAdd }}
      />

      {structures.length === 0 ? (
        <EmptyState
          icon={DollarSign}
          title="No Salary Structures"
          description="Create salary structures to define compensation for teachers, staff, and drivers."
          action={{ label: 'Add Structure', onClick: openAdd }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={structures}
          searchKey="staffId"
          searchPlaceholder="Search structures..."
          actions={actions}
        />
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Salary Structure' : 'Add Salary Structure'}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Updating structure for ${editing.staff?.fullName || 'this staff member'}.`
                : 'Choose any teacher, staff member, or driver and define their compensation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {!editing && (
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <StaffPicker value={picked ? { staffType: picked.staffType, staffId: picked.id } : undefined} onChange={setPicked} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Basic" value={form.basicSalary} onChange={(v) => setForm((f) => ({ ...f, basicSalary: v }))} />
              <Field label="HRA" value={form.hra} onChange={(v) => setForm((f) => ({ ...f, hra: v }))} />
              <Field label="DA" value={form.da} onChange={(v) => setForm((f) => ({ ...f, da: v }))} />
              <Field label="TA" value={form.ta} onChange={(v) => setForm((f) => ({ ...f, ta: v }))} />
              <Field label="Medical" value={form.medicalAllowance} onChange={(v) => setForm((f) => ({ ...f, medicalAllowance: v }))} />
              <Field label="Special Allowance" value={form.specialAllowance} onChange={(v) => setForm((f) => ({ ...f, specialAllowance: v }))} />
              <Field label="PF" value={form.pf} onChange={(v) => setForm((f) => ({ ...f, pf: v }))} />
              <Field label="ESI" value={form.esi} onChange={(v) => setForm((f) => ({ ...f, esi: v }))} />
              <Field label="Tax (TDS)" value={form.tax} onChange={(v) => setForm((f) => ({ ...f, tax: v }))} />
              <Field label="Other Deductions" value={form.otherDeductions} onChange={(v) => setForm((f) => ({ ...f, otherDeductions: v }))} />
              <Field label="Standard Days / Month" value={form.standardDays} onChange={(v) => setForm((f) => ({ ...f, standardDays: v }))} />
            </div>
            <div className="rounded-lg border p-3 space-y-1 bg-muted/50">
              <div className="flex justify-between text-sm">
                <span>Gross Salary</span>
                <span className="font-semibold">{money(gross)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Total Deductions</span>
                <span>{money(deductions)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-1">
                <span>Net Salary</span>
                <span className="text-emerald-700">{money(net)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || (!editing && !picked) || !form.basicSalary}>
              {editing ? 'Save Changes' : 'Create Structure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove salary structure?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the salary structure for {toDelete?.staff?.fullName || 'this staff member'}. Existing
              payslips are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
