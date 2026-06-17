'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useEffectiveRole } from '@/hooks/use-effective-role'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DatePicker } from '@/components/date-picker'
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
  LockOpen,
  ShieldCheck,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'

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

type NonTeachingHoliday = { date: string; endDate: string | null; name: string }
type NonTeachingInfo =
  | { reason: 'non-working-day'; weekdayName: string; label: string }
  | { reason: 'holiday'; label: string; name: string }
  | null

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Single source of truth for "is this date a non-teaching day?" — used both to
// hide the marking UI AND to skip the auto-default-absent initialize call, so a
// holiday can never be silently overridden with absent rows. Mirrors the backend
// rule (weekly off via workingDays, then declared holidays by date range).
function computeNonTeaching(date: string, workingDays: string[], holidays: NonTeachingHoliday[]): NonTeachingInfo {
  if (!date) return null
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const weekdayName = WEEKDAY_NAMES[dt.getDay()]
  if (!workingDays.includes(weekdayName)) {
    return { reason: 'non-working-day', weekdayName, label: `${weekdayName} is a weekly holiday. Attendance is not required.` }
  }
  for (const h of holidays) {
    const start = h.date.slice(0, 10)
    const end = (h.endDate || h.date).slice(0, 10)
    if (date >= start && date <= end) {
      return { reason: 'holiday', label: h.name, name: h.name }
    }
  }
  return null
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

const rollNumberCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

interface AttendanceListState {
  date?: string
  classId?: string
  sectionId?: string
  searchQuery?: string
}

const ATTENDANCE_LIST_STATE_KEY = 'attendance:mark:list'

function compareStudentsByRollNumber(a: Student, b: Student): number {
  const aRoll = (a.rollNumber || '').trim()
  const bRoll = (b.rollNumber || '').trim()

  if (aRoll && !bRoll) return -1
  if (!aRoll && bRoll) return 1

  const rollCompare = rollNumberCollator.compare(aRoll, bRoll)
  if (rollCompare !== 0) return rollCompare

  const aName = `${a.firstName} ${a.lastName}`.trim()
  const bName = `${b.firstName} ${b.lastName}`.trim()
  return rollNumberCollator.compare(aName, bName)
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchesStudentSearch(student: Student, query: string): boolean {
  const q = normalizeSearchValue(query)
  if (!q) return true

  const firstName = normalizeSearchValue(student.firstName)
  const lastName = normalizeSearchValue(student.lastName)
  const fullName = normalizeSearchValue(`${student.firstName} ${student.lastName}`)
  const reverseName = normalizeSearchValue(`${student.lastName} ${student.firstName}`)
  const rollNumber = normalizeSearchValue(student.rollNumber)

  return [firstName, lastName, fullName, reverseName, rollNumber].some((value) => value.includes(q))
}

// ── Component ──────────────────────────────────────────────────────────

export function AttendancePage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canView = hasPermission(PERMISSIONS.ATTENDANCE_READ)
  const canReopen = hasPermission(PERMISSIONS.ATTENDANCE_REOPEN)
  const currentUser = useAppStore((s) => s.user)
  const savedListState = useAppStore((s) => s.pageState[ATTENDANCE_LIST_STATE_KEY] as AttendanceListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const effectiveRole = useEffectiveRole()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  // Filter state
  const [date, setDate] = useState(savedListState?.date ?? getTodayString())
  const [classId, setClassId] = useState(savedListState?.classId ?? '')
  const [sectionId, setSectionId] = useState(savedListState?.sectionId ?? '')
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')

  // Data state
  const [students, setStudents] = useState<Student[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceStatus>>(new Map())
  const [remarksMap, setRemarksMap] = useState<Map<string, string>>(new Map())
  const [existingAttendance, setExistingAttendance] = useState<ExistingAttendance[]>([])

  // Reference data
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])

  // Calendar (working days + declared holidays). Loaded once per academic year.
  const [workingDays, setWorkingDays] = useState<string[]>(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
  const [holidays, setHolidays] = useState<Array<{ id: string; date: string; endDate: string | null; name: string; type: string }>>([])

  // Derived: does the selected class have no sections?
  const classHasNoSections = classId ? sections.filter((s) => s.classId === classId).length === 0 : false
  // The effective sectionId to use — empty string when class has no sections
  const effectiveSectionId = classHasNoSections ? '' : sectionId

  // UI state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [initialLoad, setInitialLoad] = useState(true)
  const [expandedRemark, setExpandedRemark] = useState<string | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)

  // Fetch classes and sections on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [clsRes, secRes, calRes] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes'),
          api.get<{ sections: SectionOption[] }>('/api/school/sections'),
          api.get<{ workingDays: string[]; holidays: Array<{ id: string; date: string; endDate: string | null; name: string; type: string }> }>(`/api/school/holidays?academicYear=${academicYear}`).catch(() => null),
        ])
        setClasses(clsRes.classes || [])
        setSections(secRes.sections || [])
        if (calRes) {
          if (Array.isArray(calRes.workingDays) && calRes.workingDays.length > 0) setWorkingDays(calRes.workingDays)
          if (Array.isArray(calRes.holidays)) setHolidays(calRes.holidays)
        }
      } catch {
        toast({ title: 'Error', description: 'Failed to load classes. Please refresh.', variant: 'destructive' })
      } finally {
        setInitialLoad(false)
      }
    }
    init()
  }, [toast, academicYear])

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

      const studentList = [...(studentsRes.students || [])].sort(compareStudentsByRollNumber)
      let existing = attendanceRes.records || []
      const finalized = attendanceRes.finalized || false

      // Auto-default-absent: if any enrolled student has no row, materialize
      // absent rows for them server-side, then re-fetch. Idempotent — runs once
      // per day per class (subsequent loads find no gap and skip the call).
      // Skip for future dates, finalized days, and non-teaching days (the
      // initialize endpoint rejects these anyway, but avoid the round trip).
      const todayStr = getTodayString()
      const isPastOrToday = date <= todayStr
      const hasGap = studentList.length > existing.length
      // Never auto-default-absent on a non-teaching day (declared holiday or
      // weekly off). The page already knows this from the loaded calendar; the
      // backend also rejects it, but guarding here avoids relying on the two
      // staying perfectly in sync and prevents a holiday being overridden.
      const nonTeaching = computeNonTeaching(date, workingDays, holidays)
      if (hasGap && !finalized && isPastOrToday && !nonTeaching) {
        try {
          const initParams: Record<string, string> = { date, classId, academicYear }
          if (effectiveSectionId) initParams.sectionId = effectiveSectionId
          await api.post('/api/school/attendance/initialize', initParams)
          const refreshed = await api.get<{ records: ExistingAttendance[]; finalized?: boolean }>(
            '/api/school/attendance',
            attendanceParams,
          )
          existing = refreshed.records || []
        } catch {
          // Non-teaching day or future date — initialize endpoint returned 400.
          // Silently fall back to whatever rows already exist; UI still works.
        }
      }

      setStudents(studentList)
      setExistingAttendance(existing)
      setIsFinalized(finalized)

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
  }, [academicYear, classId, effectiveSectionId, date, classHasNoSections, workingDays, holidays, toast])

  useEffect(() => {
    if (classId && date && (effectiveSectionId || classHasNoSections)) fetchAttendanceData()
  }, [classId, effectiveSectionId, date, classHasNoSections, fetchAttendanceData])

  const rememberListState = (patch: Partial<AttendanceListState>) => {
    setPageState(ATTENDANCE_LIST_STATE_KEY, {
      date,
      classId,
      sectionId,
      searchQuery,
      ...patch,
    })
  }

  const handleDateChange = (value: string) => {
    setDate(value)
    rememberListState({ date: value })
  }

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId('')
    setStudents([])
    setAttendanceMap(new Map())
    setRemarksMap(new Map())
    setExpandedRemark(null)
    setIsFinalized(false)
    setSearchQuery('')
    rememberListState({ classId: value, sectionId: '', searchQuery: '' })
  }

  const handleSectionChange = (value: string) => {
    setSectionId(value)
    rememberListState({ sectionId: value })
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    rememberListState({ searchQuery: value })
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
    // Only send students with an EXPLICIT status. Untouched students used to
    // fall back to 'present' here, which silently marked absentees present
    // when a teacher hit Save without reviewing every row — actively dangerous
    // once RFID started populating rows for some students but not others.
    // Teachers who want bulk-present must use the "Mark all present" button
    // explicitly (which populates attendanceMap for every student).
    const recordsToSend: AttendanceRecord[] = students
      .filter((s) => attendanceMap.has(s.id))
      .map((s) => ({
        studentId: s.id,
        date,
        status: attendanceMap.get(s.id)!,
        remarks: remarksMap.get(s.id) || undefined,
      }))

    if (recordsToSend.length === 0) {
      toast({
        title: 'Nothing to save',
        description: 'Mark at least one student first (use "Mark all present" or toggle individually).',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      await api.post('/api/school/attendance', { date, academicYear, records: recordsToSend })
      const unmarked = students.length - recordsToSend.length
      toast({
        title: 'Attendance Saved',
        description:
          unmarked === 0
            ? `Saved for ${recordsToSend.length} students. Finalize attendance to lock it.`
            : `Saved for ${recordsToSend.length} students. ${unmarked} still unmarked — mark them before finalizing.`,
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
      // Save current UI state to DB first. Otherwise edits the user made
      // after a reopen would be lost silently — Finalize only flips a flag,
      // it doesn't persist `attendanceMap`/`remarksMap`. Re-marking the same
      // values is a no-op at the DB level (the change log skips no-ops too).
      // Filter to ONLY students with an explicit status; the finalize PATCH
      // below will refuse if any enrolled student still has no row.
      if (students.length > 0) {
        const recordsToSend: AttendanceRecord[] = students
          .filter((s) => attendanceMap.has(s.id))
          .map((s) => ({
            studentId: s.id,
            date,
            status: attendanceMap.get(s.id)!,
            remarks: remarksMap.get(s.id) || undefined,
          }))
        if (recordsToSend.length > 0) {
          await api.post('/api/school/attendance', { date, academicYear, records: recordsToSend })
        }
      }

      const payload: Record<string, string> = { date, classId, academicYear, action: 'finalize' }
      if (effectiveSectionId) payload.sectionId = effectiveSectionId
      await api.patch('/api/school/attendance', payload)
      toast({
        title: 'Attendance Finalized',
        description: 'Latest attendance saved and locked. No further edits are allowed.',
      })
      setIsFinalized(true)
      fetchAttendanceData()
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

  const handleReopen = async () => {
    if (!classId || !date || reopening) return
    if (!classHasNoSections && !sectionId) return
    const reason = reopenReason.trim()
    if (reason.length < 5) {
      toast({ title: 'Reason Required', description: 'Please enter a clear reason before reopening attendance.', variant: 'destructive' })
      return
    }

    setReopening(true)
    try {
      const payload: Record<string, string> = { date, classId, academicYear, action: 'reopen', reason }
      if (effectiveSectionId) payload.sectionId = effectiveSectionId
      await api.patch('/api/school/attendance', payload)
      toast({
        title: 'Attendance Reopened',
        description: 'Attendance is unlocked. Make the required changes and finalize it again.',
      })
      setReopenDialogOpen(false)
      setReopenReason('')
      setIsFinalized(false)
      fetchAttendanceData()
    } catch (err) {
      toast({
        title: 'Reopen Failed',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setReopening(false)
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
    return students.filter((student) => matchesStudentSearch(student, searchQuery))
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
  const canReopenFinalizedAttendance = effectiveRole === 'SCHOOL_ADMIN' || canReopen

  // Non-teaching day check (weekly off / declared holiday). Shares one helper
  // with the auto-default-absent guard so the UI and the data logic can't drift.
  const nonTeachingInfo = useMemo(
    () => computeNonTeaching(date, workingDays, holidays),
    [date, workingDays, holidays],
  )

  const isNonTeachingDay = nonTeachingInfo !== null
  const markingBlocked = isFutureDate || isNonTeachingDay

  if (initialLoad) return <LoadingState />

  return (
    <div className="space-y-3 pb-20 sm:pb-0">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">Mark Attendance</h1>
            <p className="text-xs text-muted-foreground">
              Record daily student attendance — Present, Absent, or Leave
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          {canView && (
            <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={() => router.push('/attendance/view')}>
              <ClipboardList className="size-4" />
              View Attendance
            </Button>
          )}
          {isFinalized && (
            <Badge className="gap-1.5 h-9 px-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
              <ShieldCheck className="size-4" />
              Finalized
            </Badge>
          )}
          {!isFinalized && !markingBlocked && hasAnyMarked && (
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
          {!isFinalized && !markingBlocked && (
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
          {!isFinalized && !markingBlocked && allMarked && existingAttendance.length > 0 && (
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
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50">
              <Lock className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Attendance is Finalized</p>
              <p className="mt-0.5 text-xs text-emerald-700/70 dark:text-emerald-400/70">
                This attendance is locked. School admin can reopen it for corrections.
              </p>
            </div>
          </div>
          {canReopenFinalizedAttendance && !isFutureDate && (
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full gap-1.5 border-emerald-300 bg-white/70 text-emerald-800 hover:bg-white dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 sm:w-auto"
              onClick={() => setReopenDialogOpen(true)}
            >
              <LockOpen className="size-3.5" />
              Reopen Attendance
            </Button>
          )}
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

      {/* ── Non-Teaching Day Banner ──────────────────────────────────── */}
      {!isFutureDate && isNonTeachingDay && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800">
          <div className="size-8 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
            <CalendarDays className="size-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">
              {nonTeachingInfo?.reason === 'holiday'
                ? `Holiday: ${nonTeachingInfo.name}`
                : nonTeachingInfo?.weekdayName
                  ? `${nonTeachingInfo.weekdayName} — Weekly Off`
                  : 'Weekly Off'}
            </p>
            <p className="text-xs text-sky-700/70 dark:text-sky-400/70 mt-0.5">
              {nonTeachingInfo?.reason === 'holiday'
                ? 'Attendance cannot be marked on a declared holiday.'
                : nonTeachingInfo?.label || 'Attendance cannot be marked on a school holiday.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Configuration Bar ────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="grid gap-3 xl:grid-cols-[auto_auto_auto_1fr] xl:items-center">
            {/* Date navigation */}
            <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] gap-2 sm:grid-cols-[28px_220px_28px_auto] sm:items-center">
              <Button variant="outline" size="icon" className="size-9 shrink-0 sm:size-7" onClick={() => handleDateChange(navigateDate(date, -1))}>
                <ChevronLeft className="size-3" />
              </Button>
              <DatePicker
                value={date}
                onChange={handleDateChange}
                disableFuture
                triggerClassName="h-9 w-full min-w-0 justify-start px-2.5 text-sm sm:h-7 sm:w-[220px] sm:text-xs"
              />
              <Button variant="outline" size="icon" className="size-9 shrink-0 sm:size-7" onClick={() => handleDateChange(navigateDate(date, 1))} disabled={isFutureDate || isToday}>
                <ChevronRight className="size-3" />
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" className="col-span-3 h-8 px-2 text-xs sm:col-span-1 sm:h-7 sm:text-[11px]" onClick={() => handleDateChange(getTodayString())}>
                  Today
                </Button>
              )}
            </div>

            {/* Class */}
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Class</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:w-[160px] sm:text-xs">
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
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="flex h-9 w-full items-center px-3 text-sm sm:h-7 sm:w-auto sm:text-xs">No Sections</Badge>
              ) : (
                <Select value={sectionId} onValueChange={handleSectionChange} disabled={!classId}>
                  <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:w-[150px] sm:text-xs">
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
            {!isFinalized && !markingBlocked && (
              <>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center xl:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1 border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950 sm:h-7 sm:text-[11px]"
                    onClick={() => markAll('present')}
                    disabled={students.length === 0}
                  >
                    <Check className="size-2.5" />
                    All P
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1 border-red-200 px-2 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 sm:h-7 sm:text-[11px]"
                    onClick={() => markAll('absent')}
                    disabled={students.length === 0}
                  >
                    <X className="size-2.5" />
                    All A
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1 border-amber-200 px-2 text-xs text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950 sm:h-7 sm:text-[11px]"
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
                      className="col-span-3 h-9 gap-1 px-2 text-xs text-muted-foreground sm:col-span-1 sm:h-7 sm:text-[11px]"
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-1.5">
          {/* Progress */}
          <div className="col-span-2 flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 shadow-sm sm:col-span-1 sm:py-1.5">
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
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-2 shadow-sm sm:py-1.5">
            <div className="size-5 rounded bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">P</span>
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{presentCount}</span>
          </div>

          {/* Absent */}
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-2 shadow-sm sm:py-1.5">
            <div className="size-5 rounded bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
              <X className="size-3 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">A</span>
            <span className="text-sm font-bold text-red-700 dark:text-red-400">{absentCount}</span>
          </div>

          {/* Leave */}
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-2 shadow-sm sm:py-1.5">
            <div className="size-5 rounded bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
              <CalendarOff className="size-3 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">L</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{leaveCount}</span>
          </div>

          {/* Unmarked */}
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-2 shadow-sm sm:py-1.5">
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
          <div className="border-b bg-muted/40 px-3 py-3 sm:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-1">
                {isFinalized ? (
                  <Lock className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <Users className="size-4 text-muted-foreground shrink-0" />
                )}
                <span className="min-w-0 text-sm font-semibold">
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
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-7 pl-8 pr-7 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
            <div className="relative mt-3 md:hidden">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search student..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 pl-8 pr-8 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
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
                        'px-3 py-3 transition-all duration-150 sm:px-5',
                        config && `${config.bgColor} border-l-2 ${config.borderColor}`,
                        isFinalized && 'opacity-90',
                      )}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="flex min-w-0 items-center gap-3 md:flex-1">
                        {/* Row number */}
                        <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground md:w-8">
                          {idx + 1}
                        </span>

                        {/* Avatar */}
                        <Avatar className="size-10 shrink-0 md:size-9">
                          <AvatarFallback className={cn(
                            'text-[11px] font-bold',
                            config ? config.avatarBg : 'bg-muted text-muted-foreground',
                          )}>
                            {getInitials(student.firstName, student.lastName)}
                          </AvatarFallback>
                        </Avatar>

                        {/* Student name + roll */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold leading-tight">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Roll No. {student.rollNumber || '—'}
                          </p>
                        </div>

                        </div>

                        {/* Status buttons */}
                        <div className="grid grid-cols-4 gap-1.5 md:flex md:shrink-0 md:items-center md:gap-1">
                          {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(
                            ([status, cfg]) => {
                              const isActive = currentStatus === status
                              return (
                                <button
                                  key={status}
                                  onClick={() => handleStatusChange(student.id, status)}
                                  disabled={isFinalized || isFutureDate}
                                  className={cn(
                                    'inline-flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-xs font-semibold transition-all duration-100 md:h-8 md:px-3',
                                    isActive
                                      ? `${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor} ring-1 ${cfg.ringColor}`
                                      : isFinalized
                                        ? 'bg-background text-muted-foreground/40 border-transparent cursor-not-allowed'
                                        : 'bg-background text-muted-foreground border-transparent hover:bg-muted hover:border-border',
                                  )}
                                >
                                  <span>{cfg.label}</span>
                                </button>
                              )
                            },
                          )}
                        {/* Remark toggle */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => !isFinalized && !markingBlocked && setExpandedRemark(isRemarkExpanded ? null : student.id)}
                              disabled={isFinalized || isFutureDate}
                              className={cn(
                                'inline-flex h-9 w-full items-center justify-center rounded-md transition-colors md:size-8 md:w-8 md:shrink-0',
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
                      </div>

                      {/* Inline remark input — only when not finalized */}
                      {isRemarkExpanded && !isFinalized && !markingBlocked && (
                        <div className="mt-2.5 md:ml-[76px] md:mr-10">
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
                        <div className="mt-2 md:ml-[76px] md:mr-10">
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
          <div className="flex flex-col gap-3 border-t bg-muted/40 px-3 py-3 sm:px-5 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
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
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {!isFinalized && !markingBlocked ? (
                <>
                  {hasAnyMarked && (
                    <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground sm:h-8" onClick={clearAll}>
                      <RotateCcw className="size-3" />
                      Clear All
                    </Button>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={saving || students.length === 0}
                    className="h-9 gap-2 sm:h-8"
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
              ) : isNonTeachingDay ? (
                <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400 font-medium">
                  <CalendarDays className="size-3.5" />
                  {nonTeachingInfo?.reason === 'holiday' ? 'Holiday — no attendance' : 'Weekly Off'}
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

      <Dialog open={reopenDialogOpen} onOpenChange={(open) => {
        if (!reopening) {
          setReopenDialogOpen(open)
          if (!open) setReopenReason('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="size-4" />
              Reopen Attendance
            </DialogTitle>
            <DialogDescription>
              This will unlock attendance so corrections can be made. The reason will be saved in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Example: Parent reported approved medical leave for a student."
              rows={4}
              disabled={reopening}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 5 characters. Attendance must be finalized again after changes.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)} disabled={reopening}>
              Cancel
            </Button>
            <Button onClick={handleReopen} disabled={reopening || reopenReason.trim().length < 5} className="gap-1.5">
              {reopening ? (
                <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <LockOpen className="size-3.5" />
              )}
              {reopening ? 'Reopening...' : 'Reopen Attendance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
