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
import { Card, CardContent } from '@/components/ui/card'
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
  Lock,
  LockOpen,
  MessageSquare,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
  UsersRound,
  X,
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
    <div className="space-y-3 pb-20 sm:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">Employee Attendance</h1>
          <p className="text-xs text-muted-foreground">Record daily teacher and staff attendance</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button variant={mode === 'mark' ? 'default' : 'outline'} size="sm" className="h-9 gap-1.5" onClick={() => setMode('mark')}>
            <ClipboardCheck className="size-4" />
            Mark
          </Button>
          <Button variant={mode === 'view' ? 'default' : 'outline'} size="sm" className="h-9 gap-1.5" onClick={() => setMode('view')}>
            <ClipboardList className="size-4" />
            View
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="grid gap-3 md:grid-cols-[180px_180px_1fr] md:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <DatePicker value={date} onChange={setDate} disableFuture />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Employee Type</Label>
              <Select value={staffType} onValueChange={(value) => setStaffType(value as StaffFilter)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Teachers & Staff</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, employee ID, role..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 pl-8 pr-8 text-sm"
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

      {markedCount > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {[
            { label: 'Total', value: markedCount, icon: UsersRound, color: 'text-foreground', bg: 'bg-primary/10' },
            { label: 'Present', value: presentCount, icon: Check, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
            { label: 'Absent', value: absentCount, icon: X, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40' },
            { label: 'Leave', value: leaveCount, icon: CalendarOff, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
              <div className={cn('size-7 rounded-md flex items-center justify-center shrink-0', item.bg)}>
                <item.icon className={cn('size-3.5', item.color)} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">{item.label}</p>
                <p className={cn('text-base font-bold leading-tight', item.color)}>{item.value}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
            <div className="size-7 rounded-md bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 flex items-center justify-center shrink-0">
              <UserCheck className="size-3.5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Rate</p>
              <p className="text-base font-bold leading-tight text-sky-700 dark:text-sky-300">{attendancePercentage}%</p>
            </div>
          </div>
        </div>
      )}

      <Card className="overflow-hidden shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
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
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => markAll('present')}>
                <Check className="size-3.5" />
                All Present
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => markAll('absent')}>
                <X className="size-3.5" />
                All Absent
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={clearAll}>
                <Eraser className="size-3.5" />
                Clear
              </Button>
            </div>
          )}
        </div>

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
          <div className="divide-y divide-border">
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
                      <Avatar className="size-10 shrink-0 md:size-9">
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
                              'inline-flex h-9 items-center justify-center gap-1 rounded-md border px-2 text-xs font-semibold transition-all md:h-8 md:px-3',
                              isActive
                                ? `${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor}`
                                : markingBlocked
                                  ? 'cursor-not-allowed border-transparent bg-background text-muted-foreground/40'
                                  : 'border-transparent bg-background text-muted-foreground hover:border-border hover:bg-muted',
                            )}
                          >
                            <cfg.icon className="size-3.5" />
                            <span className="hidden lg:inline">{cfg.label}</span>
                            <span className="lg:hidden">{cfg.shortLabel}</span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        disabled={markingBlocked}
                        onClick={() => setExpandedRemark(isRemarkExpanded ? null : key)}
                        className={cn(
                          'inline-flex h-9 items-center justify-center rounded-md transition-colors md:size-8',
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

        <div className="flex flex-col gap-3 border-t bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>P: <strong className="text-foreground">{presentCount}</strong></span>
            <span>A: <strong className="text-foreground">{absentCount}</strong></span>
            <span>L: <strong className="text-foreground">{leaveCount}</strong></span>
            {unmarkedCount > 0 && <span>Unmarked: <strong className="text-foreground">{unmarkedCount}</strong></span>}
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
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setReopenDialogOpen(true)}>
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
                  <Button size="sm" className="h-9 gap-2" onClick={saveAttendance} disabled={saving || people.length === 0}>
                    <Save className="size-3.5" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button size="sm" className="h-9 gap-2 sm:bg-emerald-600 sm:hover:bg-emerald-700" onClick={finalizeAttendance} disabled={finalizing || people.length === 0}>
                    <ShieldCheck className="size-3.5" />
                    {finalizing ? 'Finalizing...' : 'Finalize'}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setMode('mark')}>
              <ClipboardCheck className="size-3.5" />
              Mark Attendance
            </Button>
          )}
        </div>
      </Card>

      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Employee Attendance</DialogTitle>
            <DialogDescription>Enter a reason before unlocking this finalized attendance.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            placeholder="Reason for reopening"
            className="min-h-24"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>Cancel</Button>
            <Button onClick={reopenAttendance} disabled={reopening}>
              {reopening ? 'Reopening...' : 'Reopen Attendance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
