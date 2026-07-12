'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState } from '@/components/shared'
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  Hash,
  ListOrdered,
  Pencil,
  Save,
  Sparkles,
  Users,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }
interface StudentRow {
  id: string
  admissionNumber: string | null
  firstName: string
  lastName: string
  rollNumber: string | null
  classId: string | null
  sectionId: string | null
  isActive: boolean
}

type AssignMode = 'manual' | 'alphabetical'

// Natural-language sort that handles "1, 2, 10" → "1, 2, 10" not "1, 10, 2"
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function fullName(student: { firstName: string; lastName: string }) {
  return `${student.firstName} ${student.lastName}`.trim()
}

function initials(student: { firstName: string; lastName: string }) {
  const first = student.firstName?.charAt(0) || ''
  const last = student.lastName?.charAt(0) || ''
  return `${first}${last}`.toUpperCase() || '?'
}

// Stable HSL avatar tint based on student id — keeps each student's avatar
// the same colour across renders without needing a stored field.
function avatarTint(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return {
    backgroundColor: `hsl(${hue} 70% 92%)`,
    color: `hsl(${hue} 60% 32%)`,
  }
}

export function AssignRollNumbersPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  // Filter state
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')

  // Options
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])

  // Data
  const [students, setStudents] = useState<StudentRow[]>([])
  const [rollDraft, setRollDraft] = useState<Record<string, string>>({}) // studentId -> roll string
  const [initialLoad, setInitialLoad] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  // Mode
  const [mode, setMode] = useState<AssignMode>('manual')

  const filteredSections = useMemo(
    () => classId ? sections.filter((s) => s.classId === classId) : [],
    [classId, sections]
  )

  const classHasNoSections = classId !== '' && filteredSections.length === 0

  // Whether the current draft differs from what's stored on each student
  const dirtyCount = useMemo(() => {
    let n = 0
    for (const s of students) {
      const draft = (rollDraft[s.id] ?? '').trim()
      const current = (s.rollNumber ?? '').trim()
      if (draft !== current) n++
    }
    return n
  }, [students, rollDraft])

  // Map roll → students sharing it (within the draft) so we can flag dupes inline
  const duplicateRolls = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of students) {
      const r = (rollDraft[s.id] ?? '').trim()
      if (!r) continue
      counts.set(r, (counts.get(r) || 0) + 1)
    }
    const dupes = new Set<string>()
    for (const [r, c] of counts) if (c > 1) dupes.add(r)
    return dupes
  }, [students, rollDraft])

  const assignedCount = useMemo(
    () => students.filter((student) => (rollDraft[student.id] ?? '').trim()).length,
    [students, rollDraft]
  )

  const selectedClass = classes.find((item) => item.id === classId)
  const selectedSection = sections.find((item) => item.id === sectionId)

  // Load classes / sections on mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [classData, sectionData] = await Promise.allSettled([
          api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true }),
          api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
        ])
        if (classData.status === 'fulfilled' && classData.value?.classes) setClasses(classData.value.classes)
        if (sectionData.status === 'fulfilled' && sectionData.value?.sections) setSections(sectionData.value.sections)
      } catch {
        // ignore — empty options handled by UI
      } finally {
        setInitialLoad(false)
      }
    }
    fetchOptions()
  }, [])

  const fetchStudents = useCallback(async () => {
    if (!academicYear || !classId) {
      setStudents([])
      setRollDraft({})
      return
    }
    if (filteredSections.length > 0 && !sectionId) {
      // Class has sections but admin hasn't picked one yet → don't load.
      setStudents([])
      setRollDraft({})
      return
    }
    setLoadingStudents(true)
    try {
      const params: Record<string, string> = { academicYear, classId }
      if (sectionId) params.sectionId = sectionId
      const data = await api.get<{ students: StudentRow[] }>(
        '/api/school/students/by-enrollment',
        params,
        { skipLogoutOn401: true }
      )
      const rows = data.students || []
      // Sort by name for a stable display order
      rows.sort((a, b) => collator.compare(fullName(a), fullName(b)))
      setStudents(rows)
      const draft: Record<string, string> = {}
      for (const s of rows) draft[s.id] = s.rollNumber || ''
      setRollDraft(draft)
    } catch (err) {
      setStudents([])
      setRollDraft({})
      toast({
        title: "Couldn't Load Students",
        description: err instanceof Error ? err.message : 'Please check the filters and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingStudents(false)
    }
  }, [academicYear, classId, sectionId, filteredSections.length, toast])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  // Reset section when class changes
  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId('')
  }

  // Apply alphabetical auto-assignment starting from 1
  const applyAlphabetical = useCallback(() => {
    if (students.length === 0) return
    const ordered = [...students].sort((a, b) => collator.compare(fullName(a), fullName(b)))
    const draft: Record<string, string> = {}
    ordered.forEach((s, idx) => {
      draft[s.id] = String(idx + 1)
    })
    setRollDraft(draft)
  }, [students])

  // Switch modes. Selecting "Alphabetical" assigns roll numbers immediately
  // starting from 1 in name order; switching back to "Manual" reverts the
  // draft to whatever is saved in the DB so the admin can edit freely.
  const handleModeChange = (next: AssignMode) => {
    if (next === mode) return
    setMode(next)
    if (next === 'alphabetical') {
      applyAlphabetical()
      toast({
        title: 'Roll Numbers Generated',
        description: `Assigned 1 through ${students.length} in alphabetical order. Review and save.`,
      })
    } else {
      const draft: Record<string, string> = {}
      for (const s of students) draft[s.id] = s.rollNumber || ''
      setRollDraft(draft)
    }
  }

  const resetDraft = () => {
    const draft: Record<string, string> = {}
    for (const s of students) draft[s.id] = s.rollNumber || ''
    setRollDraft(draft)
  }

  const clearAll = () => {
    const draft: Record<string, string> = {}
    for (const s of students) draft[s.id] = ''
    setRollDraft(draft)
  }

  const handleSave = async () => {
    if (dirtyCount === 0) {
      toast({ title: 'No Changes', description: 'There is nothing to save yet.' })
      return
    }
    if (duplicateRolls.size > 0) {
      toast({
        title: 'Duplicate Roll Numbers',
        description: 'Two or more students share the same roll number. Resolve the highlighted rows before saving.',
        variant: 'destructive',
      })
      return
    }
    setSaving(true)
    try {
      const assignments = students.map((s) => ({
        studentId: s.id,
        rollNumber: (rollDraft[s.id] ?? '').trim() || null,
      }))
      await api.post('/api/school/students/assign-roll-numbers', {
        academicYear,
        classId,
        sectionId: sectionId || null,
        assignments,
      }, { skipLogoutOn401: true })
      toast({ title: 'Saved', description: `${dirtyCount} student(s) updated.` })
      await fetchStudents()
    } catch (err) {
      toast({
        title: "Couldn't Save Roll Numbers",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  if (initialLoad) return <LoadingState />

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/15 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <Hash className="size-5 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Assign Roll Numbers</h1>
              <p className="mt-0.5 text-xs text-white/80">Organize class rolls manually or generate them alphabetically.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="h-7 gap-1.5 border border-white/20 bg-white/15 px-2.5 text-[10px] text-white hover:bg-white/15">
              <GraduationCap className="size-3.5 text-white" /> {academicYear}
            </Badge>
            {dirtyCount > 0 && (
              <Badge className="h-7 gap-1.5 border border-amber-200/30 bg-amber-300/20 px-2.5 text-[10px] text-white hover:bg-amber-300/20">
                <Pencil className="size-3 text-white" /> {dirtyCount} unsaved
              </Badge>
            )}
          </div>
        </div>
      </section>

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/55 via-card to-violet-50/50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-white/90 to-violet-100/70 px-4 py-2.5 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><Sparkles className="size-3.5 text-white" /></span>
            <div>
              <p className="text-sm font-semibold leading-none">Roll Number Setup</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Select a class and choose how numbers should be assigned.</p>
            </div>
          </div>
        </div>
        <CardContent className="p-3">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Class</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger leadingIcon={<GraduationCap className="size-3.5 text-white" />} leadingIconClassName="from-sky-500 to-blue-600" className="w-full bg-white dark:bg-input/30">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Section</Label>
              {classHasNoSections ? (
                <div className="flex h-9 items-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-medium text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">No sections in this class</div>
              ) : (
                <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                  <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-purple-600" className="w-full bg-white dark:bg-input/30">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex rounded-xl border border-primary/15 bg-white/80 p-1 shadow-sm dark:bg-card/70">
              <Button variant="ghost" size="sm" className={cn('h-8 gap-1.5 rounded-lg px-3 text-xs', mode === 'manual' && 'bg-gradient-to-r from-sky-500 to-cyan-600 text-white shadow-sm hover:text-white')} onClick={() => handleModeChange('manual')}>
                <Pencil className="size-3.5" /> Manual
              </Button>
              <Button variant="ghost" size="sm" className={cn('h-8 gap-1.5 rounded-lg px-3 text-xs', mode === 'alphabetical' && 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm hover:text-white')} onClick={() => handleModeChange('alphabetical')} disabled={students.length === 0}>
                <ListOrdered className="size-3.5" /> Alphabetical
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Students Table ───────────────────────────────────────────── */}
      {loadingStudents ? (
        <Card className="overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-card to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
          <CardContent className="p-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading students...
            </div>
          </CardContent>
        </Card>
      ) : !academicYear || !classId || (filteredSections.length > 0 && !sectionId) ? (
        <EmptyState
          icon={Users}
          title="Select Year, Class & Section"
          description="Choose an academic year, class (and section, if applicable) above to load the student list."
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Students Found"
          description="There are no active students in this class/section. Admit students first to assign roll numbers."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white"><Users className="size-4 text-white" /></span>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Students</p><p className="text-base font-bold text-sky-700 dark:text-sky-300">{students.length}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-2.5 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white"><CheckCircle2 className="size-4 text-white" /></span>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Assigned</p><p className="text-base font-bold text-emerald-700 dark:text-emerald-300">{assignedCount}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-2.5 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white"><Pencil className="size-4 text-white" /></span>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pending</p><p className="text-base font-bold text-amber-700 dark:text-amber-300">{dirtyCount}</p></div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-purple-50 p-2.5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white"><Hash className="size-4 text-white" /></span>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duplicates</p><p className="text-base font-bold text-violet-700 dark:text-violet-300">{duplicateRolls.size}</p></div>
            </div>
          </div>

        <Card className="gap-0 overflow-hidden border-primary/15 bg-card py-0 shadow-md shadow-primary/5">
          {/* Table summary header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-white to-violet-100/70 px-4 py-2.5 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                <Users className="size-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">{students.length} student{students.length === 1 ? '' : 's'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {dirtyCount > 0 ? `${dirtyCount} unsaved change${dirtyCount === 1 ? '' : 's'}` : 'All changes saved'}
                </p>
              </div>
              {duplicateRolls.size > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5 ml-2">
                  {duplicateRolls.size} duplicate{duplicateRolls.size === 1 ? '' : 's'}
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 border-red-200 bg-white/80 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/25 dark:bg-card/70" onClick={clearAll}>
              <RotateCcw className="size-3" />
              Clear all
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 border-primary/15 bg-gradient-to-r from-primary/[0.07] via-cyan-500/[0.05] to-violet-500/[0.07] hover:bg-transparent">
                  <TableHead className="w-12 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">#</TableHead>
                  <TableHead className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Student</TableHead>
                  <TableHead className="w-36 text-[10px] font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Admission No</TableHead>
                  <TableHead className="w-28 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Current Roll</TableHead>
                  <TableHead className="w-12 text-center"></TableHead>
                  <TableHead className="w-44 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">New Roll</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s, idx) => {
                  const draft = rollDraft[s.id] ?? ''
                  const trimmed = draft.trim()
                  const dirty = trimmed !== (s.rollNumber ?? '').trim()
                  const isDuplicate = trimmed !== '' && duplicateRolls.has(trimmed)
                  return (
                    <TableRow
                      key={s.id}
                      className={cn(
                        'group transition-colors',
                        isDuplicate
                          ? 'bg-destructive/5 hover:bg-destructive/10'
                          : dirty
                            ? 'bg-amber-50/60 dark:bg-amber-950/15 hover:bg-amber-50 dark:hover:bg-amber-950/25'
                            : 'hover:bg-muted/30'
                      )}
                    >
                      <TableCell className="text-center font-mono text-[11px] text-muted-foreground py-2.5">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar className="size-8 shrink-0 ring-2 ring-white shadow-sm dark:ring-card">
                            <AvatarFallback className="text-[10px] font-bold" style={avatarTint(s.id)}>
                              {initials(s)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-tight truncate">{fullName(s)}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 md:hidden font-mono">
                              {s.admissionNumber || '—'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 font-mono text-xs text-muted-foreground hidden md:table-cell">
                        {s.admissionNumber || '—'}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        {s.rollNumber ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-mono font-medium text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300">
                            <Hash className="size-3 text-muted-foreground" />
                            {s.rollNumber}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-center px-0">
                        <ArrowRight
                          className={cn(
                            'size-3.5 mx-auto transition-colors',
                            dirty ? 'text-primary' : 'text-muted-foreground/30'
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="relative">
                          <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground/60 pointer-events-none" />
                          <Input
                            value={draft}
                            onChange={(e) => setRollDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            disabled={mode === 'alphabetical'}
                            placeholder="Enter roll no"
                            className={cn(
                              'h-8 pl-7 text-xs font-mono font-medium transition-colors',
                              isDuplicate && 'border-destructive bg-destructive/5 focus-visible:ring-destructive',
                              dirty && !isDuplicate && 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20',
                              !dirty && 'border-border/70'
                            )}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 border-t border-primary/10 bg-gradient-to-r from-muted/30 via-background to-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedClass?.name || 'Class'}{selectedSection ? ` / ${selectedSection.name}` : ''} · {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? '' : 's'} ready to save` : 'Everything is up to date'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-primary/20" disabled={dirtyCount === 0 || saving} onClick={resetDraft}>
                <RotateCcw className="size-3.5" /> Reset
              </Button>
              <Button size="sm" className="h-9 gap-1.5 bg-gradient-to-r from-primary to-teal-600 px-4 text-white shadow-md shadow-primary/20 hover:opacity-90" disabled={dirtyCount === 0 || saving} onClick={handleSave}>
                <Save className="size-3.5 text-white" /> {saving ? 'Saving…' : 'Save Roll Numbers'}
              </Button>
            </div>
          </div>
        </Card>
        </>
      )}
    </div>
  )
}
