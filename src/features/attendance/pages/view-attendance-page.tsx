'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
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
import { DatePicker } from '@/components/date-picker'
import {
  Check,
  X,
  CalendarOff,
  ClipboardList,
  ClipboardCheck,
  Search,
  CalendarDays,
  MessageSquare,
  Users,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  UserCheck,
  Camera,
  RefreshCw,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'

// ── Types ──────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'absent' | 'leave'

interface AttendanceRecord {
  id: string
  date: string
  status: AttendanceStatus
  remarks: string | null
  createdAt?: string
  updatedAt?: string
  student: {
    id: string
    firstName: string
    lastName: string
    rollNumber: string
    classId: string
    sectionId: string | null
    class: { name: string }
    section: { name: string } | null
  }
  markedByUser: {
    id: string
    name: string
  } | null
  markedSource?: string | null // 'manual' | 'rfid_kiosk' | 'rfid_webhook'
  finalized?: boolean
  finalizedAt?: string | null
  finalizedByUser?: {
    id: string
    name: string
  } | null
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

const STATUS_CONFIG: Record<string, {
  label: string
  shortLabel: string
  icon: typeof Check
  bgColor: string
  textColor: string
  dotColor: string
  avatarBg: string
  barColor: string
}> = {
  present: {
    label: 'Present',
    shortLabel: 'P',
    icon: Check,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
    avatarBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    barColor: 'bg-emerald-500',
  },
  absent: {
    label: 'Absent',
    shortLabel: 'A',
    icon: X,
    bgColor: 'bg-red-50 dark:bg-red-950/50',
    textColor: 'text-red-700 dark:text-red-300',
    dotColor: 'bg-red-500',
    avatarBg: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
    barColor: 'bg-red-500',
  },
  leave: {
    label: 'Leave',
    shortLabel: 'L',
    icon: CalendarOff,
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    textColor: 'text-amber-700 dark:text-amber-300',
    dotColor: 'bg-amber-500',
    avatarBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    barColor: 'bg-amber-500',
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSubmittedTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatSubmittedDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function getSubmittedAt(record: AttendanceRecord): string | undefined {
  return record.updatedAt || record.createdAt
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

interface ViewAttendanceListState {
  date?: string
  classId?: string
  sectionId?: string
  searchQuery?: string
}

const VIEW_ATTENDANCE_LIST_STATE_KEY = 'attendance:view:list'

function compareRecordsByRollNumber(a: AttendanceRecord, b: AttendanceRecord): number {
  const aRoll = (a.student.rollNumber || '').trim()
  const bRoll = (b.student.rollNumber || '').trim()

  if (aRoll && !bRoll) return -1
  if (!aRoll && bRoll) return 1

  const rollCompare = rollNumberCollator.compare(aRoll, bRoll)
  if (rollCompare !== 0) return rollCompare

  const aName = `${a.student.firstName} ${a.student.lastName}`.trim()
  const bName = `${b.student.firstName} ${b.student.lastName}`.trim()
  return rollNumberCollator.compare(aName, bName)
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchesRecordSearch(record: AttendanceRecord, query: string): boolean {
  const q = normalizeSearchValue(query)
  if (!q) return true

  const firstName = normalizeSearchValue(record.student.firstName)
  const lastName = normalizeSearchValue(record.student.lastName)
  const fullName = normalizeSearchValue(`${record.student.firstName} ${record.student.lastName}`)
  const reverseName = normalizeSearchValue(`${record.student.lastName} ${record.student.firstName}`)
  const rollNumber = normalizeSearchValue(record.student.rollNumber)

  return [firstName, lastName, fullName, reverseName, rollNumber].some((value) => value.includes(q))
}

// ── Component ──────────────────────────────────────────────────────────

export function ViewAttendancePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canMark = hasPermission(PERMISSIONS.ATTENDANCE_MARK)
  const savedListState = useAppStore((s) => s.pageState[VIEW_ATTENDANCE_LIST_STATE_KEY] as ViewAttendanceListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  // Filter state — initial values can come from URL params so the Audit Log
  // page (and any future deep link) can land on a specific date/class/section.
  const [date, setDate] = useState(() => searchParams.get('date') || savedListState?.date || getTodayString())
  const [classId, setClassId] = useState<string>(() => searchParams.get('classId') || savedListState?.classId || '')
  const [sectionId, setSectionId] = useState<string>(() => searchParams.get('sectionId') || savedListState?.sectionId || '')
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')

  // Snapshot mode — when navigated from the Audit Log, ?snapshot=<auditId>
  // tells us to reconstruct the attendance state as it was at that moment
  // rather than showing the current state.
  const [snapshotId, setSnapshotId] = useState<string | null>(() => searchParams.get('snapshot'))
  const [snapshotMeta, setSnapshotMeta] = useState<null | {
    action: string
    capturedAt: string
    capturedByName: string | null
    reason: string | null
    isCurrent: boolean
  }>(null)
  // `effectiveSnapshot` is the user-visible "snapshot mode" — we suppress the
  // banner and re-enable live actions when the audit event being viewed is the
  // most recent and no per-student changes happened after it (i.e. snapshot
  // equals current state, so showing it as historical is misleading).
  const isSnapshot = snapshotId !== null
  const effectiveSnapshot = isSnapshot && snapshotMeta?.isCurrent === false
  const exitSnapshot = () => {
    if (!snapshotId) return
    setSnapshotId(null)
    setSnapshotMeta(null)
  }

  // Data state
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, leave: 0 })

  // Reference data
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [workingDays, setWorkingDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
  const [holidays, setHolidays] = useState<Array<{ id: string; date: string; endDate: string | null; name: string; type: string }>>([])

  // Derived: does the selected class have no sections?
  const classHasNoSections = classId ? sections.filter((s) => s.classId === classId).length === 0 : false

  // UI state
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

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
        toast({ title: 'Error', description: 'Failed to load classes.', variant: 'destructive' })
      } finally {
        setInitialLoad(false)
      }
    }
    init()
  }, [academicYear, toast])

  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : []

  // Fetch attendance records — uses the snapshot endpoint when in snapshot
  // mode (auditId is set) so we render historical state.
  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    try {
      if (snapshotId) {
        const res = await api.get<{
          records: AttendanceRecord[]
          stats: { total: number; present: number; absent: number; leave: number }
          snapshot: { action: string; capturedAt: string; capturedByName: string | null; reason: string | null; isCurrent: boolean }
        }>('/api/school/attendance/snapshot', { auditId: snapshotId })
        setRecords([...(res.records || [])].sort(compareRecordsByRollNumber))
        setStats(res.stats || { total: 0, present: 0, absent: 0, leave: 0 })
        if (res.snapshot) {
          setSnapshotMeta({
            action: res.snapshot.action,
            capturedAt: res.snapshot.capturedAt,
            capturedByName: res.snapshot.capturedByName,
            reason: res.snapshot.reason,
            isCurrent: !!res.snapshot.isCurrent,
          })
        }
        return
      }

      const params: Record<string, string> = { date, academicYear }
      if (classId) params.classId = classId
      // Only include sectionId if the class has sections and one is selected
      if (sectionId && !classHasNoSections) params.sectionId = sectionId

      const res = await api.get<{
        records: AttendanceRecord[]
        stats: { total: number; present: number; absent: number; leave: number }
      }>('/api/school/attendance', params)
      setRecords([...(res.records || [])].sort(compareRecordsByRollNumber))
      setStats(res.stats || { total: 0, present: 0, absent: 0, leave: 0 })
    } catch {
      toast({ title: 'Error', description: 'Failed to load attendance data.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [academicYear, date, classId, sectionId, classHasNoSections, snapshotId, toast])

  useEffect(() => {
    if (initialLoad) return
    if (snapshotId) {
      // Snapshot mode bypasses the class/section gate — the audit row carries
      // the class/section context server-side.
      fetchAttendance()
      return
    }
    if (classId && (sectionId || classHasNoSections)) fetchAttendance()
  }, [date, classId, sectionId, classHasNoSections, initialLoad, snapshotId, fetchAttendance])

  // Any manual filter change exits snapshot mode — snapshots are point-in-time
  // captures, so editing the filters means the user wants live data.
  const rememberListState = (patch: Partial<ViewAttendanceListState>) => {
    setPageState(VIEW_ATTENDANCE_LIST_STATE_KEY, {
      date,
      classId,
      sectionId,
      searchQuery,
      ...patch,
    })
  }

  const handleClassChange = (value: string) => {
    exitSnapshot()
    setClassId(value)
    setSectionId('')
    rememberListState({ classId: value, sectionId: '' })
  }
  const handleSectionChangeWithSnapshot = (value: string) => {
    exitSnapshot()
    setSectionId(value)
    rememberListState({ sectionId: value })
  }
  const handleDateChange = (value: string) => {
    exitSnapshot()
    setDate(value)
    rememberListState({ date: value })
  }
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    rememberListState({ searchQuery: value })
  }

  // Filter records by search
  const filteredRecords = useMemo(() => {
    return records.filter((record) => matchesRecordSearch(record, searchQuery))
  }, [records, searchQuery])

  // Attendance percentage
  const attendancePercentage = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0

  // Group records by class-section
  const groupedRecords = useMemo(() => {
    return filteredRecords.reduce((acc, record) => {
      const key = record.student.section?.name
        ? `${record.student.class?.name || 'Unknown'} — ${record.student.section.name}`
        : `${record.student.class?.name || 'Unknown'} (All Students)`
      if (!acc[key]) acc[key] = []
      acc[key].push(record)
      return acc
    }, {} as Record<string, AttendanceRecord[]>)
  }, [filteredRecords])

  const isToday = date === getTodayString()

  // Non-teaching day check (weekly off / declared holiday). Mirrors the
  // attendance marking page so reviewers know why a date has no records.
  const nonTeachingInfo = useMemo(() => {
    if (!date) return null
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    const weekdayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()]
    if (!workingDays.includes(weekdayName)) {
      return { reason: 'non-working-day' as const, weekdayName, name: '' }
    }
    for (const h of holidays) {
      const start = h.date.slice(0, 10)
      const end = (h.endDate || h.date).slice(0, 10)
      if (date >= start && date <= end) {
        return { reason: 'holiday' as const, weekdayName, name: h.name }
      }
    }
    return null
  }, [date, workingDays, holidays])

  if (initialLoad) return <LoadingState />

  return (
    <div className="space-y-3 pb-20 sm:pb-0">
      {/* ── Snapshot Banner ───────────────────────────────────────────── */}
      {effectiveSnapshot && snapshotMeta && (
        <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/30 shadow-sm">
          <CardContent className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Camera className="size-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    Viewing historical snapshot
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-200 break-words">
                    Attendance as it was at{' '}
                    <span className="font-medium">{formatSubmittedDateTime(snapshotMeta.capturedAt)}</span>
                    {' '}({snapshotMeta.action})
                    {snapshotMeta.capturedByName ? ` by ${snapshotMeta.capturedByName}` : ''}
                    {snapshotMeta.reason ? ` · "${snapshotMeta.reason}"` : ''}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-700"
                onClick={exitSnapshot}
              >
                <RefreshCw className="size-3.5" />
                View Latest
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Non-Teaching Day Banner ───────────────────────────────────── */}
      {nonTeachingInfo && !effectiveSnapshot && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800">
          <div className="size-8 rounded-full bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
            <CalendarDays className="size-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">
              {nonTeachingInfo.reason === 'holiday'
                ? `Holiday: ${nonTeachingInfo.name}`
                : `${nonTeachingInfo.weekdayName} — Weekly Off`}
            </p>
            <p className="text-xs text-sky-700/70 dark:text-sky-400/70 mt-0.5">
              {nonTeachingInfo.reason === 'holiday'
                ? 'This is a declared holiday, so attendance is usually not marked.'
                : `${nonTeachingInfo.weekdayName} is a weekly holiday, so attendance is usually not marked.`}
            </p>
          </div>
        </div>
      )}

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">View Attendance</h1>
            <p className="text-xs text-muted-foreground">
              Review and analyze daily student attendance records
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <Badge variant="outline" className="h-9 w-full justify-center gap-1.5 px-3 text-xs sm:h-7 sm:w-fit">
            <CalendarDays className="size-3.5" />
            {formatDate(date)}
          </Badge>
          {canMark && !effectiveSnapshot && (
            <Button size="sm" onClick={() => router.push('/attendance/mark')} className="h-9 w-full gap-1.5 sm:h-8 sm:w-auto">
              <ClipboardCheck className="size-4" />
              Mark Attendance
            </Button>
          )}
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="grid gap-3 xl:grid-cols-[auto_auto_auto_minmax(220px,1fr)] xl:items-center">
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
              <Button variant="outline" size="icon" className="size-9 shrink-0 sm:size-7" onClick={() => handleDateChange(navigateDate(date, 1))} disabled={isToday}>
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
                  <SelectValue placeholder="Select Class" />
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
                <Select value={sectionId} onValueChange={handleSectionChangeWithSnapshot} disabled={!classId}>
                  <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:w-[150px] sm:text-xs">
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

            {/* Search */}
            <div className="relative min-w-0 xl:justify-self-end xl:w-full xl:max-w-sm">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, roll no..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 pl-8 pr-8 text-sm sm:h-7 sm:text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5 sm:size-3" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats Overview ───────────────────────────────────────────── */}
      {stats.total > 0 && (
        <div className="space-y-2">
          {/* Attendance rate bar - thin */}
          <div className="flex flex-col gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:py-2">
            <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <BarChart3 className="size-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Attendance Rate</span>
                <span className={cn(
                  'text-xs font-bold',
                  attendancePercentage >= 75 ? 'text-emerald-600' :
                  attendancePercentage >= 50 ? 'text-amber-600' : 'text-red-600',
                )}>
                  {attendancePercentage}%
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted mt-1">
                {stats.present > 0 && (
                  <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(stats.present / stats.total) * 100}%` }} />
                )}
                {stats.leave > 0 && (
                  <div className="bg-amber-500 transition-all duration-500" style={{ width: `${(stats.leave / stats.total) * 100}%` }} />
                )}
                {stats.absent > 0 && (
                  <div className="bg-red-500 transition-all duration-500" style={{ width: `${(stats.absent / stats.total) * 100}%` }} />
                )}
              </div>
            </div>
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" /> {stats.present}P
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-red-500" /> {stats.absent}A
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-amber-500" /> {stats.leave}L
              </span>
            </div>
          </div>

          {/* Stat strips - thin */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
            {[
              { label: 'Total', value: stats.total, color: 'text-foreground', bg: 'bg-primary/10', icon: ClipboardList },
              { label: 'Present', value: stats.present, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40', icon: Check },
              { label: 'Absent', value: stats.absent, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40', icon: X },
              { label: 'Leave', value: stats.leave, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40', icon: CalendarOff },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
                <div className={cn('size-7 rounded-md flex items-center justify-center shrink-0', item.bg)}>
                  <item.icon className={cn('size-3.5', item.color)} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none">{item.label}</p>
                  <p className={cn('text-base font-bold leading-tight mt-0.5', item.color)}>{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Records ──────────────────────────────────────────────────── */}
      {loading ? (
        <Card className="shadow-sm">
          <CardContent className="p-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading attendance records...
            </div>
          </CardContent>
        </Card>
      ) : !classId || (!classHasNoSections && !sectionId) ? (
        <EmptyState
          icon={ClipboardList}
          title="Select Class & Section"
          description="Choose a date, class, and section above to view attendance records."
        />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No Attendance Records"
          description="No attendance found for the selected date and filters. Try changing the date or class/section."
        />
      ) : filteredRecords.length === 0 ? (
        <div className="text-center py-12">
          <Search className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No records match &ldquo;{searchQuery}&rdquo;</p>
          <Button variant="link" size="sm" onClick={() => handleSearchChange('')} className="mt-1">
            Clear search
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRecords).map(([groupKey, groupRecords]) => {
            // Group stats
            const gPresent = groupRecords.filter(r => r.status === 'present').length
            const gAbsent = groupRecords.filter(r => r.status === 'absent').length
            const gLeave = groupRecords.filter(r => r.status === 'leave').length
            const gPct = groupRecords.length > 0 ? Math.round((gPresent / groupRecords.length) * 100) : 0

            // Find who submitted attendance for this group (most common markedByUser)
            const markerNames = groupRecords
              .map(r => r.markedByUser?.name)
              .filter((n): n is string => !!n)
            const uniqueMarkers = [...new Set(markerNames)]

            return (
              <Card key={groupKey} className="shadow-sm overflow-hidden">
                {/* Group header */}
                <div className="border-b bg-muted/40 px-3 py-3 sm:px-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Users className="size-4 text-muted-foreground shrink-0" />
                      <h3 className="min-w-0 text-sm font-semibold">{groupKey}</h3>
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {groupRecords.length}
                      </Badge>
                      {uniqueMarkers.length > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5 gap-1 font-normal text-slate-600 dark:text-slate-400">
                          <UserCheck className="size-3" />
                          {uniqueMarkers.join(', ')}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center">
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded">
                        {gPresent} P
                      </span>
                      <span className="text-[11px] font-medium text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded">
                        {gAbsent} A
                      </span>
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded">
                        {gLeave} L
                      </span>
                      <Separator orientation="vertical" className="hidden h-4 sm:block" />
                      <span className={cn(
                        'text-[11px] font-bold',
                        gPct >= 75 ? 'text-emerald-600' : gPct >= 50 ? 'text-amber-600' : 'text-red-600',
                      )}>
                        {gPct}% present
                      </span>
                    </div>
                  </div>
                </div>

                {/* Column headers */}
                <div className="px-5 py-2 bg-muted/20 border-b hidden md:flex items-center gap-3">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8 text-center">#</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-10"></span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">Student Name</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-20 text-center">Roll No</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-28 text-center">Status</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-40 text-center">Submitted</span>
                </div>

                {/* Records */}
                <div className="divide-y divide-border">
                  {groupRecords.map((record, idx) => {
                    const statusConfig = STATUS_CONFIG[record.status] || STATUS_CONFIG.present
                    const submittedAt = getSubmittedAt(record)
                    const submittedTime = formatSubmittedTime(submittedAt)
                    const submittedDateTime = formatSubmittedDateTime(submittedAt)
                    return (
                      <div
                        key={record.id}
                        className={cn(
                          'px-3 py-3 transition-colors hover:bg-muted/20 sm:px-5 md:flex md:items-center md:gap-3 md:py-2.5',
                          record.status !== 'present' && statusConfig.bgColor,
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-3 md:flex-1">
                          {/* Serial number */}
                          <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground md:w-8">
                            {idx + 1}
                          </span>

                          {/* Avatar */}
                          <Avatar className="size-10 shrink-0 md:size-8">
                            <AvatarFallback className={cn(
                              'text-[10px] font-bold',
                              statusConfig.avatarBg,
                            )}>
                              {getInitials(record.student.firstName, record.student.lastName)}
                            </AvatarFallback>
                          </Avatar>

                          {/* Student name + remark */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight md:font-medium">
                              {record.student.firstName} {record.student.lastName}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
                              Roll No. {record.student.rollNumber || '—'}
                            </p>
                            {record.remarks && (
                              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                                <MessageSquare className="size-3 shrink-0" />
                                {record.remarks}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Roll number */}
                        <span className="text-xs font-mono text-muted-foreground w-20 text-center shrink-0 hidden md:block">
                          {record.student.rollNumber || '—'}
                        </span>

                        {/* Status badge */}
                        <div className="mt-3 grid grid-cols-2 gap-2 md:mt-0 md:flex md:w-28 md:shrink-0 md:items-center md:justify-center">
                          <div className={cn(
                            'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold md:h-auto md:py-1',
                            statusConfig.bgColor,
                            statusConfig.textColor,
                          )}>
                            <statusConfig.icon className="size-3" />
                            {statusConfig.label}
                          </div>

                          {(record.markedByUser || record.markedSource === 'rfid_webhook' || record.markedSource === 'auto_default' || record.finalized) && (
                            <div className="flex min-w-0 flex-col gap-0.5 md:hidden">
                              {(record.markedByUser || record.markedSource === 'rfid_webhook' || record.markedSource === 'auto_default') && (
                                <div className="inline-flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md bg-slate-50 px-2 text-[11px] text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                                  <UserCheck className="size-3 shrink-0" />
                                  <span className="truncate">
                                    {record.markedByUser?.name ?? (record.markedSource === 'auto_default' ? 'System default' : 'Gate reader')}
                                  </span>
                                  {record.markedSource && record.markedSource !== 'manual' && (
                                    <span
                                      className={
                                        'ml-1 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ' +
                                        (record.markedSource === 'auto_default'
                                          ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
                                          : 'bg-blue-500/10 text-blue-700 dark:text-blue-300')
                                      }
                                    >
                                      {record.markedSource === 'rfid_webhook'
                                        ? 'RFID·Gate'
                                        : record.markedSource === 'auto_default'
                                          ? 'Auto'
                                          : 'RFID'}
                                    </span>
                                  )}
                                </div>
                              )}
                              {record.finalized && record.finalizedByUser && (
                                <div className="inline-flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md bg-amber-500/10 px-2 text-[11px] text-amber-800 dark:text-amber-200">
                                  <Lock className="size-3 shrink-0" />
                                  <span className="truncate">Finalized · {record.finalizedByUser.name}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Submitted by */}
                        <div className="hidden w-44 shrink-0 items-center justify-center md:flex">
                          {(record.markedByUser || record.markedSource === 'rfid_webhook' || record.markedSource === 'auto_default' || record.finalized) ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex max-w-full flex-col items-stretch gap-0.5">
                                  {(record.markedByUser || record.markedSource === 'rfid_webhook' || record.markedSource === 'auto_default') && (
                                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                                      <UserCheck className="size-3 shrink-0" />
                                      <span className="truncate">
                                        {record.markedByUser?.name ?? (record.markedSource === 'auto_default' ? 'System default' : 'Gate reader')}
                                      </span>
                                      {record.markedSource && record.markedSource !== 'manual' && (
                                        <span
                                          className={
                                            'ml-auto inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ' +
                                            (record.markedSource === 'auto_default'
                                              ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400'
                                              : 'bg-blue-500/10 text-blue-700 dark:text-blue-300')
                                          }
                                        >
                                          {record.markedSource === 'rfid_webhook'
                                            ? 'GATE'
                                            : record.markedSource === 'auto_default'
                                              ? 'AUTO'
                                              : 'RFID'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {record.finalized && record.finalizedByUser && (
                                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-200">
                                      <Lock className="size-3 shrink-0" />
                                      <span className="truncate">{record.finalizedByUser.name}</span>
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="space-y-1.5">
                                  <div>
                                    <strong className="text-xs">Marked: </strong>
                                    <span className="text-xs">
                                      {record.markedSource === 'rfid_kiosk'
                                        ? `Tapped on RFID kiosk by ${record.markedByUser?.name ?? 'unknown'}`
                                        : record.markedSource === 'rfid_webhook'
                                          ? 'Tapped on a networked RFID gate reader'
                                          : record.markedSource === 'auto_default'
                                            ? 'Auto-defaulted to absent (no RFID tap, no manual mark)'
                                            : `${record.markedByUser?.name ?? 'unknown'} (manual)`}
                                      {submittedDateTime ? ` at ${submittedDateTime}` : ''}
                                    </span>
                                  </div>
                                  {record.finalized && record.finalizedByUser && (
                                    <div>
                                      <strong className="text-xs">Finalized: </strong>
                                      <span className="text-xs">
                                        {record.finalizedByUser.name}
                                        {record.finalizedAt ? ` at ${new Date(record.finalizedAt).toLocaleString()}` : ''}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50">—</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
