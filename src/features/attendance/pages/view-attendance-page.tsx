'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
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
import {
  Check,
  X,
  CalendarOff,
  ClipboardList,
  Search,
  CalendarDays,
  MessageSquare,
  Users,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'absent' | 'leave'

interface AttendanceRecord {
  id: string
  date: string
  status: AttendanceStatus
  remarks: string | null
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

function navigateDate(dateStr: string, direction: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + direction)
  return toLocalDateString(date)
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────

export function ViewAttendancePage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)

  // Filter state
  const [academicYear, setAcademicYear] = useState(currentSchoolAcademicYear || getCurrentAcademicYear())
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const [date, setDate] = useState(getTodayString())
  const [classId, setClassId] = useState<string>('')
  const [sectionId, setSectionId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Data state
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0, leave: 0 })

  // Reference data
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears, currentSchoolAcademicYear),
    [availableAcademicYears, currentSchoolAcademicYear]
  )

  // Derived: does the selected class have no sections?
  const classHasNoSections = classId ? sections.filter((s) => s.classId === classId).length === 0 : false

  // UI state
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  // Fetch classes and sections on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [clsRes, secRes, academicYearRes] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes'),
          api.get<{ sections: SectionOption[] }>('/api/school/sections'),
          api.get<{ academicYears: string[] }>('/api/school/academic-years'),
        ])
        setClasses(clsRes.classes || [])
        setSections(secRes.sections || [])
        setAvailableAcademicYears(academicYearRes.academicYears || [])
      } catch {
        toast({ title: 'Error', description: 'Failed to load classes.', variant: 'destructive' })
      } finally {
        setInitialLoad(false)
      }
    }
    init()
  }, [toast])

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === academicYear)) {
      setAcademicYear(academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear())
    }
  }, [academicYear, academicYearOptions, currentSchoolAcademicYear])

  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : []

  // Fetch attendance records
  const fetchAttendance = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { date, academicYear }
      if (classId) params.classId = classId
      // Only include sectionId if the class has sections and one is selected
      if (sectionId && !classHasNoSections) params.sectionId = sectionId

      const res = await api.get<{
        records: AttendanceRecord[]
        stats: { total: number; present: number; absent: number; leave: number }
      }>('/api/school/attendance', params)
      setRecords(res.records || [])
      setStats(res.stats || { total: 0, present: 0, absent: 0, leave: 0 })
    } catch {
      toast({ title: 'Error', description: 'Failed to load attendance data.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [academicYear, date, classId, sectionId, classHasNoSections, toast])

  useEffect(() => {
    if (!initialLoad && classId && (sectionId || classHasNoSections)) fetchAttendance()
  }, [date, classId, sectionId, classHasNoSections, initialLoad, fetchAttendance])

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId('')
  }

  // Filter records by search
  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records
    const q = searchQuery.toLowerCase()
    return records.filter(r =>
      `${r.student.firstName} ${r.student.lastName}`.toLowerCase().includes(q) ||
      r.student.rollNumber.toLowerCase().includes(q) ||
      (r.student.class?.name || '').toLowerCase().includes(q) ||
      (r.student.section?.name || '').toLowerCase().includes(q)
    )
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

  if (initialLoad) return <LoadingState />

  return (
    <div className="space-y-5">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">View Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and analyze daily student attendance records
          </p>
        </div>
        <Badge variant="outline" className="w-fit text-xs h-7 gap-1.5 px-3">
          <CalendarDays className="size-3.5" />
          {formatDate(date)}
        </Badge>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Year</Label>
              <Select value={academicYear} onValueChange={setAcademicYear}>
                <SelectTrigger className="h-7 w-[135px] text-xs">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {academicYearOptions.map((year) => (
                    <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-5" />

            {/* Date navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={() => setDate(navigateDate(date, -1))}>
                <ChevronLeft className="size-3" />
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-7 w-[150px] text-xs"
              />
              <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={() => setDate(navigateDate(date, 1))}>
                <ChevronRight className="size-3" />
              </Button>
              {!isToday && (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => setDate(getTodayString())}>
                  Today
                </Button>
              )}
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-5" />

            {/* Class */}
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Class</Label>
              <Select value={classId} onValueChange={handleClassChange}>
                <SelectTrigger className="h-7 w-[130px] text-xs">
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
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="h-7 text-xs px-3">No Sections</Badge>
              ) : (
                <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                  <SelectTrigger className="h-7 w-[120px] text-xs">
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
            <div className="relative flex-1 min-w-[160px] max-w-sm lg:ml-auto">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
              <Input
                placeholder="Search by name, roll no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-7 h-7 text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
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
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-card shadow-sm">
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
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-3 flex-wrap">
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
          <div className="flex flex-wrap items-stretch gap-2">
            {[
              { label: 'Total', value: stats.total, color: 'text-foreground', bg: 'bg-primary/10', icon: ClipboardList },
              { label: 'Present', value: stats.present, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/40', icon: Check },
              { label: 'Absent', value: stats.absent, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40', icon: X },
              { label: 'Leave', value: stats.leave, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40', icon: CalendarOff },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card shadow-sm">
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
          <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
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
                <div className="px-5 py-3 bg-muted/40 border-b">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-semibold">{groupKey}</h3>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded">
                        {gPresent} P
                      </span>
                      <span className="text-[11px] font-medium text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded">
                        {gAbsent} A
                      </span>
                      <span className="text-[11px] font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded">
                        {gLeave} L
                      </span>
                      <Separator orientation="vertical" className="h-4" />
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
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-32 text-center">Submitted By</span>
                </div>

                {/* Records */}
                <div className="divide-y divide-border">
                  {groupRecords.map((record, idx) => {
                    const statusConfig = STATUS_CONFIG[record.status] || STATUS_CONFIG.present
                    return (
                      <div
                        key={record.id}
                        className={cn(
                          'px-5 py-2.5 flex items-center gap-3 transition-colors hover:bg-muted/20',
                          record.status !== 'present' && statusConfig.bgColor,
                        )}
                      >
                        {/* Serial number */}
                        <span className="text-[11px] font-mono text-muted-foreground w-8 text-center shrink-0">
                          {idx + 1}
                        </span>

                        {/* Avatar */}
                        <Avatar className="size-8 shrink-0">
                          <AvatarFallback className={cn(
                            'text-[10px] font-bold',
                            statusConfig.avatarBg,
                          )}>
                            {getInitials(record.student.firstName, record.student.lastName)}
                          </AvatarFallback>
                        </Avatar>

                        {/* Student name + remark */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate leading-tight">
                            {record.student.firstName} {record.student.lastName}
                          </p>
                          {record.remarks && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                              <MessageSquare className="size-3 shrink-0" />
                              {record.remarks}
                            </p>
                          )}
                        </div>

                        {/* Roll number */}
                        <span className="text-xs font-mono text-muted-foreground w-20 text-center shrink-0 hidden md:block">
                          {record.student.rollNumber || '—'}
                        </span>

                        {/* Status badge */}
                        <div className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold shrink-0',
                          statusConfig.bgColor,
                          statusConfig.textColor,
                        )}>
                          <statusConfig.icon className="size-3" />
                          {statusConfig.label}
                        </div>

                        {/* Submitted by */}
                        <div className="w-32 shrink-0 hidden md:flex items-center justify-center">
                          {record.markedByUser ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-600 dark:text-slate-400 max-w-full">
                                  <UserCheck className="size-3 shrink-0" />
                                  <span className="truncate">{record.markedByUser.name}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>Marked by {record.markedByUser.name}</TooltipContent>
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
