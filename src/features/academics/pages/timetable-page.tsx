'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { parseWorkingDays } from '@/lib/weekdays'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Calendar,
  PlusCircle,
  Settings2,
  Trash2,
  Pencil,
  ChevronDown,
  Clock,
  GraduationCap,
  Users,
  X,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TimetableEntry {
  id: string
  classId: string
  sectionId: string
  subjectId: string
  teacherId: string
  day: string
  period: number
  subject?: { id: string; name: string; code?: string }
  teacher?: { id: string; firstName: string; lastName: string }
  section?: { id: string; name: string; class?: { id: string; name: string } }
}

interface ClassOption { id: string; name: string; subjects?: SubjectOption[] }
interface SectionOption { id: string; name: string; classId: string }
interface SubjectOption { id: string; name: string; code?: string }
interface TeacherOption { id: string; firstName: string; lastName: string; userId?: string | null }

interface PeriodConfig {
  id: string
  period: number
  startTime: string
  endTime: string
  label: string
  isBreak: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  'bg-lime-100 text-lime-800 dark:bg-lime-950/40 dark:text-lime-300 border-lime-200 dark:border-lime-800',
]

type ViewMode = 'class' | 'teacher'

interface TimetableListState {
  viewMode?: ViewMode
  filterClass?: string
  filterSection?: string
  filterTeacher?: string
}

const TIMETABLE_LIST_STATE_KEY = 'academics:timetable:list'
const TIME_OPTIONS = buildTimeOptions()
const DURATION_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90]

