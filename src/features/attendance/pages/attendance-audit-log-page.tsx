'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useEffectiveRole } from '@/hooks/use-effective-role'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/date-picker'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Filter,
  GraduationCap,
  History,
  Lock,
  Unlock,
  User,
  UserRound,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { STATUS_CONFIG, type AttendanceStatus } from '@/features/attendance/lib/status-config'

interface AuditRecord {
  id: string
  date: string
  classId: string
  className: string | null
  sectionId: string | null
  sectionName: string | null
  action: 'finalize' | 'reopen' | string
  reason: string | null
  performedBy: string
  performedByName: string | null
  performedByEmail: string | null
  createdAt: string
  changeCount: number | null
}

interface ChangeRow {
  id: string
  studentId: string
  studentName: string
  rollNumber: string | null
  oldStatus: string
  newStatus: string
  oldRemarks: string | null
  newRemarks: string | null
  changedByName: string | null
  changedAt: string
}

interface ChangesState {
  loading: boolean
  data: ChangeRow[] | null
  error: boolean
}

interface Performer {
  id: string
  name: string
  email: string
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }

interface AuditStats {
  total: number
  finalizes: number
  reopens: number
}

interface AttendanceAuditListState {
  dateFrom?: string
  dateTo?: string
  actionFilter?: 'all' | 'finalize' | 'reopen'
  classId?: string
  sectionId?: string
  performedBy?: string
  page?: number
  limit?: number
}

const ALL = '__all__'
const ATTENDANCE_AUDIT_LIST_STATE_KEY = 'attendance:audit-log:list'
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getDefaultRange(): { from: string; to: string } {
  const today = new Date()
  const past = new Date()
  past.setDate(today.getDate() - 30)
  return { from: toLocalDateString(past), to: toLocalDateString(today) }
}

