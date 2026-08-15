'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, LoadingState } from '@/components/shared'
import { ChevronLeft, ChevronRight, Printer, CalendarDays, UserSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { printReport } from './report-print'
import { type SharedReportProps } from './types'
import { STATUS_CONFIG, type AttendanceStatus } from '@/features/attendance/lib/status-config'

interface StudentOption { id: string; fullName: string; rollNumber: string | null }
interface CalendarEntry { date: string; status: string; remarks: string | null }
interface CalendarData {
  student: { id: string; name: string; rollNumber: string | null; className: string | null; sectionName: string | null }
  month: string
  entries: CalendarEntry[]
  summary: { present: number; absent: number; leave: number; late: number; half_day: number; total: number; percent: number }
}

const ENDPOINT = '/api/school/attendance/reports/calendar'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function CalendarTab({
  filters,
  externalStudentId,
}: {
  filters: SharedReportProps
  externalStudentId: string | null
}) {
  const { toast } = useToast()
  const { academicYear, school, classes, sections } = filters

  const [classId, setClassId] = useState(filters.classId)
  const [sectionId, setSectionId] = useState(filters.sectionId)
  const [studentId, setStudentId] = useState<string>(externalStudentId || '')
  const [month, setMonth] = useState(currentMonth())

  const [students, setStudents] = useState<StudentOption[]>([])
  const [data, setData] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(false)

  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : []
  const classHasNoSections = classId ? filteredSections.length === 0 : false

  // When parent pushes a student (from Monthly Summary row click), adopt it.
  useEffect(() => {
    if (externalStudentId) {
      setStudentId(externalStudentId)
      setClassId(filters.classId)
      setSectionId(filters.sectionId)
    }
  }, [externalStudentId, filters.classId, filters.sectionId])

  // Load the student dropdown for the chosen class/section.
  useEffect(() => {
    if (!classId) { setStudents([]); return }
    let cancelled = false
    const run = async () => {
      try {
        const p: Record<string, string> = { academicYear, classId, limit: '500' }
        if (sectionId) p.sectionId = sectionId
        const res = await api.get<{ students: StudentOption[] }>('/api/school/students', p)
        if (!cancelled) setStudents(res.students || [])
      } catch {
        if (!cancelled) setStudents([])
      }
    }
    run()
    return () => { cancelled = true }
  }, [academicYear, classId, sectionId])

  const fetchCalendar = useCallback(async () => {
    if (!studentId) { setData(null); return }
    setLoading(true)
    try {
      const res = await api.get<CalendarData>(ENDPOINT, { academicYear, studentId, month })
      setData(res)
    } catch {
      toast({ title: 'Error', description: 'Failed to load calendar.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [academicYear, studentId, month, toast])

  useEffect(() => { fetchCalendar() }, [fetchCalendar])

  const handleClassChange = (v: string) => { setClassId(v); setSectionId(''); setStudentId('') }
  const handleSectionChange = (v: string) => { setSectionId(v); setStudentId('') }

  // Build a calendar grid: leading blanks for the 1st's weekday, then day cells.
  const grid = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1).getDay()
    const daysInMonth = new Date(y, m, 0).getDate()
    const statusByDay = new Map<number, string>()
    if (data) {
      for (const e of data.entries) {
        const day = Number(e.date.split('-')[2])
        statusByDay.set(day, e.status)
      }
    }
    const cells: ({ day: number; status: string | null } | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, status: statusByDay.get(d) ?? null })
    return cells
  }, [month, data])

  const handlePrint = () => {
    if (!data) return
    const [y, m] = month.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1).getDay()
    const daysInMonth = new Date(y, m, 0).getDate()
    const statusByDay = new Map<number, string>()
    for (const e of data.entries) statusByDay.set(Number(e.date.split('-')[2]), e.status)

    const headCells = WEEKDAYS.map((d) => `<div class="cal-head">${d}</div>`).join('')
    const dayCells: string[] = []
    for (let i = 0; i < firstDay; i++) dayCells.push('<div class="cal-cell"></div>')
    for (let d = 1; d <= daysInMonth; d++) {
      const st = statusByDay.get(d)
      const label = st ? STATUS_CONFIG[st as AttendanceStatus]?.label ?? st : ''
      dayCells.push(`<div class="cal-cell"><div class="day">${d}</div>${st ? `<span class="st">${label}</span>` : ''}</div>`)
    }
    const bodyHtml = `<div class="cal-grid">${headCells}${dayCells.join('')}</div>
      <p style="margin-top:14px;font-size:11px;">
        Present: ${data.summary.present} &nbsp; Absent: ${data.summary.absent} &nbsp;
        Leave: ${data.summary.leave} &nbsp; Total: ${data.summary.total} &nbsp;
        <b>${data.summary.percent}%</b>
      </p>`

    printReport({
      school,
      title: 'Attendance Calendar',
      meta: [
        `${data.student.name} (Roll ${data.student.rollNumber || '—'})`,
        `${data.student.className || ''}${data.student.sectionName ? ' — ' + data.student.sectionName : ''}`,
        monthLabel(month),
      ],
      bodyHtml,
    })
  }

  return (
    <div className="space-y-4">
      {/* Tab-specific selectors */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 shadow-sm">
        <CardHeader className="flex-row items-center gap-2 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.06] px-4 py-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
            <UserSearch className="size-3" />
          </span>
          <CardTitle className="text-sm font-semibold">Student Selector</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Class</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="flex h-8 w-full items-center px-3 text-xs">No Sections</Badge>
              ) : (
                <Select value={sectionId} onValueChange={handleSectionChange} disabled={!classId}>
                  <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {filteredSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Student</Label>
              <Select value={studentId} onValueChange={setStudentId} disabled={!classId || students.length === 0}>
                <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.rollNumber ? `${s.rollNumber} · ` : ''}{s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center gap-2">
                <Button variant="outline" size="icon" className="size-8 shrink-0 bg-white shadow-sm dark:bg-input/20" onClick={() => setMonth(shiftMonth(month, -1))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="flex-1 text-center text-sm font-medium">{monthLabel(month)}</span>
                <Button
                  variant="outline" size="icon" className="size-8 shrink-0 bg-white shadow-sm dark:bg-input/20"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                  disabled={month >= currentMonth()}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!studentId ? (
        <EmptyState icon={UserSearch} title="Select a student" description="Pick a class, section and student — or click 'View' on a row in the Monthly Summary tab." />
      ) : loading ? (
        <LoadingState />
      ) : !data ? (
        <EmptyState icon={CalendarDays} title="No data" description="No attendance found for this student in the selected month." />
      ) : (
        <div className="space-y-4">
          {/* Student header + print */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] via-transparent to-violet-500/[0.06] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <CalendarDays className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{data.student.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Roll {data.student.rollNumber || '—'} · {data.student.className || ''}
                  {data.student.sectionName ? ` — ${data.student.sectionName}` : ''}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 gap-1.5 bg-white shadow-sm dark:bg-input/20">
              <Printer className="size-4" /> Print
            </Button>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2">
            {(['present', 'absent', 'leave'] as AttendanceStatus[]).map((st) => (
              <Badge key={st} variant="secondary" className={cn('gap-1', STATUS_CONFIG[st].bgColor, STATUS_CONFIG[st].textColor)}>
                {STATUS_CONFIG[st].label}: {data.summary[st]}
              </Badge>
            ))}
            <Badge variant="outline">Total: {data.summary.total}</Badge>
            <Badge className="bg-primary text-primary-foreground">{data.summary.percent}%</Badge>
          </div>

          {/* Calendar grid */}
          <Card className="gap-0 overflow-hidden rounded-xl border-sky-500/15 shadow-sm">
            <CardHeader className="flex-row items-center gap-2 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.06] px-4 py-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <CalendarDays className="size-3" />
              </span>
              <CardTitle className="text-sm font-semibold">{monthLabel(month)}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">{d}</div>
                ))}
                {grid.map((cell, i) => {
                  if (!cell) return <div key={`blank-${i}`} />
                  const cfg = cell.status ? STATUS_CONFIG[cell.status as AttendanceStatus] : null
                  return (
                    <div
                      key={cell.day}
                      className={cn(
                        'flex min-h-[52px] flex-col rounded-md border p-1.5 text-xs transition-colors hover:border-sky-500/25',
                        cfg ? cfg.bgColor : 'bg-muted/30',
                      )}
                    >
                      <div className="font-medium">{cell.day}</div>
                      {cfg && (
                        <span className={cn('mt-1 inline-block self-start rounded px-1 py-0.5 text-[9px] font-semibold', cfg.textColor)}>
                          {cfg.shortLabel}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
