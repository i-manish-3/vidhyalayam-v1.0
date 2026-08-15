'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useEffectiveRole } from '@/hooks/use-effective-role'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePicker } from '@/components/date-picker'
import { EmptyState, LoadingState } from '@/components/shared'
import { BarChart3, Lock, SlidersHorizontal } from 'lucide-react'
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
    <div className="space-y-3">
      {/* ── Gradient header banner ─────────────────────────────────── */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <BarChart3 className="size-5.5" strokeWidth={1.8} />
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
      </div>

      {/* ── Shared filters card ───────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-2 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.06] px-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <SlidersHorizontal className="size-4" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold">Filters</CardTitle>
              <p className="text-[10px] text-muted-foreground">Date range and class scope</p>
            </div>
          </div>
          <Badge variant="secondary" className="hidden px-2 py-0.5 text-[10px] sm:inline-flex">{academicYear}</Badge>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">From</Label>
              <DatePicker value={dateFrom} onChange={setDateFrom} triggerClassName="h-8 w-full justify-start bg-white text-xs shadow-xs dark:bg-input/20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">To</Label>
              <DatePicker value={dateTo} onChange={setDateTo} triggerClassName="h-8 w-full justify-start bg-white text-xs shadow-xs dark:bg-input/20" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Class</Label>
              <Select value={classId || ALL} onValueChange={handleClassChange}>
                <SelectTrigger className="h-8 w-full bg-white text-xs shadow-xs dark:bg-input/20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Section</Label>
              {classHasNoSections && classId ? (
                <div className="flex h-8 w-full items-center rounded-md border border-dashed border-muted-foreground/25 bg-muted/20 px-3 text-xs text-muted-foreground">No sections</div>
              ) : (
                <Select value={sectionId || ALL} onValueChange={handleSectionChange} disabled={!classId}>
                  <SelectTrigger className="h-8 w-full bg-white text-xs shadow-xs dark:bg-input/20"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sections</SelectItem>
                    {filteredSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="monthly-summary">Monthly Summary</TabsTrigger>
          <TabsTrigger value="daily-summary">Daily Summary</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly-summary" className="mt-4">
          <MonthlySummaryTab filters={filters} onViewCalendar={handleViewCalendar} />
        </TabsContent>
        <TabsContent value="daily-summary" className="mt-4">
          <DailySummaryTab filters={filters} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <CalendarTab filters={filters} externalStudentId={calendarStudentId} />
        </TabsContent>
        <TabsContent value="defaulters" className="mt-4">
          <DefaultersTab filters={filters} onViewCalendar={handleViewCalendar} />
        </TabsContent>
      </Tabs>
    </div>
  )
}