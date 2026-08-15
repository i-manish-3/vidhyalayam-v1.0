'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useEffectiveRole } from '@/hooks/use-effective-role'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePicker } from '@/components/date-picker'
import { EmptyState, LoadingState } from '@/components/shared'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Filter,
  GraduationCap,
  Lock,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { MonthlySummaryTab } from '@/features/attendance/components/reports/monthly-summary-tab'
import { DailySummaryTab } from '@/features/attendance/components/reports/daily-summary-tab'
import { CalendarTab } from '@/features/attendance/components/reports/calendar-tab'
import { DefaultersTab } from '@/features/attendance/components/reports/defaulters-tab'
import type { ClassOption, SectionOption, SharedReportProps } from '@/features/attendance/components/reports/types'

const ALL = '__all__'

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthRange(): { from: string; to: string } {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: toLocalDateString(first), to: toLocalDateString(now) }
}

function last30DaysRange(): { from: string; to: string } {
  const now = new Date()
  const past = new Date()
  past.setDate(now.getDate() - 30)
  return { from: toLocalDateString(past), to: toLocalDateString(now) }
}

export function AttendanceReportsPage() {
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const user = useAppStore((s) => s.user)
  const effectiveRole = useEffectiveRole()
  const permissionsLoaded = useAppStore((s) => s.permissionsLoaded)
  const currentSchool = useAppStore((s) => s.currentSchool)
  const isAdmin = effectiveRole === 'SCHOOL_ADMIN'
  const canView = isAdmin || hasPermission(PERMISSIONS.ATTENDANCE_REPORT_VIEW)

  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchool?.academicYear || getCurrentAcademicYear()

  const defaults = monthRange()
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [initialLoad, setInitialLoad] = useState(true)

  const [activeTab, setActiveTab] = useState('monthly-summary')
  const [calendarStudentId, setCalendarStudentId] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      try {
        const [clsRes, secRes] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes'),
          api.get<{ sections: SectionOption[] }>('/api/school/sections'),
        ])
        setClasses(clsRes.classes || [])
        setSections(secRes.sections || [])
      } catch {
        toast({ title: 'Error', description: 'Failed to load classes.', variant: 'destructive' })
      } finally {
        setInitialLoad(false)
      }
    }
    init()
  }, [toast])

  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : []
  const classHasNoSections = classId ? filteredSections.length === 0 : false

  const handleClassChange = (v: string) => {
    setClassId(v === ALL ? '' : v)
    setSectionId('')
  }
  const handleSectionChange = (v: string) => setSectionId(v === ALL ? '' : v)

  const handleViewCalendar = (studentId: string) => {
    setCalendarStudentId(studentId)
    setActiveTab('calendar')
  }

  const setQuickRange = (range: { from: string; to: string }) => {
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  const clearFilters = () => {
    setDateFrom(defaults.from)
    setDateTo(defaults.to)
    setClassId('')
    setSectionId('')
  }

  const hasActiveFilters =
    !!classId || !!sectionId || dateFrom !== defaults.from || dateTo !== defaults.to

  const filters: SharedReportProps = {
    academicYear,
    school: currentSchool,
    classes,
    sections,
    dateFrom,
    dateTo,
    classId,
    sectionId,
  }

  if (initialLoad) return <LoadingState />

  if (permissionsLoaded && !canView) {
    return (
      <EmptyState
        icon={Lock}
        title="Access restricted"
        description="You don't have permission to view attendance reports. Ask a school administrator for the 'attendance:report:view' permission."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Branded Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -top-14 right-1/3 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-1/4 size-28 rounded-full bg-amber-300/10 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
            <BarChart3 className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Attendance Reports</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {academicYear}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Monthly summaries, daily trends, per-student calendars and defaulters — with CSV &amp; print export.
            </p>
          </div>
        </div>
      </section>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 gap-1 bg-muted/50 p-1 sm:inline-flex sm:w-auto">
          <TabsTrigger value="monthly-summary" className="h-8 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <BarChart3 className="size-3.5" />
            Monthly
          </TabsTrigger>
          <TabsTrigger value="daily-summary" className="h-8 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <CalendarDays className="size-3.5" />
            Daily
          </TabsTrigger>
          <TabsTrigger value="calendar" className="h-8 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <CalendarRange className="size-3.5" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="defaulters" className="h-8 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-teal-600 data-[state=active]:to-cyan-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <AlertTriangle className="size-3.5" />
            Defaulters
          </TabsTrigger>
        </TabsList>

        {/* ── Configuration Bar ─────────────────────────────────────── */}
        <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
          <CardContent className="p-3">
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {/* From */}
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
                <DatePicker
                  value={dateFrom}
                  onChange={setDateFrom}
                  disableFuture
                  showQuickActions
                  placeholder="Any date"
                  triggerClassName="h-10 w-full justify-start bg-white px-2.5 text-sm dark:bg-input/30 sm:h-9 sm:text-xs"
                />
              </div>

              {/* To */}
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
                <DatePicker
                  value={dateTo}
                  onChange={setDateTo}
                  disableFuture
                  showQuickActions
                  placeholder="Any date"
                  triggerClassName="h-10 w-full justify-start bg-white px-2.5 text-sm dark:bg-input/30 sm:h-9 sm:text-xs"
                />
              </div>

              {/* Class */}
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Class</Label>
                <Select value={classId || ALL} onValueChange={handleClassChange}>
                  <SelectTrigger
                    leadingIcon={<GraduationCap className="size-3.5 text-white" />}
                    leadingIconClassName="from-sky-500 to-cyan-600"
                    className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
                    <SelectItem value={ALL}>All classes</SelectItem>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Section */}
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Section</Label>
                {classHasNoSections && classId ? (
                  <Badge variant="secondary" className="flex h-10 w-full items-center gap-2 border border-violet-200 bg-violet-50 px-3 text-sm text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300 sm:h-9 sm:text-xs">
                    <ClipboardList className="size-3.5" /> No Sections
                  </Badge>
                ) : (
                  <Select value={sectionId || ALL} onValueChange={handleSectionChange} disabled={!classId}>
                    <SelectTrigger
                      leadingIcon={<ClipboardList className="size-3.5 text-white" />}
                      leadingIconClassName="from-violet-500 to-purple-600"
                      className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 disabled:opacity-60 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:text-xs"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                      <SelectItem value={ALL}>All sections</SelectItem>
                      {filteredSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Quick filters */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Filter className="size-3" />
                  Quick:
                </span>
                <QuickFilter active={dateFrom === defaults.from && dateTo === defaults.to} tone="success" onClick={() => setQuickRange(monthRange())}>
                  This month
                </QuickFilter>
                <QuickFilter active={dateFrom === last30DaysRange().from && dateTo === last30DaysRange().to} tone="warn" onClick={() => setQuickRange(last30DaysRange())}>
                  Last 30 days
                </QuickFilter>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="monthly-summary" className="mt-0">
          <MonthlySummaryTab filters={filters} onViewCalendar={handleViewCalendar} />
        </TabsContent>
        <TabsContent value="daily-summary" className="mt-0">
          <DailySummaryTab filters={filters} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-0">
          <CalendarTab filters={filters} externalStudentId={calendarStudentId} />
        </TabsContent>
        <TabsContent value="defaulters" className="mt-0">
          <DefaultersTab filters={filters} onViewCalendar={handleViewCalendar} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function QuickFilter({
  active,
  onClick,
  tone = 'neutral',
  children,
}: {
  active: boolean
  onClick: () => void
  tone?: 'neutral' | 'success' | 'warn' | 'error'
  children: React.ReactNode
}) {
  const activeClasses = {
    neutral: 'bg-primary text-primary-foreground hover:bg-primary/90',
    success: 'bg-emerald-600 text-white hover:bg-emerald-600/90',
    warn: 'bg-amber-500 text-white hover:bg-amber-500/90',
    error: 'bg-rose-500 text-white hover:bg-rose-500/90',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-0.5 text-[11px] font-medium transition',
        active ? activeClasses : 'border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}