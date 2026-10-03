'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  History,
  Receipt,
  ClipboardList,
  Fingerprint,
  Award,
  SlidersHorizontal,
  Banknote,
  Search,
  Filter,
  Download,
  RefreshCw,
  Calendar,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  User,
  Shield,
  Laptop,
  Globe,
  X,
  Code2,
  FileSpreadsheet,
  Lock,
  Unlock,
  Check,
  Layers,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

export interface UnifiedAuditLogItem {
  id: string
  rawId: string
  category: 'fees' | 'fee-config' | 'attendance' | 'punches' | 'exams' | 'salary'
  categoryLabel: string
  action: string
  actionGroup: 'created' | 'updated' | 'deleted' | 'system'
  entityType: string
  entityId: string
  title: string
  description: string | null
  diffSummary: string | null
  oldValue: any
  newValue: any
  metadata: any
  actor: {
    id?: string | null
    name?: string | null
    email?: string | null
    role?: string | null
  } | null
  target: {
    id?: string | null
    name?: string | null
    subtitle?: string | null
    type?: string | null
  } | null
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
}

interface AuditStats {
  totalEvents: number
  filteredTotal: number
  feesCount: number
  configCount: number
  attendanceCount: number
  punchesCount: number
  examsCount: number
  salaryCount: number
  sensitiveCount: number
}

const CATEGORY_META: Record<
  string,
  {
    label: string
    shortDesc: string
    icon: any
    color: string
    gradient: string
    deepLink?: string
  }
> = {
  fees: {
    label: 'Fees & Collections',
    shortDesc: 'Payments, waivers, refunds & student ledgers',
    icon: Receipt,
    color: 'text-emerald-700 dark:text-emerald-300',
    gradient: 'from-emerald-500 to-teal-600',
    deepLink: '/audit-logs/fees',
  },
  attendance: {
    label: 'Attendance Logs',
    shortDesc: 'Class finalizations, reopens & overrides',
    icon: ClipboardList,
    color: 'text-sky-700 dark:text-sky-300',
    gradient: 'from-sky-500 to-blue-600',
    deepLink: '/audit-logs/attendance',
  },
  punches: {
    label: 'Device Punches',
    shortDesc: 'Hardware biometric & RFID raw card clock taps',
    icon: Fingerprint,
    color: 'text-violet-700 dark:text-violet-300',
    gradient: 'from-violet-500 to-purple-600',
    deepLink: '/audit-logs/punches',
  },
  exams: {
    label: 'Exams & Marks',
    shortDesc: 'Marks entries, grade scales & publication logs',
    icon: Award,
    color: 'text-amber-700 dark:text-amber-300',
    gradient: 'from-amber-500 to-orange-600',
    deepLink: '/audit-logs/exams',
  },
  'fee-config': {
    label: 'Fee Configurations',
    shortDesc: 'Fee structures, heads, groups & annual policies',
    icon: SlidersHorizontal,
    color: 'text-indigo-700 dark:text-indigo-300',
    gradient: 'from-indigo-500 to-slate-600',
    deepLink: '/audit-logs/fees',
  },
  salary: {
    label: 'Salary & Payroll',
    shortDesc: 'Payroll runs, disbursements & staff advances',
    icon: Banknote,
    color: 'text-rose-700 dark:text-rose-300',
    gradient: 'from-rose-500 to-pink-600',
  },
}

