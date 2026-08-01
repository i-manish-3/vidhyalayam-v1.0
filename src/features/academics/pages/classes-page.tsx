'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { parseWorkingDays } from '@/lib/weekdays'
import { openTimetablePrint } from '@/features/academics/lib/timetable-print'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
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
  Printer,
} from 'lucide-react'

const SUBJECT_TYPES = [
  { value: 'primary', label: 'Primary', badge: 'border-primary/20 bg-primary/10 text-primary' },
  { value: 'optional', label: 'Optional', badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300' },
  { value: 'extra', label: 'Extra', badge: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300' },
  { value: 'special', label: 'Special', badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300' },
] as const

const CLASS_CARD_TONES = [
  { card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10', header: 'from-sky-100/80 via-white/90 to-cyan-100/70 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10', icon: 'from-sky-500 to-cyan-600' },
  { card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10', header: 'from-violet-100/80 via-white/90 to-purple-100/70 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10', icon: 'from-violet-500 to-purple-600' },
  { card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10', header: 'from-emerald-100/80 via-white/90 to-teal-100/70 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10', icon: 'from-emerald-500 to-teal-600' },
  { card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10', header: 'from-amber-100/80 via-white/90 to-orange-100/70 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10', icon: 'from-amber-500 to-orange-600' },
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
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.CLASS_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.CLASS_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.CLASS_DELETE)
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

  const handlePrintTimetable = () => {
    if (!timetableClass || timetableEntries.length === 0) return
    openTimetablePrint({
      title: `${timetableClass.name || 'Class'}${selectedTimetableSection ? ` - Section ${selectedTimetableSection.name}` : ''} Timetable`,
      subtitle: `${academicYear} session`,
      days: DAYS,
      periodConfigs,
      entries: timetableEntries,
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
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <Layers className="size-5 text-white" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Class List</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{academicYear}</span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">Manage classes, sections, subjects, teachers, and student strength.</p>
            </div>
          </div>
          {canCreate && (
            <Button variant="secondary" onClick={() => router.push('/academics/classes/new')} className="relative gap-2 border border-white/60 shadow-md" style={{ backgroundColor: 'white', color: 'var(--primary)' }}>
              <PlusCircle className="size-4" /> Add Class
            </Button>
          )}
        </div>
      </section>

      {classes.length > 0 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard tone="sky" icon={Layers} label="Classes" value={classes.length} note={`${stats.activeClasses} active`} />
            <StatCard tone="emerald" icon={Users} label="Students" value={stats.totalStudents} note="Across all classes" />
            <StatCard tone="violet" icon={GraduationCap} label="Sections" value={stats.totalSections} note="Configured sections" />
            <StatCard tone="amber" icon={BookOpen} label="Subjects" value={stats.totalSubjects} note="Assigned subjects" />
          </div>

          <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search class, section, or subject"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-9 border-sky-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
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
              <Badge className="h-9 w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                {filteredClasses.length} showing
              </Badge>
            </CardContent>
          </Card>
        </>
      )}

      {classes.length === 0 ? (
        <ClassEmptyState
          icon={GraduationCap}
          title="No Classes Yet"
          description="Add classes to organize students and sections."
          actionLabel={canCreate ? 'Add Class' : undefined}
          onAction={() => router.push('/academics/classes/new')}
        />
      ) : filteredClasses.length === 0 ? (
        <ClassEmptyState icon={Search} title="No classes found" description={`No class matches “${searchQuery}”.`} actionLabel="Clear search" onAction={() => handleSearchChange('')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredClasses.map((cls, classIndex) => {
            const sectionCount = cls.sections?.length || 0
            const subjectCount = cls.subjects?.length || 0
            const studentCount = cls._count?.students ?? 0
            const classTeacherCount = sectionCount > 0
              ? cls.sections?.filter(section => section.classTeacher).length || 0
              : cls.classTeacher ? 1 : 0
            const tone = CLASS_CARD_TONES[classIndex % CLASS_CARD_TONES.length]

            return (
              <Card key={cls.id} className={cn('group gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', tone.card)}>
                <CardContent className="p-0">
                  <div className={cn('flex items-start gap-3 border-b border-current/10 bg-gradient-to-r p-3.5', tone.header)}>
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', tone.icon)}>
                      <Layers className="size-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="mr-1 truncate text-base font-semibold leading-tight" title={cls.name || 'Unnamed Class'}>
                          {cls.name || 'Unnamed Class'}
                        </h3>
                        {sectionCount > 0 ? cls.sections!.slice(0, 4).map(section => (
                          <Badge key={section.id} variant="outline" className="h-5 shrink-0 rounded-md border-primary/15 bg-white/70 px-1.5 text-[11px] shadow-sm dark:bg-card/60">
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
                        <Badge variant="outline" className={cn('h-5 shrink-0 rounded-md px-1.5 text-[11px]', cls.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300')}>
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
                        className="size-8 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
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
                        {canUpdate && (
                          <DropdownMenuItem onClick={() => handleAssignClassTeacher(cls)}>
                            <UserCheck className="mr-2 size-3.5" />
                            Assign Class Teacher
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 border-b border-current/10 bg-white/55 text-center dark:bg-card/40">
                    <Metric label="Students" value={studentCount} />
                    <Metric label="Sections" value={sectionCount} />
                    <Metric label="Class Teachers" value={classTeacherCount} />
                  </div>

                  <div className="p-3.5">
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <SectionTitle icon={UserCheck} label={`Class Teachers (${academicYear})`} />
                        {sectionCount > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {cls.sections!.map(section => (
                              <Badge key={section.id} variant="outline" className={cn('h-6 rounded-md px-2 text-xs shadow-sm', section.classTeacher ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300')}>
                                {section.name}: {section.classTeacher ? getTeacherName(section.classTeacher) : 'Unassigned'}
                              </Badge>
                            ))}
                          </div>
                        ) : cls.classTeacher ? (
                          <Badge variant="secondary" className="h-6 rounded-md px-2 text-xs">
                            {getTeacherName(cls.classTeacher)}
                          </Badge>
                        ) : (
                          <p className="rounded-lg border border-dashed border-amber-300/70 bg-amber-50/60 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">No class teacher assigned.</p>
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
                        <p className="rounded-lg border border-dashed border-violet-300/70 bg-violet-50/60 px-3 py-2 text-xs text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">No subjects assigned.</p>
                      )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-current/10 bg-white/60 px-3.5 py-2.5 dark:bg-card/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      Ready for setup
                    </div>
                    <div className="flex gap-2">
                      {canUpdate && (
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300" onClick={() => handleEdit(cls)}>
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                          onClick={() => setDeleteClass(cls)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      )}
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
              disabled={deleting || !canDelete}
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

function StatCard({ icon: Icon, label, value, note, tone }: { icon: typeof Layers; label: string; value: number; note: string; tone: 'sky' | 'emerald' | 'violet' | 'amber' }) {
  const styles = {
    sky: { card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10', icon: 'from-sky-500 to-cyan-600', value: 'text-sky-700 dark:text-sky-300' },
    emerald: { card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10', icon: 'from-emerald-500 to-teal-600', value: 'text-emerald-700 dark:text-emerald-300' },
    violet: { card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10', icon: 'from-violet-500 to-purple-600', value: 'text-violet-700 dark:text-violet-300' },
    amber: { card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10', icon: 'from-amber-500 to-orange-600', value: 'text-amber-700 dark:text-amber-300' },
  }[tone]

  return (
    <Card className={cn('group gap-0 border bg-gradient-to-r py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <CardContent className="flex items-center gap-2.5 p-2.5">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', styles.icon)}>
          <Icon className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn('text-lg font-bold leading-tight', styles.value)}>{value}</p>
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
      <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white"><Icon className="size-3 text-white" /></span>
      {label}
    </div>
  )
}

function ClassEmptyState({ icon: Icon, title, description, actionLabel, onAction }: {
  icon: typeof GraduationCap
  title: string
  description: string
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <Card className="relative gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
      <div aria-hidden className="absolute -right-8 -top-10 size-28 rounded-full border-[14px] border-sky-200/25 dark:border-sky-500/10" />
      <CardContent className="relative flex flex-col items-center justify-center py-10 text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md"><Icon className="size-6 text-white" /></span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {actionLabel ? <Button size="sm" onClick={onAction} className="mt-3 h-8 gap-1.5 px-3 text-xs">{actionLabel}</Button> : null}
      </CardContent>
    </Card>
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
