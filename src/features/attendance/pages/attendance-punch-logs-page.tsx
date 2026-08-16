'use client'

/**
 * Device Punch Logs — append-only audit of every punch received from
 * ZKTeco/ADMS devices (AttendanceDevicePunchLog). Shows the raw device
 * payload and what the system did with it (marked, duplicate, rejected...).
 *
 * UI follows the Mark Attendance / Attendance Credentials conventions:
 * branded hero, gradient config bar, summary stats, table-card list.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Fingerprint,
  History,
  RadioTower,
  Search,
  ShieldCheck,
  ShieldOff,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { toast } from 'sonner'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface PunchEvent {
  id: string
  serialNo: string
  deviceUserId: string
  personType: 'student' | 'teacher' | 'staff' | null
  personId: string | null
  punchTime: string
  verifyMode: string
  punchStatus: string
  workCode: string | null
  result: string
  errorDetail: string | null
  device: { id: string; name: string } | null
  person: { id: string; name: string; code: string } | null
}

interface DeviceOption {
  id: string
  name: string
  serialNo: string
}

interface PunchStats {
  total: number
  marked: number
  rejected: number
  nonTeaching: number
}

const RESULT_TONES: Record<string, { label: string; tone: 'success' | 'warn' | 'error' }> = {
  marked: { label: 'Marked present', tone: 'success' },
  updated: { label: 'Updated → present', tone: 'success' },
  duplicate: { label: 'Already present', tone: 'success' },
  duplicate_event: { label: 'Already processed', tone: 'warn' },
  unknown_device: { label: 'Unknown device', tone: 'error' },
  unknown_user: { label: 'Unknown user', tone: 'error' },
  unknown_card: { label: 'Unknown card', tone: 'error' },
  inactive_credential: { label: 'Inactive credential', tone: 'error' },
  card_revoked: { label: 'Card revoked', tone: 'error' },
  enrollment_missing: { label: 'Not enrolled', tone: 'error' },
  finalized: { label: 'Day finalized', tone: 'warn' },
  non_teaching: { label: 'Non-teaching day', tone: 'warn' },
  invalid_uid: { label: 'Invalid UID', tone: 'error' },
  ignored: { label: 'Ignored', tone: 'warn' },
}

const PERSON_TYPE_LABELS: Record<string, string> = {
  student: 'Student',
  teacher: 'Teacher',
  staff: 'Staff',
}

interface PunchLogsListState {
  page?: number
  limit?: number
  search?: string
  result?: string
  personType?: string
  deviceId?: string
  dateFrom?: string
  dateTo?: string
}

const PUNCH_LOGS_LIST_STATE_KEY = 'punch-logs:list'

export function AttendancePunchLogsPage() {
  const { toast: toastShadcn } = useToast()
  const savedListState = useAppStore((state) => state.pageState[PUNCH_LOGS_LIST_STATE_KEY] as PunchLogsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [loading, setLoading] = useState(true)
  const [punches, setPunches] = useState<PunchEvent[]>([])
  const [devices, setDevices] = useState<DeviceOption[]>([])
  const [stats, setStats] = useState<PunchStats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(savedListState?.page ?? 1)
  const [limit, setLimit] = useState(savedListState?.limit ?? 50)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [result, setResult] = useState<string>(savedListState?.result ?? 'all')
  const [personType, setPersonType] = useState<string>(savedListState?.personType ?? 'all')
  const [deviceId, setDeviceId] = useState<string>(savedListState?.deviceId ?? 'all')
  const [dateFrom, setDateFrom] = useState(savedListState?.dateFrom ?? '')
  const [dateTo, setDateTo] = useState(savedListState?.dateTo ?? '')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      }
      if (search) params.search = search
      if (result !== 'all') params.result = result
      if (personType !== 'all') params.personType = personType
      if (deviceId !== 'all') params.deviceId = deviceId
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const res = await api.get<{ punches: PunchEvent[]; devices: DeviceOption[]; total: number; stats: PunchStats }>(
        '/api/school/attendance-devices/punch-logs',
        params,
      )
      setPunches(res.punches || [])
      setDevices(res.devices || [])
      setTotal(res.total || 0)
      setStats(res.stats || null)
    } catch {
      toast.error('Could not load punch logs.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, result, personType, deviceId, dateFrom, dateTo])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const hasActiveFilters = result !== 'all' || personType !== 'all' || deviceId !== 'all' || !!search || !!dateFrom || !!dateTo

  const downloadCsv = () => {
    const params = new URLSearchParams()
    params.set('format', 'csv')
    if (search) params.set('search', search)
    if (result !== 'all') params.set('result', result)
    if (personType !== 'all') params.set('personType', personType)
    if (deviceId !== 'all') params.set('deviceId', deviceId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    window.open(`/api/school/attendance-devices/punch-logs?${params.toString()}`, '_blank')
    toastShadcn({ title: 'Export started', description: 'The CSV download should begin shortly.' })
  }

  const clearFilters = () => {
    setResult('all')
    setPersonType('all')
    setDeviceId('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    setPageState(PUNCH_LOGS_LIST_STATE_KEY, { result: 'all', personType: 'all', deviceId: 'all', search: '', dateFrom: '', dateTo: '', page: 1, limit })
  }

  const rememberListState = (patch: Partial<PunchLogsListState>) => {
    setPageState(PUNCH_LOGS_LIST_STATE_KEY, {
      page,
      limit,
      search,
      result,
      personType,
      deviceId,
      dateFrom,
      dateTo,
      ...patch,
    })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
    rememberListState({ search: value, page: 1 })
  }

  const handleResultChange = (value: string) => {
    setResult(value)
    setPage(1)
    rememberListState({ result: value, page: 1 })
  }

  const handlePersonTypeChange = (value: string) => {
    setPersonType(value)
    setPage(1)
    rememberListState({ personType: value, page: 1 })
  }

  const handleDeviceChange = (value: string) => {
    setDeviceId(value)
    setPage(1)
    rememberListState({ deviceId: value, page: 1 })
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

  const handlePageChange = (value: number) => {
    setPage(value)
    rememberListState({ page: value })
  }

  const handlePageSizeChange = (value: number) => {
    setLimit(value)
    setPage(1)
    rememberListState({ limit: value, page: 1 })
  }

  const setFilter = (key: keyof PunchLogsListState, value: string) => {
    setPage(1)
    if (key === 'result') setResult(value)
    else if (key === 'personType') setPersonType(value)
    else if (key === 'deviceId') setDeviceId(value)
    rememberListState({ [key]: value, page: 1 } as Partial<PunchLogsListState>)
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
              <Fingerprint className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">Device Punch Logs</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                  ZKTeco · ADMS
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Every punch received from your attendance devices — accepted, rejected, or ignored.
              </p>
            </div>
          </div>
          <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadCsv}
              className="gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            >
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </section>

      {/* ── Configuration Bar ───────────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-teal-200/80 bg-gradient-to-r from-teal-50 via-white to-sky-50 py-0 shadow-sm dark:border-teal-500/25 dark:from-teal-500/12 dark:via-card dark:to-sky-500/10">
        <CardContent className="p-3">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-7">
            {/* Search */}
            <div className="col-span-2 space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="PIN, name, or device serial"
                  className="h-10 w-full bg-white pl-8 pr-8 text-sm dark:bg-input/30 sm:h-9 sm:text-xs"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Result */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Result</Label>
              <Select value={result} onValueChange={handleResultChange}>
                <SelectTrigger
                  leadingIcon={<ShieldCheck className="size-3.5 text-white" />}
                  leadingIconClassName="from-sky-500 to-cyan-600"
                  className="h-10 w-full border-sky-200 from-sky-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-sky-400 focus:ring-sky-400/20 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
                >
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-sky-200/80 bg-white shadow-lg dark:border-sky-500/25 dark:bg-popover">
                  <SelectItem value="all">All results</SelectItem>
                  <SelectItem value="marked">Marked present</SelectItem>
                  <SelectItem value="updated">Updated → present</SelectItem>
                  <SelectItem value="duplicate">Already present</SelectItem>
                  <SelectItem value="finalized">Day finalized</SelectItem>
                  <SelectItem value="non_teaching">Non-teaching day</SelectItem>
                  <SelectItem value="unknown_user">Unknown user</SelectItem>
                  <SelectItem value="unknown_card">Unknown card</SelectItem>
                  <SelectItem value="unknown_device">Unknown device</SelectItem>
                  <SelectItem value="inactive_credential">Inactive credential</SelectItem>
                  <SelectItem value="card_revoked">Card revoked</SelectItem>
                  <SelectItem value="enrollment_missing">Not enrolled</SelectItem>
                  <SelectItem value="invalid_uid">Invalid UID</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Person */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Person</Label>
              <Select value={personType} onValueChange={handlePersonTypeChange}>
                <SelectTrigger
                  leadingIcon={<Users className="size-3.5 text-white" />}
                  leadingIconClassName="from-violet-500 to-purple-600"
                  className="h-10 w-full border-violet-200 from-violet-50 via-white to-purple-50 px-2 text-sm shadow-sm focus:border-violet-400 focus:ring-violet-400/20 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-input/30 dark:to-purple-500/10 sm:h-9 sm:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-violet-200/80 bg-white shadow-lg dark:border-violet-500/25 dark:bg-popover">
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="student">Students</SelectItem>
                  <SelectItem value="teacher">Teachers</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Device */}
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Device</Label>
              <Select value={deviceId} onValueChange={handleDeviceChange} disabled={devices.length === 0}>
                <SelectTrigger
                  leadingIcon={<RadioTower className="size-3.5 text-white" />}
                  leadingIconClassName="from-teal-500 to-cyan-600"
                  className="h-10 w-full border-teal-200 from-teal-50 via-white to-cyan-50 px-2 text-sm shadow-sm focus:border-teal-400 focus:ring-teal-400/20 disabled:opacity-60 dark:border-teal-500/25 dark:from-teal-500/15 dark:via-input/30 dark:to-cyan-500/10 sm:h-9 sm:text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64 border-teal-200/80 bg-white shadow-lg dark:border-teal-500/25 dark:bg-popover">
                  <SelectItem value="all">All devices</SelectItem>
                  {devices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} - {d.serialNo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
          </div>

          {/* Quick filters */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Filter className="size-3" />
                Quick:
              </span>
              <QuickFilter active={result === 'marked'} tone="success" onClick={() => setFilter('result', 'marked')}>
                Marked present
              </QuickFilter>
              <QuickFilter active={result === 'non_teaching'} tone="warn" onClick={() => setFilter('result', 'non_teaching')}>
                Non-teaching
              </QuickFilter>
              <QuickFilter active={result === 'unknown_user'} tone="error" onClick={() => setFilter('result', 'unknown_user')}>
                Unknown user
              </QuickFilter>
              <QuickFilter active={result === 'finalized'} tone="warn" onClick={() => setFilter('result', 'finalized')}>
                After-finalize
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
      {!loading && total > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {/* Total */}
          <div className="flex items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm">
              <Fingerprint className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total punches</p>
              <p className="text-lg font-bold leading-tight text-sky-700 dark:text-sky-300">{total.toLocaleString()}</p>
            </div>
          </div>

          {/* Marked */}
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Check className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Marked present</p>
              <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-300">{(stats?.marked ?? 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Rejected */}
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-red-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-red-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm">
              <ShieldOff className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rejected</p>
              <p className="text-lg font-bold leading-tight text-rose-700 dark:text-rose-300">{(stats?.rejected ?? 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Non-teaching */}
          <div className="flex items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-3 shadow-sm transition-shadow hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
              <CalendarOff className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Non-teaching</p>
              <p className="text-lg font-bold leading-tight text-amber-700 dark:text-amber-300">{(stats?.nonTeaching ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Punch History List Card ─────────────────────────────────── */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        {/* Header band */}
        <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/80 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                <History className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Punch history</h3>
                <p className="text-[10px] text-muted-foreground">Raw device punches and how each was handled</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {loading && <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
              <Badge variant="secondary" className="h-5 text-[10px]">
                {total.toLocaleString()} punches
              </Badge>
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="hidden items-center gap-3 border-b border-cyan-200/70 bg-gradient-to-r from-cyan-100/80 via-sky-50 to-violet-100/70 px-5 py-2 dark:border-cyan-500/20 dark:from-cyan-500/15 dark:via-sky-500/10 dark:to-violet-500/15 lg:flex">
          <span className="w-8 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">#</span>
          <span className="w-10" />
          <span className="w-32 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time</span>
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Person</span>
          <span className="w-[170px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Device</span>
          <span className="w-[150px] text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Result</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Loading punches…
            </div>
          ) : punches.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-3 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-cyan-100 dark:from-teal-500/20 dark:to-cyan-500/20">
                <Fingerprint className="size-5 text-teal-600 dark:text-teal-300" />
              </span>
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold">No punches yet</h3>
                <p className="mx-auto max-w-xs text-xs text-muted-foreground">
                  {hasActiveFilters
                    ? 'No punches match this selection. Try widening your filters.'
                    : 'Every punch your device pushes — accepted or rejected — appears here as it happens.'}
                </p>
              </div>
            </div>
          ) : (
            punches.map((punch, idx) => (
              <PunchRow key={punch.id} punch={punch} number={(page - 1) * limit + idx + 1} />
            ))
          )}
        </div>

        {/* Footer legend */}
        {!loading && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-cyan-50/90 to-violet-100/70 px-3 py-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15 sm:px-5 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-muted-foreground sm:flex sm:items-center sm:gap-4">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" />
                Marked: <strong className="text-foreground">{(stats?.marked ?? 0).toLocaleString()}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-rose-500" />
                Rejected: <strong className="text-foreground">{(stats?.rejected ?? 0).toLocaleString()}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-400" />
                Non-teaching: <strong className="text-foreground">{(stats?.nonTeaching ?? 0).toLocaleString()}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-300">
              <RadioTower className="size-3.5" />
              Live from ZKTeco / ADMS devices
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <Pagination
            page={page}
            limit={limit}
            total={total}
            totalPages={totalPages}
            itemLabel="punches"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </Card>
    </div>
  )
}

function PunchRow({ punch, number }: { punch: PunchEvent; number: number }) {
  const tone = RESULT_TONES[punch.result] || { label: punch.result, tone: 'error' as const }
  const personTypeLabel = punch.personType ? PERSON_TYPE_LABELS[punch.personType] || punch.personType : null
  return (
    <div className="px-3 py-3 transition-colors hover:bg-muted/30 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:flex-1">
          <span className="w-6 shrink-0 text-center font-mono text-[11px] text-muted-foreground lg:w-8">{number}</span>
          <Avatar className="size-10 shrink-0 lg:size-9">
            <AvatarFallback
              className={cn(
                'text-[11px] font-bold',
                tone.tone === 'success' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
                tone.tone === 'warn' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
                tone.tone === 'error' && 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
                !punch.person && 'bg-muted text-muted-foreground',
              )}
            >
              {punch.person ? initials(punch.person.name) : <UserRound className="size-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {punch.person ? punch.person.name : 'Unmapped user'}
              {personTypeLabel && (
                <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {personTypeLabel}
                </span>
              )}
              {punch.person?.code && (
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {punch.personType === 'student' ? 'Adm' : 'ID'} {punch.person.code}
                </span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              <code className="font-mono">{punch.deviceUserId}</code>
              {' · '}
              <span className="sm:hidden">{punch.device?.name || punch.serialNo}</span>
              <span className="hidden sm:inline">
                {punch.verifyMode ? `Verify ${punch.verifyMode}` : 'Fingerprint/Card'}
                {punch.punchStatus ? ` · Status ${punch.punchStatus}` : ''}
              </span>
              {punch.errorDetail ? ` · ${punch.errorDetail}` : ''}
              {' · '}
              <span className="sm:hidden">{formatShortTimestamp(punch.punchTime)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 lg:w-[170px] lg:shrink-0 lg:justify-start">
          <div className="truncate text-xs">
            <p className="truncate font-medium text-foreground">{punch.device?.name || punch.serialNo}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{punch.serialNo}</p>
          </div>
          <span className="hidden w-32 shrink-0 text-[11px] tabular-nums text-muted-foreground lg:block">
            {formatShortTimestamp(punch.punchTime)}
          </span>
        </div>

        <Badge
          variant="outline"
          className={cn(
            'shrink-0 text-[10px] lg:w-[150px] lg:justify-end',
            tone.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            tone.tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
            tone.tone === 'error' && 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
          )}
        >
          {tone.label}
        </Badge>
      </div>
    </div>
  )
}

// ─── Shared layout primitives ───────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

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

// ─── Utils ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function formatShortTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return (
    d.toLocaleDateString([], { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}