function buildTimeOptions() {
  const options: string[] = []
  for (let minutes = 6 * 60; minutes <= 18 * 60; minutes += 5) {
    options.push(minutesToTime(minutes))
  }
  return options
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

function minutesToTime(value: number) {
  const minutesInDay = 24 * 60
  const normalized = ((value % minutesInDay) + minutesInDay) % minutesInDay
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function durationBetween(startTime: string, endTime: string) {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime)
  return diff > 0 ? diff : 40
}

function withStartTime(period: PeriodConfig, startTime: string) {
  return {
    ...period,
    startTime,
    endTime: minutesToTime(timeToMinutes(startTime) + durationBetween(period.startTime, period.endTime)),
  }
}

function withDuration(period: PeriodConfig, duration: number) {
  return {
    ...period,
    endTime: minutesToTime(timeToMinutes(period.startTime) + duration),
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TimetablePage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()
  // Select the raw string (stable) and parse in useMemo. Selecting the parsed
  // array directly returns a new reference every render, which makes Zustand
  // report a state change on every notify and causes an infinite render loop.
  const workingDaysRaw = useAppStore((s) => s.currentSchool?.workingDays)
  const DAYS = useMemo(() => parseWorkingDays(workingDaysRaw), [workingDaysRaw])
  const currentUser = useAppStore((s) => s.user)
  const savedListState = useAppStore((s) => s.pageState[TIMETABLE_LIST_STATE_KEY] as TimetableListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const isTeacherRole = currentUser?.role === 'TEACHER'
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.TIMETABLE_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.TIMETABLE_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.TIMETABLE_DELETE)
  const canEdit = canCreate || canUpdate || canDelete

  // Data
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])
  const [periodConfigs, setPeriodConfigs] = useState<PeriodConfig[]>([])
  const [loading, setLoading] = useState(true)

  // View
  const [viewMode, setViewMode] = useState<ViewMode>(savedListState?.viewMode ?? 'class')
  const [filterClass, setFilterClass] = useState(savedListState?.filterClass ?? '')
  const [filterSection, setFilterSection] = useState(savedListState?.filterSection ?? '')
  const [filterTeacher, setFilterTeacher] = useState(savedListState?.filterTeacher ?? '')

  // Dialogs
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editEntry, setEditEntry] = useState<TimetableEntry | null>(null)

  // Form
  const [form, setForm] = useState({
    classId: '', sectionId: '', subjectId: '', teacherId: '', day: 'Monday', period: '1',
  })
  const [submitting, setSubmitting] = useState(false)

  // Period config form
  const [periodForm, setPeriodForm] = useState<PeriodConfig[]>([])
  const [savingPeriods, setSavingPeriods] = useState(false)
  const sortedPeriodForm = useMemo(
    () => [...periodForm]
      .map((periodConfig, formIndex) => ({ periodConfig, formIndex }))
      .sort((a, b) => a.periodConfig.period - b.periodConfig.period),
    [periodForm]
  )

  // Subject color map
  const subjectColorMap = useMemo(() => {
    const map = new Map<string, string>()
    subjects.forEach((s, i) => {
      map.set(s.id, SUBJECT_COLORS[i % SUBJECT_COLORS.length])
    })
    return map
  }, [subjects])

  // For TEACHER role: resolve the teacher record linked to the logged-in user.
  // This is used to lock the "By Teacher" view to the teacher's own timetable.
  const ownTeacher = useMemo(() => {
    if (!isTeacherRole || !currentUser?.id) return null
    return teachers.find(t => t.userId === currentUser.id) ?? null
  }, [isTeacherRole, currentUser?.id, teachers])

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [ttRes, clsRes, secRes, subRes, teachRes, periodRes] = await Promise.all([
        api.get<{ entries: TimetableEntry[] }>('/api/school/timetable', { academicYear }).catch(() => ({ entries: [] })),
        api.get<{ classes: ClassOption[] }>('/api/school/classes').catch(() => ({ classes: [] })),
        api.get<{ sections: SectionOption[] }>('/api/school/sections').catch(() => ({ sections: [] })),
        api.get<{ subjects: SubjectOption[] }>('/api/school/subjects').catch(() => ({ subjects: [] })),
        api.get<{ teachers: TeacherOption[] }>('/api/school/teachers', { limit: '500' }).catch(() => ({ teachers: [] })),
        api.get<{ periods: PeriodConfig[] }>('/api/school/period-config').catch(() => ({ periods: [] })),
      ])
      setEntries(ttRes.entries || [])
      setClasses(clsRes.classes || [])
      setSections(secRes.sections || [])
      setSubjects(subRes.subjects || [])
      setTeachers(teachRes.teachers || [])
      setPeriodConfigs(periodRes.periods || [])
    } catch {
      toast({
        title: "Couldn't Load Timetable",
        description: 'We couldn\'t load the timetable data. Please refresh the page.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Lock teacher-role users to their own timetable in "By Teacher" view.
  useEffect(() => {
    if (!isTeacherRole) return
    if (ownTeacher && filterTeacher !== ownTeacher.id) {
      setFilterTeacher(ownTeacher.id)
      setPageState(TIMETABLE_LIST_STATE_KEY, {
        viewMode,
        filterClass,
        filterSection,
        filterTeacher: ownTeacher.id,
      })
    }
  }, [filterClass, filterSection, filterTeacher, isTeacherRole, ownTeacher, setPageState, viewMode])

  const rememberListState = (patch: Partial<TimetableListState>) => {
    setPageState(TIMETABLE_LIST_STATE_KEY, {
      viewMode,
      filterClass,
      filterSection,
      filterTeacher,
      ...patch,
    })
  }

  const handleViewModeChange = (value: ViewMode) => {
    setViewMode(value)
    rememberListState({ viewMode: value })
  }

  const handleFilterClassChange = (value: string) => {
    setFilterClass(value)
    setFilterSection('')
    rememberListState({ filterClass: value, filterSection: '' })
  }

  const handleFilterSectionChange = (value: string) => {
    setFilterSection(value)
    rememberListState({ filterSection: value })
  }

  const handleFilterTeacherChange = (value: string) => {
    setFilterTeacher(value)
    rememberListState({ filterTeacher: value })
  }

  // ── Filtered sections ──
  const availableSections = useMemo(() =>
    filterClass ? sections.filter(s => s.classId === filterClass) : [],
    [filterClass, sections]
  )

  const availableFormSections = useMemo(() =>
    form.classId ? sections.filter(s => s.classId === form.classId) : [],
    [form.classId, sections]
  )

  const availableFormSubjects = useMemo<SubjectOption[]>(() => {
    if (!form.classId) return []
    const cls = classes.find(c => c.id === form.classId)
    return cls?.subjects ?? []
  }, [form.classId, classes])

  // ── Active periods (non-break) ──
  const activePeriods = useMemo(() =>
    periodConfigs.filter(p => !p.isBreak).sort((a, b) => a.period - b.period),
    [periodConfigs]
  )

  const breakPeriods = useMemo(() =>
    new Set(periodConfigs.filter(p => p.isBreak).map(p => p.period)),
    [periodConfigs]
  )

  // ── Filtered entries ──
  const filtered = useMemo(() => {
    if (viewMode === 'class') {
      return entries.filter(e => {
        if (filterSection && e.sectionId !== filterSection) return false
        if (filterClass && e.classId !== filterClass && !filterSection) return false
        return true
      })
    } else {
      return entries.filter(e => {
        if (filterTeacher && e.teacherId !== filterTeacher) return false
        return true
      })
    }
  }, [entries, viewMode, filterClass, filterSection, filterTeacher])

  // ── Grid cell content ──
  const getCell = useCallback((day: string, period: number): TimetableEntry | undefined =>
    filtered.find(e => e.day === day && e.period === period),
    [filtered]
  )

  // ── Add/Edit submit ──
  const handleSubmit = async () => {
    if (!form.sectionId || !form.subjectId || !form.teacherId || !form.day || !form.period) {
      toast({ title: 'Missing Fields', description: 'Please fill in all required fields.', variant: 'destructive' })
      return
    }
    try {
      setSubmitting(true)
      await api.post('/api/school/timetable', {
        classId: form.classId,
        sectionId: form.sectionId,
        subjectId: form.subjectId,
        teacherId: form.teacherId,
        day: form.day,
        period: Number(form.period),
        academicYear,
      })
      toast({
        title: editEntry ? 'Entry Updated' : 'Entry Added',
        description: `Timetable entry has been ${editEntry ? 'updated' : 'added'} successfully.`,
      })
      setShowAdd(false)
      setEditEntry(null)
      resetForm()
      fetchData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      toast({ title: 'Conflict Detected', description: msg, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete entry ──
  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/school/timetable?id=${id}&academicYear=${encodeURIComponent(academicYear)}`)
      toast({ title: 'Entry Deleted', description: 'Timetable entry removed.' })
      fetchData()
    } catch {
      toast({ title: 'Delete Failed', description: 'Could not delete the entry.', variant: 'destructive' })
    }
  }

  // ── Open edit dialog ──
  const openEdit = (entry: TimetableEntry) => {
    setEditEntry(entry)
    setForm({
      classId: entry.classId,
      sectionId: entry.sectionId,
      subjectId: entry.subjectId,
      teacherId: entry.teacherId,
      day: entry.day,
      period: String(entry.period),
    })
    setShowAdd(true)
  }

  // ── Open add for cell ──
  const openAddForCell = (day: string, period: number) => {
    const existing = getCell(day, period)
    if (existing) {
      openEdit(existing)
      return
    }
    resetForm()
    setForm(f => ({ ...f, day, period: String(period) }))
    if (filterClass) setForm(f => ({ ...f, classId: filterClass }))
    if (filterSection) setForm(f => ({ ...f, sectionId: filterSection }))
    setShowAdd(true)
  }

  const resetForm = () => {
    setForm({ classId: '', sectionId: '', subjectId: '', teacherId: '', day: 'Monday', period: '1' })
  }

  // ── Period config save ──
  const handleSavePeriods = async () => {
    try {
      setSavingPeriods(true)
      await api.put('/api/school/period-config', { periods: periodForm })
      setPeriodConfigs(periodForm)
      setShowSettings(false)
      toast({ title: 'Periods Saved', description: 'Period configuration updated successfully.' })
    } catch {
      toast({ title: 'Save Failed', description: 'Could not save period configuration.', variant: 'destructive' })
    } finally {
      setSavingPeriods(false)
    }
  }

  const openPeriodSettings = () => {
    setPeriodForm([...periodConfigs].sort((a, b) => a.period - b.period))
    setShowSettings(true)
  }

  // ── Stats ──
  const totalEntries = filtered.length
  const uniqueSubjects = new Set(filtered.map(e => e.subjectId)).size
  const uniqueTeachers = new Set(filtered.map(e => e.teacherId)).size

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Calendar className="size-6" />
              Timetable
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Manage weekly class schedules and period allocations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canUpdate && (
            <Button variant="outline" size="sm" onClick={openPeriodSettings} className="gap-2">
              <Settings2 className="size-4" />
              Period Settings
            </Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={() => { resetForm(); setEditEntry(null); setShowAdd(true) }} className="gap-2">
              <PlusCircle className="size-4" />
              Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* View Mode & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'class' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => handleViewModeChange('class')}
              >
                <GraduationCap className="size-3.5 inline mr-1.5" />
                By Class
              </button>
              <button
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'teacher' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => handleViewModeChange('teacher')}
              >
                <Users className="size-3.5 inline mr-1.5" />
                By Teacher
              </button>
            </div>

            {viewMode === 'class' ? (
              <div className="flex flex-wrap items-center gap-3">
                <Select value={filterClass} onValueChange={handleFilterClassChange}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterClass && (
                  <Select value={filterSection} onValueChange={handleFilterSectionChange}>
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue placeholder="Select Section" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSections.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {isTeacherRole ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-xs">
                    <Users className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">
                      {ownTeacher
                        ? `${ownTeacher.firstName} ${ownTeacher.lastName}`
                        : currentUser?.name || 'My Timetable'}
                    </span>
                    <Badge variant="outline" className="ml-1 text-[10px]">You</Badge>
                  </div>
                ) : (
                  <Select value={filterTeacher} onValueChange={handleFilterTeacherChange}>
                    <SelectTrigger className="w-[220px] h-9">
                      <SelectValue placeholder="Select Teacher" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          {(filterClass || filterTeacher) && (
            <div className="flex items-center gap-4 mt-3 pt-3 border-t">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{totalEntries}</span> entries
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{uniqueSubjects}</span> subjects
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{uniqueTeachers}</span> teachers
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timetable Grid */}
      {!(viewMode === 'class' ? filterClass : filterTeacher) ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="size-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Select a {viewMode === 'class' ? 'Class' : 'Teacher'}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a {viewMode === 'class' ? 'class and section' : 'teacher'} above to view their timetable
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="size-7 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">No Timetable Entries</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {canCreate ? 'Click on any cell in the grid or use the Add Entry button to start building the schedule' : 'No timetable has been set up yet.'}
                </p>
              </div>
              {canCreate && (
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setEditEntry(null); setShowAdd(true) }} className="gap-2 mt-2">
                  <PlusCircle className="size-4" />
                  Add First Entry
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[800px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-muted/80 p-2 text-xs font-semibold text-center border-b border-r w-[100px]">
                        <Clock className="size-3.5 inline mr-1" />
                        Time
                      </th>
                      {DAYS.map(day => (
                        <th key={day} className="bg-muted/80 p-2 text-xs font-semibold text-center border-b border-r last:border-r-0">
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...periodConfigs].sort((a, b) => a.period - b.period).map((pc) => {
                      if (pc.isBreak) {
                        const isLunch = pc.label.toLowerCase().includes('lunch')
                        return (
                          <tr key={pc.period}>
                            <td className="bg-muted/40 px-2 py-1.5 border-b border-r text-center">
                              <div className="text-xs font-semibold">{pc.label}</div>
                              <div className="text-[10px] text-muted-foreground">{pc.startTime} - {pc.endTime}</div>
                            </td>
                            <td
                              colSpan={DAYS.length}
                              className={cn(
                                'border-b px-4 py-2 text-center text-xs font-medium',
                                isLunch
                                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300'
                              )}
                            >
                              {pc.label} · {pc.startTime} – {pc.endTime}
                            </td>
                          </tr>
                        )
                      }
                      return (
                      <tr key={pc.period}>
                        <td className="bg-muted/40 px-2 py-1.5 border-b border-r text-center">
                          <div className="text-xs font-semibold">{pc.label}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {pc.startTime} - {pc.endTime}
                          </div>
                        </td>
                        {DAYS.map(day => {
                          const cell = getCell(day, pc.period)
                          const colorClass = cell ? subjectColorMap.get(cell.subjectId) : ''

                          return (
                            <td
                              key={`${day}-${pc.period}`}
                              className={cn(
                                'border-b border-r last:border-r-0 p-1 min-h-[64px] align-top transition-colors',
                                ((cell && canUpdate) || (!cell && canCreate)) ? 'cursor-pointer hover:bg-primary/5' : 'cursor-default',
                                cell ? '' : 'bg-background'
                              )}
                              onClick={() => {
                                if (cell ? canUpdate : canCreate) openAddForCell(day, pc.period)
                              }}
                            >
                              {cell ? (
                                <div className={cn('rounded-md px-2 py-1.5 border text-xs', colorClass)}>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold truncate">{cell.subject?.name || '—'}</p>
                                      <p className="text-[10px] opacity-80 truncate">
                                        {cell.teacher ? `${cell.teacher.firstName} ${cell.teacher.lastName}` : '—'}
                                      </p>
                                      {viewMode === 'teacher' && cell.section && (
                                        <p className="text-[10px] opacity-70 truncate">
                                          {cell.section.class?.name} - {cell.section.name}
                                        </p>
                                      )}
                                    </div>
                                    {(canUpdate || canDelete) && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                        <button className="size-5 rounded hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center shrink-0">
                                          <ChevronDown className="size-3" />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="min-w-[120px]">
                                        {canUpdate && (
                                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(cell) }}>
                                            <Pencil className="size-3.5 mr-2" />
                                            Edit
                                          </DropdownMenuItem>
                                        )}
                                        {canDelete && (
                                          <DropdownMenuItem
                                            className="text-destructive focus:text-destructive"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(cell.id) }}
                                          >
                                            <Trash2 className="size-3.5 mr-2" />
                                            Delete
                                          </DropdownMenuItem>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-[52px]">
                                  <PlusCircle className="size-4 text-muted-foreground/30" />
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {filtered.length > 0 && viewMode === 'class' && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Subjects</h4>
            <div className="flex flex-wrap gap-2">
              {subjects.filter(s => filtered.some(e => e.subjectId === s.id)).map(subject => (
                <Badge key={subject.id} variant="outline" className={cn('text-[10px] font-medium', subjectColorMap.get(subject.id))}>
                  {subject.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) { setEditEntry(null); resetForm() } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Timetable Entry' : 'Add Timetable Entry'}</DialogTitle>
            <DialogDescription>
              {editEntry ? 'Update the subject and teacher for this slot.' : 'Assign a subject and teacher to a time slot.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Class <span className="text-destructive">*</span></Label>
                <Select value={form.classId} onValueChange={v => setForm(f => ({ ...f, classId: v, sectionId: '', subjectId: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Section <span className="text-destructive">*</span></Label>
                <Select value={form.sectionId} onValueChange={v => setForm(f => ({ ...f, sectionId: v }))} disabled={!form.classId}>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>{availableFormSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Subject <span className="text-destructive">*</span></Label>
                <Select
                  value={form.subjectId}
                  onValueChange={v => setForm(f => ({ ...f, subjectId: v }))}
                  disabled={!form.classId || availableFormSubjects.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={!form.classId ? 'Select class first' : availableFormSubjects.length === 0 ? 'No subjects in this class' : 'Select subject'} />
                  </SelectTrigger>
                  <SelectContent>{availableFormSubjects.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {form.classId && availableFormSubjects.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Is class me koi subject assigned nahi hai. Pehle Edit Class jaakar subjects assign karein.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Teacher <span className="text-destructive">*</span></Label>
                <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Day <span className="text-destructive">*</span></Label>
                <Select value={form.day} onValueChange={v => setForm(f => ({ ...f, day: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Period <span className="text-destructive">*</span></Label>
                <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activePeriods.map(p => (
                      <SelectItem key={p.period} value={String(p.period)}>
                        {p.label} ({p.startTime} - {p.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditEntry(null); resetForm() }}>
              Cancel
            </Button>
            {editEntry && canDelete && (
              <Button variant="destructive" onClick={async () => { await handleDelete(editEntry.id); setShowAdd(false); setEditEntry(null); resetForm() }}>
                <Trash2 className="size-4 mr-1" />
                Delete
              </Button>
            )}
            <Button onClick={handleSubmit} disabled={submitting || !form.sectionId || !form.subjectId || !form.teacherId}>
              {submitting ? (
                <><div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />Saving...</>
              ) : (
                <>{editEntry ? 'Update Entry' : 'Add Entry'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle>Period Configuration</DialogTitle>
            <DialogDescription>
              Define the time slots and break periods for your school day.
            </DialogDescription>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pr-6">
            <div className="space-y-3">
              {sortedPeriodForm.map(({ periodConfig: p, formIndex }, idx) => (
                <div key={idx} className={cn(
                  'flex flex-col gap-3 p-3 rounded-lg border sm:flex-row sm:items-center',
                  p.isBreak ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800' : 'bg-background'
                )}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold text-muted-foreground">{idx + 1}</span>
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_0.9fr_0.8fr_0.9fr]">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Label</Label>
                      <Input
                        value={p.label}
                        onChange={e => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? { ...pp, label: e.target.value } : pp))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Start</Label>
                      <Select
                        value={p.startTime}
                        onValueChange={value => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? withStartTime(pp, value) : pp))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {(TIME_OPTIONS.includes(p.startTime) ? TIME_OPTIONS : [p.startTime, ...TIME_OPTIONS]).map(time => (
                            <SelectItem key={time} value={time}>{time}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Duration</Label>
                      <Select
                        value={String(durationBetween(p.startTime, p.endTime))}
                        onValueChange={value => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? withDuration(pp, Number(value)) : pp))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(DURATION_OPTIONS.includes(durationBetween(p.startTime, p.endTime))
                            ? DURATION_OPTIONS
                            : [durationBetween(p.startTime, p.endTime), ...DURATION_OPTIONS]
                          ).map(minutes => (
                            <SelectItem key={minutes} value={String(minutes)}>{minutes} min</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">End</Label>
                      <div className="flex h-8 items-center rounded-md border bg-muted/40 px-3 text-xs font-medium tabular-nums text-muted-foreground">
                        {p.endTime}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Type</Label>
                      <Select
                        value={!p.isBreak ? 'period' : p.label.toLowerCase().includes('lunch') ? 'lunch' : 'break'}
                        onValueChange={v => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? {
                          ...pp,
                          isBreak: v !== 'period',
                          label: v === 'lunch' ? 'Lunch Break' : v === 'break' ? 'Break' : pp.label,
                        } : pp))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="period">Period</SelectItem>
                          <SelectItem value="break">Break</SelectItem>
                          <SelectItem value="lunch">Lunch Break</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 self-end text-muted-foreground hover:text-destructive sm:self-auto"
                    onClick={() => setPeriodForm(prev => prev.filter((_, i) => i !== formIndex))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  const sorted = [...periodForm].sort((a, b) => a.period - b.period)
                  const lastConfig = sorted[sorted.length - 1]
                  const lastPeriod = lastConfig?.period ?? 0
                  const startTime = lastConfig?.endTime ?? '08:00'
                  setPeriodForm(prev => [...prev, {
                    id: '',
                    period: lastPeriod + 1,
                    startTime,
                    endTime: minutesToTime(timeToMinutes(startTime) + 40),
                    label: `Period ${prev.filter(p => !p.isBreak).length + 1}`,
                    isBreak: false,
                  }])
                }}
              >
                <PlusCircle className="size-4" />
                Add Period
              </Button>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t px-5 py-4">
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button onClick={handleSavePeriods} disabled={savingPeriods}>
              {savingPeriods ? (
                <><div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />Saving...</>
              ) : (
                <><Check className="size-4 mr-1" />Save Periods</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
