'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/date-picker'
import {
  History,
  Lock,
  Unlock,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'

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
}

interface Performer {
  id: string
  name: string
  email: string
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }

const ALL = '__all__'

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
  const permissionsLoaded = useAppStore((s) => s.permissionsLoaded)
  const isAdmin = user?.role === 'SCHOOL_ADMIN'
  const canView = isAdmin || hasPermission(PERMISSIONS.ATTENDANCE_AUDIT_VIEW)

  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const defaults = useMemo(getDefaultRange, [])
  const [dateFrom, setDateFrom] = useState(defaults.from)
  const [dateTo, setDateTo] = useState(defaults.to)
  const [actionFilter, setActionFilter] = useState<'all' | 'finalize' | 'reopen'>('all')
  const [classId, setClassId] = useState<string>('')
  const [sectionId, setSectionId] = useState<string>('')
  const [performedBy, setPerformedBy] = useState<string>('')

  const [records, setRecords] = useState<AuditRecord[]>([])
  const [performers, setPerformers] = useState<Performer[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 })
  const [page, setPage] = useState(1)

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
    const params: Record<string, string> = { academicYear, page: String(page), limit: '20' }
    if (dateFrom) params.dateFrom = dateFrom
    if (dateTo) params.dateTo = dateTo
    if (actionFilter !== 'all') params.action = actionFilter
    if (classId) params.classId = classId
    if (sectionId && !classHasNoSections) params.sectionId = sectionId
    if (performedBy) params.performedBy = performedBy
    return { ...params, ...(extra || {}) }
  }, [academicYear, page, dateFrom, dateTo, actionFilter, classId, sectionId, classHasNoSections, performedBy])

  const fetchRecords = useCallback(async () => {
    if (!canView) return
    setLoading(true)
    try {
      const res = await api.get<{
        records: AuditRecord[]
        performers: Performer[]
        pagination: { page: number; limit: number; total: number; totalPages: number }
      }>('/api/school/attendance/audit-log', buildParams())
      setRecords(res.records || [])
      setPerformers(res.performers || [])
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 })
    } catch {
      toast({ title: 'Error', description: 'Failed to load audit log.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [canView, buildParams, toast])

  useEffect(() => {
    if (!initialLoad && canView) fetchRecords()
  }, [initialLoad, canView, fetchRecords])

  // Reset to page 1 whenever any filter changes — pagination is stale otherwise.
  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, actionFilter, classId, sectionId, performedBy])

  const handleClassChange = (value: string) => {
    setClassId(value === ALL ? '' : value)
    setSectionId('')
  }
  const handleSectionChange = (value: string) => {
    setSectionId(value === ALL ? '' : value)
  }
  const handlePerformerChange = (value: string) => {
    setPerformedBy(value === ALL ? '' : value)
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
    const params = new URLSearchParams({ date: record.date, classId: record.classId })
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

  return (
    <div className="space-y-3 pb-20 sm:pb-0">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight flex items-center gap-2">
            <History className="size-5" />
            Attendance Audit Log
          </h1>
          <p className="text-xs text-muted-foreground">
            Who finalized or reopened attendance — and why. Click a row to open that day&rsquo;s attendance.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          disabled={exporting || loading || records.length === 0}
          className="h-9 gap-1.5 sm:h-8"
        >
          <Download className="size-4" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">
              {academicYear}
            </Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">From</Label>
              <DatePicker
                value={dateFrom}
                onChange={setDateFrom}
                triggerClassName="h-9 w-full justify-start text-sm sm:h-7 sm:text-xs"
              />
            </div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">To</Label>
              <DatePicker
                value={dateTo}
                onChange={setDateTo}
                triggerClassName="h-9 w-full justify-start text-sm sm:h-7 sm:text-xs"
              />
            </div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action</Label>
              <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as typeof actionFilter)}>
                <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="finalize">Finalize</SelectItem>
                  <SelectItem value="reopen">Reopen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Class</Label>
              <Select value={classId || ALL} onValueChange={handleClassChange}>
                <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Section</Label>
              {classHasNoSections ? (
                <Badge variant="secondary" className="flex h-9 w-full items-center px-3 text-sm sm:h-7 sm:text-xs">No Sections</Badge>
              ) : (
                <Select value={sectionId || ALL} onValueChange={handleSectionChange} disabled={!classId}>
                  <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:text-xs">
                    <SelectValue placeholder="All sections" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sections</SelectItem>
                    {filteredSections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">By User</Label>
              <Select value={performedBy || ALL} onValueChange={handlePerformerChange}>
                <SelectTrigger className="h-9 w-full text-sm sm:h-7 sm:text-xs">
                  <SelectValue placeholder="Any user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any user</SelectItem>
                  {performers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <LoadingState />
      ) : records.length === 0 ? (
        <EmptyState
          icon={History}
          title="No audit entries"
          description="No finalize or reopen actions match the current filters."
        />
      ) : (
        <>
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <ul className="divide-y">
                {records.map((r) => {
                  const isReopen = r.action === 'reopen'
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleRowClick(r)}
                        className="w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
                      >
                        <div className="flex items-center gap-2 sm:w-[110px] shrink-0">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'gap-1 text-[11px] font-semibold uppercase',
                              isReopen
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                            )}
                          >
                            {isReopen ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                            {r.action}
                          </Badge>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-sm font-medium">
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
                      </button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} entries
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="h-7 px-2"
                >
                  <ChevronLeft className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages || loading}
                  className="h-7 px-2"
                >
                  <ChevronRight className="size-3" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