function QuickFilterPill({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all shadow-xs',
        active
          ? 'border-primary/40 bg-primary text-primary-foreground shadow-sm'
          : 'border-border/80 bg-background/80 text-muted-foreground hover:bg-muted/80 hover:text-foreground'
      )}
    >
      {children}
      {typeof count === 'number' && (
        <span
          className={cn(
            'ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold',
            active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export function AllAuditLogsPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [logs, setLogs] = useState<UnifiedAuditLogItem[]>([])
  const [stats, setStats] = useState<AuditStats>({
    totalEvents: 0,
    filteredTotal: 0,
    feesCount: 0,
    configCount: 0,
    attendanceCount: 0,
    punchesCount: 0,
    examsCount: 0,
    salaryCount: 0,
    sensitiveCount: 0,
  })

  // Filters
  const [category, setCategory] = useState<string>('all')
  const [actionGroup, setActionGroup] = useState<string>('all')
  const [search, setSearch] = useState<string>('')
  const [datePreset, setDatePreset] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  // Inspection modal
  const [selectedLog, setSelectedLog] = useState<UnifiedAuditLogItem | null>(null)

  // Calculate start/end date from preset
  const dateRange = useMemo(() => {
    const now = new Date()
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      return { startDate: start, endDate: now.toISOString() }
    }
    if (datePreset === 'yesterday') {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999)
      return { startDate: yesterday.toISOString(), endDate: end.toISOString() }
    }
    if (datePreset === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return { startDate: weekAgo.toISOString(), endDate: now.toISOString() }
    }
    if (datePreset === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      return { startDate: monthStart.toISOString(), endDate: now.toISOString() }
    }
    return { startDate: undefined, endDate: undefined }
  }, [datePreset])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      }
      if (category !== 'all') params.category = category
      if (actionGroup !== 'all') params.actionGroup = actionGroup
      if (search.trim()) params.search = search.trim()
      if (dateRange.startDate) params.startDate = dateRange.startDate
      if (dateRange.endDate) params.endDate = dateRange.endDate

      const res = await api.get<{
        logs: UnifiedAuditLogItem[]
        stats: AuditStats
        pagination: { page: number; limit: number; total: number; totalPages: number }
      }>('/api/school/audit-logs', params)

      setLogs(res.logs || [])
      if (res.stats) setStats(res.stats)
      if (res.pagination) {
        setTotalPages(res.pagination.totalPages || 1)
        setTotalCount(res.pagination.total || 0)
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error)
      toast({
        title: 'Error loading audit logs',
        description: 'Unable to retrieve audit trail entries. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [page, limit, category, actionGroup, search, dateRange, toast])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const handleDownloadCsv = () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('format', 'csv')
      if (category !== 'all') params.set('category', category)
      if (actionGroup !== 'all') params.set('actionGroup', actionGroup)
      if (search.trim()) params.set('search', search.trim())
      if (dateRange.startDate) params.set('startDate', dateRange.startDate)
      if (dateRange.endDate) params.set('endDate', dateRange.endDate)

      const url = `/api/school/audit-logs?${params.toString()}`
      window.open(url, '_blank')
      toast({ title: 'Export started', description: 'Your audit log CSV is downloading.' })
    } catch {
      toast({ title: 'Export failed', description: 'Could not generate CSV.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const hasActiveFilters =
    category !== 'all' || actionGroup !== 'all' || !!search.trim() || datePreset !== 'all'

  const clearAllFilters = () => {
    setCategory('all')
    setActionGroup('all')
    setSearch('')
    setDatePreset('all')
    setPage(1)
  }

  const getActionBadge = (actionGrp: string, action: string) => {
    switch (actionGrp) {
      case 'created':
        return (
          <Badge
            variant="secondary"
            className="gap-1 border-emerald-300/60 bg-emerald-100 text-[11px] font-semibold uppercase text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200"
          >
            <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-300" />
            {action.replace(/_/g, ' ')}
          </Badge>
        )
      case 'updated':
        return (
          <Badge
            variant="secondary"
            className="gap-1 border-amber-300/60 bg-amber-100 text-[11px] font-semibold uppercase text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200"
          >
            <Unlock className="size-3 text-amber-600 dark:text-amber-300" />
            {action.replace(/_/g, ' ')}
          </Badge>
        )
      case 'deleted':
        return (
          <Badge
            variant="secondary"
            className="gap-1 border-rose-300/60 bg-rose-100 text-[11px] font-semibold uppercase text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200"
          >
            <AlertTriangle className="size-3 text-rose-600 dark:text-rose-300" />
            {action.replace(/_/g, ' ')}
          </Badge>
        )
      default:
        return (
          <Badge
            variant="secondary"
            className="gap-1 border-slate-300/60 bg-slate-100 text-[11px] font-semibold uppercase text-slate-800 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-200"
          >
            <Lock className="size-3 text-slate-600 dark:text-slate-300" />
            {action.replace(/_/g, ' ')}
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-4">
      {/* ── 1. Branded Hero (Signature ERP Pattern) ───────────────────── */}
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
                <h1 className="text-xl font-bold tracking-tight">All Log Reports & Audit Trail</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                  Live System Audit
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/85">
                Centralized audit lineage across fees, attendance, biometric punches, exams, and payroll.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchLogs()}
              disabled={loading}
              className="gap-1.5 border-white/40 bg-white/10 text-white shadow-sm hover:bg-white/20"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadCsv}
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

      {/* ── 2. Category Tab Strip ─────────────────────────────────────── */}
      <Tabs
        value={category}
        onValueChange={(val) => {
          setCategory(val)
          setPage(1)
        }}
        className="space-y-4"
      >
        <TabsList className="h-9 gap-1 bg-muted/60 p-1 flex-wrap sm:flex-nowrap">
          <TabsTrigger
            value="all"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Layers className="size-3.5" />
            All Logs
            <span className="ml-1 rounded-full bg-black/10 dark:bg-white/20 px-1.5 py-0.2 text-[10px] font-semibold">
              {stats.totalEvents.toLocaleString()}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="fees"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Receipt className="size-3.5" />
            Fees
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <ClipboardList className="size-3.5" />
            Attendance
          </TabsTrigger>
          <TabsTrigger
            value="punches"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Fingerprint className="size-3.5" />
            Punches
          </TabsTrigger>
          <TabsTrigger
            value="exams"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Award className="size-3.5" />
            Exams
          </TabsTrigger>
          <TabsTrigger
            value="fee-config"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <SlidersHorizontal className="size-3.5" />
            Configs
          </TabsTrigger>
          <TabsTrigger
            value="salary"
            className="h-7 gap-1.5 text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-teal-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
          >
            <Banknote className="size-3.5" />
            Salary
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── 3. Configuration Bar (Signature ERP Form Strip) ───────────── */}
      <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">
            {/* Search Input */}
            <div className="space-y-1 lg:col-span-5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Search Logs
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search user, student, receipt #, action, entity..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="h-9 border-teal-200 from-teal-50 via-white to-sky-50 pl-8 pr-7 text-xs shadow-sm focus:border-teal-400 focus:ring-teal-400/20 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-sky-500/10"
                />
                {search && (
                  <button
                    onClick={() => {
                      setSearch('')
                      setPage(1)
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Date Preset */}
            <div className="space-y-1 lg:col-span-4">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Timeframe
              </Label>
              <Select
                value={datePreset}
                onValueChange={(val) => {
                  setDatePreset(val)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-full border-teal-200 from-teal-50 via-white to-sky-50 px-2 text-xs shadow-sm focus:border-teal-400 focus:ring-teal-400/20 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-sky-500/10">
                  <Calendar className="mr-1.5 size-3.5 text-teal-600 dark:text-teal-400" />
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent className="border-teal-200/80 bg-white shadow-lg dark:border-teal-500/25 dark:bg-popover">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Rows Per Page */}
            <div className="space-y-1 lg:col-span-3">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Page Size
              </Label>
              <Select
                value={String(limit)}
                onValueChange={(val) => {
                  setLimit(Number(val))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-full border-teal-200 from-teal-50 via-white to-sky-50 px-2 text-xs shadow-sm focus:border-teal-400 focus:ring-teal-400/20 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-sky-500/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-teal-200/80 bg-white shadow-lg dark:border-teal-500/25 dark:bg-popover">
                  <SelectItem value="25">25 records</SelectItem>
                  <SelectItem value="50">50 records</SelectItem>
                  <SelectItem value="100">100 records</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick Action Filters */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-teal-200/60 pt-2.5 dark:border-teal-500/20">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mr-1">
                <Filter className="size-3" />
                Actions:
              </span>
              <QuickFilterPill
                active={actionGroup === 'all'}
                onClick={() => {
                  setActionGroup('all')
                  setPage(1)
                }}
              >
                All
              </QuickFilterPill>
              <QuickFilterPill
                active={actionGroup === 'created'}
                onClick={() => {
                  setActionGroup('created')
                  setPage(1)
                }}
              >
                Created / Recorded
              </QuickFilterPill>
              <QuickFilterPill
                active={actionGroup === 'updated'}
                onClick={() => {
                  setActionGroup('updated')
                  setPage(1)
                }}
              >
                Modified / Reopened
              </QuickFilterPill>
              <QuickFilterPill
                active={actionGroup === 'deleted'}
                onClick={() => {
                  setActionGroup('deleted')
                  setPage(1)
                }}
                count={stats.sensitiveCount}
              >
                Deleted / Reversals
              </QuickFilterPill>
              <QuickFilterPill
                active={actionGroup === 'system'}
                onClick={() => {
                  setActionGroup('system')
                  setPage(1)
                }}
              >
                System / Finalized
              </QuickFilterPill>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
                Clear Filters
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Summary Stats Strip (Signature ERP 4-Col Grid) ─────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Total Events */}
        <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
            <History className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total actions
            </p>
            <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">
              {stats.totalEvents.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Fees & Billing */}
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <Receipt className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Financial Logs
            </p>
            <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">
              {(stats.feesCount + stats.salaryCount + stats.configCount).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Attendance & Punches */}
        <div className="flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <ClipboardList className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Attendance & Punches
            </p>
            <p className="text-lg font-bold leading-tight text-violet-700 dark:text-violet-300">
              {(stats.attendanceCount + stats.punchesCount).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Sensitive Actions */}
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Reversals & Deletions
            </p>
            <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">
              {stats.sensitiveCount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── 5. Log Records Stream Table ───────────────────────────────── */}
      <Card className="overflow-hidden border border-border/70 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              Audit Stream Records
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {totalCount.toLocaleString()} total
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Page {page} of {totalPages}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-3 pl-4 pr-3 sm:pl-5">Module & Time</th>
                <th className="px-3 py-3">Action & Event</th>
                <th className="px-3 py-3">Target Subject</th>
                <th className="px-3 py-3">Change Description</th>
                <th className="px-3 py-3">Performed By</th>
                <th className="py-3 pl-3 pr-4 text-right sm:pr-5">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 bg-card">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Loading audit entries…
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center">
                      <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
                        <History className="size-5 text-teal-600 dark:text-teal-300" />
                      </span>
                      <div className="space-y-0.5">
                        <h3 className="text-sm font-semibold">No audit entries found</h3>
                        <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                          {hasActiveFilters
                            ? 'No actions matched your current filters or date range.'
                            : 'Perform operations across modules to see history here.'}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((item) => {
                  const meta = CATEGORY_META[item.category]
                  const CatIcon = meta?.icon || ShieldCheck
                  const dateObj = new Date(item.createdAt)
                  const formattedDate = dateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                  const formattedTime = dateObj.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  })

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedLog(item)}
                      className="group cursor-pointer transition-colors hover:bg-muted/40"
                    >
                      {/* Module & Time */}
                      <td className="py-3 pl-4 pr-3 sm:pl-5">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                              meta?.gradient || 'from-slate-500 to-slate-700'
                            )}
                          >
                            <CatIcon className="size-4" />
                          </span>
                          <div>
                            <div className="font-semibold text-foreground">{formattedDate}</div>
                            <div className="text-[10px] text-muted-foreground">{formattedTime}</div>
                            <span className="mt-0.5 inline-block text-[10px] font-medium text-muted-foreground">
                              {item.categoryLabel}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Action & Event */}
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <div>{getActionBadge(item.actionGroup, item.action)}</div>
                          <div className="text-[11px] font-medium text-foreground line-clamp-1">
                            {item.entityType.replace(/_/g, ' ')}
                          </div>
                        </div>
                      </td>

                      {/* Target Subject */}
                      <td className="px-3 py-3">
                        {item.target ? (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-foreground line-clamp-1">
                              {item.target.name}
                            </div>
                            {item.target.subtitle && (
                              <div className="text-[10px] text-muted-foreground">
                                {item.target.subtitle}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">School General</span>
                        )}
                      </td>

                      {/* Change Description */}
                      <td className="px-3 py-3 max-w-xs">
                        <div className="space-y-0.5">
                          <p className="text-xs text-foreground line-clamp-2">
                            {item.diffSummary || item.description || 'No detailed change summary recorded'}
                          </p>
                          {item.ipAddress && (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                              <Globe className="size-2.5" />
                              {item.ipAddress}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Performed By */}
                      <td className="px-3 py-3">
                        {item.actor ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="size-6 border border-border">
                              <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                {item.actor.name?.slice(0, 2).toUpperCase() || 'US'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-foreground line-clamp-1">
                                {item.actor.name || 'System User'}
                              </div>
                              <span className="text-[10px] text-muted-foreground uppercase">
                                {item.actor.role || 'STAFF'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Automated System</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 pl-3 pr-4 text-right sm:pr-5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedLog(item)
                          }}
                          className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
                        >
                          <Eye className="mr-1 size-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-3 sm:px-6">
            <span className="text-xs text-muted-foreground">
              Showing page {page} of {totalPages} ({totalCount} items)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-8 px-3 text-xs"
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-8 px-3 text-xs"
              >
                Next
                <ChevronRight className="ml-1 size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 6. Inspection Modal (Strict AGENTS.md Pattern) ────────────── */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        {selectedLog && (
          <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-teal-500/20 bg-card p-0 shadow-2xl shadow-teal-500/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
            {/* Gradient Header */}
            <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-5 py-4 pr-12 text-white sm:px-6">
              <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full border-[18px] border-white/10" />
              <div className="pointer-events-none absolute -bottom-10 left-1/3 size-48 rounded-full bg-amber-300/15 blur-2xl" />

              <div className="relative z-10 flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm shadow-inner">
                  <ShieldCheck className="size-6 text-white" />
                </div>
                <div className="space-y-0.5">
                  <DialogTitle className="text-lg font-bold text-white">
                    Audit Log Inspection
                  </DialogTitle>
                  <DialogDescription className="text-xs text-white/80">
                    Detailed record analysis and state transition diff for ID #{selectedLog.rawId || selectedLog.id}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Scrollable Body */}
            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-teal-500/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
              {/* SECTION 1: Event & Actor Profile */}
              <div className="relative overflow-hidden rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-teal-50 p-4 shadow-sm dark:border-teal-500/25 dark:from-teal-500/15 dark:via-card dark:to-teal-500/10">
                <div className="flex items-center gap-3 border-b border-teal-100/80 pb-3 dark:border-teal-500/20">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                    <User className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Actor & Context Profile</h3>
                    <p className="text-[10px] text-muted-foreground">Identity of the user, machine and event origin</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Module Category</span>
                    <p className="font-semibold text-foreground mt-0.5">{selectedLog.categoryLabel}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Action</span>
                    <div className="mt-0.5">{getActionBadge(selectedLog.actionGroup, selectedLog.action)}</div>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Timestamp</span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {new Date(selectedLog.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Performed By</span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {selectedLog.actor?.name || 'Automated Action'}
                    </p>
                    <span className="text-[10px] text-muted-foreground">{selectedLog.actor?.role || 'SYSTEM'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">Target Subject</span>
                    <p className="font-semibold text-foreground mt-0.5">
                      {selectedLog.target?.name || 'School General'}
                    </p>
                    {selectedLog.target?.subtitle && (
                      <span className="text-[10px] text-muted-foreground">{selectedLog.target.subtitle}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">IP Address</span>
                    <p className="font-mono text-foreground mt-0.5">
                      {selectedLog.ipAddress || 'Internal Network'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Description & Summary */}
              <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10">
                <div className="flex items-center gap-3 border-b border-sky-100/80 pb-3 dark:border-sky-500/20">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
                    <History className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Change Description</h3>
                    <p className="text-[10px] text-muted-foreground">High-level summary of state modifications</p>
                  </div>
                </div>

                <div className="mt-3 text-xs leading-relaxed text-foreground">
                  {selectedLog.diffSummary || selectedLog.description || (
                    <span className="italic text-muted-foreground">No specific text summary recorded.</span>
                  )}
                </div>
              </div>

              {/* SECTION 3: Deep State Comparison (Old Value vs New Value) */}
              {(selectedLog.oldValue || selectedLog.newValue) && (
                <div className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-amber-500/10">
                  <div className="flex items-center gap-3 border-b border-amber-100/80 pb-3 dark:border-amber-500/20">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                      <Code2 className="size-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">State Transition Data</h3>
                      <p className="text-[10px] text-muted-foreground">Detailed snapshot of payload before and after modification</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {/* Old Value */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        Previous State (Old)
                      </span>
                      <div className="max-h-48 overflow-auto rounded-lg border border-border/80 bg-card p-2.5 font-mono text-[11px] text-foreground">
                        {selectedLog.oldValue ? (
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(selectedLog.oldValue, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-muted-foreground italic">None (Newly Created)</span>
                        )}
                      </div>
                    </div>

                    {/* New Value */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        New State (Updated)
                      </span>
                      <div className="max-h-48 overflow-auto rounded-lg border border-border/80 bg-card p-2.5 font-mono text-[11px] text-foreground">
                        {selectedLog.newValue ? (
                          <pre className="whitespace-pre-wrap">
                            {JSON.stringify(selectedLog.newValue, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-muted-foreground italic">None (Deleted / Reverted)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: Metadata (if any) */}
              {selectedLog.metadata && (
                <div className="relative overflow-hidden rounded-xl border border-muted-foreground/20 bg-card p-4 shadow-sm">
                  <h4 className="text-xs font-semibold text-foreground">Additional Metadata</h4>
                  <pre className="mt-2 max-h-36 overflow-auto rounded-lg border border-border/60 bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
              <div className="flex w-full items-center justify-between">
                {CATEGORY_META[selectedLog.category]?.deepLink ? (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      const link = CATEGORY_META[selectedLog.category]?.deepLink
                      if (link) router.push(link)
                    }}
                    className="h-8 p-0 text-xs text-primary"
                  >
                    Open {CATEGORY_META[selectedLog.category]?.label} View
                    <ArrowRight className="ml-1 size-3" />
                  </Button>
                ) : (
                  <div />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedLog(null)}
                  className="h-8 px-4 text-xs"
                >
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
