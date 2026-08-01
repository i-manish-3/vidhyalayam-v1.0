'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// Checkbox removed — using custom visual indicator to avoid Radix internal state issues
import {
  List,
  PlusCircle,
  X,
  GraduationCap,
  Users,
  Layers,
  BookOpen,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

// ─── Subject Type Configuration ──────────────────────────────────────────────

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', color: 'bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-500/15 dark:to-cyan-500/10', border: 'border-sky-300 dark:border-sky-500/35', badge: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300', accent: 'bg-sky-500', checkColor: 'text-sky-600 dark:text-sky-300' },
  { value: 'optional', label: 'Optional', color: 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-500/15 dark:to-orange-500/10', border: 'border-amber-300 dark:border-amber-500/35', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', accent: 'bg-amber-500', checkColor: 'text-amber-600 dark:text-amber-300' },
  { value: 'extra', label: 'Extra', color: 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-500/15 dark:to-teal-500/10', border: 'border-emerald-300 dark:border-emerald-500/35', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300', accent: 'bg-emerald-500', checkColor: 'text-emerald-600 dark:text-emerald-300' },
  { value: 'special', label: 'Special', color: 'bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-500/15 dark:to-purple-500/10', border: 'border-violet-300 dark:border-violet-500/35', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300', accent: 'bg-violet-500', checkColor: 'text-violet-600 dark:text-violet-300' },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

interface SectionInput {
  id: string
  name: string
  teacherId: string
}

interface SubjectItem {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
}

interface TeacherOption {
  id: string
  firstName: string
  lastName: string
  employeeId?: string | null
  isActive: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createSectionId(): string {
  return `section_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function createEmptySection(): SectionInput {
  return { id: createSectionId(), name: '', teacherId: '' }
}

function getTypeConfig(type: string) {
  return SUBJECT_TYPES.find(t => t.value === type) || SUBJECT_TYPES[0]
}

function getTeacherName(teacher: TeacherOption) {
  return `${teacher.firstName} ${teacher.lastName}`.trim()
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AddClassPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.CLASS_CREATE)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  // Form state
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [sections, setSections] = useState<SectionInput[]>([createEmptySection()])
  const [classTeacherId, setClassTeacherId] = useState('')
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  // Subjects data
  const [subjects, setSubjects] = useState<SubjectItem[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [loadingTeachers, setLoadingTeachers] = useState(true)

  // Fetch subjects on mount
  useEffect(() => {
    api.get<{ subjects: SubjectItem[] }>('/api/school/subjects')
      .then(res => {
        setSubjects(res.subjects || [])
      })
      .catch(() => {
        toast({ title: 'Could not load subjects', description: 'Subjects list could not be loaded. You can still create the class and assign subjects later.', variant: 'destructive' })
      })
      .finally(() => setLoadingSubjects(false))
  }, [toast])

  // Fetch teachers on mount
  useEffect(() => {
    api.get<{ teachers: TeacherOption[] }>('/api/school/teachers', { limit: '500' })
      .then(res => {
        setTeachers((res.teachers || []).filter((teacher) => teacher.isActive))
      })
      .catch(() => {
        toast({ title: 'Could not load teachers', description: 'Class teachers can still be assigned later from Edit Class.', variant: 'destructive' })
      })
      .finally(() => setLoadingTeachers(false))
  }, [toast])

  // Group subjects by type
  const subjectsByType = SUBJECT_TYPES.map(typeConfig => ({
    ...typeConfig,
    subjects: subjects.filter(s => s.type === typeConfig.value),
  })).filter(group => group.subjects.length > 0)

  // ── Toggle subject selection ──
  const toggleSubject = (subjectId: string) => {
    setSelectedSubjectIds(prev => {
      const next = new Set(prev)
      if (next.has(subjectId)) {
        next.delete(subjectId)
      } else {
        next.add(subjectId)
      }
      return next
    })
  }

  // ── Toggle all subjects in a type group ──
  const toggleAllInGroup = (typeValue: string) => {
    const groupSubjects = subjects.filter(s => s.type === typeValue)
    const groupIds = groupSubjects.map(s => s.id)
    const allSelected = groupIds.every(id => selectedSubjectIds.has(id))

    setSelectedSubjectIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        groupIds.forEach(id => next.delete(id))
      } else {
        groupIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  // ── Toggle all subjects ──
  const toggleAllSubjects = () => {
    const activeSubjectIds = subjects.map(s => s.id)
    if (selectedSubjectIds.size === activeSubjectIds.length) {
      setSelectedSubjectIds(new Set())
    } else {
      setSelectedSubjectIds(new Set(activeSubjectIds))
    }
  }

  // ── Section management ──
  const updateSection = (sectionId: string, value: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, name: value } : s))
    )
  }

  const updateSectionTeacher = (sectionId: string, teacherId: string) => {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, teacherId: teacherId === 'none' ? '' : teacherId } : s))
    )
  }

  const addSection = () => {
    setSections((prev) => [...prev, createEmptySection()])
  }

  const removeSection = (sectionId: string) => {
    if (sections.length <= 1) {
      toast({ title: 'Cannot Remove', description: 'At least one section row must remain.', variant: 'destructive' })
      return
    }
    setSections((prev) => prev.filter((s) => s.id !== sectionId))
  }

  // ── Validate class name ──
  const validateName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setNameError('Class name is required. Please enter a name like Class 1, Class 10, or Nursery.')
      return false
    }
    if (trimmed.length < 1) {
      setNameError('Class name must be at least 1 character.')
      return false
    }
    setNameError('')
    return true
  }

  // ── Handle name change with live validation ──
  const handleNameChange = (value: string) => {
    setName(value)
    if (nameError && value.trim().length >= 1) {
      setNameError('')
    }
  }

  // ── Form validity ──
  const isFormValid = name.trim().length >= 1 && !submitting

  // ── Submit handler ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!validateName(name)) return

    // Build payload
    const namedSections = sections.filter((s) => s.name.trim())
    const payload = {
      name: name.trim(),
      sections: namedSections.length > 0
        ? namedSections.map((s) => ({ name: s.name.trim(), teacherId: s.teacherId || undefined }))
        : undefined,
      classTeacherId: namedSections.length === 0 ? classTeacherId || undefined : undefined,
      academicYear,
      subjectIds: selectedSubjectIds.size > 0
        ? Array.from(selectedSubjectIds)
        : undefined,
    }

    try {
      setSubmitting(true)
      await api.post('/api/school/classes', payload)
      toast({
        title: 'Class Added Successfully',
        description: `${name.trim() || 'New class'} has been created${selectedSubjectIds.size > 0 ? ` with ${selectedSubjectIds.size} subject${selectedSubjectIds.size > 1 ? 's' : ''} assigned` : ''}.`,
      })
      router.push('/academics/classes')
    } catch (err) {
      toast({
        title: 'Something Went Wrong',
        description: err instanceof Error ? err.message : "We couldn't add the class. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Count sections with names ──
  const namedSectionCount = sections.filter((s) => s.name.trim()).length
  const activeSubjectCount = subjects.length
  const assignedClassTeacherCount = namedSectionCount > 0
    ? sections.filter((s) => s.name.trim() && s.teacherId).length
    : classTeacherId ? 1 : 0

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <GraduationCap className="size-5 text-white" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Add Class</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{academicYear}</span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">Create a class, add sections, teachers, and curriculum subjects.</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => router.push('/academics/classes')} className="relative gap-2 border border-white/60 shadow-md" style={{ backgroundColor: 'white', color: 'var(--primary)' }}>
            <List className="size-4" /> Class List
          </Button>
        </div>
      </section>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Class Details Card ── */}
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
          <CardHeader className="gap-1 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/75 via-white/90 to-violet-100/65 px-4 py-3 !pb-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                <Layers className="size-4 text-white" />
              </span>
              Class Details
            </CardTitle>
            <CardDescription className="text-xs">Enter the basic information for the new class</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-1.5 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-3.5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-sky-500/10">
              <Label htmlFor="class-name" className="text-xs font-medium">
                Class Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="class-name"
                placeholder="e.g., Class 1, Class 10, Nursery"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => validateName(name)}
                disabled={submitting}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'class-name-error' : undefined}
                className="h-9 border-violet-200 bg-white shadow-sm focus-visible:border-violet-400 focus-visible:ring-violet-400/20 dark:border-violet-500/25 dark:bg-input/30"
              />
              {nameError && (
                <p id="class-name-error" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the class name (e.g., Class 1, Class 10, Nursery, LKG)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── Sections Card ── */}
        <Card className="gap-0 overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-card to-cyan-50/60 py-0 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/10 dark:via-card dark:to-cyan-500/10">
          <CardHeader className="border-b border-emerald-200/70 bg-gradient-to-r from-emerald-100/75 via-white/90 to-cyan-100/65 px-4 py-3 !pb-3 dark:border-emerald-500/20 dark:from-emerald-500/15 dark:via-card dark:to-cyan-500/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 text-white shadow-sm">
                    <Users className="size-4 text-white" />
                  </span>
                  Sections
                  {namedSectionCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {namedSectionCount} section{namedSectionCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {assignedClassTeacherCount > 0 && (
                    <Badge variant="outline" className="ml-1">
                      {assignedClassTeacherCount} teacher{assignedClassTeacherCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Add sections and optionally assign class teachers for {academicYear}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-input/30 dark:text-emerald-300"
                onClick={addSection}
                disabled={submitting}
              >
                <PlusCircle className="size-3.5" />
                Add Section
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2.5">
              {/* Section list header */}
              <div className="hidden gap-3 px-1 sm:grid sm:grid-cols-[1fr_1fr_36px]">
                <span className="text-xs font-medium text-muted-foreground">Section Name</span>
                <span className="text-xs font-medium text-muted-foreground">Class Teacher</span>
                <span />
              </div>

              {/* Section rows */}
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className="grid grid-cols-1 items-start gap-2 rounded-xl border border-cyan-200/70 bg-gradient-to-r from-cyan-50/70 via-white to-emerald-50/70 p-2.5 shadow-sm sm:grid-cols-[1fr_1fr_36px] dark:border-cyan-500/20 dark:from-cyan-500/10 dark:via-card dark:to-emerald-500/10"
                >
                  <div className="space-y-1 sm:space-y-0">
                    <Label className="text-xs font-medium text-muted-foreground sm:hidden">
                      Section Name
                    </Label>
                    <div className="flex items-center gap-2">
                      <Badge className="flex size-7 shrink-0 items-center justify-center rounded-lg border-0 bg-gradient-to-br from-cyan-500 to-emerald-600 p-0 font-mono text-xs text-white shadow-sm hover:from-cyan-500 hover:to-emerald-600">
                        {index + 1}
                      </Badge>
                      <Input
                        placeholder="e.g., A, B, C"
                        value={section.name}
                        onChange={(e) => updateSection(section.id, e.target.value)}
                        className="h-9 border-cyan-200 bg-white shadow-sm focus-visible:border-cyan-400 focus-visible:ring-cyan-400/20 dark:border-cyan-500/25 dark:bg-input/30"
                        disabled={submitting}
                        maxLength={10}
                      />
                    </div>
                  </div>
                  <div className="space-y-1 sm:space-y-0">
                    <Label className="text-xs font-medium text-muted-foreground sm:hidden">
                      Class Teacher
                    </Label>
                    <Select
                      value={section.teacherId || 'none'}
                      onValueChange={(value) => updateSectionTeacher(section.id, value)}
                      disabled={submitting || loadingTeachers || !section.name.trim()}
                    >
                      <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-emerald-500 to-teal-600" className="h-9 w-full border-emerald-200 bg-white dark:border-emerald-500/25 dark:bg-input/30">
                        <SelectValue placeholder={loadingTeachers ? 'Loading teachers...' : 'Optional'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {teachers.map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {getTeacherName(teacher)}{teacher.employeeId ? ` (${teacher.employeeId})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-end sm:pt-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 rounded-lg border border-transparent text-muted-foreground hover:border-red-200 hover:bg-red-50 hover:text-destructive dark:hover:border-red-500/25 dark:hover:bg-red-500/10"
                      onClick={() => removeSection(section.id)}
                      disabled={submitting}
                      title="Remove section"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Add section button — mobile-friendly */}
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full gap-2 border-dashed border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-500/30 dark:from-emerald-500/10 dark:via-card dark:to-cyan-500/10 dark:text-emerald-300"
                onClick={addSection}
                disabled={submitting}
              >
                <PlusCircle className="size-4" />
                Add Another Section
              </Button>

              {namedSectionCount === 0 && (
                <div className="rounded-xl border border-dashed border-violet-300/70 bg-gradient-to-r from-violet-50 via-white to-purple-50 p-3 dark:border-violet-500/25 dark:from-violet-500/10 dark:via-card dark:to-purple-500/10">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium">Class Teacher</Label>
                    <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px]">
                      {academicYear}
                    </Badge>
                  </div>
                  <Select
                    value={classTeacherId || 'none'}
                    onValueChange={(value) => setClassTeacherId(value === 'none' ? '' : value)}
                    disabled={submitting || loadingTeachers}
                  >
                    <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-purple-600" className="h-9 w-full border-violet-200 bg-white dark:border-violet-500/25 dark:bg-input/30">
                      <SelectValue placeholder={loadingTeachers ? 'Loading teachers...' : 'Optional'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {teachers.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id}>
                          {getTeacherName(teacher)}{teacher.employeeId ? ` (${teacher.employeeId})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Use this when the class has no sections.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Subject Assignment Card ── */}
        <Card className="gap-0 overflow-hidden border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-card to-violet-50/60 py-0 shadow-sm dark:border-amber-500/25 dark:from-amber-500/10 dark:via-card dark:to-violet-500/10">
          <CardHeader className="border-b border-amber-200/70 bg-gradient-to-r from-amber-100/75 via-white/90 to-violet-100/65 px-4 py-3 !pb-3 dark:border-amber-500/20 dark:from-amber-500/15 dark:via-card dark:to-violet-500/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-violet-600 text-white shadow-sm">
                    <BookOpen className="size-4 text-white" />
                  </span>
                  Assign Subjects
                  {selectedSubjectIds.size > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {selectedSubjectIds.size} selected
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  Select subjects to assign to this class, grouped by type
                </CardDescription>
              </div>
              {activeSubjectCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                className="h-7 shrink-0 border border-amber-200 bg-white px-2 text-[11px] text-amber-700 hover:bg-amber-50 dark:border-amber-500/25 dark:bg-input/30 dark:text-amber-300"
                  onClick={toggleAllSubjects}
                >
                  {selectedSubjectIds.size === activeSubjectCount ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {loadingSubjects ? (
              <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">Loading subjects...</span>
              </div>
            ) : subjectsByType.length === 0 ? (
              <div className="text-center py-6">
                <BookOpen className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No subjects available</p>
                <p className="text-xs text-muted-foreground mt-1">Add subjects first, then assign them to classes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {subjectsByType.map((group) => {
                  const allGroupSelected = group.subjects.every(s => selectedSubjectIds.has(s.id))
                  const someGroupSelected = group.subjects.some(s => selectedSubjectIds.has(s.id))

                  return (
                    <div key={group.value} className={`space-y-2 rounded-xl border p-3 shadow-sm ${group.border} ${group.color}`}>
                      {/* Type Group Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${group.accent}`} />
                          <span className="text-sm font-semibold">{group.label} Subjects</span>
                          <Badge className={`text-[10px] px-1.5 py-0 h-5 font-medium ${group.badge}`}>
                            {group.subjects.length}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 border border-current/15 bg-white/70 px-2 text-[10px] hover:bg-white dark:bg-card/60"
                          onClick={() => toggleAllInGroup(group.value)}
                        >
                          {allGroupSelected ? 'Deselect' : 'Select All'}
                        </Button>
                      </div>

                      {/* Subject Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {group.subjects.map((subject) => {
                          const isSelected = selectedSubjectIds.has(subject.id)
                          return (
                            <div
                              key={subject.id}
                              onClick={() => toggleSubject(subject.id)}
                              className={`
                                relative flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white/80 p-2.5 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md dark:bg-card/60
                                ${isSelected
                                  ? `${group.color} ${group.border} ring-1 ring-current/10`
                                  : 'border-border/70 hover:border-primary/25'
                                }
                              `}
                            >
                              {/* Custom visual checkbox — no internal state, no Radix */}
                              <div
                                className={`size-4 shrink-0 rounded-[4px] border transition-colors duration-150 flex items-center justify-center ${
                                  isSelected
                                    ? `${group.accent} border-transparent text-white`
                                    : 'border-input bg-background dark:bg-input/30'
                                }`}
                              >
                                {isSelected && (
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-current">
                                    <path d="M2 5.5L4 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>

                              {/* Subject Info */}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isSelected ? group.checkColor : ''}`}>
                                  {subject.name}
                                </p>
                                {subject.code && (
                                  <p className="text-[11px] text-muted-foreground font-mono">{subject.code}</p>
                                )}
                              </div>

                              {/* Selected indicator */}
                              {isSelected && (
                                <CheckCircle2 className={`size-4 ${group.checkColor} shrink-0`} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Selection Summary */}
                {selectedSubjectIds.size > 0 && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                      <span>
                        {selectedSubjectIds.size} of {activeSubjectCount} subjects selected
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SUBJECT_TYPES.map(typeConfig => {
                          const count = subjects.filter(
                            s => s.type === typeConfig.value && selectedSubjectIds.has(s.id)
                          ).length
                          if (count === 0) return null
                          return (
                            <Badge key={typeConfig.value} className={`text-[10px] px-1.5 py-0 h-5 ${typeConfig.badge}`}>
                              {count} {typeConfig.label}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-2 rounded-xl border border-primary/10 bg-gradient-to-r from-muted/40 via-white to-primary/5 p-3 sm:flex-row sm:items-center dark:via-card">
          <Button
            type="submit"
            disabled={!isFormValid || !canCreate}
            className="h-9 min-w-[140px] gap-2 shadow-sm"
          >
            {submitting ? (
              <>
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creating...
              </>
            ) : (
              <>
                <GraduationCap className="size-4" />
                Create Class
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/academics/classes')}
            disabled={submitting}
            className="h-9 px-4"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
