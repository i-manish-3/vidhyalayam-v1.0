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
import { openTimetablePrint } from '@/features/academics/lib/timetable-print'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Calendar,
  PlusCircle,
  Settings2,
  Trash2,
  Pencil,
  ChevronDown,
  Clock,
  Printer,
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

const DAY_HEADER_COLORS = [
  'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
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
  const selectedClass = classes.find((item) => item.id === filterClass)
  const selectedSection = sections.find((item) => item.id === filterSection)
  const selectedTeacher = isTeacherRole ? ownTeacher : teachers.find((item) => item.id === filterTeacher)
  const canPrintTimetable = (viewMode === 'class' ? !!filterClass : !!filterTeacher) && filtered.length > 0
  const printTitle = viewMode === 'class'
    ? `${selectedClass?.name || 'Class'}${selectedSection ? ` - Section ${selectedSection.name}` : ''} Timetable`
    : `${selectedTeacher ? `${selectedTeacher.firstName} ${selectedTeacher.lastName}`.trim() : 'Teacher'} Timetable`
  const printSubtitle = `${academicYear} session`

  const handlePrintTimetable = () => {
    openTimetablePrint({
      title: printTitle,
      subtitle: printSubtitle,
      days: DAYS,
      periodConfigs,
      entries: filtered,
      currentTeacherId: isTeacherRole ? ownTeacher?.id ?? null : null,
      showSection: viewMode === 'teacher',
    })
  }

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
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Calendar className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Timetable</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{academicYear}</span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Manage weekly class schedules and period allocations</p>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          {canPrintTimetable && (
            <Button
              variant="secondary"
              onClick={handlePrintTimetable}
              className="gap-2 border border-violet-200 shadow-sm hover:brightness-95"
              style={{ backgroundColor: '#f5f3ff', color: '#6d28d9', backgroundImage: 'none' }}
            >
              <Printer className="size-4" /> Print / PDF
            </Button>
          )}
          {canUpdate && (
            <Button
              variant="secondary"
              onClick={openPeriodSettings}
              className="gap-2 border border-amber-200 shadow-sm hover:brightness-95"
              style={{ backgroundColor: '#fffbeb', color: '#b45309', backgroundImage: 'none' }}
            >
              <Settings2 className="size-4" /> Period Settings
            </Button>
          )}
          {canCreate && (
            <Button
              variant="secondary"
              onClick={() => { resetForm(); setEditEntry(null); setShowAdd(true) }}
              className="gap-2 border border-white/60 shadow-sm hover:brightness-95"
              style={{ backgroundColor: 'white', color: 'var(--primary)', backgroundImage: 'none' }}
            >
              <PlusCircle className="size-4" /> Add Entry
            </Button>
          )}
        </div>
      </div>

      {/* View Mode & Filters */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center rounded-lg border border-sky-200/70 bg-white/80 p-1 shadow-sm dark:border-sky-500/20 dark:bg-background/70">
              <button
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'class' ? 'bg-sky-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-sky-50 hover:text-sky-700'
                )}
                onClick={() => handleViewModeChange('class')}
              >
                <GraduationCap className="size-3.5 inline mr-1.5" />
                By Class
              </button>
              <button
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === 'teacher' ? 'bg-violet-500 text-white shadow-sm' : 'text-muted-foreground hover:bg-violet-50 hover:text-violet-700'
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
                  <SelectTrigger className="h-9 w-[180px] bg-white shadow-sm dark:bg-background">
                    <SelectValue placeholder="Select Class" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 rounded-xl border-sky-200/80 shadow-xl dark:border-sky-500/25">
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id} className="focus:bg-sky-100 focus:text-sky-800 dark:focus:bg-sky-500/15 dark:focus:text-sky-300">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterClass && (
                  <Select value={filterSection} onValueChange={handleFilterSectionChange}>
                    <SelectTrigger className="h-9 w-[180px] bg-white shadow-sm dark:bg-background">
                      <SelectValue placeholder="Select Section" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 rounded-xl border-cyan-200/80 shadow-xl dark:border-cyan-500/25">
                      {availableSections.map(s => (
                        <SelectItem key={s.id} value={s.id} className="focus:bg-cyan-100 focus:text-cyan-800 dark:focus:bg-cyan-500/15 dark:focus:text-cyan-300">{s.name}</SelectItem>
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
                  <SelectTrigger className="h-9 w-[220px] bg-white shadow-sm dark:bg-background">
                      <SelectValue placeholder="Select Teacher" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 rounded-xl border-violet-200/80 shadow-xl dark:border-violet-500/25">
                      {teachers.map(t => (
                        <SelectItem key={t.id} value={t.id} className="focus:bg-violet-100 focus:text-violet-800 dark:focus:bg-violet-500/15 dark:focus:text-violet-300">{t.firstName} {t.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          {(filterClass || filterTeacher) && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 shadow-sm dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                <Calendar className="size-3.5" />
                <span className="font-bold">{totalEntries}</span> entries
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700 shadow-sm dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                <GraduationCap className="size-3.5" />
                <span className="font-bold">{uniqueSubjects}</span> subjects
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 shadow-sm dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Users className="size-3.5" />
                <span className="font-bold">{uniqueTeachers}</span> teachers
              </span>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Timetable Grid */}
      {!(viewMode === 'class' ? filterClass : filterTeacher) ? (
        <Card className="border-dashed border-sky-300 bg-gradient-to-br from-white via-sky-50 to-violet-50 shadow-sm dark:border-sky-500/30 dark:from-card dark:via-sky-500/5 dark:to-violet-500/10">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-500 text-white shadow-md">
                <Calendar className="size-7" />
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
        <Card className="border-dashed border-violet-300 bg-gradient-to-br from-white via-violet-50 to-fuchsia-50 shadow-sm dark:border-violet-500/30 dark:from-card dark:via-violet-500/5 dark:to-fuchsia-500/10">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center text-center gap-3">
              <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md">
                <Calendar className="size-7" />
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
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-white py-0 shadow-md dark:border-sky-500/25 dark:bg-card">
          <CardContent className="p-0">
            <div className="themed-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain">
              <div className="min-w-[800px]">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="w-[100px] border-b border-r bg-gradient-to-br from-primary to-teal-600 p-2 text-center text-xs font-semibold text-white">
                        <Clock className="size-3.5 inline mr-1" />
                        Time
                      </th>
                      {DAYS.map((day, index) => (
                        <th key={day} className={cn('border-b border-r p-2 text-center text-xs font-semibold last:border-r-0', DAY_HEADER_COLORS[index % DAY_HEADER_COLORS.length])}>
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
                          <tr key={pc.period} className="transition-colors hover:brightness-[0.99]">
                            <td className="border-b border-r bg-gradient-to-br from-amber-50 to-orange-50 px-2 py-1.5 text-center dark:from-amber-500/10 dark:to-orange-500/10">
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
                      <tr key={pc.period} className="group/row transition-colors hover:bg-sky-500/[0.025]">
                        <td className="border-b border-r bg-gradient-to-br from-slate-50 to-sky-50 px-2 py-1.5 text-center dark:from-slate-500/10 dark:to-sky-500/10">
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
                                'min-h-[64px] border-b border-r p-1 align-top transition-all last:border-r-0',
                                ((cell && canUpdate) || (!cell && canCreate)) ? 'cursor-pointer hover:bg-sky-500/[0.07]' : 'cursor-default',
                                cell ? '' : 'bg-white dark:bg-background'
                              )}
                              onClick={() => {
                                if (cell ? canUpdate : canCreate) openAddForCell(day, pc.period)
                              }}
                            >
                              {cell ? (
                                <div className={cn('rounded-lg border px-2 py-1.5 text-xs shadow-sm transition-all hover:-translate-y-px hover:shadow-md', colorClass)}>
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
                                <div className="flex h-[52px] items-center justify-center rounded-md border border-dashed border-transparent transition-colors group-hover/row:border-sky-200 group-hover/row:bg-sky-50/60 dark:group-hover/row:border-sky-500/20 dark:group-hover/row:bg-sky-500/5">
                                  <PlusCircle className="size-4 text-muted-foreground/25 transition-colors group-hover/row:text-sky-500" />
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {filtered.length > 0 && viewMode === 'class' && (
        <Card className="gap-0 border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-cyan-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/10 dark:via-card dark:to-cyan-500/10">
          <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2 sm:border-r sm:border-violet-200 sm:pr-3 dark:sm:border-violet-500/25">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-sm">
                <GraduationCap className="size-3.5" />
              </span>
              <h4 className="text-xs font-semibold text-foreground/80">Subjects</h4>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:pl-1">
              {subjects.filter(s => filtered.some(e => e.subjectId === s.id)).map(subject => (
                <Badge key={subject.id} variant="outline" className={cn('h-6 px-2 text-[10px] font-semibold shadow-sm', subjectColorMap.get(subject.id))}>
                  {subject.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { setShowAdd(open); if (!open) { setEditEntry(null); resetForm() } }}>
        <DialogContent className="max-h-[90svh] overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative overflow-hidden border-b border-white/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-5 py-4 pr-12 text-white">
            <div aria-hidden className="absolute -right-8 -top-12 size-32 rounded-full border-[16px] border-white/10" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
                {editEntry ? <Pencil className="size-4.5 text-white" /> : <PlusCircle className="size-5 text-white" />}
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-white">{editEntry ? 'Edit Timetable Entry' : 'Add Timetable Entry'}</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  {editEntry ? 'Update the subject and teacher for this time slot.' : 'Assign a subject and teacher to a time slot.'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar grid max-h-[68svh] gap-3 overflow-y-auto bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
            <div className="grid gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Class <span className="text-destructive">*</span></Label>
                <Select value={form.classId} onValueChange={v => setForm(f => ({ ...f, classId: v, sectionId: '', subjectId: '' }))}>
                  <SelectTrigger leadingIcon={<GraduationCap className="size-3.5 text-white" />} leadingIconClassName="from-sky-500 to-cyan-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Section <span className="text-destructive">*</span></Label>
                <Select value={form.sectionId} onValueChange={v => setForm(f => ({ ...f, sectionId: v }))} disabled={!form.classId}>
                  <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-purple-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>{availableFormSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-3 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Subject <span className="text-destructive">*</span></Label>
                <Select
                  value={form.subjectId}
                  onValueChange={v => setForm(f => ({ ...f, subjectId: v }))}
                  disabled={!form.classId || availableFormSubjects.length === 0}
                >
                  <SelectTrigger leadingIcon={<GraduationCap className="size-3.5 text-white" />} leadingIconClassName="from-emerald-500 to-teal-600" className="w-full bg-white dark:bg-input/30">
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
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Teacher <span className="text-destructive">*</span></Label>
                <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}>
                  <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-cyan-500 to-sky-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>{teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-3 shadow-sm dark:border-amber-500/25 dark:from-amber-500/12 dark:via-card dark:to-orange-500/10 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Day <span className="text-destructive">*</span></Label>
                <Select value={form.day} onValueChange={v => setForm(f => ({ ...f, day: v }))}>
                  <SelectTrigger leadingIcon={<Calendar className="size-3.5 text-white" />} leadingIconClassName="from-amber-500 to-orange-600" className="w-full bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">Period <span className="text-destructive">*</span></Label>
                <Select value={form.period} onValueChange={v => setForm(f => ({ ...f, period: v }))}>
                  <SelectTrigger leadingIcon={<Clock className="size-3.5 text-white" />} leadingIconClassName="from-orange-500 to-red-500" className="w-full bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
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
          <DialogFooter className="border-t border-primary/10 bg-gradient-to-r from-muted/40 via-background to-primary/5 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => { setShowAdd(false); setEditEntry(null); resetForm() }}>
              Cancel
            </Button>
            {editEntry && canDelete && (
              <Button variant="destructive" size="sm" className="h-9 gap-1.5" onClick={async () => { await handleDelete(editEntry.id); setShowAdd(false); setEditEntry(null); resetForm() }}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
            <Button size="sm" className="h-9 gap-1.5 px-4" onClick={handleSubmit} disabled={submitting || !form.sectionId || !form.subjectId || !form.teacherId}>
              {submitting ? (
                <><div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Saving...</>
              ) : (
                <><Check className="size-4" />{editEntry ? 'Update Entry' : 'Add Entry'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-5xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-5 py-4 pr-12 text-white">
            <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-white/10" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
                  <Settings2 className="size-5 text-white" />
                </span>
                <div>
                  <DialogTitle className="text-lg font-bold tracking-tight text-white">Period Configuration</DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs text-white/75">
                    Define time slots, teaching periods, and breaks for your school day.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge className="h-6 border border-white/20 bg-white/15 px-2 text-[10px] text-white hover:bg-white/15">
                  {periodForm.filter((period) => !period.isBreak).length} periods
                </Badge>
                <Badge className="h-6 border border-amber-200/30 bg-amber-300/20 px-2 text-[10px] text-white hover:bg-amber-300/20">
                  {periodForm.filter((period) => period.isBreak).length} breaks
                </Badge>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
            <div className="space-y-2.5">
              {sortedPeriodForm.map(({ periodConfig: p, formIndex }, idx) => (
                <div key={idx} className={cn(
                  'group flex flex-col gap-3 rounded-xl border p-3 shadow-sm transition-all hover:shadow-md sm:flex-row sm:items-center',
                  p.isBreak
                    ? 'border-amber-200/90 bg-gradient-to-r from-amber-50 via-white to-orange-50 dark:border-amber-500/30 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10'
                    : 'border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10'
                )}>
                  <span className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm',
                    p.isBreak ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-sky-500 to-violet-600',
                  )}>{idx + 1}</span>
                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_0.9fr_0.8fr_0.9fr]">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Label</Label>
                      <Input
                        value={p.label}
                        onChange={e => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? { ...pp, label: e.target.value } : pp))}
                        className="h-9 border-border/70 bg-white text-xs shadow-sm dark:bg-input/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Start</Label>
                      <Select
                        value={p.startTime}
                        onValueChange={value => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? withStartTime(pp, value) : pp))}
                      >
                        <SelectTrigger leadingIcon={<Clock className="size-3.5 text-white" />} leadingIconClassName="from-sky-500 to-cyan-600" className="h-9 bg-white text-xs dark:bg-input/30">
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
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</Label>
                      <Select
                        value={String(durationBetween(p.startTime, p.endTime))}
                        onValueChange={value => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? withDuration(pp, Number(value)) : pp))}
                      >
                        <SelectTrigger leadingIcon={<Clock className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-purple-600" className="h-9 bg-white text-xs dark:bg-input/30">
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
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">End</Label>
                      <div className="flex h-9 items-center rounded-lg border border-indigo-200/70 bg-indigo-50/70 px-3 text-xs font-semibold tabular-nums text-indigo-700 shadow-sm dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-300">
                        {p.endTime}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</Label>
                      <Select
                        value={!p.isBreak ? 'period' : p.label.toLowerCase().includes('lunch') ? 'lunch' : 'break'}
                        onValueChange={v => setPeriodForm(prev => prev.map((pp, i) => i === formIndex ? {
                          ...pp,
                          isBreak: v !== 'period',
                          label: v === 'lunch' ? 'Lunch Break' : v === 'break' ? 'Break' : pp.label,
                        } : pp))}
                      >
                        <SelectTrigger
                          leadingIcon={p.isBreak ? <Clock className="size-3.5 text-white" /> : <GraduationCap className="size-3.5 text-white" />}
                          leadingIconClassName={p.isBreak ? 'from-amber-500 to-orange-600' : 'from-indigo-500 to-violet-600'}
                          className="h-9 bg-white text-xs dark:bg-input/30"
                        >
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
                    className="size-8 shrink-0 self-end rounded-lg border border-transparent text-muted-foreground hover:border-red-200 hover:bg-red-50 hover:text-destructive dark:hover:border-red-500/25 dark:hover:bg-red-500/10 sm:self-auto"
                    onClick={() => setPeriodForm(prev => prev.filter((_, i) => i !== formIndex))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full gap-2 border-dashed border-primary/30 bg-gradient-to-r from-primary/5 via-background to-sky-500/5 text-primary hover:border-primary/50 hover:bg-primary/10"
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
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-gradient-to-r from-muted/40 via-background to-primary/5 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button size="sm" className="h-9 gap-1.5 px-4" onClick={handleSavePeriods} disabled={savingPeriods}>
              {savingPeriods ? (
                <><div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Saving...</>
              ) : (
                <><Check className="size-4" />Save Periods</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
