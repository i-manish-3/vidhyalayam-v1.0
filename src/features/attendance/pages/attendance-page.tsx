'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
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
    bgColor: 'bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/30',
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
    bgColor: 'bg-gradient-to-br from-red-50 via-white to-rose-50 dark:from-red-950/40 dark:via-card dark:to-rose-950/30',
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
    bgColor: 'bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-950/40 dark:via-card dark:to-orange-950/30',
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
    <div className="space-y-4">
      {/* ── Branded Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -top-14 right-1/3 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-1/4 size-28 rounded-full bg-amber-300/10 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
              <ClipboardCheck className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Mark Attendance</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  {academicYear}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">Record daily student attendance with present, absent, or leave status.</p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            {isFinalized && (
              <Badge className="gap-1.5 border border-white/25 bg-white/15 px-3 py-1.5 text-xs text-white shadow-sm backdrop-blur-sm hover:bg-white/20">
                <ShieldCheck className="size-3.5" />
                Finalized
              </Badge>
            )}
            {canView && !isFinalized && (
              <Button
                variant="secondary"
                size="sm"
                className="relative gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
                style={{ backgroundColor: 'white', color: 'var(--primary)' }}
                onClick={() => router.push('/attendance/view')}
              >
                <ClipboardList className="size-4" />
                View Attendance
              </Button>
            )}
            {!isFinalized && !markingBlocked && hasAnyMarked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1.5 border border-white/30 bg-white/20 px-2.5 text-xs text-white shadow-sm backdrop-blur-sm hover:bg-white/30"
                    onClick={clearAll}
                  >
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
                size="sm"
                className="h-8 gap-1.5 bg-white px-3 text-xs text-primary shadow-sm [background-image:none] hover:bg-white/90 disabled:bg-white disabled:text-primary/60"
              >
                <Save className="size-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
            {!isFinalized && !markingBlocked && allMarked && existingAttendance.length > 0 && (
              <Button
                onClick={handleFinalize}
                disabled={finalizing}
                size="sm"
                className="h-8 gap-1.5 border border-emerald-300/40 bg-emerald-600 px-3 text-xs text-white shadow-sm [background-image:none] hover:bg-emerald-700"
              >
                {finalizing ? (
                  <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Shield className="size-3.5" />
                )}
                {finalizing ? 'Finalizing...' : 'Finalize'}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Finalized Banner ────────────────────────────────────────── */}
      {isFinalized && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 py-3 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/5 sm:flex-row sm:items-center">
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
              className="h-8 gap-1.5 border-emerald-300 bg-white/70 px-2.5 text-xs text-emerald-800 hover:bg-white dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
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
        <div className="flex items-center gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-3 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
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
        <div className="flex items-center gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-4 py-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/50">
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
      <Card className="gap-0 overflow-hidden border-rose-200/80 bg-gradient-to-r from-rose-50 via-white to-sky-50 py-0 shadow-sm dark:border-rose-500/25 dark:from-rose-500/12 dark:via-card dark:to-sky-500/10">
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
                triggerClassName="h-9 w-full min-w-0 justify-start bg-white px-2.5 text-sm dark:bg-input/30 sm:h-7 sm:w-[220px] sm:text-xs"
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
                <SelectTrigger
                  leadingIcon={<Users className="size-3.5 text-white" />}
                  leadingIconClassName="from-sky-500 to-cyan-600"
                  className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:w-[180px] sm:text-xs"
                >
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="data-[state=checked]:bg-sky-50 data-[state=checked]:font-semibold data-[state=checked]:text-sky-700 dark:data-[state=checked]:bg-sky-500/15 dark:data-[state=checked]:text-sky-300">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Section */}
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="flex h-10 w-full items-center gap-2 border border-violet-200 bg-violet-50 px-3 text-sm text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300 sm:h-9 sm:w-auto sm:text-xs">
                  <ClipboardList className="size-3.5" /> No Sections
                </Badge>
              ) : (
                <Select value={sectionId} onValueChange={handleSectionChange} disabled={!classId}>
                  <SelectTrigger
                    leadingIcon={<ClipboardList className="size-3.5 text-white" />}
                    leadingIconClassName="from-violet-500 to-purple-600"
                    className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 disabled:opacity-60 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:w-[170px] sm:text-xs"
                  >
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                    {filteredSections.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="data-[state=checked]:bg-violet-50 data-[state=checked]:font-semibold data-[state=checked]:text-violet-700 dark:data-[state=checked]:bg-violet-500/15 dark:data-[state=checked]:text-violet-300">
                        {s.name}
                      </SelectItem>
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {/* Progress */}
          <div className="col-span-2 rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-cyan-500/25 dark:from-cyan-500/15 dark:via-card dark:to-sky-500/10 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm">
                <ClipboardCheck className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress</p>
                <p className={cn('text-lg font-bold leading-tight', completionPercent === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-cyan-700 dark:text-cyan-300')}>
                  {completionPercent}%
                </p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cyan-100 dark:bg-cyan-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>

          {/* Present */}
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Check className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Present</p>
              <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">{presentCount}</p>
            </div>
          </div>

          {/* Absent */}
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-red-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-red-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm">
              <X className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Absent</p>
              <p className="text-lg font-bold leading-tight text-rose-700 dark:text-rose-300">{absentCount}</p>
            </div>
          </div>

          {/* Leave */}
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <CalendarOff className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On Leave</p>
              <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">{leaveCount}</p>
            </div>
          </div>

          {/* Unmarked */}
          <div className="flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-slate-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-slate-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-slate-600 text-white shadow-sm">
              <ClipboardCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unmarked</p>
              <p className="text-lg font-bold leading-tight text-violet-700 dark:text-violet-300">{unmarkedCount}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Student List ─────────────────────────────────────────────── */}
      {!classId || (!classHasNoSections && !sectionId) ? (
        <Card className="relative gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          <div aria-hidden className="absolute -right-10 -top-14 size-40 rounded-full border-[20px] border-sky-200/25 dark:border-sky-400/10" />
          <div aria-hidden className="absolute -bottom-16 -left-8 size-36 rounded-full bg-violet-200/25 blur-2xl dark:bg-violet-500/10" />
          <CardContent className="relative flex flex-col items-center px-4 py-8 text-center sm:px-6">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-teal-600 to-cyan-600 text-white shadow-lg shadow-primary/20 ring-4 ring-primary/10">
              <ClipboardCheck className="size-7" />
            </span>
            <h2 className="mt-4 text-lg font-semibold">{classId ? 'Select a Section' : 'Select Class & Section'}</h2>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Choose the attendance group above to load students and begin marking today&rsquo;s attendance.
            </p>

            <div className="mt-5 grid w-full max-w-2xl gap-2.5 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 text-left shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                  <CalendarDays className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Date</p>
                  <p className="truncate text-[11px] text-emerald-700 dark:text-emerald-300">{formatShortDate(date)}</p>
                </div>
                <Check className="ml-auto size-3.5 shrink-0 text-emerald-600" />
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 text-left shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
                  <Users className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Class</p>
                  <p className="truncate text-[11px] text-sky-700 dark:text-sky-300">{selectedClassName || 'Choose class'}</p>
                </div>
                {classId && <Check className="ml-auto size-3.5 shrink-0 text-sky-600" />}
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-3 text-left shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                  <ClipboardList className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">Section</p>
                  <p className="truncate text-[11px] text-violet-700 dark:text-violet-300">Choose section</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card className="gap-0 border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-cyan-500/10">
          <CardContent className="p-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading students...
            </div>
          </CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card className="gap-0 border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 py-0 shadow-sm dark:border-amber-500/25 dark:from-amber-500/12 dark:via-card dark:to-orange-500/10">
          <CardContent className="flex items-center gap-3 p-5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Users className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">No students found</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">There are no students in the selected class and section.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={cn('gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10', isFinalized && 'ring-1 ring-emerald-200 dark:ring-emerald-800')}>
          {/* Table header */}
          <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
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
                  className="h-7 bg-white pl-8 pr-7 text-xs dark:bg-input/30"
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
                className="h-9 bg-white pl-8 pr-8 text-sm dark:bg-input/30"
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
          <div className="hidden items-center gap-3 border-b border-cyan-200/70 bg-gradient-to-r from-cyan-100/80 via-sky-50 to-violet-100/70 px-5 py-2 dark:border-cyan-500/20 dark:from-cyan-500/15 dark:via-sky-500/10 dark:to-violet-500/15 md:flex">
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
                            className="h-8 bg-white text-xs dark:bg-input/30"
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
          <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
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
            <div className="flex items-center gap-2">
              {isFutureDate ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <CalendarDays className="size-3.5" />
                  Future dates cannot be marked
                </div>
              ) : isNonTeachingDay ? (
                <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-400 font-medium">
                  <CalendarDays className="size-3.5" />
                  {nonTeachingInfo?.reason === 'holiday' ? 'Holiday — no attendance' : 'Weekly Off'}
                </div>
              ) : isFinalized ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                  <Lock className="size-3.5" />
                  Attendance Locked
                </div>
              ) : (
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                  <Button
                    onClick={handleSave}
                    disabled={saving || finalizing || students.length === 0}
                    size="sm"
                    className="h-9 gap-1.5 px-3 text-xs sm:h-8"
                  >
                    {saving ? (
                      <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    {saving ? 'Saving...' : 'Save Attendance'}
                  </Button>
                  <Button
                    onClick={handleFinalize}
                    disabled={saving || finalizing || !allMarked || existingAttendance.length === 0}
                    size="sm"
                    title={!allMarked ? `Mark all ${unmarkedCount} remaining students before finalizing` : undefined}
                    className="h-9 gap-1.5 border border-emerald-600 bg-emerald-600 px-3 text-xs text-white shadow-sm [background-image:none] hover:bg-emerald-700 disabled:border-emerald-400 disabled:bg-emerald-400 sm:h-8"
                  >
                    {finalizing ? (
                      <div className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Shield className="size-3.5" />
                    )}
                    {finalizing ? 'Finalizing...' : 'Finalize Attendance'}
                  </Button>
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
              className="bg-white dark:bg-input/30"
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
