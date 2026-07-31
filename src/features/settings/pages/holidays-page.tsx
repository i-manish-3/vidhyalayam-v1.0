'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, LayoutGrid, List, Loader2, Pencil, PlusCircle, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useEffectiveRole } from '@/hooks/use-effective-role'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DatePicker } from '@/components/date-picker'
import { GradientHero, GradientDialogHeader, GradientEmptyState } from '@/components/shared'
import { cn } from '@/lib/utils'

type Holiday = {
  id: string
  name: string
  type: string
  date: string
  endDate: string | null
  description: string | null
  academicYear: string
}

type HolidayForm = {
  name: string
  type: string
  date: string
  endDate: string
  description: string
  academicYear: string
}

const EMPTY_FORM: HolidayForm = { name: '', type: 'school', date: '', endDate: '', description: '', academicYear: '' }

const TYPE_LABELS: Record<string, string> = { public: 'Public Holiday', school: 'School Holiday', vacation: 'Vacation' }

// List-view row + badge styling. Same hue family as the calendar cells (rose /
// sky / violet) so users can scan the list and match each row visually to its
// month-grid counterpart.
const TYPE_LIST_ROW_STYLES: Record<string, string> = {
  public: 'border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/10',
  school: 'border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/10',
  vacation: 'border-violet-200 bg-violet-50/60 dark:border-violet-500/30 dark:bg-violet-500/10',
}

const TYPE_LIST_ACCENT_STYLES: Record<string, string> = {
  public: 'bg-rose-500 dark:bg-rose-400',
  school: 'bg-sky-500 dark:bg-sky-400',
  vacation: 'bg-violet-500 dark:bg-violet-400',
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  public: 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-100',
  school: 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-100',
  vacation: 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/20 dark:text-violet-100',
}

// Calendar cell tinting per holiday type. Each type gets a distinct hue so the
// month at a glance reads as "this is what's coming up": rose for public
// (national/regional), sky for school-specific, violet for vacations.
const TYPE_CALENDAR_STYLES: Record<string, string> = {
  public: 'bg-rose-50 text-rose-900 ring-1 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-100 dark:ring-rose-500/30',
  school: 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-100 dark:ring-sky-500/30',
  vacation: 'bg-violet-50 text-violet-900 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-100 dark:ring-violet-500/30',
}

// Weekly off (Sun by default) uses a soft slate so it reads as "non-school"
// without competing visually with declared holidays.
const WEEKLY_OFF_STYLE = 'bg-slate-50 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400'

