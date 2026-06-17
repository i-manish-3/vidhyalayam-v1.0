'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { parseWorkingDays } from '@/lib/weekdays'
import { openTimetablePrint } from '@/features/academics/lib/timetable-print'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  GraduationCap,
  Users,
  UserCheck,
  BookOpen,
  CalendarDays,
  Search,
  X,
  Layers,
  Loader2,
  ClipboardCheck,
  ClipboardList,
  Star,
  Printer,
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

type TeacherRole = 'class_teacher' | 'subject_teacher' | 'both'

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

interface MySection {
  id: string
  name: string
  _count?: { students: number }
  classTeacher?: TeacherInfo | null
  teacherSubjectIds: string[]
  teacherRole: TeacherRole
}

interface MyClassItem {
  id: string
  name: string | null
  isActive: boolean
  sections: MySection[]
  subjects: SubjectInfo[]
  _count?: { students: number }
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

function roleBadgeStyle(role: TeacherRole) {
  if (role === 'class_teacher') return 'border-primary/30 bg-primary/10 text-primary'
  if (role === 'both') return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300'
}

function roleBadgeLabel(role: TeacherRole) {
  if (role === 'class_teacher') return 'Class Teacher'
  if (role === 'both') return 'Class & Subject Teacher'
  return 'Subject Teacher'
}

interface MyClassesListState {
  searchQuery?: string
}

const MY_CLASSES_LIST_STATE_KEY = 'academics:my-classes:list'

export function MyClassesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()
  const workingDays = useAppStore((s) => s.currentSchool?.workingDays)
  const DAYS = useMemo(() => parseWorkingDays(workingDays), [workingDays])
  const savedListState = useAppStore((s) => s.pageState[MY_CLASSES_LIST_STATE_KEY] as MyClassesListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const [classes, setClasses] = useState<MyClassItem[]>([])
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')
  const [timetableClass, setTimetableClass] = useState<MyClassItem | null>(null)
  const [selectedTimetableSectionId, setSelectedTimetableSectionId] = useState('')
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([])
  const [periodConfigs, setPeriodConfigs] = useState<PeriodConfig[]>([])
  const [loadingTimetable, setLoadingTimetable] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ classes: MyClassItem[]; teacherId: string | null }>(
        '/api/school/teacher/my-classes',
        { academicYear }
      )
      setClasses(res.classes || [])
      setTeacherId(res.teacherId)
    } catch {
      toast({
        title: "Couldn't Load Your Classes",
        description: "We couldn't load your assigned classes. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const stats = useMemo(() => {
    const totalSections = classes.reduce((sum, cls) => sum + cls.sections.length, 0)
    const teacherSubjectIds = new Set<string>()
    classes.forEach((cls) => {
      cls.sections.forEach((section) => {
        section.teacherSubjectIds.forEach((id) => teacherSubjectIds.add(id))
      })
    })
    const totalStudents = classes.reduce(
      (sum, cls) => sum + cls.sections.reduce((s, sec) => s + (sec._count?.students ?? 0), 0),
      0
    )
    return {
      totalClasses: classes.length,
      totalSections,
      totalSubjects: teacherSubjectIds.size,
      totalStudents,
    }
  }, [classes])

  const filteredClasses = useMemo(
    () =>
      classes.filter((cls) => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
          (cls.name || '').toLowerCase().includes(q) ||
          cls.sections.some((s) => s.name.toLowerCase().includes(q)) ||
          cls.subjects.some((s) => s.name.toLowerCase().includes(q))
        )
      }),
    [classes, searchQuery]
  )

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPageState(MY_CLASSES_LIST_STATE_KEY, { searchQuery: value })
  }

  const selectedTimetableSection = useMemo(
    () => timetableClass?.sections.find((section) => section.id === selectedTimetableSectionId) || null,
    [selectedTimetableSectionId, timetableClass]
  )

  const handlePrintTimetable = () => {
    if (!timetableClass || timetableEntries.length === 0) return
    openTimetablePrint({
      title: `${timetableClass.name || 'Class'}${selectedTimetableSection ? ` - Section ${selectedTimetableSection.name}` : ''} Timetable`,
      subtitle: `${academicYear} session`,
      days: DAYS,
      periodConfigs,
      entries: timetableEntries,
      currentTeacherId: teacherId,
    })
  }

  const timetablePeriods = useMemo(() => {
    const configured = periodConfigs
      .filter((period) => !period.isBreak)
      .sort((a, b) => a.period - b.period)
      .map((period) => period.period)
    if (configured.length > 0) return configured
    return Array.from(new Set(timetableEntries.map((entry) => entry.period))).sort((a, b) => a - b)
  }, [periodConfigs, timetableEntries])

  const handleOpenTimetable = (cls: MyClassItem) => {
    setTimetableClass(cls)
    setSelectedTimetableSectionId(cls.sections[0]?.id || '')
    setTimetableEntries([])
  }

  const handleMarkAttendance = (cls: MyClassItem, section: MySection) => {
    const params = new URLSearchParams({ classId: cls.id, sectionId: section.id })
    router.push(`/attendance/mark?${params.toString()}`)
  }

  const handleViewAttendance = (cls: MyClassItem, section: MySection) => {
    const params = new URLSearchParams({ classId: cls.id, sectionId: section.id })
    router.push(`/attendance/view?${params.toString()}`)
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
          description: "We couldn't load this section timetable. Please try again.",
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

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Classes"
        description={`Classes and sections you teach or supervise this academic year (${academicYear}).`}
      />

      {classes.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Layers} label="Classes" value={stats.totalClasses} note="Assigned to you" />
            <StatCard icon={GraduationCap} label="Sections" value={stats.totalSections} note="You teach or supervise" />
            <StatCard icon={BookOpen} label="Your Subjects" value={stats.totalSubjects} note="Across your sections" />
            <StatCard icon={Users} label="Students" value={stats.totalStudents} note="Across your sections" />
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
          title="No Classes Assigned"
          description="You aren't assigned as a class teacher or in any timetable for this academic year. Please contact your school admin."
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
          {filteredClasses.map((cls) => {
            const sectionCount = cls.sections.length
            const studentCount = cls.sections.reduce((sum, s) => sum + (s._count?.students ?? 0), 0)
            const teacherSubjectIdSet = new Set<string>()
            cls.sections.forEach((s) => s.teacherSubjectIds.forEach((id) => teacherSubjectIdSet.add(id)))
            const yourSubjectCount = teacherSubjectIdSet.size
            const totalSubjectCount = cls.subjects.length

            return (
              <Card
                key={cls.id}
                className="group gap-0 overflow-hidden py-0 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <CardContent className="p-0">
                  <div className="flex items-start gap-3 border-b bg-muted/20 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Layers className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3
                          className="mr-1 truncate text-base font-semibold leading-tight"
                          title={cls.name || 'Unnamed Class'}
                        >
                          {cls.name || 'Unnamed Class'}
                        </h3>
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
                    </div>
                  </div>

                  <div className="grid grid-cols-3 border-b text-center">
                    <Metric label="Students" value={studentCount} />
                    <Metric label="Sections" value={sectionCount} />
                    <Metric label={`Your Subjects`} value={`${yourSubjectCount}/${totalSubjectCount}`} />
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="space-y-2">
                      <SectionTitle icon={UserCheck} label="Your Sections" />
                      <div className="space-y-2">
                        {cls.sections.map((section) => (
                          <div
                            key={section.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/10 px-2.5 py-1.5"
                          >
                            <Badge variant="secondary" className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">
                              {section.name}
                              <span className="ml-1 text-muted-foreground">({section._count?.students ?? 0})</span>
                            </Badge>
                            <Badge variant="outline" className={`h-5 shrink-0 rounded-md px-1.5 text-[11px] ${roleBadgeStyle(section.teacherRole)}`}>
                              {roleBadgeLabel(section.teacherRole)}
                            </Badge>
                            {section.classTeacher && section.classTeacher.id !== teacherId && (
                              <span className="text-[11px] text-muted-foreground">
                                CT: {getTeacherName(section.classTeacher)}
                              </span>
                            )}
                            <div className="ml-auto flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => handleMarkAttendance(cls, section)}
                              >
                                <ClipboardCheck className="size-3.5" />
                                Mark
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => handleViewAttendance(cls, section)}
                              >
                                <ClipboardList className="size-3.5" />
                                View
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <SectionTitle icon={BookOpen} label="Subjects" />
                      {totalSubjectCount > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {cls.subjects.map((subject) => {
                            const typeBadge = getTypeBadge(subject.type)
                            const isYours = teacherSubjectIdSet.has(subject.id)
                            return (
                              <Badge
                                key={subject.id}
                                variant="outline"
                                className={`h-6 rounded-md px-2 text-xs font-medium ${
                                  isYours
                                    ? `${typeBadge.badge} ring-1 ring-primary/40`
                                    : 'border-muted-foreground/20 text-muted-foreground'
                                }`}
                                title={isYours ? 'You teach this subject' : 'Other subject in this class'}
                              >
                                {isYours && <Star className="mr-1 size-3 fill-current" />}
                                {subject.name}
                              </Badge>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          No subjects assigned to this class.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!timetableClass}
        onOpenChange={(open) => {
          if (!open) {
            setTimetableClass(null)
            setSelectedTimetableSectionId('')
            setTimetableEntries([])
          }
        }}
      >
        <DialogContent className="flex max-h-[88svh] flex-col overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-muted-foreground" />
              {timetableClass?.name || 'Class'} Timetable
            </DialogTitle>
            <DialogDescription className="text-xs">
              {academicYear} session. Your periods are highlighted.
            </DialogDescription>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pr-5">
            {!timetableClass?.sections.length ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center">
                <CalendarDays className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">No sections to show</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Section {selectedTimetableSection?.name || '-'}</p>
                    <p className="text-xs text-muted-foreground">
                      {timetableEntries.length} scheduled period{timetableEntries.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={handlePrintTimetable}
                      disabled={loadingTimetable || timetableEntries.length === 0}
                    >
                      <Printer className="size-3.5" />
                      Print / PDF
                    </Button>
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
                    currentTeacherId={teacherId}
                    days={DAYS}
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, note }: { icon: typeof Layers; label: string; value: number; note: string }) {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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

function Metric({ label, value }: { label: string; value: number | string }) {
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
  currentTeacherId,
  days,
}: {
  entries: TimetableEntry[]
  periods: number[]
  periodConfigs: PeriodConfig[]
  currentTeacherId: string | null
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
                const isMine = entry?.teacherId === currentTeacherId && currentTeacherId !== null
                return (
                  <div key={`${day}-${period}`} className="min-h-16 border-r p-1.5 last:border-r-0">
                    {entry ? (
                      <div
                        className={`h-full rounded-md border p-2 ${
                          isMine
                            ? 'border-primary/50 bg-primary/15 ring-1 ring-primary/30'
                            : 'border-primary/20 bg-primary/10'
                        }`}
                      >
                        <p className="truncate text-xs font-semibold text-foreground" title={entry.subject?.name || 'Subject'}>
                          {entry.subject?.name || 'Subject'}
                        </p>
                        <p
                          className="mt-1 truncate text-[11px] text-muted-foreground"
                          title={entry.teacher ? `${entry.teacher.firstName} ${entry.teacher.lastName}` : ''}
                        >
                          {isMine
                            ? 'You'
                            : entry.teacher
                              ? `${entry.teacher.firstName} ${entry.teacher.lastName}`.trim()
                              : 'Teacher not set'}
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
