'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DatePicker } from '@/components/date-picker'
import { EmptyState, LoadingState } from '@/components/shared'
import { BarChart3, Lock, Filter } from 'lucide-react'
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
  const permissionsLoaded = useAppStore((s) => s.permissionsLoaded)
  const currentSchool = useAppStore((s) => s.currentSchool)
  const isAdmin = user?.role === 'SCHOOL_ADMIN'
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
    <div className="space-y-3 pb-20 sm:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight leading-tight flex items-center gap-2">
          <BarChart3 className="size-5" />
          Attendance Reports
        </h1>
        <p className="text-xs text-muted-foreground">
          Monthly summaries, daily trends, per-student calendars and defaulters — with CSV &amp; print export.
        </p>
      </div>

      {/* Shared filters */}
      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{academicYear}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
              <DatePicker value={dateFrom} onChange={setDateFrom} triggerClassName="h-9 w-full justify-start text-sm sm:h-8" />
            </div>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
              <DatePicker value={dateTo} onChange={setDateTo} triggerClassName="h-9 w-full justify-start text-sm sm:h-8" />
            </div>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Class</Label>
              <Select value={classId || ALL} onValueChange={handleClassChange}>
                <SelectTrigger className="h-9 w-full text-sm sm:h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="flex h-9 w-full items-center px-3 text-sm sm:h-8">No Sections</Badge>
              ) : (
                <Select value={sectionId || ALL} onValueChange={handleSectionChange} disabled={!classId}>
                  <SelectTrigger className="h-9 w-full text-sm sm:h-8"><SelectValue placeholder="All sections" /></SelectTrigger>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="monthly-summary">Monthly Summary</TabsTrigger>
          <TabsTrigger value="daily-summary">Daily Summary</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly-summary" className="mt-3">
          <MonthlySummaryTab filters={filters} onViewCalendar={handleViewCalendar} />
        </TabsContent>
        <TabsContent value="daily-summary" className="mt-3">
          <DailySummaryTab filters={filters} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-3">
          <CalendarTab filters={filters} externalStudentId={calendarStudentId} />
        </TabsContent>
        <TabsContent value="defaulters" className="mt-3">
          <DefaultersTab filters={filters} onViewCalendar={handleViewCalendar} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
