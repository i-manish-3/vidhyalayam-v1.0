'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Check,
  X,
  CalendarOff,
  Save,
  ClipboardCheck,
  ClipboardList,
  CalendarDays,
  Users,
  MessageSquare,
  RotateCcw,
  Eraser,
  Search,
  ChevronLeft,
  ChevronRight,
  Lock,
  ShieldCheck,
  Shield,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'absent' | 'leave'

interface Student {
  id: string
  firstName: string
  lastName: string
  rollNumber: string
  classId: string
  sectionId: string | null
}

interface ExistingAttendance {
  studentId: string
  date: string
  status: AttendanceStatus
  remarks?: string | null
}

interface AttendanceRecord {
  studentId: string
  date: string
  status: AttendanceStatus
  remarks?: string
}

interface ClassOption {
  id: string
  name: string
}

interface SectionOption {
  id: string
  name: string
  classId: string
}

// ── Status Configuration ───────────────────────────────────────────────

const STATUS_CONFIG: Record<AttendanceStatus, {
  label: string
  shortLabel: string
  icon: typeof Check
  bgColor: string
  textColor: string
  borderColor: string
  ringColor: string
  dotColor: string
  avatarBg: string
}> = {
  present: {
    label: 'Present',
    shortLabel: 'P',
    icon: Check,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    ringColor: 'ring-emerald-500/30',
    dotColor: 'bg-emerald-500',
    avatarBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  },
  absent: {
    label: 'Absent',
    shortLabel: 'A',
    icon: X,
    bgColor: 'bg-red-50 dark:bg-red-950/50',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-300 dark:border-red-700',
    ringColor: 'ring-red-500/30',
    dotColor: 'bg-red-500',
    avatarBg: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  },
  leave: {
    label: 'Leave',
    shortLabel: 'L',
    icon: CalendarOff,
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-300 dark:border-amber-700',
    ringColor: 'ring-amber-500/30',
    dotColor: 'bg-amber-500',
    avatarBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getTodayString(): string {
  return toLocalDateString(new Date())
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })
}

function navigateDate(dateStr: string, direction: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + direction)
  return toLocalDateString(date)
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────

