'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { compareClassNames } from '@/lib/class-order'
import { useToast } from '@/hooks/use-toast'
import { LoadingState, PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GraduationCap, Home, Loader2, Palette, Plus, Save, Trash2, Users, X } from 'lucide-react'

interface StudentHouse {
  id: string
  name: string
  color: string
  description: string | null
  isActive: boolean
  _count?: { students: number }
}

interface StudentRow {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  rollNumber: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  assignedHouse?: { id: string; name: string; color: string } | null
}

const DEFAULT_COLORS = ['#ef4444', '#2563eb', '#16a34a', '#eab308', '#9333ea', '#f97316']

export function StudentHousesPage() {
  const { toast } = useToast()
  const [houses, setHouses] = useState<StudentHouse[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingHouse, setEditingHouse] = useState<StudentHouse | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StudentHouse | null>(null)
  const [form, setForm] = useState({ name: '', color: DEFAULT_COLORS[0], description: '' })
  const [selectedHouseId, setSelectedHouseId] = useState<string>('all')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [sectionFilter, setSectionFilter] = useState<string>('all')
  const [assignmentScope, setAssignmentScope] = useState<'selected' | 'filtered' | 'class'>('selected')
  const [targetHouseId, setTargetHouseId] = useState<string>('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [houseData, studentData] = await Promise.all([
        api.get<{ houses: StudentHouse[] }>('/api/school/student-houses', undefined, { skipLogoutOn401: true }),
        api.get<{ students: StudentRow[] }>('/api/school/students', { limit: 'all', isActive: 'true' }, { skipLogoutOn401: true }),
      ])
      setHouses(houseData?.houses || [])
      setStudents(studentData?.students || [])
    } catch (error) {
      toast({
        title: 'Could not load houses',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const classOptions = useMemo(() => {
    const map = new Map<string, string>()
    students.forEach((student) => {
      if (student.class?.id) map.set(student.class.id, student.class.name)
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => compareClassNames(a.name, b.name))
  }, [students])

  const sectionOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; classId: string | null }>()
    students.forEach((student) => {
      if (!student.section?.id) return
      if (classFilter !== 'all' && student.class?.id !== classFilter) return
      map.set(student.section.id, {
        id: student.section.id,
        name: student.section.name,
        classId: student.class?.id || null,
      })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [classFilter, students])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((student) => {
      const houseId = student.assignedHouse?.id || 'none'
      if (selectedHouseId !== 'all' && houseId !== selectedHouseId) return false
      if (classFilter !== 'all' && student.class?.id !== classFilter) return false
      if (sectionFilter !== 'all' && student.section?.id !== sectionFilter) return false
      if (!q) return true
      const text = [
        student.firstName,
        student.lastName,
        student.admissionNumber,
        student.rollNumber,
        student.class?.name,
        student.section?.name,
        student.assignedHouse?.name,
      ].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    })
  }, [classFilter, search, sectionFilter, selectedHouseId, students])

  const classScopeStudents = useMemo(() => {
    if (classFilter === 'all') return []
    return students.filter((student) => {
      if (student.class?.id !== classFilter) return false
      if (sectionFilter !== 'all' && student.section?.id !== sectionFilter) return false
      return true
    })
  }, [classFilter, sectionFilter, students])

  const scopeStudentIds = useMemo(() => {
    if (assignmentScope === 'selected') return selectedStudentIds
    if (assignmentScope === 'filtered') return filteredStudents.map((student) => student.id)
    return classScopeStudents.map((student) => student.id)
  }, [assignmentScope, classScopeStudents, filteredStudents, selectedStudentIds])

  const openCreateDialog = () => {
    setEditingHouse(null)
    setForm({ name: '', color: DEFAULT_COLORS[0], description: '' })
    setDialogOpen(true)
  }

  const openEditDialog = (house: StudentHouse) => {
    setEditingHouse(house)
    setForm({
      name: house.name,
      color: house.color,
      description: house.description || '',
    })
    setDialogOpen(true)
  }

  const submitHouse = async () => {
    if (!form.name.trim()) {
      toast({ title: 'House name required', description: 'Please enter a house name.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        description: form.description.trim() || null,
      }
      if (editingHouse) {
        await api.patch(`/api/school/student-houses/${editingHouse.id}`, payload)
        toast({ title: 'House updated', description: `${payload.name} has been saved.` })
      } else {
        await api.post('/api/school/student-houses', payload)
        toast({ title: 'House created', description: `${payload.name} is ready for assignment.` })
      }
      setDialogOpen(false)
      await fetchData()
    } catch (error) {
      toast({
        title: editingHouse ? 'Could not update house' : 'Could not create house',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const deleteHouse = async (house: StudentHouse) => {
    setSaving(true)
    try {
      await api.delete(`/api/school/student-houses/${house.id}`)
      toast({ title: 'House deleted', description: `${house.name} has been removed.` })
      if (selectedHouseId === house.id) setSelectedHouseId('all')
      if (targetHouseId === house.id) setTargetHouseId('')
      setDeleteTarget(null)
      await fetchData()
    } catch (error) {
      toast({
        title: 'Could not delete house',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleClassFilterChange = (value: string) => {
    setClassFilter(value)
    setSectionFilter('all')
    if (assignmentScope === 'class' && value === 'all') setAssignmentScope('filtered')
  }

  const toggleStudent = (studentId: string, checked: boolean) => {
    setSelectedStudentIds((current) => checked
      ? [...current, studentId]
      : current.filter((id) => id !== studentId)
    )
  }

  const toggleVisibleStudents = (checked: boolean) => {
    const visibleIds = filteredStudents.map((student) => student.id)
    setSelectedStudentIds((current) => {
      if (!checked) return current.filter((id) => !visibleIds.includes(id))
      return Array.from(new Set([...current, ...visibleIds]))
    })
  }

  const assignStudents = async (remove = false) => {
    if (scopeStudentIds.length === 0) {
      toast({ title: 'No students in scope', description: 'Please select students or adjust the filters.', variant: 'destructive' })
      return
    }

    if (!remove && !targetHouseId) {
      toast({ title: 'Select house', description: 'Please choose the house to assign.', variant: 'destructive' })
      return
    }

    setAssigning(true)
    try {
      await api.post('/api/school/student-houses/assign', {
        houseId: remove ? null : targetHouseId,
        studentIds: scopeStudentIds,
      })
      toast({
        title: remove ? 'House removed' : 'House assigned',
        description: `${scopeStudentIds.length} student${scopeStudentIds.length === 1 ? '' : 's'} updated.`,
      })
      setSelectedStudentIds([])
      await fetchData()
    } catch (error) {
      toast({
        title: 'Could not assign house',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setAssigning(false)
    }
  }

  const hasActiveFilters = search.trim() !== '' || classFilter !== 'all' || sectionFilter !== 'all' || selectedHouseId !== 'all'

  const clearFilters = () => {
    setSearch('')
    setClassFilter('all')
    setSectionFilter('all')
    setSelectedHouseId('all')
    if (assignmentScope === 'class') setAssignmentScope('filtered')
  }

  const allVisibleSelected = filteredStudents.length > 0 && filteredStudents.every((student) => selectedStudentIds.includes(student.id))
  const selectedHouse = targetHouseId ? houses.find((house) => house.id === targetHouseId) || null : null
  const scopeLabel = assignmentScope === 'selected'
    ? 'selected students'
    : assignmentScope === 'filtered'
      ? 'filtered students'
      : sectionFilter !== 'all'
        ? 'selected class-section'
        : 'selected class'

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5">
      <PageHeader
        title="Student Houses"
        description="Create houses with colors and assign students in one place."
        action={{ label: 'Create House', icon: Plus, onClick: openCreateDialog }}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                <Home className="size-4" />
              </span>
              House Master
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {houses.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Palette className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No houses created yet</p>
                <p className="text-xs text-muted-foreground">Create houses like Red, Blue, Green, Yellow.</p>
              </div>
            ) : (
              houses.map((house) => (
                <div key={house.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ backgroundColor: house.color }} />
                        <p className="truncate font-semibold">{house.name}</p>
                      </div>
                      {house.description && <p className="mt-1 text-xs text-muted-foreground">{house.description}</p>}
                      <Badge variant="secondary" className="mt-2 gap-1 text-[10px]">
                        <Users className="size-3" /> {house._count?.students || 0} students
                      </Badge>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(house)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        disabled={saving || (house._count?.students || 0) > 0}
                        onClick={() => setDeleteTarget(house)}
                        title={(house._count?.students || 0) > 0 ? 'Unassign students before deleting this house' : 'Delete house'}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                  <GraduationCap className="size-4" />
                </span>
                Assign Students
              </CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-destructive">
                  <X className="size-4" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px]">
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, admission no, class, house..." />
              <Select value={classFilter} onValueChange={handleClassFilterChange}>
                <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sectionFilter} onValueChange={setSectionFilter} disabled={classFilter === 'all'}>
                <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {sectionOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={selectedHouseId} onValueChange={setSelectedHouseId}>
                <SelectTrigger><SelectValue placeholder="Filter house" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Students</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {houses.map((house) => <SelectItem key={house.id} value={house.id}>{house.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="grid gap-3 lg:grid-cols-[190px_1fr_auto_auto]">
                <Select value={assignmentScope} onValueChange={(value: 'selected' | 'filtered' | 'class') => setAssignmentScope(value)}>
                  <SelectTrigger><SelectValue placeholder="Assignment scope" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selected">Selected students</SelectItem>
                    <SelectItem value="filtered">All filtered students</SelectItem>
                    <SelectItem value="class" disabled={classFilter === 'all'}>Class / Section</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={targetHouseId || 'choose'} onValueChange={(value) => setTargetHouseId(value === 'choose' ? '' : value)}>
                  <SelectTrigger><SelectValue placeholder="Assign to house" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="choose" disabled>Choose house</SelectItem>
                    {houses.map((house) => <SelectItem key={house.id} value={house.id}>{house.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={() => assignStudents(false)} disabled={assigning || scopeStudentIds.length === 0 || !targetHouseId} className="gap-1">
                  {assigning ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Assign
                </Button>
                <Button variant="outline" onClick={() => assignStudents(true)} disabled={assigning || scopeStudentIds.length === 0} className="gap-1">
                  <X className="size-4" /> Remove
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Action will update <span className="font-semibold text-foreground">{scopeStudentIds.length}</span> {scopeLabel}
                {selectedHouse ? <> to <span className="font-semibold text-foreground">{selectedHouse.name}</span></> : null}.
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allVisibleSelected} onCheckedChange={(value) => toggleVisibleStudents(value === true)} />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead>House</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No students found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStudents.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStudentIds.includes(student.id)}
                            onCheckedChange={(value) => toggleStudent(student.id, value === true)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{student.firstName} {student.lastName || ''}</p>
                            <p className="text-xs font-mono text-muted-foreground">{student.admissionNumber || 'No admission no'}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {student.class?.name || '--'}{student.section?.name ? ` - ${student.section.name}` : ''}
                        </TableCell>
                        <TableCell>{student.rollNumber || '--'}</TableCell>
                        <TableCell>
                          {student.assignedHouse ? (
                            <Badge variant="outline" className="gap-1.5">
                              <span className="size-2 rounded-full" style={{ backgroundColor: student.assignedHouse.color }} />
                              {student.assignedHouse.name}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingHouse ? 'Edit House' : 'Create House'}</DialogTitle>
            <DialogDescription>Give the house a name and color. Students can be assigned after saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>House Name</Label>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g., Red House" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`size-8 rounded-full border-2 ${form.color === color ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setForm((current) => ({ ...current, color }))}
                    aria-label={color}
                  />
                ))}
                <Input
                  type="color"
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                  className="h-8 w-14 p-1"
                />
                <span className="text-xs font-mono text-muted-foreground">{form.color}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Optional note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submitHouse} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save House
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete House</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong>{deleteTarget?.name}</strong>? This is allowed only when no students are assigned to the house.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !deleteTarget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteHouse(deleteTarget)}
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
