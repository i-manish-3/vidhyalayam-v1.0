'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GradientHero, LoadingState, TintedStatCard } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileEdit,
  FileText,
  Filter,
  Globe,
  History,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  Unlock,
  User,
  X,
} from 'lucide-react'

interface ExamAuditLog {
  id: string
  entityType: string
  entityId: string
  action: string
  diffSummary: string | null
  oldValue: unknown
  newValue: unknown
  metadata: Record<string, unknown> | null
  createdAt: string
  ipAddress: string | null
  exam: { id: string; name: string; shortCode: string | null } | null
  student: {
    id: string
    firstName: string
    lastName: string | null
    admissionNumber: string | null
  } | null
  user: { id: string; name: string | null; email: string; role: string } | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface ExamAuditFilters {
  entityType: string
  action: string
  examId: string
  studentId: string
  startDate: string
  endDate: string
}

interface ExamAuditListState {
  filters?: ExamAuditFilters
  page?: number
  limit?: number
}

const EXAM_AUDIT_LIST_STATE_KEY = 'exams:audit-log:list'

const ENTITY_TYPES = [
  'Exam',
  'ExamParadigm',
  'ExamGroup',
  'ExamSubjectConfig',
  'ExamComponent',
  'ExamSchedule',
  'MarksEntry',
  'ExamResult',
  'FinalResult',
  'GradeScale',
  'ReportCardTemplate',
  'TeacherSubjectAssignment',
]

const ACTIONS = [
  'created',
  'updated',
  'deleted',
  'status_changed',
  'marks_entered',
  'marks_submitted',
  'marks_locked',
  'marks_unlocked',
  'result_calculated',
  'result_published',
  'result_unpublished',
  'report_downloaded',
]

const ACTION_CONFIG: Record<
  string,
  { label: string; badgeCls: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  created: {
    label: 'Created',
    badgeCls:
      'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    icon: Plus,
    tone: 'emerald',
  },
  updated: {
    label: 'Updated',
    badgeCls:
      'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    icon: Pencil,
    tone: 'blue',
  },
  deleted: {
    label: 'Deleted',
    badgeCls:
      'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    icon: Trash2,
    tone: 'rose',
  },
  status_changed: {
    label: 'Status Changed',
    badgeCls:
      'bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60',
    icon: RefreshCw,
    tone: 'violet',
  },
  marks_entered: {
    label: 'Marks Entered',
    badgeCls:
      'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
    icon: FileEdit,
    tone: 'sky',
  },
  marks_submitted: {
    label: 'Marks Submitted',
    badgeCls:
      'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
    icon: CheckCircle2,
    tone: 'indigo',
  },
  marks_locked: {
    label: 'Marks Locked',
    badgeCls:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    icon: Lock,
    tone: 'amber',
  },
  marks_unlocked: {
    label: 'Marks Unlocked',
    badgeCls:
      'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    icon: Unlock,
    tone: 'amber',
  },
  result_calculated: {
    label: 'Result Calculated',
    badgeCls:
      'bg-cyan-50 text-cyan-700 border-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60',
    icon: RefreshCw,
    tone: 'cyan',
  },
  result_published: {
    label: 'Result Published',
    badgeCls:
      'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700',
    icon: CheckCircle2,
    tone: 'emerald',
  },
  result_unpublished: {
    label: 'Result Unpublished',
    badgeCls:
      'bg-orange-50 text-orange-700 border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60',
    icon: ShieldAlert,
    tone: 'orange',
  },
  report_downloaded: {
    label: 'Report Downloaded',
    badgeCls:
      'bg-slate-50 text-slate-700 border-slate-200/80 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800',
    icon: Download,
    tone: 'slate',
  },
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function ExamAuditLogPage() {
  const { toast } = useToast()
  const savedListState = useAppStore(
    (state) => state.pageState[EXAM_AUDIT_LIST_STATE_KEY] as ExamAuditListState | undefined,
  )
  const setPageState = useAppStore((state) => state.setPageState)

  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<ExamAuditLog[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [pagination, setPagination] = useState<Pagination>({
    page: savedListState?.page ?? 1,
    limit: savedListState?.limit ?? 50,
    total: 0,
    totalPages: 0,
  })
  const [filters, setFilters] = useState<ExamAuditFilters>(
    savedListState?.filters ?? {
      entityType: '',
      action: '',
      examId: '',
      studentId: '',
      startDate: '',
      endDate: '',
    },
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(pagination.page),
        limit: String(pagination.limit),
      }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v
      })
      const res = await api.get<{ logs: ExamAuditLog[]; pagination: Pagination }>(
        '/api/school/exams/audit',
        params,
      )
      setLogs(res.logs)
      setPagination((prev) => ({
        ...prev,
        total: res.pagination.total,
        totalPages: res.pagination.totalPages,
      }))
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load audit logs',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.page, pagination.limit, toast])

  useEffect(() => {
    void load()
  }, [load])

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function resetFilters() {
    const emptyFilters = {
      entityType: '',
      action: '',
      examId: '',
      studentId: '',
      startDate: '',
      endDate: '',
    }
    setFilters(emptyFilters)
    setSearchQuery('')
    setPagination((p) => ({ ...p, page: 1 }))
    setPageState(EXAM_AUDIT_LIST_STATE_KEY, {
      filters: emptyFilters,
      page: 1,
      limit: pagination.limit,
    })
  }

  function updateFilters(patch: Partial<ExamAuditFilters>) {
    const nextFilters = { ...filters, ...patch }
    setFilters(nextFilters)
    setPagination((p) => ({ ...p, page: 1 }))
    setPageState(EXAM_AUDIT_LIST_STATE_KEY, {
      filters: nextFilters,
      page: 1,
      limit: pagination.limit,
    })
  }

  function handlePageChange(page: number) {
    setPagination((p) => ({ ...p, page }))
    setPageState(EXAM_AUDIT_LIST_STATE_KEY, { filters, page, limit: pagination.limit })
  }

  function handlePageSizeChange(limit: number) {
    setPagination((p) => ({ ...p, page: 1, limit }))
    setPageState(EXAM_AUDIT_LIST_STATE_KEY, { filters, page: 1, limit })
  }

  async function exportCsv() {
    try {
      const params: Record<string, string> = { page: '1', limit: '1000' }
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params[k] = v
      })
      const res = await api.get<{ logs: ExamAuditLog[] }>('/api/school/exams/audit', params)
      const csv = toCsv(res.logs)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `exam-audit-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({
        variant: 'success',
        title: 'Export ready',
        description: 'Exam audit CSV has been downloaded successfully.',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not export',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  // Filter logs client-side by search query (actor name, diff summary, exam name, entity type)
  const visibleLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs
    const q = searchQuery.toLowerCase().trim()
    return logs.filter((log) => {
      const actor = `${log.user?.name ?? ''} ${log.user?.email ?? ''}`.toLowerCase()
      const summary = (log.diffSummary ?? '').toLowerCase()
      const entity = log.entityType.toLowerCase()
      const action = log.action.toLowerCase()
      const exam = (log.exam?.name ?? '').toLowerCase()
      const student = `${log.student?.firstName ?? ''} ${log.student?.lastName ?? ''}`.toLowerCase()
      return (
        actor.includes(q) ||
        summary.includes(q) ||
        entity.includes(q) ||
        action.includes(q) ||
        exam.includes(q) ||
        student.includes(q) ||
        log.entityId.toLowerCase().includes(q)
      )
    })
  }, [logs, searchQuery])

  // Summary Metrics calculated from active batch
  const marksEventsCount = useMemo(
    () => logs.filter((l) => l.action.includes('marks')).length,
    [logs],
  )
  const resultsEventsCount = useMemo(
    () => logs.filter((l) => l.action.includes('result')).length,
    [logs],
  )
  const deletionCount = useMemo(
    () => logs.filter((l) => l.action === 'deleted').length,
    [logs],
  )

  const hasActiveFilters = Boolean(
    filters.entityType ||
      filters.action ||
      filters.examId ||
      filters.studentId ||
      filters.startDate ||
      filters.endDate ||
      searchQuery.trim(),
  )

  return (
    <div className="space-y-5">
      {/* Hero Banner */}
      <GradientHero
        icon={ScrollText}
        title="Exam Audit Trail"
        badge={`${pagination.total.toLocaleString()} records`}
        description="Immutable chronological record of exam modifications, marks entries, result publications, and template changes."
        primaryAction={{
          label: 'Export CSV',
          icon: Download,
          onClick: () => void exportCsv(),
        }}
      />

      {/* Summary Metric Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TintedStatCard
          icon={ScrollText}
          label="Total Logged Events"
          value={pagination.total.toLocaleString()}
          note="Full historical log"
          tone="sky"
        />
        <TintedStatCard
          icon={FileEdit}
          label="Marks Operations"
          value={marksEventsCount}
          note="In current page view"
          tone="indigo"
        />
        <TintedStatCard
          icon={CheckCircle2}
          label="Result Calculations"
          value={resultsEventsCount}
          note="Calculated & published"
          tone="emerald"
        />
        <TintedStatCard
          icon={Trash2}
          label="Deletions & Revocations"
          value={deletionCount}
          note="Deleted entities"
          tone="rose"
        />
      </div>

      {/* Streamlined, Compact Filter Toolbar (Not Bulky!) */}
      <div className="space-y-2.5 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-2xs dark:border-slate-800 dark:bg-card">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {/* Quick Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by user, action, exam, student, or summary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8.5 pl-8.5 pr-8 bg-slate-50/50 text-xs dark:bg-slate-900/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Quick Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Entity Filter */}
            <Select
              value={filters.entityType || '__all'}
              onValueChange={(v) => updateFilters({ entityType: v === '__all' ? '' : v })}
            >
              <SelectTrigger className="h-8.5 w-[140px] bg-slate-50/50 text-xs dark:bg-slate-900/40">
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Entities</SelectItem>
                {ENTITY_TYPES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action Filter */}
            <Select
              value={filters.action || '__all'}
              onValueChange={(v) => updateFilters({ action: v === '__all' ? '' : v })}
            >
              <SelectTrigger className="h-8.5 w-[140px] bg-slate-50/50 text-xs dark:bg-slate-900/40">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All Actions</SelectItem>
                {ACTIONS.map((a) => {
                  const cfg = ACTION_CONFIG[a]
                  return (
                    <SelectItem key={a} value={a}>
                      {cfg?.label ?? a}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>

            {/* Advanced Filters Toggle (Dates & IDs) */}
            <Button
              variant={showAdvancedFilters ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="h-8.5 gap-1.5 px-2.5 text-xs"
            >
              <Filter className="size-3.5" />
              <span>Filters</span>
              {(filters.startDate || filters.endDate || filters.examId || filters.studentId) && (
                <span className="size-1.5 rounded-full bg-sky-600" />
              )}
            </Button>

            {/* Reset Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8.5 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                title="Reset all filters"
              >
                <RotateCcw className="size-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters (Dates & IDs) */}
        {showAdvancedFilters && (
          <div className="grid gap-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800/80 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <span className="mb-1 block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                From Date
              </span>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilters({ startDate: e.target.value })}
                className="h-8 bg-slate-50/50 text-xs dark:bg-slate-900/40"
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                To Date
              </span>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => updateFilters({ endDate: e.target.value })}
                className="h-8 bg-slate-50/50 text-xs dark:bg-slate-900/40"
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Exam ID Filter
              </span>
              <Input
                placeholder="Target exam ID..."
                value={filters.examId}
                onChange={(e) => updateFilters({ examId: e.target.value })}
                className="h-8 bg-slate-50/50 text-xs dark:bg-slate-900/40"
              />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Student ID Filter
              </span>
              <Input
                placeholder="Target student ID..."
                value={filters.studentId}
                onChange={(e) => updateFilters({ studentId: e.target.value })}
                className="h-8 bg-slate-50/50 text-xs dark:bg-slate-900/40"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Audit Trail Feed */}
      {loading && logs.length === 0 ? (
        <LoadingState />
      ) : visibleLogs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs dark:border-slate-800 dark:bg-card">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <History className="size-6" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">No audit entries found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasActiveFilters
              ? 'No exam mutations matched your active search or filters.'
              : 'There are no recorded exam audit logs yet.'}
          </p>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 h-8 text-xs">
              Clear Filters
            </Button>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden border border-slate-200/90 bg-white/95 shadow-2xs dark:border-slate-800 dark:bg-card">
          {/* Header strip with summary */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-muted-foreground dark:border-slate-800 dark:bg-slate-900/30">
            <span className="font-medium text-foreground">
              Showing {visibleLogs.length} of {pagination.total.toLocaleString()} audit entries
            </span>
            <span className="text-[11px] text-muted-foreground/80">Click entry to inspect before/after diff</span>
          </div>

          {/* Activity Timeline List */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {visibleLogs.map((log) => {
              const isOpen = expanded.has(log.id)
              const cfg = ACTION_CONFIG[log.action] ?? {
                label: log.action,
                badgeCls: 'bg-slate-100 text-slate-700 border-slate-200',
                icon: ScrollText,
                tone: 'slate',
              }
              const ActionIcon = cfg.icon

              return (
                <div
                  key={log.id}
                  className={cn(
                    'transition-colors duration-150',
                    isOpen ? 'bg-slate-50/70 dark:bg-slate-900/40' : 'hover:bg-slate-50/40 dark:hover:bg-slate-900/20',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(log.id)}
                    className="flex w-full items-start gap-3 p-3.5 text-left sm:gap-4 sm:px-4"
                  >
                    {/* Action Icon Tile */}
                    <div
                      className={cn(
                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border shadow-2xs',
                        cfg.badgeCls,
                      )}
                    >
                      <ActionIcon className="size-4" />
                    </div>

                    {/* Content Block */}
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Top Badges & Entity Row */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold shadow-2xs',
                            cfg.badgeCls,
                          )}
                        >
                          {cfg.label}
                        </span>

                        <Badge
                          variant="outline"
                          className="border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {log.entityType}
                        </Badge>

                        {/* Associated Exam Pill */}
                        {log.exam && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                            Exam: {log.exam.name}
                          </span>
                        )}

                        {/* Associated Student Pill */}
                        {log.student && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-violet-200/80 bg-violet-50/70 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                            Student: {log.student.firstName} {log.student.lastName ?? ''}
                          </span>
                        )}
                      </div>

                      {/* Diff Summary / Operation Note */}
                      {log.diffSummary ? (
                        <p className="text-xs font-medium text-foreground leading-relaxed">
                          {log.diffSummary}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          {log.action} performed on {log.entityType} ({log.entityId.slice(0, 12)}…)
                        </p>
                      )}

                      {/* Meta Line: Actor, Timestamp, IP */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {/* Operator */}
                        <span className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <User className="size-3 text-muted-foreground" />
                          {log.user ? log.user.name || log.user.email : 'System Process'}
                          {log.user?.role && (
                            <span className="text-[10px] opacity-70">({log.user.role})</span>
                          )}
                        </span>

                        {/* Relative & Exact Timestamp */}
                        <span className="inline-flex items-center gap-1" title={new Date(log.createdAt).toISOString()}>
                          <Clock className="size-3 text-muted-foreground" />
                          <span>{timeAgo(log.createdAt)}</span>
                          <span className="opacity-60">
                            · {new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>

                        {/* IP Address */}
                        {log.ipAddress && (
                          <span className="inline-flex items-center gap-1 opacity-75">
                            <Globe className="size-3" />
                            {log.ipAddress}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand Arrow Indicator */}
                    <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800">
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </div>
                  </button>

                  {/* Expanded Detailed Inspection Drawer */}
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/40">
                      <div className="space-y-3">
                        {/* Entity ID & Summary header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">Entity ID:</span>
                            <code className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                              {log.entityId}
                            </code>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            Timestamp: {new Date(log.createdAt).toLocaleString('en-IN')}
                          </span>
                        </div>

                        {/* Before & After Values Side-by-Side */}
                        {(log.oldValue || log.newValue) && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {/* Before State */}
                            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400">
                                  State Before
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">oldValue</span>
                              </div>
                              <pre className="max-h-56 overflow-auto rounded bg-slate-950 p-2.5 font-mono text-[10px] leading-relaxed text-slate-200">
                                {log.oldValue ? JSON.stringify(log.oldValue, null, 2) : '— No prior state recorded —'}
                              </pre>
                            </div>

                            {/* After State */}
                            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                              <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                  State After
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">newValue</span>
                              </div>
                              <pre className="max-h-56 overflow-auto rounded bg-slate-950 p-2.5 font-mono text-[10px] leading-relaxed text-slate-200">
                                {log.newValue ? JSON.stringify(log.newValue, null, 2) : '— No post state recorded —'}
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* Metadata Box */}
                        {log.metadata && (
                          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            <span className="mb-1.5 block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              Operation Metadata
                            </span>
                            <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-2.5 font-mono text-[10px] text-slate-200">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Sleek, Non-Bulky Footer Pagination */}
          <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/30">
            <span className="text-xs text-muted-foreground">
              Page <span className="font-semibold text-foreground">{pagination.page}</span> of{' '}
              <span className="font-semibold text-foreground">{Math.max(1, pagination.totalPages)}</span> ({pagination.total.toLocaleString()} total)
            </span>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Rows per page:</span>
              <Select
                value={String(pagination.limit)}
                onValueChange={(v) => handlePageSizeChange(parseInt(v, 10))}
              >
                <SelectTrigger className="h-7 w-[70px] bg-white text-xs dark:bg-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1 ml-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function toCsv(logs: ExamAuditLog[]): string {
  const header = [
    'Timestamp',
    'Action',
    'Entity',
    'Entity ID',
    'Exam',
    'Student',
    'User',
    'IP',
    'Summary',
  ]
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = logs.map((l) =>
    [
      new Date(l.createdAt).toISOString(),
      l.action,
      l.entityType,
      l.entityId,
      l.exam ? l.exam.name : '',
      l.student ? `${l.student.firstName} ${l.student.lastName ?? ''}`.trim() : '',
      l.user ? l.user.name ?? l.user.email : '',
      l.ipAddress ?? '',
      l.diffSummary ?? '',
    ]
      .map((v) => escape(String(v)))
      .join(','),
  )
  return [header.map(escape).join(','), ...rows].join('\n')
}