export function AttendancePage() {
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)

  // Filter state
  const [academicYear, setAcademicYear] = useState(currentSchoolAcademicYear || getCurrentAcademicYear())
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const [date, setDate] = useState(getTodayString())
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Data state
  const [students, setStudents] = useState<Student[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceStatus>>(new Map())
  const [remarksMap, setRemarksMap] = useState<Map<string, string>>(new Map())
  const [existingAttendance, setExistingAttendance] = useState<ExistingAttendance[]>([])

  // Reference data
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears, currentSchoolAcademicYear),
    [availableAcademicYears, currentSchoolAcademicYear]
  )

  // Derived: does the selected class have no sections?
  const classHasNoSections = classId ? sections.filter((s) => s.classId === classId).length === 0 : false
  // The effective sectionId to use — empty string when class has no sections
  const effectiveSectionId = classHasNoSections ? '' : sectionId

  // UI state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [expandedRemark, setExpandedRemark] = useState<string | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)

  // Fetch classes and sections on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [clsRes, secRes, academicYearRes] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes'),
          api.get<{ sections: SectionOption[] }>('/api/school/sections'),
          api.get<{ academicYears: string[] }>('/api/school/academic-years'),
        ])
        setClasses(clsRes.classes || [])
        setSections(secRes.sections || [])
        setAvailableAcademicYears(academicYearRes.academicYears || [])
      } catch {
        toast({ title: 'Error', description: 'Failed to load classes. Please refresh.', variant: 'destructive' })
      } finally {
        setInitialLoad(false)
      }
    }
    init()
  }, [toast])

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === academicYear)) {
      setAcademicYear(academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear())
    }
  }, [academicYear, academicYearOptions, currentSchoolAcademicYear])

  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : []

  // Selected class/section names
  const selectedClassName = useMemo(() => classes.find(c => c.id === classId)?.name || '', [classes, classId])
  const selectedSectionName = useMemo(() => sections.find(s => s.id === sectionId)?.name || '', [sections, sectionId])

  // Fetch students and existing attendance
  const fetchAttendanceData = useCallback(async () => {
    // Need classId + date, and either sectionId OR classHasNoSections
    if (!classId || !date) return
    if (!classHasNoSections && !sectionId) return

    setLoading(true)
    setStudents([])
    setAttendanceMap(new Map())
    setRemarksMap(new Map())
    setExistingAttendance([])
    setExpandedRemark(null)
    setIsFinalized(false)

    try {
      const studentParams: Record<string, string> = { classId, limit: '500', academicYear }
      const attendanceParams: Record<string, string> = { classId, date, academicYear }
      if (effectiveSectionId) {
        studentParams.sectionId = effectiveSectionId
        attendanceParams.sectionId = effectiveSectionId
      }

      const [studentsRes, attendanceRes] = await Promise.all([
        api.get<{ students: Student[] }>('/api/school/students', studentParams),
        api.get<{ records: ExistingAttendance[]; finalized?: boolean }>('/api/school/attendance', attendanceParams),
      ])

      const studentList = studentsRes.students || []
      const existing = attendanceRes.records || []
      setStudents(studentList)
      setExistingAttendance(existing)
      setIsFinalized(attendanceRes.finalized || false)

      const statusMap = new Map<string, AttendanceStatus>()
      const remMap = new Map<string, string>()
      existing.forEach((a) => {
        const rawStatus = a.status as string
        let status: AttendanceStatus = rawStatus === 'late' || rawStatus === 'half_day'
          ? 'leave'
          : a.status as AttendanceStatus
        statusMap.set(a.studentId, status)
        if (a.remarks) remMap.set(a.studentId, a.remarks)
      })
      setAttendanceMap(statusMap)
      setRemarksMap(remMap)
    } catch {
      toast({ title: 'Error', description: 'Failed to load attendance data.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [academicYear, classId, effectiveSectionId, date, classHasNoSections, toast])

  useEffect(() => {
    if (classId && date && (effectiveSectionId || classHasNoSections)) fetchAttendanceData()
  }, [classId, effectiveSectionId, date, classHasNoSections, fetchAttendanceData])

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId('')
    setStudents([])
    setAttendanceMap(new Map())
    setRemarksMap(new Map())
    setExpandedRemark(null)
    setIsFinalized(false)
    setSearchQuery('')
  }

  const handleStatusChange = (studentId: string, status: AttendanceStatus) => {
    if (isFinalized || isFutureDate) return
    setAttendanceMap((prev) => {
      const next = new Map(prev)
      next.set(studentId, status)
      return next
    })
  }

  const handleRemarkChange = (studentId: string, remark: string) => {
    if (isFinalized || isFutureDate) return
    setRemarksMap((prev) => {
      const next = new Map(prev)
      if (remark.trim()) next.set(studentId, remark)
      else next.delete(studentId)
      return next
    })
  }

  const handleSave = async () => {
    if (students.length === 0 || isFinalized) return
    setSaving(true)
    const records: AttendanceRecord[] = students.map((s) => ({
      studentId: s.id,
      date,
      status: attendanceMap.get(s.id) || 'present',
      remarks: remarksMap.get(s.id) || undefined,
    }))

    try {
      await api.post('/api/school/attendance', { date, academicYear, records })
      const allStudentsMarked = records.every((r) => attendanceMap.has(r.studentId))
      toast({
        title: 'Attendance Saved',
        description: allStudentsMarked
          ? `Saved for ${records.length} students. Finalize attendance to lock it.`
          : `Saved for ${records.length} students.`,
      })
      fetchAttendanceData()
    } catch (err) {
      toast({ title: 'Save Failed', description: err instanceof Error ? err.message : 'Something went wrong.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!classId || !date) return
    if (!classHasNoSections && !sectionId) return
    setFinalizing(true)
    try {
      const payload: Record<string, string> = { date, classId, academicYear, action: 'finalize' }
      if (effectiveSectionId) payload.sectionId = effectiveSectionId
      await api.patch('/api/school/attendance', payload)
      toast({
        title: 'Attendance Finalized',
        description: 'Attendance has been locked. No further edits are allowed.',
      })
      setIsFinalized(true)
    } catch (err) {
      toast({
        title: 'Finalize Failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setFinalizing(false)
    }
  }

  const markAll = (status: AttendanceStatus) => {
    if (isFinalized || isFutureDate) return
    const map = new Map<string, AttendanceStatus>()
    students.forEach((s) => map.set(s.id, status))
    setAttendanceMap(map)
  }

  const clearAll = () => {
    if (isFinalized || isFutureDate) return
    setAttendanceMap(new Map())
    setRemarksMap(new Map())
    setExpandedRemark(null)
  }

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students
    const q = searchQuery.toLowerCase()
    return students.filter(s =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.rollNumber.toLowerCase().includes(q)
    )
  }, [students, searchQuery])

  // Stats
  const presentCount = Array.from(attendanceMap.values()).filter((s) => s === 'present').length
  const absentCount = Array.from(attendanceMap.values()).filter((s) => s === 'absent').length
  const leaveCount = Array.from(attendanceMap.values()).filter((s) => s === 'leave').length
  const unmarkedCount = students.length - presentCount - absentCount - leaveCount
  const markedCount = presentCount + absentCount + leaveCount
  const completionPercent = students.length > 0 ? Math.round((markedCount / students.length) * 100) : 0
  const hasAnyMarked = markedCount > 0
  const allMarked = students.length > 0 && unmarkedCount === 0

  // Is today or future?
  const isToday = date === getTodayString()
  const todayStr = getTodayString()
  const isFutureDate = date > todayStr

  if (initialLoad) return <LoadingState />

  return (
    <div className="space-y-3">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">Mark Attendance</h1>
            <p className="text-xs text-muted-foreground">
              Record daily student attendance — Present, Absent, or Leave
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => setCurrentPage('view-attendance')}>
            <ClipboardList className="size-4" />
            View Attendance
          </Button>
          {isFinalized && (
            <Badge className="gap-1.5 h-9 px-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
              <ShieldCheck className="size-4" />
              Finalized
            </Badge>
          )}
          {!isFinalized && !isFutureDate && hasAnyMarked && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={clearAll}>
                  <Eraser className="size-3.5" />
                  Clear All
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset all attendance marks</TooltipContent>
            </Tooltip>
          )}
          {!isFinalized && !isFutureDate && (
            <Button
              onClick={handleSave}
              disabled={saving || students.length === 0}
              className="gap-2 h-9"
              size="sm"
            >
              <Save className="size-3.5" />
              {saving ? 'Saving...' : 'Save Attendance'}
            </Button>
          )}
          {!isFinalized && !isFutureDate && allMarked && existingAttendance.length > 0 && (
            <Button
              onClick={handleFinalize}
              disabled={finalizing}
              className="gap-2 h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
              size="sm"
            >
              {finalizing ? (
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Shield className="size-3.5" />
              )}
              {finalizing ? 'Finalizing...' : 'Finalize Attendance'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Finalized Banner ────────────────────────────────────────── */}
      {isFinalized && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
          <div className="size-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center shrink-0">
            <Lock className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Attendance is Finalized</p>
            <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 mt-0.5">
              This attendance has been locked and cannot be edited. Contact admin if changes are needed.
            </p>
          </div>
        </div>
      )}

      {/* ── Future Date Banner ───────────────────────────────────────── */}
      {isFutureDate && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
          <div className="size-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            <CalendarDays className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Future Date Selected</p>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">
              Attendance cannot be marked for future dates. Please select today or a past date.
            </p>
          </div>
        </div>
      )}

      {/* ── Configuration Bar ────────────────────────────────────────── */}
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
                  {academicYearOptions.map((year) => (
                    <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-5" />

            {/* Date navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={() => setDate(navigateDate(date, -1))}>
                <ChevronLeft className="size-3" />
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                max={getTodayString()}
                className="h-7 w-[150px] text-xs"
              />
              <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={() => setDate(navigateDate(date, 1))} disabled={isFutureDate || isToday}>
                <ChevronRight className="size-3" />
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => setDate(getTodayString())}>
                  Today
                </Button>
              )}
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-5" />

            {/* Class */}
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Class</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Section */}
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="h-7 text-xs px-3">No Sections</Badge>
              ) : (
                <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredSections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Quick actions — only when not finalized and not future date */}
            {!isFinalized && !isFutureDate && (
              <>
                <Separator orientation="vertical" className="hidden lg:block h-5" />

                <div className="flex items-center gap-1 lg:ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950 px-2"
                    onClick={() => markAll('present')}
                    disabled={students.length === 0}
                  >
                    <Check className="size-2.5" />
                    All P
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-red-700 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950 px-2"
                    onClick={() => markAll('absent')}
                    disabled={students.length === 0}
                  >
                    <X className="size-2.5" />
                    All A
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-[11px] text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950 px-2"
                    onClick={() => markAll('leave')}
                    disabled={students.length === 0}
                  >
                    <CalendarOff className="size-2.5" />
                    All L
                  </Button>
                  {hasAnyMarked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 text-[11px] text-muted-foreground px-2"
                      onClick={clearAll}
                    >
                      <RotateCcw className="size-2.5" />
                      Reset
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Bar ──────────────────────────────────────────────── */}
      {students.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Progress */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-card shadow-sm">
            <div className="size-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardCheck className="size-3 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Progress</span>
                <span className={cn(
                  'text-[11px] font-bold',
                  completionPercent === 100 ? 'text-emerald-600' : 'text-foreground',
                )}>
                  {completionPercent}%
                </span>
              </div>
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted mt-0.5">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Present */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-card shadow-sm">
            <div className="size-5 rounded bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">P</span>
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{presentCount}</span>
          </div>

          {/* Absent */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-card shadow-sm">
            <div className="size-5 rounded bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <X className="size-3 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">A</span>
            <span className="text-sm font-bold text-red-700 dark:text-red-400">{absentCount}</span>
          </div>

          {/* Leave */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-card shadow-sm">
            <div className="size-5 rounded bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <CalendarOff className="size-3 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">L</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{leaveCount}</span>
          </div>

          {/* Unmarked */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-card shadow-sm">
            <div className="size-5 rounded bg-muted flex items-center justify-center shrink-0">
              <ClipboardCheck className="size-3 text-muted-foreground" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">?</span>
            <span className="text-sm font-bold text-muted-foreground">{unmarkedCount}</span>
          </div>
        </div>
      )}

      {/* ── Student List ─────────────────────────────────────────────── */}
      {!classId || (!classHasNoSections && !sectionId) ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Select Class & Section"
          description="Choose a date, class, and section above to start marking attendance."
        />
      ) : loading ? (
        <Card className="shadow-sm">
          <CardContent className="p-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading students...
            </div>
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No Students Found"
          description="No students found for the selected class and section."
        />
      ) : (
        <Card className={cn('shadow-sm overflow-hidden', isFinalized && 'ring-1 ring-emerald-200 dark:ring-emerald-800')}>
          {/* Table header */}
          <div className="px-5 py-3 bg-muted/40 border-b">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isFinalized ? (
                  <Lock className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Users className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm font-semibold">
                  {selectedClassName}{selectedSectionName ? ` — ${selectedSectionName}` : classHasNoSections ? ' (All Students)' : ''}
                </span>
                <Badge variant="secondary" className="text-[10px] h-5">
                  {students.length} students
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5 font-normal">
                  {formatShortDate(date)}
                </Badge>
                {isFinalized && (
                  <Badge className="text-[10px] h-5 gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                    <ShieldCheck className="size-3" />
                    Finalized
                  </Badge>
                )}
              </div>
              {/* Search */}
              <div className="relative w-[200px] hidden md:block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-8 pr-7 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div className="px-5 py-2 bg-muted/20 border-b hidden md:flex items-center gap-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8 text-center">#</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-10"></span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">Student Name</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-[220px] text-center">Status</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8 text-center">Remark</span>
          </div>

          {/* Student rows */}
          <div>
            <div className="divide-y divide-border">
              {filteredStudents.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No students match &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredStudents.map((student, idx) => {
                  const currentStatus = attendanceMap.get(student.id) || null
                  const currentRemark = remarksMap.get(student.id) || ''
                  const isRemarkExpanded = expandedRemark === student.id
                  const config = currentStatus ? STATUS_CONFIG[currentStatus] : null

                  return (
                    <div
                      key={student.id}
                      className={cn(
                        'px-5 py-3 transition-all duration-150',
                        config && `${config.bgColor} border-l-2 ${config.borderColor}`,
                        isFinalized && 'opacity-90',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {/* Row number */}
                        <span className="text-[11px] font-mono text-muted-foreground w-8 text-center shrink-0">
                          {idx + 1}
                        </span>

                        {/* Avatar */}
                        <Avatar className="size-9 shrink-0">
                          <AvatarFallback className={cn(
                            'text-[11px] font-bold',
                            config ? config.avatarBg : 'bg-muted text-muted-foreground',
                          )}>
                            {getInitials(student.firstName, student.lastName)}
                          </AvatarFallback>
                        </Avatar>

                        {/* Student name + roll */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-tight">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Roll No. {student.rollNumber || '—'}
                          </p>
                        </div>

                        {/* Status buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(
                            ([status, cfg]) => {
                              const isActive = currentStatus === status
                              return (
                                <button
                                  key={status}
                                  onClick={() => handleStatusChange(student.id, status)}
                                  disabled={isFinalized || isFutureDate}
                                  className={cn(
                                    'inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-semibold transition-all duration-100 border',
                                    isActive
                                      ? `${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor} ring-1 ${cfg.ringColor}`
                                      : isFinalized
                                        ? 'bg-background text-muted-foreground/40 border-transparent cursor-not-allowed'
                                        : 'bg-background text-muted-foreground border-transparent hover:bg-muted hover:border-border',
                                  )}
                                >
                                  <cfg.icon className="size-3.5" strokeWidth={isActive ? 2.5 : 2} />
                                  <span className="hidden lg:inline">{cfg.label}</span>
                                  <span className="lg:hidden">{cfg.shortLabel}</span>
                                </button>
                              )
                            },
                          )}
                        </div>

                        {/* Remark toggle */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => !isFinalized && !isFutureDate && setExpandedRemark(isRemarkExpanded ? null : student.id)}
                              disabled={isFinalized || isFutureDate}
                              className={cn(
                                'inline-flex items-center justify-center size-8 rounded-md transition-colors shrink-0',
                                (isFinalized || isFutureDate) && 'cursor-not-allowed',
                                currentRemark
                                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                  : isRemarkExpanded
                                    ? 'bg-muted text-foreground'
                                    : (isFinalized || isFutureDate)
                                      ? 'text-muted-foreground/30'
                                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                              )}
                            >
                              <MessageSquare className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isFinalized || isFutureDate ? 'Cannot edit' : currentRemark ? 'Edit remark' : 'Add remark'}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {/* Inline remark input — only when not finalized */}
                      {isRemarkExpanded && !isFinalized && !isFutureDate && (
                        <div className="mt-2.5 ml-[76px] mr-10">
                          <Input
                            placeholder="Add remark (e.g., Sick leave, Family function, Medical appointment...)"
                            value={currentRemark}
                            onChange={(e) => handleRemarkChange(student.id, e.target.value)}
                            className="h-8 text-xs"
                            autoFocus
                          />
                        </div>
                      )}

                      {/* Show remark inline if not expanded but has value */}
                      {!isRemarkExpanded && currentRemark && (
                        <div className="mt-1 ml-[76px] mr-10">
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <MessageSquare className="size-3 shrink-0" />
                            <span className="truncate">{currentRemark}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Footer legend + actions */}
          <div className="px-5 py-3 bg-muted/40 border-t flex items-center justify-between">
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" />
                P: <strong className="text-foreground">{presentCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-red-500" />
                A: <strong className="text-foreground">{absentCount}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" />
                L: <strong className="text-foreground">{leaveCount}</strong>
              </span>
              {unmarkedCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-gray-300" />
                  Unmarked: <strong className="text-foreground">{unmarkedCount}</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!isFinalized && !isFutureDate ? (
                <>
                  {hasAnyMarked && (
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={clearAll}>
                      <RotateCcw className="size-3" />
                      Clear All
                    </Button>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={saving || students.length === 0}
                    className="gap-2 h-8"
                    size="sm"
                  >
                    <Save className="size-3.5" />
                    {saving ? 'Saving...' : 'Save Attendance'}
                  </Button>
                </>
              ) : isFutureDate ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <CalendarDays className="size-3.5" />
                  Future dates cannot be marked
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <Lock className="size-3.5" />
                  Attendance Locked
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