const ALL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DEFAULT_SCHOOLING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ymd(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse academic year string ("2026-2027") into start/end years so we can
// constrain calendar navigation to that academic session.
function parseAcademicYearBounds(year: string): { start: Date; end: Date } | null {
  const m = year.match(/^(\d{4})-(\d{4})$/)
  if (!m) return null
  const startYear = Number(m[1])
  const endYear = Number(m[2])
  // Indian academic year typically runs Apr–Mar.
  return {
    start: new Date(startYear, 3, 1),
    end: new Date(endYear, 2, 31),
  }
}

export function HolidaysPage() {
  const { user, currentSchool, setCurrentSchool } = useAppStore()
  const effectiveRole = useEffectiveRole()
  const { toast } = useToast()
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [academicYear, setAcademicYear] = useState('')
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const [schoolingDialogOpen, setSchoolingDialogOpen] = useState(false)
  const [schoolingDays, setSchoolingDays] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(currentSchool?.workingDays || '[]')
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SCHOOLING_DAYS
    } catch {
      return DEFAULT_SCHOOLING_DAYS
    }
  })
  const [schoolingSaving, setSchoolingSaving] = useState(false)

  const isAdmin = effectiveRole === 'SCHOOL_ADMIN'

  // Effective schooling days drives "weekly off" tinting on the calendar.
  const effectiveSchoolingDays = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(currentSchool?.workingDays || '[]')
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SCHOOLING_DAYS
    } catch {
      return DEFAULT_SCHOOLING_DAYS
    }
  }, [currentSchool?.workingDays])

  useEffect(() => {
    api.get<{ academicYears: string[] }>('/api/school/academic-years').then((res) => {
      const years = res.academicYears ?? []
      setAcademicYears(years)
      if (years.length > 0) setAcademicYear(years[0])
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!academicYear) return
    setLoading(true)
    api.get<{ holidays: Holiday[] }>(`/api/school/holidays?academicYear=${academicYear}`)
      .then((res) => setHolidays(res.holidays ?? []))
      .catch(() => toast({ title: 'Failed to load holidays', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [academicYear, toast])

  // When user switches academic year, snap calendar cursor to the start of
  // that academic session so they see a relevant month right away.
  useEffect(() => {
    if (!academicYear) return
    const bounds = parseAcademicYearBounds(academicYear)
    if (!bounds) return
    const today = new Date()
    // If today is inside the academic year, show current month; otherwise
    // snap to the start of the session.
    const inRange = today >= bounds.start && today <= bounds.end
    setCursor(inRange ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1))
  }, [academicYear])

  // Map YYYY-MM-DD → list of holidays that cover that day (multi-day ranges
  // expand to every day in between, inclusive). Computed once per holidays list.
  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>()
    for (const h of holidays) {
      const start = new Date(h.date)
      start.setHours(0, 0, 0, 0)
      const end = h.endDate ? new Date(h.endDate) : start
      end.setHours(0, 0, 0, 0)
      const cur = new Date(start)
      while (cur <= end) {
        const key = ymd(cur)
        const arr = map.get(key) || []
        arr.push(h)
        map.set(key, arr)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [holidays])

  function openAdd(prefillDate?: string) {
    setEditing(null)
    setForm({ ...EMPTY_FORM, academicYear, date: prefillDate || '' })
    setDialogOpen(true)
  }

  function openEdit(h: Holiday) {
    setEditing(h)
    setForm({
      name: h.name,
      type: h.type,
      date: h.date.slice(0, 10),
      endDate: h.endDate ? h.endDate.slice(0, 10) : '',
      description: h.description ?? '',
      academicYear: h.academicYear,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.date) {
      toast({ title: 'Name and date are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        date: form.date,
        endDate: form.endDate || null,
        description: form.description.trim() || null,
        academicYear: form.academicYear || academicYear,
      }
      if (editing) {
        const res = await api.patch<{ holiday: Holiday }>(`/api/school/holidays/${editing.id}`, payload)
        setHolidays((prev) => prev.map((h) => (h.id === editing.id ? res.holiday : h)))
        toast({ title: 'Holiday updated' })
      } else {
        const res = await api.post<{ holiday: Holiday }>('/api/school/holidays', payload)
        setHolidays((prev) => [...prev, res.holiday].sort((a, b) => a.date.localeCompare(b.date)))
        toast({ title: 'Holiday added' })
      }
      setDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save holiday'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await api.delete(`/api/school/holidays/${id}`)
      setHolidays((prev) => prev.filter((h) => h.id !== id))
      toast({ title: 'Holiday deleted' })
    } catch {
      toast({ title: 'Failed to delete holiday', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  function openSchoolingDialog() {
    try {
      const parsed = JSON.parse(currentSchool?.workingDays || '[]')
      setSchoolingDays(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SCHOOLING_DAYS)
    } catch {
      setSchoolingDays(DEFAULT_SCHOOLING_DAYS)
    }
    setSchoolingDialogOpen(true)
  }

  async function saveSchoolingDays() {
    if (schoolingDays.length === 0) {
      toast({ title: 'Please select at least one schooling day.', variant: 'destructive' })
      return
    }
    setSchoolingSaving(true)
    try {
      const res = await api.patch<{ school: typeof currentSchool }>('/api/school/info', { workingDays: schoolingDays })
      if (res.school) setCurrentSchool(res.school)
      toast({ title: 'Schooling days updated' })
      setSchoolingDialogOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSchoolingSaving(false)
    }
  }

  // ---------- Calendar grid ----------
  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // 6 rows × 7 cols. Start from the Sunday on/before the 1st of the month so
  // the calendar always has the same shape and weekday columns line up.
  const calendarCells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startOffset = first.getDay() // 0 = Sun
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - startOffset)
    const cells: Array<{ date: Date; inMonth: boolean; iso: string }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      cells.push({
        date: d,
        inMonth: d.getMonth() === cursor.getMonth(),
        iso: ymd(d),
      })
    }
    return cells
  }, [cursor])

  const todayIso = ymd(new Date())

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  function goToday() {
    const d = new Date()
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  function handleCellClick(iso: string, dayHolidays: Holiday[]) {
    if (!isAdmin) return
    if (dayHolidays.length > 0) {
      openEdit(dayHolidays[0])
    } else {
      openAdd(iso)
    }
  }

  return (
    <div className="space-y-4">
      <GradientHero
        icon={CalendarDays}
        title="Academic Calendar"
        badge={academicYear || undefined}
        description="Manage holidays and vacation periods for each academic year."
        extraActions={
          <Select value={academicYear} onValueChange={setAcademicYear}>
            <SelectTrigger className="h-10 w-36 border-white/60 bg-white/15 text-white shadow-md backdrop-blur-sm hover:border-white/80 data-[placeholder]:text-white/85 [&_svg]:text-white">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        secondaryAction={
          isAdmin
            ? { label: 'Schooling Days', icon: CalendarRange, onClick: openSchoolingDialog }
            : undefined
        }
        primaryAction={
          isAdmin
            ? { label: 'Add Holiday', icon: PlusCircle, onClick: () => openAdd() }
            : undefined
        }
      />

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardHeader className="border-b border-current/10 px-4 py-3">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><CalendarDays className="size-4" /></span>
            Holidays
          </CardTitle>
          <CardDescription>
            Browse holidays by month grid or list, and manage entries for the selected academic year.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Tabs value={view} onValueChange={(v) => setView(v as 'calendar' | 'list')} className="gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="calendar"><LayoutGrid className="size-3.5" />Calendar</TabsTrigger>
                  <TabsTrigger value="list"><List className="size-3.5" />List</TabsTrigger>
                </TabsList>
                {view === 'calendar' && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={goToday}>Today</Button>
                    <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} aria-label="Next month">
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>

              <TabsContent value="calendar" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{monthLabel}</h3>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-rose-200 ring-1 ring-rose-300 dark:bg-rose-500/40 dark:ring-rose-500/60" />
                      Public
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-sky-200 ring-1 ring-sky-300 dark:bg-sky-500/40 dark:ring-sky-500/60" />
                      School
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-violet-200 ring-1 ring-violet-300 dark:bg-violet-500/40 dark:ring-violet-500/60" />
                      Vacation
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-slate-200 ring-1 ring-slate-300 dark:bg-slate-500/40 dark:ring-slate-500/60" />
                      Weekly Off
                    </span>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-sky-200/80 bg-white/70 shadow-sm dark:border-sky-500/25 dark:bg-card/60">
                  <div className="grid grid-cols-7 border-b bg-sky-100/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground dark:bg-sky-500/10">
                    {WEEKDAY_LABELS.map((d) => (
                      <div key={d} className="px-2 py-2">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {calendarCells.map((cell, idx) => {
                      const dayHolidays = holidaysByDate.get(cell.iso) || []
                      const primaryHoliday = dayHolidays[0]
                      const weekdayName = ALL_WEEKDAYS[cell.date.getDay()]
                      const isWeeklyOff = !effectiveSchoolingDays.includes(weekdayName)
                      const isToday = cell.iso === todayIso

                      const tint = primaryHoliday
                        ? TYPE_CALENDAR_STYLES[primaryHoliday.type] || TYPE_CALENDAR_STYLES.school
                        : isWeeklyOff
                          ? WEEKLY_OFF_STYLE
                          : ''

                      return (
                        <button
                          key={`${cell.iso}-${idx}`}
                          type="button"
                          onClick={() => handleCellClick(cell.iso, dayHolidays)}
                          disabled={!isAdmin && dayHolidays.length === 0}
                          title={
                            primaryHoliday
                              ? `${primaryHoliday.name}${dayHolidays.length > 1 ? ` +${dayHolidays.length - 1} more` : ''}`
                              : isWeeklyOff
                                ? `${weekdayName} — Weekly Off`
                                : isAdmin
                                  ? 'Click to add holiday'
                                  : ''
                          }
                          className={cn(
                            'group relative flex min-h-[88px] flex-col items-stretch border-b border-r p-1.5 text-left transition',
                            // Last column has no right border, last row no bottom border.
                            (idx + 1) % 7 === 0 && 'border-r-0',
                            idx >= 35 && 'border-b-0',
                            !cell.inMonth && 'bg-muted/10',
                            isAdmin && 'cursor-pointer hover:bg-primary/5',
                            !isAdmin && dayHolidays.length === 0 && 'cursor-default',
                            tint,
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={cn(
                                'inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                                !cell.inMonth && 'text-muted-foreground/50',
                                isToday && 'bg-primary text-primary-foreground',
                              )}
                            >
                              {cell.date.getDate()}
                            </span>
                            {dayHolidays.length > 1 && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px]">+{dayHolidays.length - 1}</Badge>
                            )}
                          </div>
                          {primaryHoliday ? (
                            <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight">
                              {primaryHoliday.name}
                            </p>
                          ) : isWeeklyOff && cell.inMonth ? (
                            <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">Off</p>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {holidays.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    No holidays configured for {academicYear}. {isAdmin ? 'Click any date to add one.' : ''}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="list">
                {holidays.length === 0 ? (
                  <GradientEmptyState icon={CalendarDays} title="No holidays added" description={`No holidays configured for ${academicYear}.`} />
                ) : (
                  <div className="space-y-2">
                    {holidays.map((h) => (
                      <div
                        key={h.id}
                        className={cn(
                          'flex items-stretch gap-3 overflow-hidden rounded-xl border p-3 transition',
                          TYPE_LIST_ROW_STYLES[h.type] ?? 'bg-card',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            '-my-3 -ml-3 w-1.5 shrink-0',
                            TYPE_LIST_ACCENT_STYLES[h.type] ?? 'bg-muted-foreground/30',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{h.name}</p>
                            <Badge
                              variant="outline"
                              className={cn('border', TYPE_BADGE_STYLES[h.type] ?? '')}
                            >
                              {TYPE_LABELS[h.type] ?? h.type}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDate(h.date)}
                            {h.endDate && h.endDate !== h.date ? ` – ${formatDate(h.endDate)}` : ''}
                            {h.description ? ` · ${h.description}` : ''}
                          </p>
                        </div>
                        {isAdmin && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(h)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => handleDelete(h.id)} disabled={deleting === h.id}>
                              {deleting === h.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <GradientDialogHeader
            icon={editing ? Pencil : PlusCircle}
            title={editing ? 'Edit Holiday' : 'Add Holiday'}
          />
          <div className="themed-scrollbar grid max-h-[68svh] gap-3 overflow-y-auto bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
            <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. Diwali" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public Holiday</SelectItem>
                  <SelectItem value="school">School Holiday</SelectItem>
                  <SelectItem value="vacation">Vacation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <DatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date <span className="text-muted-foreground">(optional)</span></Label>
                <DatePicker value={form.endDate} onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input placeholder="Short note" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            </div>
            <DialogFooter>
              {editing && isAdmin && (
                <Button
                  variant="ghost"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => { handleDelete(editing.id); setDialogOpen(false) }}
                  disabled={deleting === editing.id}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {editing ? 'Save Changes' : 'Add Holiday'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={schoolingDialogOpen} onOpenChange={setSchoolingDialogOpen}>
        <DialogContent className="overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-lg [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <GradientDialogHeader
            icon={CalendarRange}
            title="Schooling Days"
            description="Choose the days school is open. Attendance and timetable follow this schedule; unselected days appear as weekly off."
          />
          <div className="themed-scrollbar grid max-h-[68svh] gap-3 overflow-y-auto bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
            <div className="space-y-3 py-2">
              <div className="flex flex-wrap gap-2">
                {ALL_WEEKDAYS.map((day) => {
                  const active = schoolingDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSchoolingDays((prev) => active ? prev.filter((d) => d !== day) : [...prev, day])}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/50'}`}
                    >
                      {day.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {schoolingDays.length === 0
                  ? 'No days selected.'
                  : `${schoolingDays.length} schooling day${schoolingDays.length === 1 ? '' : 's'}: ${schoolingDays.join(', ')}`}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSchoolingDialogOpen(false)}>Cancel</Button>
              <Button onClick={saveSchoolingDays} disabled={schoolingSaving}>
                {schoolingSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
