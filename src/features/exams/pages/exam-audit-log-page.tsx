'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { ChevronDown, ChevronRight, Download, History } from 'lucide-react'

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

const ACTION_BADGE: Record<string, string> = {
  created: 'bg-emerald-100 text-emerald-700',
  updated: 'bg-blue-100 text-blue-700',
  deleted: 'bg-red-100 text-red-700',
  status_changed: 'bg-violet-100 text-violet-700',
  marks_entered: 'bg-sky-100 text-sky-700',
  marks_submitted: 'bg-indigo-100 text-indigo-700',
  marks_locked: 'bg-amber-100 text-amber-700',
  marks_unlocked: 'bg-amber-50 text-amber-600',
  result_calculated: 'bg-cyan-100 text-cyan-700',
  result_published: 'bg-emerald-100 text-emerald-800',
  result_unpublished: 'bg-orange-100 text-orange-700',
  report_downloaded: 'bg-slate-100 text-slate-700',
}

export function ExamAuditLogPage() {
  const router = useRouter()
  const { toast } = useToast()
  const savedListState = useAppStore((state) => state.pageState[EXAM_AUDIT_LIST_STATE_KEY] as ExamAuditListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<ExamAuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: savedListState?.page ?? 1,
    limit: savedListState?.limit ?? 50,
    total: 0,
    totalPages: 0,
  })
  const [filters, setFilters] = useState<ExamAuditFilters>(savedListState?.filters ?? {
    entityType: '',
    action: '',
    examId: '',
    studentId: '',
    startDate: '',
    endDate: '',
  })
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
    const emptyFilters = { entityType: '', action: '', examId: '', studentId: '', startDate: '', endDate: '' }
    setFilters(emptyFilters)
    setPagination((p) => ({ ...p, page: 1 }))
    setPageState(EXAM_AUDIT_LIST_STATE_KEY, { filters: emptyFilters, page: 1, limit: pagination.limit })
  }

  function updateFilters(patch: Partial<ExamAuditFilters>) {
    const nextFilters = { ...filters, ...patch }
    setFilters(nextFilters)
    setPagination((p) => ({ ...p, page: 1 }))
    setPageState(EXAM_AUDIT_LIST_STATE_KEY, { filters: nextFilters, page: 1, limit: pagination.limit })
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
      toast({ title: 'CSV downloaded' })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not export',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  const totalPagesLabel = useMemo(
    () => `Page ${pagination.page} of ${Math.max(1, pagination.totalPages)}`,
    [pagination],
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Exam audit log"
        description="Every mutation to exams, marks, results, and publishing. Kept for compliance."
        backAction={{ onClick: () => router.push('/exams') }}
        action={{ label: 'Export CSV', icon: Download, onClick: () => void exportCsv() }}
      />

      <Card>
        <CardContent className="grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect
            label="Entity"
            value={filters.entityType}
            onChange={(v) => updateFilters({ entityType: v })}
            options={ENTITY_TYPES}
          />
          <FilterSelect
            label="Action"
            value={filters.action}
            onChange={(v) => updateFilters({ action: v })}
            options={ACTIONS}
          />
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Exam ID
            </Label>
            <Input
              className="h-9 text-xs"
              value={filters.examId}
              onChange={(e) => updateFilters({ examId: e.target.value })}
              placeholder="cuid"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Student ID
            </Label>
            <Input
              className="h-9 text-xs"
              value={filters.studentId}
              onChange={(e) => updateFilters({ studentId: e.target.value })}
              placeholder="cuid"
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              From
            </Label>
            <Input
              type="date"
              className="h-9 text-xs"
              value={filters.startDate}
              onChange={(e) => updateFilters({ startDate: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
            <Input
              type="date"
              className="h-9 text-xs"
              value={filters.endDate}
              onChange={(e) => updateFilters({ endDate: e.target.value })}
            />
          </div>
          <div className="sm:col-span-3 lg:col-span-6 flex items-center justify-between border-t pt-2 text-xs">
            <div className="text-muted-foreground">
              {loading ? 'Loading…' : `${pagination.total.toLocaleString()} entries`}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={resetFilters}>
                Reset
              </Button>
              <Button
                size="sm"
                onClick={() => handlePageChange(1)}
              >
                Apply
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && logs.length === 0 ? (
        <LoadingState />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No audit entries"
          description="No exam mutations match the current filters."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {logs.map((log) => {
                const isOpen = expanded.has(log.id)
                const badge = ACTION_BADGE[log.action] ?? 'bg-slate-100 text-slate-700'
                return (
                  <li key={log.id} className="px-3 py-2 text-sm">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(log.id)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <span className="mt-0.5 text-muted-foreground">
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className={`text-[10px] ${badge}`}>{log.action}</Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {log.entityType}
                          </Badge>
                          {log.exam && (
                            <span className="text-xs text-muted-foreground">
                              · {log.exam.name}
                            </span>
                          )}
                          {log.student && (
                            <span className="text-xs text-muted-foreground">
                              · {log.student.firstName} {log.student.lastName ?? ''}
                            </span>
                          )}
                        </div>
                        {log.diffSummary && (
                          <p className="mt-0.5 truncate text-xs">{log.diffSummary}</p>
                        )}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {log.user && ` · ${log.user.name ?? log.user.email}`}
                          {log.ipAddress && ` · ${log.ipAddress}`}
                        </p>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="mt-2 grid gap-2 rounded-md border bg-muted/30 p-2 text-[11px] md:grid-cols-2">
                        <div>
                          <div className="mb-1 font-semibold text-muted-foreground">Before</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                            {log.oldValue ? JSON.stringify(log.oldValue, null, 2) : '—'}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 font-semibold text-muted-foreground">After</div>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                            {log.newValue ? JSON.stringify(log.newValue, null, 2) : '—'}
                          </pre>
                        </div>
                        {log.metadata && (
                          <div className="md:col-span-2">
                            <div className="mb-1 font-semibold text-muted-foreground">Metadata</div>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[10px]">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5 text-xs">
            <div>{totalPagesLabel}</div>
            <div className="flex items-center gap-1">
              <Select
                value={String(pagination.limit)}
                onValueChange={(v) => handlePageSizeChange(parseInt(v, 10))}
              >
                <SelectTrigger className="h-7 w-20 text-xs">
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
              <Button
                size="sm"
                variant="outline"
                disabled={pagination.page <= 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<string>
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={value || '__all'} onValueChange={(v) => onChange(v === '__all' ? '' : v)}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
