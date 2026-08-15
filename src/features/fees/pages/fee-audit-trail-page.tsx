/**
 * Fee Audit Trail Page
 *
 * Full-page audit trail view with tabs for transactions and config changes.
 * Includes filtering, pagination, and CSV export.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  History,
  PencilLine,
  PlusCircle,
  Receipt,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { AuditTrailViewer } from '../components/audit-trail-viewer'
import { AuditLogFilters } from '../components/audit-log-filters'
import { useAppStore } from '@/lib/store'

type TabType = 'transactions' | 'config'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface AuditStats {
  total: number
  created: number
  updated: number
  deleted: number
}

interface AuditLogItem {
  id: string
  createdAt: string
  action: string
  entityType: string
  entityId: string
  oldValue: any
  newValue: any
  metadata: any
  student?: {
    id: string
    firstName: string
    lastName: string
    admissionNumber?: string
  } | null
  user?: {
    id: string
    name: string
    email: string
    role: string
  } | null
  ipAddress?: string | null
  userAgent?: string | null
  diffSummary?: string | null
  [key: string]: unknown
}

interface FeeAuditTrailListState {
  activeTab?: TabType
  filters?: Record<string, string>
  page?: number
  limit?: number
}

const FEE_AUDIT_TRAIL_LIST_STATE_KEY = 'fees:audit-trail:list'

export function FeeAuditTrailPage() {
  const savedListState = useAppStore((state) => state.pageState[FEE_AUDIT_TRAIL_LIST_STATE_KEY] as FeeAuditTrailListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [activeTab, setActiveTab] = useState<TabType>(savedListState?.activeTab ?? 'transactions')
  const [filters, setFilters] = useState<Record<string, string>>(savedListState?.filters ?? {})
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: savedListState?.page ?? 1,
    limit: savedListState?.limit ?? 50,
    total: 0,
    totalPages: 0,
  })

  const endpoint = activeTab === 'transactions'
    ? '/api/school/fees/audit'
    : '/api/school/fees/audit/config'

  const rememberListState = useCallback((patch: Partial<FeeAuditTrailListState>) => {
    setPageState(FEE_AUDIT_TRAIL_LIST_STATE_KEY, {
      activeTab,
      filters,
      page: pagination.page,
      limit: pagination.limit,
      ...patch,
    })
  }, [setPageState, activeTab, filters, pagination.page, pagination.limit])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
        ...Object.entries(filters).reduce(
          (acc, [key, value]) => {
            if (value) acc[key] = value
            return acc
          },
          {} as Record<string, string>,
        ),
      })

      const response = await fetch(`${endpoint}?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to fetch audit logs')

      const data = await response.json()
      setLogs(data.logs || [])
      setStats(data.stats || null)
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total ?? 0,
        totalPages: data.pagination?.totalPages ?? 0,
      }))
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      toast.error('Could not load audit logs.')
    } finally {
      setLoading(false)
    }
  }, [endpoint, filters, pagination.page, pagination.limit])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(newFilters)
    setPagination((prev) => ({ ...prev, page: 1 }))
    rememberListState({ filters: newFilters, page: 1 })
  }

  const handleQuickGroup = (group: 'created' | 'updated' | 'deleted') => {
    const next: Record<string, string> = { ...filters, actionGroup: group }
    delete next.action
    setFilters(next)
    setPagination((prev) => ({ ...prev, page: 1 }))
    rememberListState({ filters: next, page: 1 })
  }

  const clearFilters = () => {
    setFilters({})
    setPagination((prev) => ({ ...prev, page: 1 }))
    rememberListState({ filters: {}, page: 1 })
  }

  const handleTabChange = (value: string) => {
    const nextTab = value as TabType
    setActiveTab(nextTab)
    setPagination((prev) => ({ ...prev, page: 1 }))
    rememberListState({ activeTab: nextTab, page: 1 })
  }

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }))
    rememberListState({ page })
  }

  const handlePageSizeChange = (size: number) => {
    setPagination((prev) => ({ ...prev, limit: size, page: 1 }))
    rememberListState({ limit: size, page: 1 })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '1000',
        ...Object.entries(filters).reduce(
          (acc, [key, value]) => {
            if (value) acc[key] = value
            return acc
          },
          {} as Record<string, string>,
        ),
      })

      const response = await fetch(`${endpoint}?${params}`, { credentials: 'include' })
      if (!response.ok) throw new Error('Failed to export audit logs')
      const data = await response.json()

      const csv = convertToCSV(data.logs || [])
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fee-audit-${activeTab}-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success('CSV downloaded.')
    } catch (error) {
      console.error('Error exporting audit logs:', error)
      toast.error('Failed to export audit logs.')
    } finally {
      setExporting(false)
    }
  }

  const hasActiveFilters = Object.values(filters).some((v) => !!v)

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
              <Receipt className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Fee Audit Trail</h1>
              <p className="mt-0.5 text-xs text-white/80">
                Every fee transaction and config change, kept for compliance.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExport}
              disabled={exporting || loading || logs.length === 0}
              className="gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <Download className="size-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Tab strip ───────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-9 gap-1 bg-muted/50 p-1">
          <TabsTrigger
            value="transactions"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Receipt className="size-3.5" />
            Transactions
          </TabsTrigger>
          <TabsTrigger
            value="config"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Settings2 className="size-3.5" />
            Configuration
          </TabsTrigger>
        </TabsList>

        {/* ── Configuration Bar ─────────────────────────────────────── */}
        <Card className="gap-0 overflow-hidden border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50 py-0 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/10">
          <CardContent className="p-3">
            <AuditLogFilters filters={filters} onFilterChange={handleFilterChange} />

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Filter className="size-3" />
                  Quick:
                </span>
                <QuickFilter active={filters.actionGroup === 'created'} tone="success" onClick={() => handleQuickGroup('created')}>
                  Created
                </QuickFilter>
                <QuickFilter active={filters.actionGroup === 'updated'} tone="warn" onClick={() => handleQuickGroup('updated')}>
                  Updated
                </QuickFilter>
                <QuickFilter active={filters.actionGroup === 'deleted'} tone="error" onClick={() => handleQuickGroup('deleted')}>
                  Deleted
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

        {/* ── Summary Stats ─────────────────────────────────────────── */}
        {!loading && stats && stats.total > 0 && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatCard
              label="Total entries"
              value={stats.total}
              icon={<History className="size-4" />}
              iconClass="from-sky-500 to-cyan-600"
              cardClass="border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10"
              valueClass="text-sky-700 dark:text-sky-300"
            />
            <StatCard
              label="Created"
              value={stats.created}
              icon={<PlusCircle className="size-4" />}
              iconClass="from-emerald-500 to-teal-600"
              cardClass="border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10"
              valueClass="text-emerald-700 dark:text-emerald-300"
            />
            <StatCard
              label="Updated"
              value={stats.updated}
              icon={<PencilLine className="size-4" />}
              iconClass="from-amber-500 to-orange-600"
              cardClass="border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10"
              valueClass="text-amber-700 dark:text-amber-300"
            />
            <StatCard
              label="Deleted / Voided"
              value={stats.deleted}
              icon={<Trash2 className="size-4" />}
              iconClass="from-rose-500 to-red-600"
              cardClass="border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-red-50 dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-red-500/10"
              valueClass="text-rose-700 dark:text-rose-300"
            />
          </div>
        )}

        {/* ── Audit History List Card ───────────────────────────────── */}
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          {/* Header band */}
          <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                  <Receipt className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">
                    {activeTab === 'transactions' ? 'Fee transactions &amp; refunds' : 'Fee structure &amp; config changes'}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Click a row to see the before/after changes
                  </p>
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
          <AuditTrailViewer logs={logs} loading={loading} />

          {/* Footer legend */}
          {!loading && pagination.total > 0 && (
            <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
              <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Created: <strong className="text-foreground">{(stats?.created ?? 0).toLocaleString()}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-400" />
                  Updated: <strong className="text-foreground">{(stats?.updated ?? 0).toLocaleString()}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-500" />
                  Deleted: <strong className="text-foreground">{(stats?.deleted ?? 0).toLocaleString()}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
                <History className="size-3.5" />
                Click any row to review the before/after diff
              </div>
            </div>
          )}

          {/* Pagination */}
          {!loading && pagination.total > 0 && (
            <Pagination
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </Card>
      </Tabs>
    </div>
  )
}

// ─── Shared layout primitives ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  iconClass,
  cardClass,
  valueClass,
}: {
  label: string
  value: number
  icon: React.ReactNode
  iconClass: string
  cardClass: string
  valueClass: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md', cardClass)}>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', iconClass)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-bold leading-tight', valueClass)}>{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationInfo
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
}) {
  const { page, limit, total, totalPages } = pagination
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
          Showing {from} to {to} of {total} entries
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

// ─── CSV ────────────────────────────────────────────────────────────────────

function convertToCSV(logs: AuditLogItem[]): string {
  if (logs.length === 0) return ''

  const headers = [
    'Date',
    'Time',
    'Action',
    'Entity Type',
    'Entity ID',
    'Student',
    'User',
    'IP Address',
    'Summary',
  ]

  const rows = logs.map((log) => [
    new Date(log.createdAt).toLocaleDateString(),
    new Date(log.createdAt).toLocaleTimeString(),
    log.action,
    log.entityType,
    log.entityId,
    log.student ? `${log.student.firstName} ${log.student.lastName}` : '',
    log.user ? log.user.name : '',
    log.ipAddress || '',
    log.diffSummary || '',
  ])

  return [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n')
}