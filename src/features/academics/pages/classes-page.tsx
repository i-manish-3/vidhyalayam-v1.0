'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { parseWorkingDays } from '@/lib/weekdays'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  PlusCircle,
  GraduationCap,
  Users,
  UserCheck,
  Pencil,
  Trash2,
  BookOpen,
  CalendarDays,
  MoreVertical,
  Search,
  X,
  Layers,
  Loader2,
  CheckCircle2,
} from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', badge: 'border-primary/20 bg-primary/10 text-primary' },
  { value: 'optional', label: 'Optional', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300' },
  { value: 'extra', label: 'Extra', badge: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300' },
  { value: 'special', label: 'Special', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300' },
] as const

function getTypeBadge(type: string) {
  return SUBJECT_TYPES.find(t => t.value === type) || SUBJECT_TYPES[0]
}

function getTeacherName(teacher: TeacherInfo) {
  return `${teacher.firstName} ${teacher.lastName}`.trim()
}

interface Section {
  id: string
  name: string
  _count?: { students: number }
  classTeacher?: TeacherInfo | null
  [key: string]: unknown
}

interface TeacherInfo {
  id: string
  firstName: string
  lastName: string
  employeeId?: string | null
  isActive: boolean
}

interface SubjectInfo {
  id: string
  name: string
  code: string | null
  type: string
  sequenceNo: number | null
  isActive: boolean
}

interface ClassItem {
  id: string
  name: string | null
  isActive: boolean
  sections?: Section[]
  subjects?: SubjectInfo[]
  classTeacher?: TeacherInfo | null
  _count?: { students: number }
  [key: string]: unknown
}

interface TimetableEntry {
  id: string
  classId: string
  sectionId: string
  subjectId: string
  teacherId: string
  day: string
  period: number
  subject?: { id: string; name: string; code?: string | null }
  teacher?: { id: string; firstName: string; lastName: string }
}

interface PeriodConfig {
  id: string
  period: number
  startTime: string
  endTime: string
  label: string
  isBreak: boolean
}

interface ClassesListState {
  searchQuery: string
}

const CLASSES_LIST_STATE_KEY = 'academics:classes:list'

export function ClassesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const savedListState = useAppStore((s) => s.pageState[CLASSES_LIST_STATE_KEY] as ClassesListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()
  // Select the raw string (stable reference) and parse via useMemo. Selecting
  // parseWorkingDays(...) directly returns a new array each render, which makes
  // Zustand's reference-equality check re-render in a loop ("Maximum update depth").
  const workingDays = useAppStore((s) => s.currentSchool?.workingDays)
  const DAYS = useMemo(() => parseWorkingDays(workingDays), [workingDays])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')
  const [deleteClass, setDeleteClass] = useState<ClassItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [timetableClass, setTimetableClass] = useState<ClassItem | null>(null)
  const [selectedTimetableSectionId, setSelectedTimetableSectionId] = useState('')
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([])
  const [periodConfigs, setPeriodConfigs] = useState<PeriodConfig[]>([])
  const [loadingTimetable, setLoadingTimetable] = useState(false)

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPageState(CLASSES_LIST_STATE_KEY, { searchQuery: value })
  }

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ classes: ClassItem[] }>('/api/school/classes', { assignmentAcademicYear: academicYear })
      setClasses(res.classes || [])
    } catch {
      toast({ title: 'Couldn\'t Load Classes', description: 'We couldn\'t load the classes. Please refresh the page.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const stats = useMemo(() => {
    const totalSections = classes.reduce((sum, cls) => sum + (cls.sections?.length || 0), 0)
    const totalSubjects = classes.reduce((sum, cls) => sum + (cls.subjects?.length || 0), 0)
    const totalStudents = classes.reduce((sum, cls) => sum + (cls._count?.students ?? 0), 0)
    const activeClasses = classes.filter(cls => cls.isActive).length

    return { totalSections, totalSubjects, totalStudents, activeClasses }
  }, [classes])

  const filteredClasses = useMemo(() => classes.filter(cls => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (cls.name || '').toLowerCase().includes(q) ||
      (cls.sections && cls.sections.some(s => s.name.toLowerCase().includes(q))) ||
      (cls.subjects && cls.subjects.some(s => s.name.toLowerCase().includes(q)))
  }), [classes, searchQuery])

  const selectedTimetableSection = useMemo(
    () => timetableClass?.sections?.find((section) => section.id === selectedTimetableSectionId) || null,
    [selectedTimetableSectionId, timetableClass]
  )

  const timetablePeriods = useMemo(() => {
    const configured = periodConfigs
      .filter((period) => !period.isBreak)
      .sort((a, b) => a.period - b.period)
      .map((period) => period.period)
    if (configured.length > 0) return configured
    return Array.from(new Set(timetableEntries.map((entry) => entry.period))).sort((a, b) => a - b)
  }, [periodConfigs, timetableEntries])

  const handleEdit = (cls: ClassItem) => {
    router.push(`/academics/classes/${cls.id}/edit`)
  }

  const handleAssignClassTeacher = (cls: ClassItem) => {
    router.push(`/academics/classes/${cls.id}/edit#class-teachers`)
  }

  const handleOpenTimetable = (cls: ClassItem) => {
    setTimetableClass(cls)
    setSelectedTimetableSectionId(cls.sections?.[0]?.id || '')
    setTimetableEntries([])
  }

  useEffect(() => {
    if (!timetableClass || !selectedTimetableSectionId) return

    let mounted = true
    setLoadingTimetable(true)
    Promise.all([
      api.get<{ entries: TimetableEntry[] }>('/api/school/timetable', {
        academicYear,
        sectionId: selectedTimetableSectionId,
      }),
      periodConfigs.length
        ? Promise.resolve({ periods: periodConfigs })
        : api.get<{ periods: PeriodConfig[] }>('/api/school/period-config').catch(() => ({ periods: [] })),
    ])
      .then(([timetableRes, periodRes]) => {
        if (!mounted) return
        setTimetableEntries(timetableRes.entries || [])
        if (!periodConfigs.length) setPeriodConfigs(periodRes.periods || [])
      })
      .catch(() => {
        if (!mounted) return
        setTimetableEntries([])
        toast({
          title: "Couldn't Load Timetable",
          description: 'We couldn\'t load this section timetable. Please try again.',
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (mounted) setLoadingTimetable(false)
      })

    return () => {
      mounted = false
    }
  }, [academicYear, periodConfigs.length, selectedTimetableSectionId, timetableClass, toast])

  const handleDelete = async () => {
    if (!deleteClass) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/classes/${deleteClass.id}`)
      toast({ title: 'Class Deleted', description: `"${deleteClass.name || 'Unnamed'}" has been removed.` })
      setDeleteClass(null)
      fetchData()
    } catch (err) {
      toast({ title: 'Couldn\'t Delete Class', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <PageHeader
        title="Class List"
        description="Manage class structure, sections, subjects and student strength."
        action={{ label: 'Add Class', icon: PlusCircle, onClick: () => router.push('/academics/classes/new') }}
      />

      {classes.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Layers} label="Classes" value={classes.length} note={`${stats.activeClasses} active`} />
            <StatCard icon={Users} label="Students" value={stats.totalStudents} note="Across all classes" />
            <StatCard icon={GraduationCap} label="Sections" value={stats.totalSections} note="Configured sections" />
            <StatCard icon={BookOpen} label="Subjects" value={stats.totalSubjects} note="Assigned subjects" />
          </div>

          <Card className="gap-0 py-0 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search class, section, or subject"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-9 bg-background pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Badge variant="secondary" className="w-fit rounded-md px-2 py-1 text-xs">
                {filteredClasses.length} showing
              </Badge>
            </CardContent>
          </Card>
        </>
      )}

      {classes.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No Classes Yet"
          description="Add classes to organize students and sections."
          action={{ label: 'Add Class', onClick: () => router.push('/academics/classes/new') }}
        />
      ) : filteredClasses.length === 0 ? (
        <Card className="py-0">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="mb-3 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No classes found</p>
            <p className="mt-1 text-sm text-muted-foreground">No class matches &ldquo;{searchQuery}&rdquo;.</p>
            <Button variant="link" size="sm" onClick={() => handleSearchChange('')} className="mt-1">
              Clear search
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredClasses.map(cls => {
            const sectionCount = cls.sections?.length || 0
            const subjectCount = cls.subjects?.length || 0
            const studentCount = cls._count?.students ?? 0
            const classTeacherCount = sectionCount > 0
              ? cls.sections?.filter(section => section.classTeacher).length || 0
              : cls.classTeacher ? 1 : 0

            return (
              <Card key={cls.id} className="card-premium group gap-0 overflow-hidden border-0 py-0">
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 border-b bg-muted/20 p-4">
                    <div className="bg-brand-soft flex size-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                      <Layers className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="mr-1 truncate text-base font-semibold leading-tight" title={cls.name || 'Unnamed Class'}>
                          {cls.name || 'Unnamed Class'}
                        </h3>
                        {sectionCount > 0 ? cls.sections!.slice(0, 4).map(section => (
                          <Badge key={section.id} variant="secondary" className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                            {section.name}
                            <span className="ml-1 text-muted-foreground">({section._count?.students ?? 0})</span>
                          </Badge>
                        )) : (
                          <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[11px] text-muted-foreground">
                            No sections
                          </Badge>
                        )}
                        {sectionCount > 4 && (
                          <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                            +{sectionCount - 4}
                          </Badge>
                        )}
                        <Badge variant={cls.isActive ? 'secondary' : 'outline'} className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                          {cls.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''} / {studentCount} student{studentCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="View timetable"
                        aria-label={`View timetable for ${cls.name || 'class'}`}
                        onClick={() => handleOpenTimetable(cls)}
                      >
                        <CalendarDays className="size-4" />
                      </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => handleAssignClassTeacher(cls)}>
                          <UserCheck className="mr-2 size-3.5" />
                          Assign Class Teacher
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 border-b text-center">
                    <Metric label="Students" value={studentCount} />
                    <Metric label="Sections" value={sectionCount} />
                    <Metric label="Class Teachers" value={classTeacherCount} />
                  </div>

                  <div className="p-4">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <SectionTitle icon={UserCheck} label={`Class Teachers (${academicYear})`} />
                        {sectionCount > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {cls.sections!.map(section => (
                              <Badge key={section.id} variant={section.classTeacher ? 'secondary' : 'outline'} className="h-6 rounded-md px-2 text-xs">
                                {section.name}: {section.classTeacher ? getTeacherName(section.classTeacher) : 'Unassigned'}
                              </Badge>
                            ))}
                          </div>
                        ) : cls.classTeacher ? (
                          <Badge variant="secondary" className="h-6 rounded-md px-2 text-xs">
                            {getTeacherName(cls.classTeacher)}
                          </Badge>
                        ) : (
                          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No class teacher assigned.</p>
                        )}
                      </div>

                      <div className="space-y-2">
                      <SectionTitle icon={BookOpen} label="Subjects" />
                      {subjectCount > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {cls.subjects!.slice(0, 6).map(subject => {
                            const typeBadge = getTypeBadge(subject.type)
                            return (
                              <Badge key={subject.id} variant="outline" className={`h-6 rounded-md px-2 text-xs font-medium ${typeBadge.badge}`}>
                                {subject.name}
                              </Badge>
                            )
                          })}
                          {subjectCount > 6 && (
                            <Badge variant="outline" className="h-6 rounded-md px-2 text-xs">
                              +{subjectCount - 6} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">No subjects assigned.</p>
                      )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t bg-muted/15 px-4 py-2.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      Ready for setup
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleEdit(cls)}>
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteClass(cls)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={!!timetableClass} onOpenChange={(open) => {
        if (!open) {
          setTimetableClass(null)
          setSelectedTimetableSectionId('')
          setTimetableEntries([])
        }
      }}>
        <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-muted-foreground" />
              {timetableClass?.name || 'Class'} Timetable
            </DialogTitle>
            <DialogDescription className="text-xs">
              {academicYear} session
            </DialogDescription>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pr-5">
            {!timetableClass?.sections?.length ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center">
                <CalendarDays className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">No sections configured</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Timetable view is section-based. Add a section first to create or view timetable entries.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Section {selectedTimetableSection?.name || '-'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {timetableEntries.length} scheduled period{timetableEntries.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Select value={selectedTimetableSectionId} onValueChange={setSelectedTimetableSectionId}>
                    <SelectTrigger className="h-9 w-full sm:w-48">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {timetableClass.sections.map((section) => (
                        <SelectItem key={section.id} value={section.id}>
                          Section {section.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {loadingTimetable ? (
                  <div className="flex items-center justify-center gap-2 rounded-md border py-10 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading timetable...
                  </div>
                ) : timetablePeriods.length === 0 ? (
                  <div className="rounded-md border border-dashed px-3 py-8 text-center">
                    <CalendarDays className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No timetable found</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      No entries are scheduled for this section yet.
                    </p>
                  </div>
                ) : (
                  <TimetableGrid
                    entries={timetableEntries}
                    periods={timetablePeriods}
                    periodConfigs={periodConfigs}
                    days={DAYS}
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteClass} onOpenChange={(open) => { if (!open) setDeleteClass(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{deleteClass?.name || 'Unnamed Class'}&rdquo;</strong>? All its sections will also be removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, note }: { icon: typeof Layers; label: string; value: number; note: string }) {
  return (
    <Card className="card-premium gap-0 border-0 py-0">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="bg-brand-soft flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
          <Icon className="size-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold leading-tight">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r px-3 py-2 last:border-r-0">
      <p className="text-sm font-semibold leading-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: typeof GraduationCap; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Icon className="size-3.5" />
      {label}
    </div>
  )
}

function TimetableGrid({
  entries,
  periods,
  periodConfigs,
  days,
}: {
  entries: TimetableEntry[]
  periods: number[]
  periodConfigs: PeriodConfig[]
  days: string[]
}) {
  const periodByNumber = new Map(periodConfigs.map((period) => [period.period, period]))
  const gridStyle = { gridTemplateColumns: `96px repeat(${days.length}, minmax(104px, 1fr))` }

  return (
    <div className="themed-scrollbar w-full max-w-full overflow-x-auto overscroll-x-contain rounded-md border">
      <div className="min-w-[760px]">
        <div className="grid border-b bg-muted/30" style={gridStyle}>
          <div className="border-r px-2 py-2 text-xs font-semibold text-muted-foreground">Period</div>
          {days.map((day) => (
            <div key={day} className="border-r px-2 py-2 text-xs font-semibold last:border-r-0">
              {day.slice(0, 3)}
            </div>
          ))}
        </div>
        {periods.map((period) => {
          const config = periodByNumber.get(period)
          return (
            <div key={period} className="grid border-b last:border-b-0" style={gridStyle}>
              <div className="border-r bg-muted/10 px-2 py-2">
                <p className="text-xs font-semibold">P{period}</p>
                {config && (
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    {config.startTime}-{config.endTime}
                  </p>
                )}
              </div>
              {days.map((day) => {
                const entry = entries.find((item) => item.day === day && item.period === period)
                return (
                  <div key={`${day}-${period}`} className="min-h-16 border-r p-1.5 last:border-r-0">
                    {entry ? (
                      <div className="h-full rounded-md border border-primary/20 bg-primary/10 p-2">
                        <p className="truncate text-xs font-semibold text-foreground" title={entry.subject?.name || 'Subject'}>
                          {entry.subject?.name || 'Subject'}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={entry.teacher ? `${entry.teacher.firstName} ${entry.teacher.lastName}` : ''}>
                          {entry.teacher ? `${entry.teacher.firstName} ${entry.teacher.lastName}`.trim() : 'Teacher not set'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">
                        -
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
