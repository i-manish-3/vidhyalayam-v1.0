'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ALL_WEEKDAYS } from '@/lib/weekdays'
import { ChevronLeft, ChevronRight, CalendarDays, PartyPopper } from 'lucide-react'

interface ChildOption {
  id: string
  fullName: string
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
  summary: { total: number; present: number; absent: number; leave: number; late: number; halfDay: number; percentage: number }
}

interface HolidayDay {
  day: number
  name: string
  type: string
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Per-status calendar-cell styling.
const DAY_STATUS: Record<string, { label: string; cell: string; dot: string }> = {
  present: { label: 'Present', cell: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  absent: { label: 'Absent', cell: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  leave: { label: 'Leave', cell: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400', dot: 'bg-sky-500' },
  late: { label: 'Late', cell: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  half_day: { label: 'Half day', cell: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400', dot: 'bg-violet-500' },
}
const HOLIDAY_CELL = 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400'
const OFF_CELL = 'border-border bg-muted/40 text-muted-foreground'

function isSameYmd(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function ParentAttendancePage() {
  const searchParams = useSearchParams()
  const queryStudentId = searchParams.get('studentId')
  const { toast } = useToast()

  const now = new Date()
  const [children, setChildren] = useState<ChildOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [attendance, setAttendance] = useState<StudentAttendance | null>(null)
  const [holidays, setHolidays] = useState<HolidayDay[]>([])
  const [workingDays, setWorkingDays] = useState<string[]>([])
  const [loadingChildren, setLoadingChildren] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

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
        if (!cancelled) toast({ title: "Couldn't load your children", variant: 'destructive' })
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
      const res = await api.get<{ attendance: StudentAttendance[]; holidays: HolidayDay[]; workingDays: string[] }>(
        '/api/parent/attendance',
        { studentId: selectedId, month: String(month), year: String(year) },
      )
      setAttendance(res?.attendance?.[0] || null)
      setHolidays(res?.holidays || [])
      setWorkingDays(res?.workingDays || [])
    } catch {
      toast({ title: "Couldn't load attendance", variant: 'destructive' })
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
  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)

  if (loadingChildren) return <LoadingState />

  if (children.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Attendance" description="Attendance for your children" />
        <EmptyState
          icon={CalendarDays}
          title="No active children"
          description="No active students are linked to your account. Please contact the school administration."
        />
      </div>
    )
  }

  const s = attendance?.summary
  const attByDay = new Map(attendance?.records.map((r) => [r.day, r]) || [])
  const holidayByDay = new Map(holidays.map((h) => [h.day, h]))
  const workingSet = new Set(workingDays.length > 0 ? workingDays : ALL_WEEKDAYS.slice(1)) // default Mon–Sat

  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0 = Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<number | null> = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="space-y-3">
      <PageHeader title="Attendance" description="Monthly attendance for your children" />

      {/* Child + month controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {children.length > 1 ? (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="h-8 w-full text-sm sm:w-56">
              <SelectValue placeholder="Select a child" />
            </SelectTrigger>
            <SelectContent>
              {children.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm font-medium">{children[0]?.fullName}</p>
        )}

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="size-7" onClick={goPrevMonth} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">
            {MONTHS[month - 1]} {year}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={goNextMonth}
            disabled={isCurrentOrFuture}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Slim summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Attendance <span className="text-base font-bold text-foreground">{s?.percentage || 0}%</span>
        </span>
        <span className="text-muted-foreground">Present <span className="font-semibold text-emerald-600">{s?.present || 0}</span></span>
        <span className="text-muted-foreground">Absent <span className="font-semibold text-red-600">{s?.absent || 0}</span></span>
        {(s?.leave || 0) > 0 && <span className="text-muted-foreground">Leave <span className="font-semibold text-sky-600">{s?.leave}</span></span>}
        {(s?.late || 0) > 0 && <span className="text-muted-foreground">Late <span className="font-semibold text-amber-600">{s?.late}</span></span>}
        <span className="ml-auto text-muted-foreground">Teaching days <span className="font-semibold text-foreground">{s?.total || 0}</span></span>
      </div>

      {/* Calendar */}
      <div className="rounded-xl border bg-card p-2 sm:p-3">
        {loadingData ? (
          <div className="flex justify-center py-10">
            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-muted-foreground sm:gap-1.5 sm:text-xs">
              {WEEK_LABELS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {cells.map((day, idx) => {
                if (day === null) return <div key={`b-${idx}`} />
                const date = new Date(year, month - 1, day)
                const weekday = ALL_WEEKDAYS[date.getDay()]
                const isFuture = date > now && !isSameYmd(date, now)
                const isToday = isSameYmd(date, now)
                const att = attByDay.get(day)
                const holiday = holidayByDay.get(day)
                const isOff = !workingSet.has(weekday)

                let cellClass = 'border-border/40 text-muted-foreground/40' // future / no-data default
                let label = ''
                if (att && DAY_STATUS[att.status]) {
                  cellClass = DAY_STATUS[att.status].cell
                  label = DAY_STATUS[att.status].label
                } else if (holiday) {
                  cellClass = HOLIDAY_CELL
                  label = holiday.name
                } else if (isOff) {
                  cellClass = OFF_CELL
                  label = 'Weekly off'
                } else if (!isFuture) {
                  cellClass = 'border-border text-foreground'
                }

                return (
                  <div
                    key={day}
                    title={holiday ? holiday.name : att ? DAY_STATUS[att.status]?.label : isOff ? 'Weekly off' : undefined}
                    className={cn(
                      'flex h-14 flex-col rounded-md border p-1 text-left sm:h-16',
                      cellClass,
                      isToday && 'ring-2 ring-primary/60',
                    )}
                  >
                    <span className="text-xs font-semibold leading-none">{day}</span>
                    {label && (
                      <span className="mt-auto line-clamp-2 text-[9px] font-medium leading-tight sm:text-[10px]">{label}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
        {Object.entries(DAY_STATUS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn('size-2 rounded-full', v.dot)} /> {v.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-violet-500" /> Holiday
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-muted-foreground/50" /> Weekly off
        </span>
      </div>

      {/* Holidays this month */}
      {holidays.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs font-semibold">
            <PartyPopper className="size-3.5 text-violet-500" /> Holidays in {MONTHS[month - 1]}
          </div>
          <ul className="divide-y">
            {[...holidays]
              .filter((h, i, arr) => arr.findIndex((x) => x.name === h.name) === i)
              .map((h) => (
                <li key={`${h.day}-${h.name}`} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  <span className="w-12 shrink-0 font-semibold text-violet-600">{MONTHS[month - 1].slice(0, 3)} {h.day}</span>
                  <span className="min-w-0 flex-1 truncate">{h.name}</span>
                  <span className="shrink-0 text-[10px] capitalize text-muted-foreground">{h.type}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}
