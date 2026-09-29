'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { GradientHero, EmptyState, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ALL_WEEKDAYS } from '@/lib/weekdays'
import {
  CalendarDays,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  CheckCircle2,
  XCircle,
  Clock,
  Coffee,
  AlertCircle,
  Calendar as CalendarIcon,
  Sparkles,
} from 'lucide-react'

interface ChildOption {
  id: string
  fullName: string
  admissionNumber?: string | null
  className?: string | null
  sectionName?: string | null
  isActive: boolean
}

interface AttendanceRecord {
  date: string
  day: number
  status: string
  remarks: string | null
}

interface StudentAttendance {
  studentId: string
  studentName: string
  records: AttendanceRecord[]
  summary: {
    total: number
    present: number
    absent: number
    leave: number
    late: number
    halfDay: number
    percentage: number
  }
}

interface HolidayDay {
  day: number
  name: string
  type: string
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const DAY_STATUS: Record<
  string,
  {
    label: string
    cell: string
    badge: string
    dot: string
    icon: typeof CheckCircle2
  }
> = {
  present: {
    label: 'Present',
    cell: 'border-emerald-500/30 bg-emerald-500/[0.06] hover:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-500/10',
    badge: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  absent: {
    label: 'Absent',
    cell: 'border-rose-500/30 bg-rose-500/[0.06] hover:bg-rose-500/10 text-rose-800 dark:text-rose-300 dark:bg-rose-500/10',
    badge: 'border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    icon: XCircle,
  },
  leave: {
    label: 'Leave',
    cell: 'border-sky-500/30 bg-sky-500/[0.06] hover:bg-sky-500/10 text-sky-800 dark:text-sky-300 dark:bg-sky-500/10',
    badge: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    icon: Coffee,
  },
  late: {
    label: 'Late',
    cell: 'border-amber-500/30 bg-amber-500/[0.06] hover:bg-amber-500/10 text-amber-800 dark:text-amber-300 dark:bg-amber-500/10',
    badge: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: Clock,
  },
  half_day: {
    label: 'Half Day',
    cell: 'border-violet-500/30 bg-violet-500/[0.06] hover:bg-violet-500/10 text-violet-800 dark:text-violet-300 dark:bg-violet-500/10',
    badge: 'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300',
    dot: 'bg-violet-500',
    icon: AlertCircle,
  },
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function isSameYmd(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function ParentAttendancePage() {
  const searchParams = useSearchParams()
  const queryStudentId = searchParams.get('studentId')
  const { toast } = useToast()

  const now = useMemo(() => new Date(), [])
  const [children, setChildren] = useState<ChildOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [attendance, setAttendance] = useState<StudentAttendance | null>(null)
  const [holidays, setHolidays] = useState<HolidayDay[]>([])
  const [workingDays, setWorkingDays] = useState<string[]>([])
  const [loadingChildren, setLoadingChildren] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  // Day detail modal state
  const [selectedDayInfo, setSelectedDayInfo] = useState<{
    day: number
    date: Date
    record?: AttendanceRecord
    holiday?: HolidayDay
    isOff?: boolean
    isFuture?: boolean
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<{ children: ChildOption[] }>('/api/parent/children')
        if (cancelled) return
        const active = (res?.children || []).filter((c) => c.isActive)
        setChildren(active)
        const valid = queryStudentId && active.some((c) => c.id === queryStudentId)
        setSelectedId(valid ? queryStudentId! : active[0]?.id || '')
      } catch {
        if (!cancelled) {
          toast({
            title: "Couldn't load your children",
            description: 'Please refresh the page or try again later.',
            variant: 'destructive',
          })
        }
      } finally {
        if (!cancelled) setLoadingChildren(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [queryStudentId, toast])

  const fetchAttendance = useCallback(async () => {
    if (!selectedId) return
    setLoadingData(true)
    try {
      const res = await api.get<{
        attendance: StudentAttendance[]
        holidays: HolidayDay[]
        workingDays: string[]
      }>('/api/parent/attendance', {
        studentId: selectedId,
        month: String(month),
        year: String(year),
      })
      setAttendance(res?.attendance?.[0] || null)
      setHolidays(res?.holidays || [])
      setWorkingDays(res?.workingDays || [])
    } catch {
      toast({
        title: "Couldn't load attendance records",
        description: 'Unable to fetch monthly attendance details. Please try again.',
        variant: 'destructive',
      })
      setAttendance(null)
      setHolidays([])
    } finally {
      setLoadingData(false)
    }
  }, [selectedId, month, year, toast])

  useEffect(() => {
    void fetchAttendance()
  }, [fetchAttendance])

  const goPrevMonth = () => {
    setMonth((m) => (m === 1 ? 12 : m - 1))
    if (month === 1) setYear((y) => y - 1)
  }

  const goNextMonth = () => {
    setMonth((m) => (m === 12 ? 1 : m + 1))
    if (month === 12) setYear((y) => y + 1)
  }

  const jumpToCurrentMonth = () => {
    setMonth(now.getMonth() + 1)
    setYear(now.getFullYear())
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()
  const isCurrentOrFuture =
    year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedId),
    [children, selectedId],
  )

  if (loadingChildren) return <LoadingState />

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        <GradientHero
          icon={CalendarCheck}
          title="Attendance"
          description="Monthly attendance records and leave history for your children."
        />
        <EmptyState
          icon={CalendarDays}
          title="No active children found"
          description="No active students are currently associated with your parent account. Please contact the school administration office."
        />
      </div>
    )
  }

  const s = attendance?.summary
  const attByDay = new Map(attendance?.records.map((r) => [r.day, r]) || [])
  const holidayByDay = new Map(holidays.map((h) => [h.day, h]))
  const workingSet = new Set(workingDays.length > 0 ? workingDays : ALL_WEEKDAYS.slice(1))

  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const pct = s?.percentage ?? 0
  const pctTone =
    pct >= 85
      ? 'text-emerald-600 dark:text-emerald-400'
      : pct >= 75
        ? 'text-primary'
        : pct >= 60
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-rose-600 dark:text-rose-400'

  return (
    <div className="space-y-5">
      {/* Hero Header */}
      <GradientHero
        icon={CalendarCheck}
        title="Attendance Records"
        description="Monitor daily classroom attendance, leaves, working days, and school holidays."
        badge={s ? `${s.percentage}% Attendance Rate` : undefined}
        gradientClassName="bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#0284c7_100%)]"
      />

      {/* Child Switcher Pills */}
      {children.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="mr-1 shrink-0 text-xs font-semibold text-muted-foreground">
            Child:
          </span>
          {children.map((c) => {
            const active = c.id === selectedId
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-primary/20'
                    : 'border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[9px] font-bold',
                    active
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {initials(c.fullName)}
                </span>
                <span>{c.fullName}</span>
                {c.admissionNumber && (
                  <span
                    className={cn(
                      'font-mono text-[10px] opacity-75',
                      active ? 'text-white/80' : 'text-muted-foreground',
                    )}
                  >
                    #{c.admissionNumber}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Top Toolbar: Selected Child Info & Month Navigator */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-muted/20 p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-inner">
            <CalendarIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-foreground">
                {selectedChild?.fullName}
              </p>
              {selectedChild?.className && (
                <Badge variant="secondary" className="text-[10px] font-medium">
                  {selectedChild.className}
                  {selectedChild.sectionName ? ` - ${selectedChild.sectionName}` : ''}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Viewing attendance register for {MONTHS[month - 1]} {year}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-center">
          {!isCurrentMonth && (
            <Button
              variant="ghost"
              size="sm"
              onClick={jumpToCurrentMonth}
              className="mr-1 h-8 px-2.5 text-xs font-semibold text-primary hover:bg-primary/10"
            >
              This Month
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-lg shadow-xs"
            onClick={goPrevMonth}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>

          <span className="min-w-36 text-center text-sm font-bold tracking-tight text-foreground">
            {MONTHS[month - 1]} {year}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="size-8 rounded-lg shadow-xs"
            onClick={goNextMonth}
            disabled={isCurrentOrFuture}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* KPI Stat Tiles */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Attendance Rate */}
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.07] via-card to-primary/[0.02] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Attendance Rate
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <CalendarCheck className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={cn('text-2xl font-extrabold tracking-tight tabular-nums', pctTone)}>
              {s?.percentage ?? 0}%
            </span>
            <span className="text-xs text-muted-foreground">this month</span>
          </div>
          <Progress value={pct} className="mt-2.5 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            {pct >= 75 ? 'Meets recommended 75% target' : 'Below 75% school threshold'}
          </p>
        </div>

        {/* Present Days */}
        <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-card to-emerald-50/30 p-4 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-card dark:to-emerald-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Present Days
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
              {s?.present ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">
              / {s?.total ?? 0} teaching days
            </span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Active class attendance logged
          </p>
        </div>

        {/* Absent Days */}
        <div className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-card to-rose-50/30 p-4 shadow-sm dark:border-rose-500/20 dark:from-rose-500/10 dark:via-card dark:to-rose-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Absent Days
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
              <XCircle className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={cn(
                'text-2xl font-extrabold tracking-tight tabular-nums',
                (s?.absent ?? 0) > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-foreground',
              )}
            >
              {s?.absent ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">days missed</span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {(s?.leave ?? 0) > 0 ? `${s?.leave} approved medical/casual leave` : 'No formal leaves taken'}
          </p>
        </div>

        {/* Teaching Days & Special info */}
        <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-card to-sky-50/30 p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-500/10 dark:via-card dark:to-sky-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              School Days
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <Clock className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
              {s?.total ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">working sessions</span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {(s?.late ?? 0) > 0 || (s?.halfDay ?? 0) > 0
              ? `${s?.late || 0} late · ${s?.halfDay || 0} half-day`
              : 'Punctual attendance records'}
          </p>
        </div>
      </div>

      {/* Monthly Attendance Calendar */}
      <div className="rounded-2xl border border-border/80 bg-card p-3.5 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Monthly Calendar Grid
            </h2>
            <p className="text-xs text-muted-foreground">
              Click any calendar day to inspect detailed attendance notes or holiday schedule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {s?.present ?? 0} Days Present
            </span>
          </div>
        </div>

        {loadingData ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            <p className="mt-3 text-xs text-muted-foreground">
              Fetching attendance records for {MONTHS[month - 1]}...
            </p>
          </div>
        ) : (
          <>
            {/* Weekday Labels Header */}
            <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground sm:gap-2 sm:text-xs">
              {WEEK_LABELS.map((w, idx) => (
                <div
                  key={w}
                  className={cn(
                    'rounded-lg py-1.5 transition-colors',
                    idx === 0
                      ? 'bg-rose-500/[0.07] text-rose-600 dark:text-rose-400'
                      : 'bg-muted/40 text-muted-foreground',
                  )}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Month Day Cells */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {cells.map((day, idx) => {
                if (day === null) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="min-h-[64px] rounded-xl border border-transparent sm:min-h-[76px]"
                    />
                  )
                }

                const date = new Date(year, month - 1, day)
                const weekday = ALL_WEEKDAYS[date.getDay()]
                const isFuture = date > now && !isSameYmd(date, now)
                const isToday = isSameYmd(date, now)
                const att = attByDay.get(day)
                const holiday = holidayByDay.get(day)
                const isOff = !workingSet.has(weekday)

                let cellStyle =
                  'border-border/60 bg-muted/15 text-muted-foreground/60 hover:bg-muted/30'
                let label = ''
                let badgeClass = ''
                let IconComponent = null

                if (att && DAY_STATUS[att.status]) {
                  const cfg = DAY_STATUS[att.status]
                  cellStyle = cfg.cell
                  label = cfg.label
                  badgeClass = cfg.badge
                  IconComponent = cfg.icon
                } else if (holiday) {
                  cellStyle =
                    'border-violet-500/30 bg-violet-500/[0.08] hover:bg-violet-500/15 text-violet-800 dark:text-violet-300 dark:bg-violet-500/10'
                  label = holiday.name
                  badgeClass =
                    'border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  IconComponent = PartyPopper
                } else if (isOff) {
                  cellStyle =
                    'border-border/50 bg-muted/30 text-muted-foreground/80 hover:bg-muted/40'
                  label = 'Weekly Off'
                  badgeClass = 'bg-muted text-muted-foreground'
                } else if (!isFuture) {
                  cellStyle =
                    'border-border/80 bg-card text-foreground hover:border-primary/40'
                  label = 'No Entry'
                  badgeClass = 'bg-muted/60 text-muted-foreground'
                }

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setSelectedDayInfo({
                        day,
                        date,
                        record: att,
                        holiday,
                        isOff,
                        isFuture,
                      })
                    }
                    className={cn(
                      'group relative flex min-h-[64px] flex-col justify-between rounded-xl border p-1.5 text-left transition-all duration-150 sm:min-h-[76px] sm:p-2',
                      cellStyle,
                      isToday &&
                        'ring-2 ring-primary ring-offset-2 ring-offset-background shadow-xs',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          'text-xs font-bold leading-none sm:text-sm',
                          isToday ? 'text-primary font-black' : '',
                        )}
                      >
                        {day}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-primary px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider text-primary-foreground sm:text-[9px]">
                          Today
                        </span>
                      )}
                      {!isToday && IconComponent && (
                        <IconComponent className="size-3.5 opacity-60 transition group-hover:opacity-100" />
                      )}
                    </div>

                    {label && (
                      <div className="mt-auto">
                        <span
                          className={cn(
                            'block truncate rounded-md px-1 py-0.5 text-[9px] font-semibold leading-tight sm:text-[10px]',
                            badgeClass,
                          )}
                        >
                          {label}
                        </span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 text-xs shadow-xs">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Attendance Legend:
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-foreground">
          {Object.entries(DAY_STATUS).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full shadow-xs', v.dot)} />
              {v.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-violet-500 shadow-xs" />
            Holiday
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/40 shadow-xs" />
            Weekly Off
          </span>
        </div>
      </div>

      {/* Holidays List this Month */}
      {holidays.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/50 via-card to-card shadow-sm dark:border-violet-500/20 dark:from-violet-500/10">
          <div className="flex items-center gap-2.5 border-b border-border/70 bg-violet-500/[0.04] px-4 py-3 sm:px-5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <PartyPopper className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                School Holidays in {MONTHS[month - 1]} {year}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Gazetted and academic scheduled observances
              </p>
            </div>
            <Badge
              variant="outline"
              className="ml-auto border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-semibold"
            >
              {holidays.length} {holidays.length === 1 ? 'Holiday' : 'Holidays'}
            </Badge>
          </div>

          <div className="divide-y divide-border/60">
            {[...holidays]
              .filter((h, i, arr) => arr.findIndex((x) => x.name === h.name) === i)
              .map((h) => (
                <div
                  key={`${h.day}-${h.name}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 transition hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 flex-col items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 font-bold leading-none text-violet-700 dark:text-violet-300">
                      <span className="text-[9px] uppercase tracking-wide text-violet-600/80 dark:text-violet-400/80">
                        {MONTHS[month - 1].slice(0, 3)}
                      </span>
                      <span className="text-xs font-extrabold">{h.day}</span>
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{h.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {MONTHS[month - 1]} {h.day}, {year}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="capitalize text-[10px]">
                    {h.type || 'Holiday'}
                  </Badge>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Day Details Modal (follows AGENTS.md dialog convention!) */}
      <Dialog
        open={!!selectedDayInfo}
        onOpenChange={(open) => {
          if (!open) setSelectedDayInfo(null)
        }}
      >
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div
              aria-hidden
              className="absolute -right-8 -top-12 size-36 rounded-full border-[18px] border-white/10"
            />
            <div
              aria-hidden
              className="absolute -bottom-8 right-16 size-24 rounded-full bg-cyan-300/20 blur-2xl"
            />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
                <CalendarCheck className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-white">
                  Daily Attendance Log
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  {selectedDayInfo
                    ? `${MONTHS[month - 1]} ${selectedDayInfo.day}, ${year} (${WEEK_LABELS[selectedDayInfo.date.getDay()]})`
                    : 'Attendance details'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.055] p-4 sm:p-5">
            {selectedDayInfo && (
              <>
                {/* Status overview tile */}
                <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        Student
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {selectedChild?.fullName}
                      </p>
                    </div>
                    {selectedDayInfo.record && DAY_STATUS[selectedDayInfo.record.status] ? (
                      <Badge
                        className={cn(
                          'text-xs font-bold capitalize',
                          DAY_STATUS[selectedDayInfo.record.status].badge,
                        )}
                      >
                        {DAY_STATUS[selectedDayInfo.record.status].label}
                      </Badge>
                    ) : selectedDayInfo.holiday ? (
                      <Badge className="border-violet-500/30 bg-violet-500/15 text-violet-700 dark:text-violet-300 text-xs font-bold">
                        School Holiday
                      </Badge>
                    ) : selectedDayInfo.isOff ? (
                      <Badge variant="secondary" className="text-xs font-semibold">
                        Weekly Off
                      </Badge>
                    ) : selectedDayInfo.isFuture ? (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Future Date
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        No Session Recorded
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Holiday description */}
                {selectedDayInfo.holiday && (
                  <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-4 dark:border-violet-500/20 dark:bg-violet-500/10">
                    <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
                      <PartyPopper className="size-4" />
                      <h4 className="text-sm font-bold">{selectedDayInfo.holiday.name}</h4>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Type: <span className="capitalize font-semibold">{selectedDayInfo.holiday.type}</span>
                    </p>
                  </div>
                )}

                {/* Remarks & Notes */}
                <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <Sparkles className="size-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Teacher Remarks & Notes
                    </h4>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-foreground">
                    {selectedDayInfo.record?.remarks ||
                      (selectedDayInfo.holiday
                        ? `School closed on account of ${selectedDayInfo.holiday.name}.`
                        : selectedDayInfo.isOff
                          ? 'School regular weekly holiday.'
                          : selectedDayInfo.record?.status === 'present'
                            ? 'Student attended regular instructional sessions.'
                            : selectedDayInfo.record?.status === 'absent'
                              ? 'Absence recorded by class teacher.'
                              : 'No special remarks recorded for this day.')}
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-4 text-xs font-medium"
              onClick={() => setSelectedDayInfo(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
