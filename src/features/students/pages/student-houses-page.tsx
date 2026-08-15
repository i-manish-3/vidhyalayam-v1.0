'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { compareClassNames } from '@/lib/class-order'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { LoadingState } from '@/components/shared'
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
import { CheckCircle2, GraduationCap, Home, Loader2, Palette, Plus, Save, Search, Trash2, Users, X } from 'lucide-react'

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
  const { hasPermission } = usePermissions()
  const canManage = hasPermission(PERMISSIONS.STUDENT_UPDATE)
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
        api.get<{ students: StudentRow[] }>('/api/school/students', { limit: 'all', isActive: 'true', minimal: 'true' }, { skipLogoutOn401: true }),
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
  const assignedCount = students.filter((student) => student.assignedHouse).length
  const unassignedCount = students.length - assignedCount
  const selectedVisibleCount = filteredStudents.filter((student) => selectedStudentIds.includes(student.id)).length
  const assignedPercentage = students.length > 0 ? Math.round((assignedCount / students.length) * 100) : 0
  const unassignedPercentage = students.length > 0 ? Math.round((unassignedCount / students.length) * 100) : 0
  const selectedHouse = targetHouseId ? houses.find((house) => house.id === targetHouseId) || null : null
  const selectedClass = classOptions.find((item) => item.id === classFilter)
  const selectedSection = sectionOptions.find((item) => item.id === sectionFilter)
  const scopeLabel = assignmentScope === 'selected'
    ? 'selected students'
    : assignmentScope === 'filtered'
      ? 'filtered students'
      : sectionFilter !== 'all'
        ? 'selected class-section'
        : 'selected class'
  const scopeOptions = [
    {
      id: 'selected' as const,
      title: 'Selected',
      description: 'Only checked students',
      count: selectedStudentIds.length,
      disabled: false,
    },
    {
      id: 'filtered' as const,
      title: 'Filtered',
      description: 'All students matching filters',
      count: filteredStudents.length,
      disabled: filteredStudents.length === 0,
    },
    {
      id: 'class' as const,
      title: 'Class / Section',
      description: selectedClass
        ? `${selectedClass.name}${selectedSection ? ` - ${selectedSection.name}` : ''}`
        : 'Choose class first',
      count: classScopeStudents.length,
      disabled: classFilter === 'all' || classScopeStudents.length === 0,
    },
  ]

  if (loading) return <LoadingState />

  return (
    <div className="space-y-5">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Home className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Student Houses</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{houses.length} houses</span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Create colorful houses and assign students in one place</p>
          </div>
        </div>
        {canManage && (
          <Button variant="secondary" onClick={openCreateDialog} className="relative shrink-0 gap-2 border border-white/60 shadow-md" style={{ backgroundColor: 'white', color: 'var(--primary)' }}>
            <Plus className="size-4" /> Create House
          </Button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="group flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-fuchsia-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm">
            <Home className="size-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Houses</p>
            <p className="text-lg font-bold leading-tight text-violet-700 dark:text-violet-300">{houses.length}</p>
          </div>
          <span className="text-[10px] font-medium text-violet-600/70 dark:text-violet-300/70">groups</span>
        </div>

        <div className="group flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <CheckCircle2 className="size-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned</p>
            <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">{assignedCount}</p>
          </div>
          <Badge className="h-5 bg-emerald-100 px-1.5 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300">{assignedPercentage}%</Badge>
        </div>

        <div className="group flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <Users className="size-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unassigned</p>
            <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">{unassignedCount}</p>
          </div>
          <Badge className="h-5 bg-amber-100 px-1.5 text-[10px] text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300">{unassignedPercentage}%</Badge>
        </div>

        <div className="group flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
            <GraduationCap className="size-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Selected</p>
            <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">{selectedStudentIds.length}</p>
          </div>
          <Badge className="h-5 bg-sky-100 px-1.5 text-[10px] text-sky-700 hover:bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300">{selectedVisibleCount} visible</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-white to-violet-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-card dark:to-violet-500/10">
          <CardHeader className="border-b border-violet-500/15 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
                <Home className="size-4" />
              </span>
              House Master
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {houses.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Palette className="mx-auto mb-2 size-6 text-muted-foreground" />
                <p className="text-sm font-medium">No houses created yet</p>
                <p className="text-xs text-muted-foreground">Create houses like Red, Blue, Green, Yellow.</p>
              </div>
            ) : (
              houses.map((house) => (
                <div key={house.id} className="rounded-lg border p-3 shadow-sm" style={{ borderColor: `color-mix(in srgb, ${house.color} 35%, transparent)`, backgroundColor: `color-mix(in srgb, ${house.color} 7%, transparent)` }}>
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
                      {canManage && <Button variant="outline" size="sm" onClick={() => openEditDialog(house)}>Edit</Button>}
                      {canManage && (
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
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-white to-sky-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-card dark:to-sky-500/10">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/10 via-primary/5 to-cyan-500/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm">
                  <GraduationCap className="size-4" />
                </span>
                House Assignment
              </CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-destructive">
                  <X className="size-4" /> Clear filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 to-white p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-500/10 dark:to-card">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-sky-500 text-xs font-semibold text-white">1</span>
                <div>
                  <p className="text-sm font-semibold">Find students</p>
                  <p className="text-xs text-muted-foreground">Search, class, section and current house filter.</p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_170px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search student, admission no, class, house..."
                    className="pl-9"
                  />
                </div>
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
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr_260px]">
              <div className="rounded-lg border border-violet-200/80 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm dark:border-violet-500/20 dark:from-violet-500/10 dark:to-card">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-violet-500 text-xs font-semibold text-white">2</span>
                  <div>
                    <p className="text-sm font-semibold">Choose assignment scope</p>
                    <p className="text-xs text-muted-foreground">Decide which students will be updated.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {scopeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={option.disabled}
                      onClick={() => setAssignmentScope(option.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg border p-3 text-left transition',
                        assignmentScope === option.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50',
                        option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                      )}
                    >
                      <span>
                        <span className="block text-sm font-semibold">{option.title}</span>
                        <span className="block text-xs text-muted-foreground">{option.description}</span>
                      </span>
                      <Badge variant={assignmentScope === option.id ? 'default' : 'secondary'}>{option.count}</Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-card">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-semibold text-white">3</span>
                  <div>
                    <p className="text-sm font-semibold">Choose house</p>
                    <p className="text-xs text-muted-foreground">Click a house card to assign.</p>
                  </div>
                </div>
                {houses.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                    Create a house first.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {houses.map((house) => (
                      <button
                        key={house.id}
                        type="button"
                        onClick={() => setTargetHouseId(house.id)}
                        className={cn(
                          'flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/50',
                          targetHouseId === house.id && 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: house.color }} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{house.name}</span>
                            <span className="block text-xs text-muted-foreground">{house._count?.students || 0} assigned</span>
                          </span>
                        </span>
                        {targetHouseId === house.id && <CheckCircle2 className="size-4 shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:to-card">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-amber-500 text-xs font-semibold text-white">4</span>
                  <div>
                    <p className="text-sm font-semibold">Apply</p>
                    <p className="text-xs text-muted-foreground">Review before updating.</p>
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Students in scope</p>
                  <p className="mt-1 text-3xl font-semibold">{scopeStudentIds.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground capitalize">{scopeLabel}</p>
                </div>
                <div className="mt-3 rounded-lg border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Target house</p>
                  {selectedHouse ? (
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <span className="size-3 rounded-full" style={{ backgroundColor: selectedHouse.color }} />
                      {selectedHouse.name}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No house selected</p>
                  )}
                </div>
                <div className="mt-3 grid gap-2">
                  <Button onClick={() => assignStudents(false)} disabled={!canManage || assigning || scopeStudentIds.length === 0 || !targetHouseId} className="gap-1">
                    {assigning ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Assign House
                  </Button>
                  <Button variant="outline" onClick={() => assignStudents(true)} disabled={!canManage || assigning || scopeStudentIds.length === 0} className="gap-1">
                    <X className="size-4" /> Remove House
                  </Button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-cyan-200/80 bg-card shadow-sm dark:border-cyan-500/20">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/15 bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-violet-500/10 p-3">
                <div>
                  <p className="text-sm font-semibold">Student list</p>
                  <p className="text-xs text-muted-foreground">
                    Showing {filteredStudents.length} of {students.length} students. {selectedStudentIds.length} selected.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleVisibleStudents(!allVisibleSelected)}
                  disabled={filteredStudents.length === 0}
                >
                  {allVisibleSelected ? 'Unselect visible' : 'Select visible'}
                </Button>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gradient-to-r from-cyan-500/[0.07] via-sky-500/[0.04] to-violet-500/[0.07]">
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
                      <TableRow key={student.id} className="transition-colors hover:bg-cyan-500/[0.045]">
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
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Home className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">{editingHouse ? 'Edit House' : 'Create House'}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">Give the house a name and color. Students can be assigned after saving.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm"><Home className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">House details</h3><p className="text-[10px] text-muted-foreground">Name and color shown on student profiles</p></div>
              </div>
              <div className="relative space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="house-name" className="text-xs font-medium">House Name</Label>
                  <Input id="house-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g., Red House" className="h-9 bg-white shadow-sm dark:bg-input/30" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="house-color" className="text-xs font-medium">Color</Label>
                  <div className="flex flex-wrap items-center gap-2" id="house-color">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`size-8 rounded-full border-2 ${form.color === color ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/40'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setForm((current) => ({ ...current, color }))}
                        aria-label={color}
                      />
                    ))}
                    <Input
                      type="color"
                      value={form.color}
                      onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                      className="h-8 w-14 cursor-pointer rounded-md border-0 p-0"
                    />
                    <span className="text-xs font-mono text-muted-foreground">{form.color}</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-fuchsia-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-violet-200/35 blur-xl dark:bg-violet-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-sm"><Palette className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Description</h3><p className="text-[10px] text-muted-foreground">A short note about this house</p></div>
              </div>
              <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={3} placeholder="Optional note" className="relative resize-none bg-white shadow-sm dark:bg-input/30" />
            </section>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <div className="flex w-full items-center justify-between gap-3 max-sm:flex-col">
              <p className="hidden text-xs text-muted-foreground/60 sm:block dark:text-muted-foreground/40">
                <span className="inline-flex items-center gap-1">
                  <Home className="size-3" />
                  {editingHouse ? 'Update house details' : 'Create a new student house'}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setDialogOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 px-4 text-xs"
                  onClick={submitHouse}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  Save House
                </Button>
              </div>
            </div>
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
              disabled={saving || !deleteTarget || !canManage}
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