function formatDate(value: string): string {
  const d = new Date(value + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatRelative(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const diff = Date.now() - then.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day > 1 ? 's' : ''} ago`
  return then.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatFullDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export function AttendanceAuditLogPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const user = useAppStore((s) => s.user)
  const effectiveRole = useEffectiveRole()
  const permissionsLoaded = useAppStore((s) => s.permissionsLoaded)
  const savedListState = useAppStore((s) => s.pageState[ATTENDANCE_AUDIT_LIST_STATE_KEY] as AttendanceAuditListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const isAdmin = effectiveRole === 'SCHOOL_ADMIN'
  const canView = isAdmin || hasPermission(PERMISSIONS.ATTENDANCE_AUDIT_VIEW)

  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const defaults = useMemo(getDefaultRange, [])
  const [dateFrom, setDateFrom] = useState(savedListState?.dateFrom ?? defaults.from)
  const [dateTo, setDateTo] = useState(savedListState?.dateTo ?? defaults.to)
  const [actionFilter, setActionFilter] = useState<'all' | 'finalize' | 'reopen'>(savedListState?.actionFilter ?? 'all')
  const [classId, setClassId] = useState<string>(savedListState?.classId ?? '')
  const [sectionId, setSectionId] = useState<string>(savedListState?.sectionId ?? '')
  const [performedBy, setPerformedBy] = useState<string>(savedListState?.performedBy ?? '')

  const [records, setRecords] = useState<AuditRecord[]>([])
  const [performers, setPerformers] = useState<Performer[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  // Lazy-loaded per-audit changes cache. Keyed by auditId. Fetched on first expand.
  const [changesByAuditId, setChangesByAuditId] = useState<Record<string, ChangesState>>({})
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [page, setPage] = useState(savedListState?.page ?? 1)
  const [limit, setLimit] = useState(savedListState?.limit ?? 20)

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])

  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  const classHasNoSections = classId ? sections.filter((s) => s.classId === classId).length === 0 : false
  const filteredSections = classId ? sections.filter((s) => s.classId === classId) : []

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

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const params: Record<string, string> = { academicYear, page: String(page), limit: String(limit) }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (actionFilter !== 'all') params.action = actionFilter
    if (classId) params.classId = classId
    if (sectionId && !classHasNoSections) params.sectionId = sectionId
    if (performedBy) params.performedBy = performedBy
    return { ...params, ...(extra || {}) }
  }, [academicYear, page, limit, dateFrom, dateTo, actionFilter, classId, sectionId, classHasNoSections, performedBy])

  const fetchRecords = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const res = await api.get<{
        records: AuditRecord[]
        performers: Performer[]
        pagination: { page: number; limit: number; total: number; totalPages: number }
        stats: AuditStats
      }>('/api/school/attendance/audit-log', buildParams())
      setRecords(res.records || [])
      setPerformers(res.performers || [])
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 })
      setStats(res.stats || null)
    } catch {
      toast({ title: 'Error', description: 'Failed to load audit log.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [canView, buildParams, toast])

  useEffect(() => {
    if (!initialLoad && canView) fetchRecords()
  }, [initialLoad, canView, fetchRecords])

  // Whenever a fresh page of records arrives, drop the stale changes cache so
  // expanding a row triggers a fresh fetch (e.g., after switching filters).
  useEffect(() => {
    setChangesByAuditId({})
  }, [records])

  const fetchChangesFor = useCallback(async (auditId: string) => {
    setChangesByAuditId((prev) => ({ ...prev, [auditId]: { loading: true, data: prev[auditId]?.data ?? null, error: false } }))
    try {
      const res = await api.get<{ changes: ChangeRow[] }>(`/api/school/attendance/audit-log/${auditId}/changes`)
      setChangesByAuditId((prev) => ({ ...prev, [auditId]: { loading: false, data: res.changes || [], error: false } }))
    } catch {
      setChangesByAuditId((prev) => ({ ...prev, [auditId]: { loading: false, data: null, error: true } }))
    }
  }, [])

  const rememberListState = (patch: Partial<AttendanceAuditListState>) => {
    setPageState(ATTENDANCE_AUDIT_LIST_STATE_KEY, {
      dateFrom,
      dateTo,
      actionFilter,
      classId,
      sectionId,
      performedBy,
      page,
      limit,
      ...patch,
    })
  }

  const handleDateFromChange = (value: string) => {
    setDateFrom(value)
    setPage(1)
    rememberListState({ dateFrom: value, page: 1 })
  }
  const handleDateToChange = (value: string) => {
    setDateTo(value)
    setPage(1)
    rememberListState({ dateTo: value, page: 1 })
  }
  const handleActionFilterChange = (value: 'all' | 'finalize' | 'reopen') => {
    setActionFilter(value)
    setPage(1)
    rememberListState({ actionFilter: value, page: 1 })
  }
  const handleClassChange = (value: string) => {
    const nextClassId = value === ALL ? '' : value
    setClassId(nextClassId)
    setSectionId('')
    setPage(1)
    rememberListState({ classId: nextClassId, sectionId: '', page: 1 })
  }
  const handleSectionChange = (value: string) => {
    const nextSectionId = value === ALL ? '' : value
    setSectionId(nextSectionId)
    setPage(1)
    rememberListState({ sectionId: nextSectionId, page: 1 })
  }
  const handlePerformerChange = (value: string) => {
    const nextPerformedBy = value === ALL ? '' : value
    setPerformedBy(nextPerformedBy)
    setPage(1)
    rememberListState({ performedBy: nextPerformedBy, page: 1 })
  }
  const handlePageChange = (value: number) => {
    setPage(value)
    rememberListState({ page: value })
  }
  const handlePageSizeChange = (value: number) => {
    setLimit(value)
    setPage(1)
    rememberListState({ limit: value, page: 1 })
  }

  const handleExportCsv = async () => {
    if (!canView) return
    setExporting(true)
    try {
      const params = new URLSearchParams(buildParams({ format: 'csv' }))
      const res = await fetch(`/api/school/attendance/audit-log?${params.toString()}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance-audit-${dateFrom || 'all'}-to-${dateTo || 'all'}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast({ title: 'Export failed', description: 'Could not download CSV.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handleRowClick = (record: AuditRecord) => {
    // Always carry the audit id as ?snapshot=… so View Attendance reconstructs
    // the historical state at that moment. The page itself has a "View Latest"
    // button to drop snapshot mode and see current data.
    const params = new URLSearchParams({
      date: record.date,
      classId: record.classId,
      snapshot: record.id,
    })
    if (record.sectionId) params.set('sectionId', record.sectionId)
    router.push(`/attendance/view?${params.toString()}`)
  }

  if (initialLoad) return <LoadingState />

  if (permissionsLoaded && !canView) {
    return (
      <div className="space-y-3 pb-20 sm:pb-0">
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="You don't have permission to view the attendance audit log. Ask a school administrator for the 'attendance:audit:view' permission."
        />
      </div>
    )
  }

  const hasActiveFilters = actionFilter !== 'all' || !!classId || !!sectionId || !!performedBy || !!dateFrom || !!dateTo
  const reopenRate = stats && stats.total > 0 ? Math.round((stats.reopens / stats.total) * 100) : 0

  const clearFilters = () => {
    handleActionFilterChange('all')
    handleClassChange(ALL)
    handleSectionChange(ALL)
    handlePerformerChange(ALL)
    handleDateFromChange('')
    handleDateToChange('')
  }

  return (
    <div className="space-y-4">
      {/* ── Branded Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -top-14 right-1/3 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-16 right-1/4 size-28 rounded-full bg-amber-300/10 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
              <History className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Attendance Audit Log</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  {academicYear}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Who finalized or reopened attendance — and why. Click a row to open that day&rsquo;s attendance.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting || loading || records.length === 0}
              className="gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <Download className="size-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Configuration Bar ───────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-6">
            {/* From */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
              <DatePicker
                value={dateFrom}
                onChange={handleDateFromChange}
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
                onChange={handleDateToChange}
                disableFuture
                showQuickActions
                placeholder="Any date"
                triggerClassName="h-10 w-full justify-start bg-white px-2.5 text-sm dark:bg-input/30 sm:h-9 sm:text-xs"
              />
            </div>

            {/* Action */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</Label>
              <Select value={actionFilter} onValueChange={(v) => handleActionFilterChange(v as typeof actionFilter)}>
                <SelectTrigger
                  leadingIcon={<Lock className="size-3.5 text-white" />}
                  leadingIconClassName="from-amber-500 to-orange-600"
                  className="h-10 w-full border-amber-200 from-amber-50 via-white to-orange-50 px-2 text-sm shadow-sm focus:border-amber-400 focus:ring-amber-400/20 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-input/30 dark:to-orange-500/10 sm:h-9 sm:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-amber-200/80 bg-white shadow-lg dark:border-amber-500/25 dark:bg-popover">
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="finalize">Finalize</SelectItem>
                  <SelectItem value="reopen">Reopen</SelectItem>
                </SelectContent>
              </Select>
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
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Section */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Section</Label>
              {classHasNoSections ? (
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
                    {filteredSections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Performed by */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">By User</Label>
              <Select value={performedBy || ALL} onValueChange={handlePerformerChange}>
                <SelectTrigger
                  leadingIcon={<UserRound className="size-3.5 text-white" />}
                  leadingIconClassName="from-teal-500 to-cyan-600"
                  className="h-10 w-full border-teal-200 from-teal-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-teal-400 focus:ring-teal-400/20 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-teal-200/80 bg-white shadow-lg dark:border-teal-500/25 dark:bg-popover">
                  <SelectItem value={ALL}>Any user</SelectItem>
                  {performers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick filters */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Filter className="size-3" />
                Quick:
              </span>
              <QuickFilter active={actionFilter === 'finalize'} tone="success" onClick={() => handleActionFilterChange('finalize')}>
                Finalizes
              </QuickFilter>
              <QuickFilter active={actionFilter === 'reopen'} tone="warn" onClick={() => handleActionFilterChange('reopen')}>
                Reopens
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

      {/* ── Summary Stats ───────────────────────────────────────────── */}
      {!loading && stats && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {/* Total actions */}
          <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
              <History className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total actions</p>
              <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">{stats.total.toLocaleString()}</p>
            </div>
          </div>

          {/* Finalizes */}
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Lock className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finalizes</p>
              <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">{stats.finalizes.toLocaleString()}</p>
            </div>
          </div>

          {/* Reopens */}
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <Unlock className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reopens</p>
              <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">{stats.reopens.toLocaleString()}</p>
            </div>
          </div>

          {/* Reopen rate */}
          <div className="col-span-2 rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-cyan-500/10 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                <Unlock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reopen rate</p>
                <p className={cn('text-lg font-bold leading-tight', reopenRate > 25 ? 'text-amber-600 dark:text-amber-400' : 'text-teal-700 dark:text-teal-300')}>
                  {reopenRate}%
                </p>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-teal-100 dark:bg-teal-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                style={{ width: `${reopenRate}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Audit History List Card ─────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        {/* Header band */}
        <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                <History className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Finalize &amp; reopen history</h3>
                <p className="text-[10px] text-muted-foreground">Click a row to open that day&rsquo;s attendance</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {loading && <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              <Badge variant="secondary" className="h-5 text-[10px]">
                {pagination.total.toLocaleString()} entries
              </Badge>
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading audit entries…
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
                <History className="size-5 text-teal-600 dark:text-teal-300" />
              </span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold">No audit entries</h3>
                <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'No finalize or reopen actions match the current filters.'
                    : 'Finalize or reopen attendance to see its history here.'}
                </p>
              </div>
            </div>
          ) : (
            records.map((r) => {
              const isReopen = r.action === 'reopen'
              const hasChanges = isReopen && (r.changeCount ?? 0) > 0
              const changeState = changesByAuditId[r.id]
              return (
                <div key={r.id} className="px-3 py-3 transition-colors hover:bg-muted/30 sm:px-5">
                  <Collapsible
                    onOpenChange={(open) => {
                      if (open && !changeState) fetchChangesFor(r.id)
                    }}
                  >
                    <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => handleRowClick(r)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <div className="flex items-center gap-2 sm:w-[110px] shrink-0">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'gap-1 text-[11px] font-semibold uppercase',
                              isReopen
                                ? 'border-amber-300/60 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200'
                                : 'border-emerald-300/60 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
                            )}
                          >
                            {isReopen ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                            {r.action}
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold">
                              {r.className || r.classId}
                              {r.sectionName ? ` — ${r.sectionName}` : ''}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              on {formatDate(r.date)}
                            </span>
                          </div>
                          {r.reason && (
                            <p className="text-xs text-muted-foreground mt-0.5 break-words">
                              &ldquo;{r.reason}&rdquo;
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3" />
                              {r.performedByName || r.performedByEmail || r.performedBy}
                            </span>
                            <span>·</span>
                            <span title={formatFullDateTime(r.createdAt)}>
                              {formatRelative(r.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                    {hasChanges && (
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto px-3 self-stretch shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground data-[state=open]:bg-muted/70 [&[data-state=open]>svg]:rotate-180"
                        >
                          <span>{r.changeCount} {r.changeCount === 1 ? 'change' : 'changes'}</span>
                          <ChevronDown className="size-3.5 transition-transform" />
                        </Button>
                      </CollapsibleTrigger>
                    )}
                  </div>
                  {hasChanges && (
                    <CollapsibleContent className="bg-muted/30">
                      <div className="px-3 py-3 border-t">
                        {changeState?.loading && (
                          <p className="text-xs text-muted-foreground">Loading changes…</p>
                        )}
                        {changeState?.error && (
                          <p className="text-xs text-destructive">Failed to load changes. Try again later.</p>
                        )}
                        {changeState?.data && changeState.data.length === 0 && (
                          <p className="text-xs text-muted-foreground">No per-student changes recorded.</p>
                        )}
                        {changeState?.data && changeState.data.length > 0 && (
                          <ul className="space-y-2">
                            {changeState.data.map((ch) => {
                              const oldCfg = STATUS_CONFIG[ch.oldStatus as AttendanceStatus]
                              const newCfg = STATUS_CONFIG[ch.newStatus as AttendanceStatus]
                              const remarksChanged = (ch.oldRemarks ?? '') !== (ch.newRemarks ?? '')
                              return (
                                <li key={ch.id} className="text-xs flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-mono text-muted-foreground w-10 shrink-0">
                                    {ch.rollNumber || '—'}
                                  </span>
                                  <span className="font-medium min-w-[120px]">{ch.studentName}</span>
                                  <Badge
                                    variant="secondary"
                                    className={cn('gap-1', oldCfg?.bgColor, oldCfg?.textColor)}
                                  >
                                    {oldCfg?.label ?? ch.oldStatus}
                                  </Badge>
                                  <ArrowRight className="size-3 text-muted-foreground" />
                                  <Badge
                                    variant="secondary"
                                    className={cn('gap-1', newCfg?.bgColor, newCfg?.textColor)}
                                  >
                                    {newCfg?.label ?? ch.newStatus}
                                  </Badge>
                                  <span className="text-muted-foreground">
                                    by {ch.changedByName || '—'}
                                  </span>
                                  <span className="text-muted-foreground" title={formatFullDateTime(ch.changedAt)}>
                                    · {formatRelative(ch.changedAt)}
                                  </span>
                                  {remarksChanged && (
                                    <span className="basis-full pl-12 text-[11px] text-muted-foreground italic">
                                      Remarks: &ldquo;{ch.oldRemarks || ''}&rdquo; → &ldquo;{ch.newRemarks || ''}&rdquo;
                                    </span>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    </CollapsibleContent>
                  )}
                  </Collapsible>
                </div>
              )
            })
          )}
        </div>

        {/* Footer legend */}
        {!loading && records.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" />
                Finalized: <strong className="text-foreground">{(stats?.finalizes ?? 0).toLocaleString()}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-400" />
                Reopened: <strong className="text-foreground">{(stats?.reopens ?? 0).toLocaleString()}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
              <ClipboardList className="size-3.5" />
              Click any row to view that day&rsquo;s attendance
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.total > 0 && (
          <Pagination
            page={page}
            limit={limit}
            total={pagination.total}
            totalPages={pagination.totalPages}
            itemLabel="entries"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </Card>
    </div>
  )
}

// ─── Shared layout primitives ───────────────────────────────────────────────

function Pagination({
  page,
  limit,
  total,
  totalPages,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  limit: number
  total: number
  totalPages: number
  itemLabel: string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const getPageNumbers = (): (number | 'ellipsis-start' | 'ellipsis-end')[] => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    if (page <= 3) {
      return [1, 2, 3, 4, 'ellipsis-end', totalPages]
    }
    if (page >= totalPages - 2) {
      return [1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages]
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={String(limit)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2">
          Showing {from} to {to} of {total} {itemLabel}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageNumbers.map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                ...
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
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