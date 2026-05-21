'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, LoadingState } from '@/components/shared'
import {
  ArrowLeft,
  ArrowRight,
  Hash,
  ListOrdered,
  Pencil,
  Save,
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
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)

  // Filter state
  const [academicYear, setAcademicYear] = useState(currentSchoolAcademicYear || getCurrentAcademicYear())
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')

  // Options
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])

  // Data
  const [students, setStudents] = useState<StudentRow[]>([])
  const [rollDraft, setRollDraft] = useState<Record<string, string>>({}) // studentId -> roll string
  const [initialLoad, setInitialLoad] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)

  // Mode
  const [mode, setMode] = useState<AssignMode>('manual')

  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears),
    [availableAcademicYears]
  )

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

  // Load classes / sections / years on mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [classData, sectionData, yearData] = await Promise.allSettled([
          api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true }),
          api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
          api.get<{ academicYears: string[] }>('/api/school/academic-years', undefined, { skipLogoutOn401: true }),
        ])
        if (classData.status === 'fulfilled' && classData.value?.classes) setClasses(classData.value.classes)
        if (sectionData.status === 'fulfilled' && sectionData.value?.sections) setSections(sectionData.value.sections)
        if (yearData.status === 'fulfilled' && yearData.value?.academicYears) setAvailableAcademicYears(yearData.value.academicYears)
      } catch {
        // ignore — empty options handled by UI
      } finally {
        setInitialLoad(false)
      }
    }
    fetchOptions()
  }, [])

  const fetchStudents = useCallback(async () => {
    if (!classId) {
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
      const params: Record<string, string> = { classId, isActive: 'true', limit: '500' }
      if (sectionId) params.sectionId = sectionId
      const data = await api.get<{ students: StudentRow[] }>(
        '/api/school/students',
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
  }, [classId, sectionId, filteredSections.length, toast])

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
    <div className="space-y-3">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('classes')} className="size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">Assign Roll Numbers</h1>
            <p className="text-xs text-muted-foreground">
              Set roll numbers manually or auto-assign in alphabetical order.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dirtyCount > 0 && (
            <Badge variant="outline" className="h-7 px-2 gap-1 text-xs text-amber-700 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800">
              <Pencil className="size-3" /> {dirtyCount} unsaved
            </Badge>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 h-9" disabled={dirtyCount === 0 || saving} onClick={resetDraft}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button size="sm" className="gap-1.5 h-9" disabled={dirtyCount === 0 || saving} onClick={handleSave}>
            <Save className="size-3.5" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Year</Label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger className="h-7 w-[135px] text-xs">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYearOptions.map((y) => (
                    <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-5" />

            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Class</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue placeholder="Select Class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="h-7 text-xs px-3">No Sections</Badge>
              ) : (
                <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue placeholder="Select Section" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-5" />

            <div className="flex items-center gap-1 ml-auto">
              <Button
                variant={mode === 'manual' ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => handleModeChange('manual')}
              >
                <Pencil className="size-3" />
                Manual
              </Button>
              <Button
                variant={mode === 'alphabetical' ? 'default' : 'outline'}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => handleModeChange('alphabetical')}
                disabled={students.length === 0}
              >
                <ListOrdered className="size-3" />
                Alphabetical
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Students Table ───────────────────────────────────────────── */}
      {loadingStudents ? (
        <Card className="shadow-sm">
          <CardContent className="p-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading students...
            </div>
          </CardContent>
        </Card>
      ) : !classId || (filteredSections.length > 0 && !sectionId) ? (
        <EmptyState
          icon={Users}
          title="Select Class & Section"
          description="Choose a class (and section, if applicable) above to load the student list."
        />
      ) : students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Students Found"
          description="There are no active students in this class/section. Admit students first to assign roll numbers."
        />
      ) : (
        <Card className="shadow-sm overflow-hidden border-border/60">
          {/* Table summary header */}
          <div className="px-4 py-2.5 bg-gradient-to-r from-muted/60 to-muted/20 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="size-3.5 text-primary" />
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
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive" onClick={clearAll}>
              <RotateCcw className="size-3" />
              Clear all
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 hover:bg-transparent bg-muted/30">
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
                          <Avatar className="size-8 shrink-0 ring-1 ring-border">
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
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/70 text-xs font-mono font-medium">
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
        </Card>
      )}
    </div>
  )
}
