'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingState, EmptyState } from '@/components/shared'
import { DatePicker } from '@/components/date-picker'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { useEffectiveRole } from '@/hooks/use-effective-role'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  CalendarDays,
  CalendarOff,
  Check,
  ClipboardCheck,
  ClipboardList,
  Eraser,
  Loader2,
  Lock,
  LockOpen,
  MessageSquare,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'

type AttendanceStatus = 'present' | 'absent' | 'leave'
type StaffType = 'teacher' | 'staff'
type StaffFilter = 'all' | StaffType
type Mode = 'mark' | 'view'

interface EmployeePerson {
  staffType: StaffType
  staffId: string
  employeeId: string | null
  firstName: string
  lastName: string
  roleLabel: string | null
}

interface EmployeeAttendanceRecord {
  id: string
  staffType: StaffType
  staffId: string
  date: string
  status: AttendanceStatus
  remarks: string | null
  createdAt?: string
  updatedAt?: string
  finalized?: boolean
  finalizedAt?: string | null
  markedByUser?: { id: string; name: string } | null
  finalizedByUser?: { id: string; name: string } | null
  person: EmployeePerson | null
}

const STATUS_CONFIG: Record<AttendanceStatus, {
  label: string
  shortLabel: string
  icon: typeof Check
  bgColor: string
  textColor: string
  borderColor: string
  avatarBg: string
}> = {
  present: {
    label: 'Present',
    shortLabel: 'P',
    icon: Check,
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
    textColor: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-300 dark:border-emerald-700',
    avatarBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  },
  absent: {
    label: 'Absent',
    shortLabel: 'A',
    icon: X,
    bgColor: 'bg-red-50 dark:bg-red-950/50',
    textColor: 'text-red-700 dark:text-red-300',
    borderColor: 'border-red-300 dark:border-red-700',
    avatarBg: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  },
  leave: {
    label: 'Leave',
    shortLabel: 'L',
    icon: CalendarOff,
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    textColor: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-300 dark:border-amber-700',
    avatarBg: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  },
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayString(): string {
  return toLocalDateString(new Date())
}

function personKey(person: Pick<EmployeePerson, 'staffType' | 'staffId'>): string {
  return `${person.staffType}:${person.staffId}`
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function matchesSearch(person: EmployeePerson, query: string): boolean {
  const q = normalize(query)
  if (!q) return true
  return [
    person.firstName,
    person.lastName,
    `${person.firstName} ${person.lastName}`,
    person.employeeId,
    person.roleLabel,
    person.staffType,
  ].some((value) => normalize(value).includes(q))
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose'
}) {
  const styles = {
    sky: {
      card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]',
      icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20',
      accent: 'from-sky-500 via-sky-400',
      bubble: 'bg-sky-500/[0.10]',
    },
    emerald: {
      card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]',
      icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
      accent: 'from-emerald-500 via-emerald-400',
      bubble: 'bg-emerald-500/[0.10]',
    },
    amber: {
      card: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.14] via-card to-amber-500/[0.05]',
      icon: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/20',
      accent: 'from-amber-500 via-amber-400',
      bubble: 'bg-amber-500/[0.10]',
    },
    violet: {
      card: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05]',
      icon: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20',
      accent: 'from-violet-500 via-violet-400',
      bubble: 'bg-violet-500/[0.10]',
    },
    rose: {
      card: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05]',
      icon: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20',
      accent: 'from-rose-500 via-rose-400',
      bubble: 'bg-rose-500/[0.10]',
    },
  }[tone]

  return (
    <Card className={cn('group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div aria-hidden className={cn('absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125', styles.bubble)} />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function EmployeeAttendancePage() {
  const { toast } = useToast()
  const effectiveRole = useEffectiveRole()
  const { hasPermission } = usePermissions()
  const canReopen = effectiveRole === 'SCHOOL_ADMIN' || hasPermission(PERMISSIONS.ATTENDANCE_REOPEN)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const [date, setDate] = useState(todayString())
  const [staffType, setStaffType] = useState<StaffFilter>('all')
  const [mode, setMode] = useState<Mode>('mark')
  const [searchQuery, setSearchQuery] = useState('')

  const [people, setPeople] = useState<EmployeePerson[]>([])
  const [records, setRecords] = useState<EmployeeAttendanceRecord[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceStatus>>(new Map())
  const [remarksMap, setRemarksMap] = useState<Map<string, string>>(new Map())
  const [isFinalized, setIsFinalized] = useState(false)

  const [initialLoad, setInitialLoad] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [expandedRemark, setExpandedRemark] = useState<string | null>(null)
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')

  const isFutureDate = date > todayString()
  const markingBlocked = mode === 'view' || isFutureDate || isFinalized

  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    setExpandedRemark(null)
    try {
      const res = await api.get<{
        people: EmployeePerson[]
        records: EmployeeAttendanceRecord[]
        finalized: boolean
      }>('/api/school/employee-attendance', {
        date,
        staffType,
        academicYear,
        ...(mode === 'view' ? { finalizedOnly: 'true' } : {}),
      })

      const personList = res.people || []
      const recordList = res.records || []
      const statusMap = new Map<string, AttendanceStatus>()
      const remMap = new Map<string, string>()

      recordList.forEach((record) => {
        statusMap.set(`${record.staffType}:${record.staffId}`, record.status)
        if (record.remarks) remMap.set(`${record.staffType}:${record.staffId}`, record.remarks)
      })

      if (mode === 'mark' && !res.finalized && !isFutureDate) {
        personList.forEach((person) => {
          const key = personKey(person)
          if (!statusMap.has(key)) statusMap.set(key, 'absent')
        })
      }

      setPeople(personList)
      setRecords(recordList)
      setAttendanceMap(statusMap)
      setRemarksMap(remMap)
      setIsFinalized(!!res.finalized)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load employee attendance.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setInitialLoad(false)
    }
  }, [academicYear, date, staffType, mode, isFutureDate, toast])

  useEffect(() => {
    fetchAttendance()
  }, [fetchAttendance])

  const visiblePeople = useMemo(
    () => people.filter((person) => matchesSearch(person, searchQuery)),
    [people, searchQuery],
  )

  const recordsByKey = useMemo(
    () => new Map(records.map((record) => [`${record.staffType}:${record.staffId}`, record])),
    [records],
  )

  const presentCount = Array.from(attendanceMap.values()).filter((status) => status === 'present').length
  const absentCount = Array.from(attendanceMap.values()).filter((status) => status === 'absent').length
  const leaveCount = Array.from(attendanceMap.values()).filter((status) => status === 'leave').length
  const markedCount = presentCount + absentCount + leaveCount
  const unmarkedCount = Math.max(people.length - markedCount, 0)
  const attendancePercentage = markedCount > 0 ? Math.round((presentCount / markedCount) * 100) : 0

  const handleStatusChange = (person: EmployeePerson, status: AttendanceStatus) => {
    if (markingBlocked) return
    setAttendanceMap((prev) => {
      const next = new Map(prev)
      next.set(personKey(person), status)
      return next
    })
  }

  const handleRemarkChange = (person: EmployeePerson, remark: string) => {
    if (markingBlocked) return
    setRemarksMap((prev) => {
      const next = new Map(prev)
      const key = personKey(person)
      if (remark.trim()) next.set(key, remark)
      else next.delete(key)
      return next
    })
  }

  const markAll = (status: AttendanceStatus) => {
    if (markingBlocked) return
    const next = new Map<string, AttendanceStatus>()
    people.forEach((person) => next.set(personKey(person), status))
    setAttendanceMap(next)
  }

  const clearAll = () => {
    if (markingBlocked) return
    setAttendanceMap(new Map())
    setRemarksMap(new Map())
    setExpandedRemark(null)
  }

  const saveAttendance = async (): Promise<boolean> => {
    if (saving || people.length === 0 || markingBlocked) return false
    const payload = people
      .filter((person) => attendanceMap.has(personKey(person)))
      .map((person) => {
        const key = personKey(person)
        return {
          staffType: person.staffType,
          staffId: person.staffId,
          status: attendanceMap.get(key),
          remarks: remarksMap.get(key) || undefined,
        }
      })

    if (payload.length === 0) {
      toast({ title: 'Nothing to save', description: 'Please mark at least one employee.' })
      return false
    }

    setSaving(true)
    try {
      await api.post('/api/school/employee-attendance', { date, academicYear, records: payload })
      toast({ title: 'Attendance Saved', description: 'Employee attendance has been saved.' })
      fetchAttendance()
      return true
    } catch (error) {
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save employee attendance.',
        variant: 'destructive',
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  const finalizeAttendance = async () => {
    if (finalizing || markingBlocked || people.length === 0) return
    setFinalizing(true)
    try {
      const saved = await saveAttendance()
      if (!saved) return
      await api.patch('/api/school/employee-attendance', { date, academicYear, staffType, action: 'finalize' })
      toast({ title: 'Attendance Finalized', description: 'Employee attendance is now locked.' })
      setIsFinalized(true)
      fetchAttendance()
    } catch (error) {
      toast({
        title: 'Finalize Failed',
        description: error instanceof Error ? error.message : 'Failed to finalize employee attendance.',
        variant: 'destructive',
      })
    } finally {
      setFinalizing(false)
    }
  }

  const reopenAttendance = async () => {
    if (reopening || !canReopen) return
    if (reopenReason.trim().length < 5) {
      toast({ title: 'Reason Required', description: 'Please enter a clear reason before reopening.', variant: 'destructive' })
      return
    }
    setReopening(true)
    try {
      await api.patch('/api/school/employee-attendance', {
        date,
        academicYear,
        staffType,
        action: 'reopen',
        reason: reopenReason.trim(),
      })
      toast({ title: 'Attendance Reopened', description: 'Employee attendance can be edited again.' })
      setReopenDialogOpen(false)
      setReopenReason('')
      fetchAttendance()
    } catch (error) {
      toast({
        title: 'Reopen Failed',
        description: error instanceof Error ? error.message : 'Failed to reopen employee attendance.',
        variant: 'destructive',
      })
    } finally {
      setReopening(false)
    }
  }

  if (initialLoad) return <LoadingState />

  return (
    <div className="space-y-4 pb-20 sm:pb-0">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <ClipboardCheck className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Employee Attendance</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {people.length.toLocaleString('en-IN')} employees
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Record daily teacher and staff attendance.</p>
          </div>
        </div>
        <div className="relative flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 p-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMode('mark')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all',
              mode === 'mark' ? 'bg-white text-primary shadow-sm' : 'text-white/85 hover:bg-white/15 hover:text-white',
            )}
          >
            <ClipboardCheck className="size-3.5" />Mark
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all',
              mode === 'view' ? 'bg-white text-primary shadow-sm' : 'text-white/85 hover:bg-white/15 hover:text-white',
            )}
          >
            <ClipboardList className="size-3.5" />View
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard title="Marked" value={markedCount} description={unmarkedCount > 0 ? `${unmarkedCount} unmarked` : 'All employees marked'} icon={UsersRound} tone="sky" />
        <StatCard title="Present" value={presentCount} description="On duty today" icon={Check} tone="emerald" />
        <StatCard title="Absent" value={absentCount} description="Not on duty" icon={X} tone="rose" />
        <StatCard title="On Leave" value={leaveCount} description="Approved leave" icon={CalendarOff} tone="amber" />
        <StatCard title="Rate" value={`${attendancePercentage}%`} description="Present of marked" icon={UserCheck} tone="violet" />
      </div>

      {/* Filters */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <SlidersHorizontal className="size-3.5" />
            </span>
            Filters
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-[190px_190px_1fr] md:items-end">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarDays className="size-3.5" />Date
              </Label>
              <DatePicker value={date} onChange={setDate} disableFuture triggerClassName="w-full h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <UsersRound className="size-3.5" />Employee Type
              </Label>
              <Select value={staffType} onValueChange={(value) => setStaffType(value as StaffFilter)}>
                <SelectTrigger className="h-9 bg-white shadow-xs dark:bg-input/30"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Teachers & Staff</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, employee ID, role..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 bg-white pl-8 pr-8 text-sm shadow-xs dark:bg-input/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <UsersRound className="size-4" />
              </span>
              <span className="text-sm font-semibold">{mode === 'mark' ? 'Daily Roster' : 'Finalized Records'}</span>
              <Badge variant="secondary" className="h-5 text-[10px]">{visiblePeople.length}</Badge>
              {isFinalized && (
                <Badge className="h-6 gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <ShieldCheck className="size-3" />
                  Finalized
                </Badge>
              )}
            </div>
            {mode === 'mark' && !isFinalized && !isFutureDate && (
              <div className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-white text-xs shadow-xs dark:bg-input/20" onClick={() => markAll('present')}>
                  <Check className="size-3.5" />
                  All Present
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-white text-xs shadow-xs dark:bg-input/20" onClick={() => markAll('absent')}>
                  <X className="size-3.5" />
                  All Absent
                </Button>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={clearAll}>
                  <Eraser className="size-3.5" />
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        {loading ? (
          <CardContent className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            Loading employee attendance...
          </CardContent>
        ) : people.length === 0 ? (
          <CardContent className="p-8">
            <EmptyState icon={UsersRound} title="No Employees Found" description="No active teachers or staff match this filter." />
          </CardContent>
        ) : visiblePeople.length === 0 ? (
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No employees match &ldquo;{searchQuery}&rdquo;
          </CardContent>
        ) : (
          <div className="divide-y divide-border/70">
            {visiblePeople.map((person, index) => {
              const key = personKey(person)
              const currentStatus = attendanceMap.get(key) || null
              const currentRemark = remarksMap.get(key) || ''
              const record = recordsByKey.get(key)
              const statusConfig = currentStatus ? STATUS_CONFIG[currentStatus] : null
              const isRemarkExpanded = expandedRemark === key

              return (
                <div
                  key={key}
                  className={cn(
                    'px-3 py-3 transition-all sm:px-5',
                    statusConfig && `${statusConfig.bgColor} border-l-2 ${statusConfig.borderColor}`,
                  )}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground md:w-8">
                        {index + 1}
                      </span>
                      <Avatar className="size-10 shrink-0 shadow-sm md:size-9">
                        <AvatarFallback className={cn('text-[11px] font-bold', statusConfig ? statusConfig.avatarBg : 'bg-muted text-muted-foreground')}>
                          {getInitials(person.firstName, person.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight">{person.firstName} {person.lastName}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {person.staffType === 'teacher' ? 'Teacher' : 'Staff'}
                          {person.employeeId ? ` · ${person.employeeId}` : ''}
                          {person.roleLabel ? ` · ${person.roleLabel}` : ''}
                        </p>
                        {mode === 'view' && record?.markedByUser && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            Marked by {record.markedByUser.name}{record.updatedAt ? ` · ${formatDateTime(record.updatedAt)}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 md:flex md:shrink-0 md:items-center md:gap-1">
                      {(Object.entries(STATUS_CONFIG) as [AttendanceStatus, typeof STATUS_CONFIG[AttendanceStatus]][]).map(([status, cfg]) => {
                        const isActive = currentStatus === status
                        return (
                          <button
                            key={status}
                            type="button"
                            disabled={markingBlocked}
                            onClick={() => handleStatusChange(person, status)}
                            className={cn(
                              'inline-flex h-9 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold transition-all md:h-8 md:px-2.5',
                              isActive
                                ? `${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor}`
                                : markingBlocked
                                  ? 'cursor-not-allowed border-transparent bg-background text-muted-foreground/40'
                                  : 'border-transparent bg-background text-muted-foreground hover:border-border hover:bg-muted',
                            )}
                          >
                            <cfg.icon className="size-3.5" />
                            <span>{cfg.shortLabel}</span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        disabled={markingBlocked}
                        onClick={() => setExpandedRemark(isRemarkExpanded ? null : key)}
                        className={cn(
                          'inline-flex h-9 items-center justify-center rounded-lg transition-colors md:size-8',
                          currentRemark ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                          markingBlocked && 'cursor-not-allowed text-muted-foreground/30 hover:bg-transparent',
                        )}
                      >
                        <MessageSquare className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {isRemarkExpanded && !markingBlocked && (
                    <div className="mt-2.5 md:ml-[76px] md:mr-10">
                      <Input
                        placeholder="Add remark"
                        value={currentRemark}
                        onChange={(event) => handleRemarkChange(person, event.target.value)}
                        className="h-8 text-xs"
                        autoFocus
                      />
                    </div>
                  )}
                  {!isRemarkExpanded && currentRemark && (
                    <div className="mt-2 md:ml-[76px] md:mr-10">
                      <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                        <MessageSquare className="size-3 shrink-0" />
                        <span className="truncate">{currentRemark}</span>
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] via-transparent to-violet-500/[0.05] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 dark:border-emerald-700 dark:bg-emerald-950/40"><span className="size-1.5 rounded-full bg-emerald-500" />P <strong className="text-foreground">{presentCount}</strong></span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 dark:border-red-700 dark:bg-red-950/40"><span className="size-1.5 rounded-full bg-red-500" />A <strong className="text-foreground">{absentCount}</strong></span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 dark:border-amber-700 dark:bg-amber-950/40"><span className="size-1.5 rounded-full bg-amber-500" />L <strong className="text-foreground">{leaveCount}</strong></span>
            {unmarkedCount > 0 && <span className="inline-flex items-center gap-1.5 rounded-full border border-muted bg-muted/40 px-2 py-0.5">Unmarked <strong className="text-foreground">{unmarkedCount}</strong></span>}
          </div>
          {mode === 'mark' ? (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              {isFutureDate ? (
                <div className="col-span-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <CalendarDays className="size-3.5" />
                  Future dates cannot be marked
                </div>
              ) : isFinalized ? (
                <>
                  {canReopen && (
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-white text-xs shadow-xs dark:bg-input/20" onClick={() => setReopenDialogOpen(true)}>
                      <LockOpen className="size-3.5" />
                      Reopen
                    </Button>
                  )}
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <Lock className="size-3.5" />
                    Attendance Locked
                  </div>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs text-muted-foreground" onClick={clearAll}>
                    <RotateCcw className="size-3" />
                    Clear All
                  </Button>
                  <Button size="sm" className="h-9 gap-2 text-xs" onClick={saveAttendance} disabled={saving || people.length === 0}>
                    <Save className="size-3.5" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" className="h-9 gap-2 bg-emerald-600 text-xs hover:bg-emerald-700" onClick={finalizeAttendance} disabled={finalizing || people.length === 0}>
                    <ShieldCheck className="size-3.5" />
                    {finalizing ? 'Finalizing...' : 'Finalize'}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-9 gap-1.5 bg-white text-xs shadow-xs dark:bg-input/20" onClick={() => setMode('mark')}>
              <ClipboardCheck className="size-3.5" />
              Mark Attendance
            </Button>
          )}
        </div>
      </Card>

      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-amber-500/20 bg-card p-0 shadow-2xl shadow-amber-500/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#f59e0b_0%,#d97706_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-yellow-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <LockOpen className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Reopen Attendance</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Unlock this finalized attendance to make corrections.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-amber-500/[0.04] via-background to-sky-500/[0.055] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-amber-200/35 blur-xl dark:bg-amber-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm"><MessageSquare className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">Reason for reopening</h3><p className="text-[10px] text-muted-foreground">A clear reason is required before unlocking</p></div>
              </div>
              <Textarea
                value={reopenReason}
                onChange={(event) => setReopenReason(event.target.value)}
                placeholder="Why is this attendance being reopened?"
                className="min-h-24 bg-white shadow-sm dark:bg-input/30"
              />
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setReopenDialogOpen(false)}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={reopenAttendance} disabled={reopening}>
              {reopening ? <Loader2 className="size-3.5 animate-spin" /> : <LockOpen className="size-3.5" />}
              {reopening ? 'Reopening...' : 'Reopen Attendance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
