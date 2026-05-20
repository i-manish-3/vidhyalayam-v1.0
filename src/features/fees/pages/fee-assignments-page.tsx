'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileCheck2, PlusCircle, RefreshCw, Search } from 'lucide-react'

interface Student {
  id: string
  firstName: string
  lastName: string
  admissionNumber?: string | null
  rollNumber?: string | null
}

interface FeeGroup {
  id: string
  name: string
}

interface Assignment {
  id: string
  academicYear: string
  name: string
  source: string
  status: string
  assignedAt: string
  student?: Student & {
    class?: { name: string } | null
    section?: { name: string } | null
  }
  feesGroup?: { name: string }
  feeStructure?: { name: string; version: number }
  items: Array<{ id: string; amount: number }>
  invoices: Array<{ id: string; totalAmount: number; paidAmount: number; status: string }>
}

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`
}

export function FeeAssignmentsPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [groups, setGroups] = useState<FeeGroup[]>([])
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [showAssign, setShowAssign] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [form, setForm] = useState({
    studentId: '',
    feesGroupId: '',
    academicYear: currentSchoolAcademicYear || getCurrentAcademicYear(),
    effectiveFrom: '',
  })

  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(academicYears, currentSchoolAcademicYear),
    [academicYears, currentSchoolAcademicYear]
  )

  const fetchData = useCallback(async () => {
    try {
      const [assignmentRes, studentRes, groupRes, yearRes] = await Promise.all([
        api.get<{ assignments: Assignment[] }>('/api/school/fees/assignments'),
        api.get<{ students: Student[] }>('/api/school/students', { limit: '100' }),
        api.get<{ groups: FeeGroup[] }>('/api/school/fees/groups'),
        api.get<{ academicYears: string[] }>('/api/school/academic-years'),
      ])
      setAssignments(assignmentRes.assignments || [])
      setStudents(studentRes.students || [])
      setGroups(groupRes.groups || [])
      setAcademicYears(yearRes.academicYears || [])
    } catch {
      toast({ title: "Couldn't Load Assignments", description: 'Please refresh and try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === form.academicYear)) {
      setForm((current) => ({
        ...current,
        academicYear: academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear(),
      }))
    }
  }, [academicYearOptions, currentSchoolAcademicYear, form.academicYear])

  const filteredStudents = studentSearch.trim()
    ? students.filter((student) => {
        const q = studentSearch.toLowerCase()
        return `${student.firstName} ${student.lastName}`.toLowerCase().includes(q) ||
          (student.admissionNumber || '').toLowerCase().includes(q) ||
          (student.rollNumber || '').toLowerCase().includes(q)
      })
    : students.slice(0, 30)

  const handleAssign = async () => {
    if (!form.studentId || !form.feesGroupId || !form.academicYear) {
      toast({ title: 'Missing Information', description: 'Please select student, fee group, and academic year.', variant: 'destructive' })
      return
    }

    try {
      setSaving(true)
      await api.post('/api/school/fees/assignments', {
        studentId: form.studentId,
        feesGroupId: form.feesGroupId,
        academicYear: form.academicYear,
        effectiveFrom: form.effectiveFrom || undefined,
      })
      toast({ title: 'Fees Assigned', description: 'Student fee snapshot and invoice were created.' })
      setShowAssign(false)
      setForm({ studentId: '', feesGroupId: '', academicYear: form.academicYear, effectiveFrom: '' })
      fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Assign Fees",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Fee Assignments"
        description={`${assignments.length} student fee snapshot${assignments.length === 1 ? '' : 's'}`}
        action={{ label: 'Assign Fees', icon: PlusCircle, onClick: () => setShowAssign(true) }}
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No Fee Assignments"
          description="Assign a fee group to a student to create a protected fee snapshot."
          action={{ label: 'Assign Fees', onClick: () => setShowAssign(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Structure</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => {
                const invoiceTotal = assignment.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
                return (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div className="font-medium">{assignment.student ? `${assignment.student.firstName} ${assignment.student.lastName}` : '-'}</div>
                      <div className="text-xs text-muted-foreground">
                        {assignment.student?.class?.name || 'No class'} {assignment.student?.section?.name || ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>{assignment.feeStructure?.name || assignment.name}</div>
                      <div className="text-xs text-muted-foreground">{assignment.feesGroup?.name || '-'} - v{assignment.feeStructure?.version || 1}</div>
                    </TableCell>
                    <TableCell>{assignment.academicYear}</TableCell>
                    <TableCell>{assignment.items.length}</TableCell>
                    <TableCell>{money(invoiceTotal)}</TableCell>
                    <TableCell>
                      <Badge variant={assignment.status === 'active' ? 'default' : 'secondary'}>{assignment.status}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Student Fees</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Search student" className="pl-9" />
              </div>
              <Select value={form.studentId} onValueChange={(value) => setForm((current) => ({ ...current, studentId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {filteredStudents.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.firstName} {student.lastName}{student.admissionNumber ? ` - ${student.admissionNumber}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Fee Group</Label>
                <Select value={form.feesGroupId} onValueChange={(value) => setForm((current) => ({ ...current, feesGroupId: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select fee group" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Select value={form.academicYear} onValueChange={(value) => setForm((current) => ({ ...current, academicYear: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                  <SelectContent>
                    {academicYearOptions.map((year) => <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Effective From</Label>
              <Input type="date" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving}>
              {saving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <PlusCircle className="mr-2 size-4" />}
              Assign Fees
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
