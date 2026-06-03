'use client'

/**
 * RFID audit log — two tabs:
 *   • Taps  — every tap (success, duplicate, unknown, rejected) from RfidTapLog
 *   • Cards — issued + revoked events derived from StudentCard rows
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Filter,
  History,
  ScanLine,
  Search,
  ShieldOff,
  Sparkles,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

interface CardEvent {
  id: string
  cardId: string
  action: 'issued' | 'revoked'
  at: string
  uid: string
  academicYear: string
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
  }
  performedBy: string | null
  performedByName: string | null
  reason: string | null
  printNotes: string | null
}

interface TapEvent {
  id: string
  uid: string
  source: 'kiosk' | 'webhook' | string
  tappedAt: string
  result: string
  academicYear: string | null
  errorDetail: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
  } | null
  device: { id: string; name: string } | null
}

const RESULT_TONES: Record<string, { label: string; tone: 'success' | 'warn' | 'error' }> = {
  marked: { label: 'Marked present', tone: 'success' },
  updated: { label: 'Updated → present', tone: 'success' },
  duplicate: { label: 'Already present', tone: 'success' },
  finalized: { label: 'Day finalized', tone: 'warn' },
  non_teaching: { label: 'Non-teaching day', tone: 'warn' },
  unknown_card: { label: 'Unknown card', tone: 'error' },
  card_revoked: { label: 'Card revoked', tone: 'error' },
  enrollment_missing: { label: 'Not enrolled', tone: 'error' },
  invalid_uid: { label: 'Invalid UID', tone: 'error' },
}

interface RfidAuditPageState {
  activeTab?: 'taps' | 'cards'
}

interface RfidTapsListState {
  page?: number
  limit?: number
  search?: string
  result?: string
  source?: string
  dateFrom?: string
  dateTo?: string
}

interface RfidCardsListState {
  page?: number
  limit?: number
  search?: string
  action?: string
  dateFrom?: string
  dateTo?: string
}

const RFID_AUDIT_PAGE_STATE_KEY = 'rfid:audit:page'
const RFID_AUDIT_TAPS_LIST_STATE_KEY = 'rfid:audit:taps:list'
const RFID_AUDIT_CARDS_LIST_STATE_KEY = 'rfid:audit:cards:list'

export function RfidAuditPage() {
  const savedPageState = useAppStore((state) => state.pageState[RFID_AUDIT_PAGE_STATE_KEY] as RfidAuditPageState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [activeTab, setActiveTab] = useState<'taps' | 'cards'>(savedPageState?.activeTab ?? 'taps')

  const handleTabChange = (value: string) => {
    const nextTab = value as 'taps' | 'cards'
    setActiveTab(nextTab)
    setPageState(RFID_AUDIT_PAGE_STATE_KEY, { activeTab: nextTab })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight">RFID Audit Log</h1>
          <p className="text-xs text-muted-foreground">
            Every tap, every card issued or revoked.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
        <TabsList className="h-9">
          <TabsTrigger value="taps" className="h-7 gap-1.5 text-xs">
            <ScanLine className="size-3.5" />
            Taps
          </TabsTrigger>
          <TabsTrigger value="cards" className="h-7 gap-1.5 text-xs">
            <CreditCard className="size-3.5" />
            Card events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="taps" className="mt-0">
          <TapsTab />
        </TabsContent>
        <TabsContent value="cards" className="mt-0">
          <CardsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Taps tab ───────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function TapsTab() {
  const savedListState = useAppStore((state) => state.pageState[RFID_AUDIT_TAPS_LIST_STATE_KEY] as RfidTapsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [loading, setLoading] = useState(true)
  const [taps, setTaps] = useState<TapEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(savedListState?.page ?? 1)
  const [limit, setLimit] = useState(savedListState?.limit ?? 50)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [result, setResult] = useState<string>(savedListState?.result ?? 'all')
  const [source, setSource] = useState<string>(savedListState?.source ?? 'all')
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
      if (source !== 'all') params.source = source
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const res = await api.get<{ taps: TapEvent[]; total: number }>(
        '/api/school/rfid/audit/taps',
        params,
      )
      setTaps(res.taps || [])
      setTotal(res.total || 0)
    } catch {
      toast.error('Could not load tap log.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, result, source, dateFrom, dateTo])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const hasActiveFilters = result !== 'all' || source !== 'all' || !!search || !!dateFrom || !!dateTo

  const downloadCsv = () => {
    const params = new URLSearchParams()
    params.set('format', 'csv')
    if (search) params.set('search', search)
    if (result !== 'all') params.set('result', result)
    if (source !== 'all') params.set('source', source)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    window.open(`/api/school/rfid/audit/taps?${params.toString()}`, '_blank')
  }

  const clearFilters = () => {
    setResult('all')
    setSource('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    setPageState(RFID_AUDIT_TAPS_LIST_STATE_KEY, { result: 'all', source: 'all', search: '', dateFrom: '', dateTo: '', page: 1, limit })
  }

  const rememberListState = (patch: Partial<RfidTapsListState>) => {
    setPageState(RFID_AUDIT_TAPS_LIST_STATE_KEY, {
      page,
      limit,
      search,
      result,
      source,
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

  const handleSourceChange = (value: string) => {
    setSource(value)
    setPage(1)
    rememberListState({ source: value, page: 1 })
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

  return (
    <div className="space-y-3">
      <FilterCard
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onExport={downloadCsv}
        quickFilters={
          <>
            <QuickFilter
              active={result === 'unknown_card'}
              tone="error"
              onClick={() => {
                setResult('unknown_card')
                setPage(1)
              }}
            >
              Unknown cards
            </QuickFilter>
            <QuickFilter
              active={result === 'finalized'}
              tone="warn"
              onClick={() => {
                setResult('finalized')
                setPage(1)
              }}
            >
              After-finalize
            </QuickFilter>
            <QuickFilter
              active={result === 'card_revoked'}
              tone="error"
              onClick={() => {
                setResult('card_revoked')
                setPage(1)
              }}
            >
              Revoked card use
            </QuickFilter>
          </>
        }
      >
        <FilterField label="Search" className="sm:col-span-2 lg:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="UID, name, or admission no."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </FilterField>
        <FilterField label="Result">
          <Select
            value={result}
            onValueChange={handleResultChange}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="marked">Marked present</SelectItem>
              <SelectItem value="updated">Updated → present</SelectItem>
              <SelectItem value="duplicate">Already present</SelectItem>
              <SelectItem value="finalized">Day finalized</SelectItem>
              <SelectItem value="non_teaching">Non-teaching day</SelectItem>
              <SelectItem value="unknown_card">Unknown card</SelectItem>
              <SelectItem value="card_revoked">Card revoked</SelectItem>
              <SelectItem value="enrollment_missing">Not enrolled</SelectItem>
              <SelectItem value="invalid_uid">Invalid UID</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Source">
          <Select
            value={source}
            onValueChange={handleSourceChange}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="kiosk">Kiosk</SelectItem>
              <SelectItem value="webhook">Networked reader</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From">
          <DatePicker
            value={dateFrom}
            onChange={handleDateFromChange}
            disableFuture
            showQuickActions
            placeholder="Any date"
            triggerClassName="h-8 text-sm"
          />
        </FilterField>
        <FilterField label="To">
          <DatePicker
            value={dateTo}
            onChange={handleDateToChange}
            disableFuture
            showQuickActions
            placeholder="Any date"
            triggerClassName="h-8 text-sm"
          />
        </FilterField>
      </FilterCard>

      <Card className="overflow-hidden p-0">
        <ResultsHeader
          left={loading ? '…' : `${total.toLocaleString()} ${total === 1 ? 'tap' : 'taps'}${hasActiveFilters ? ' (filtered)' : ''}`}
        />
        {loading ? (
          <RowSkeleton rows={8} />
        ) : taps.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="No taps yet"
            description="Every tap — successful or not — appears here as it happens."
          />
        ) : (
          <ul className="divide-y">
            {taps.map((t) => (
              <TapRow key={t.id} tap={t} />
            ))}
          </ul>
        )}
        {!loading && total > 0 && (
          <Pagination
            page={page}
            limit={limit}
            total={total}
            totalPages={totalPages}
            itemLabel="taps"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        )}
      </Card>
    </div>
  )
}

function TapRow({ tap }: { tap: TapEvent }) {
  const tone = RESULT_TONES[tap.result] || { label: tap.result, tone: 'error' as const }
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40">
      <span
        className={cn(
          'inline-block size-2 shrink-0 rounded-full',
          tone.tone === 'success' && 'bg-emerald-500',
          tone.tone === 'warn' && 'bg-amber-500',
          tone.tone === 'error' && 'bg-rose-500',
        )}
      />
      <span className="hidden w-32 shrink-0 text-[11px] tabular-nums text-muted-foreground sm:block">
        {formatShortTimestamp(tap.tappedAt)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {tap.student ? (
            <>
              <span className="font-medium">
                {tap.student.firstName} {tap.student.lastName}
              </span>
              {tap.student.admissionNumber && (
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  Adm {tap.student.admissionNumber}
                </span>
              )}
            </>
          ) : (
            <span className="italic text-muted-foreground">No matching student</span>
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          <code className="font-mono">{tap.uid}</code>
          {' · '}
          {tap.source === 'kiosk' ? 'Kiosk' : tap.device?.name || 'Gate reader'}
          {tap.errorDetail ? ` · ${tap.errorDetail}` : ''}
          <span className="sm:hidden"> · {formatShortTimestamp(tap.tappedAt)}</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn(
          'shrink-0 text-[10px]',
          tone.tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          tone.tone === 'warn' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          tone.tone === 'error' && 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        )}
      >
        {tone.label}
      </Badge>
    </li>
  )
}

// ─── Cards tab ──────────────────────────────────────────────────────────────

function CardsTab() {
  const savedListState = useAppStore((state) => state.pageState[RFID_AUDIT_CARDS_LIST_STATE_KEY] as RfidCardsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<CardEvent[]>([])
  const [page, setPage] = useState(savedListState?.page ?? 1)
  const [limit, setLimit] = useState(savedListState?.limit ?? 50)
  const [hasMore, setHasMore] = useState(false)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [action, setAction] = useState<string>(savedListState?.action ?? 'all')
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
      if (action !== 'all') params.action = action
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const res = await api.get<{ events: CardEvent[]; hasMore: boolean }>(
        '/api/school/rfid/audit/cards',
        params,
      )
      setEvents(res.events || [])
      setHasMore(res.hasMore || false)
    } catch {
      toast.error('Could not load card events.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, action, dateFrom, dateTo])

  useEffect(() => {
    void load()
  }, [load])

  const hasActiveFilters = action !== 'all' || !!search || !!dateFrom || !!dateTo

  const downloadCsv = () => {
    const params = new URLSearchParams()
    params.set('format', 'csv')
    if (search) params.set('search', search)
    if (action !== 'all') params.set('action', action)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    window.open(`/api/school/rfid/audit/cards?${params.toString()}`, '_blank')
  }

  const clearFilters = () => {
    setAction('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
    setPageState(RFID_AUDIT_CARDS_LIST_STATE_KEY, { action: 'all', search: '', dateFrom: '', dateTo: '', page: 1, limit })
  }

  const rememberListState = (patch: Partial<RfidCardsListState>) => {
    setPageState(RFID_AUDIT_CARDS_LIST_STATE_KEY, {
      page,
      limit,
      search,
      action,
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

  const handleActionChange = (value: string) => {
    setAction(value)
    setPage(1)
    rememberListState({ action: value, page: 1 })
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

  return (
    <div className="space-y-3">
      <FilterCard
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
        onExport={downloadCsv}
        quickFilters={
          <>
            <QuickFilter
              active={action === 'issued'}
              tone="success"
              onClick={() => {
                setAction('issued')
                setPage(1)
              }}
            >
              Issued
            </QuickFilter>
            <QuickFilter
              active={action === 'revoked'}
              tone="error"
              onClick={() => {
                setAction('revoked')
                setPage(1)
              }}
            >
              Revoked
            </QuickFilter>
          </>
        }
      >
        <FilterField label="Search" className="sm:col-span-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="UID, name, or admission no."
              className="h-8 pl-8 text-sm"
            />
          </div>
        </FilterField>
        <FilterField label="Action">
          <Select
            value={action}
            onValueChange={handleActionChange}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="issued">Issued</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="From">
          <DatePicker
            value={dateFrom}
            onChange={handleDateFromChange}
            disableFuture
            showQuickActions
            placeholder="Any date"
            triggerClassName="h-8 text-sm"
          />
        </FilterField>
        <FilterField label="To">
          <DatePicker
            value={dateTo}
            onChange={handleDateToChange}
            disableFuture
            showQuickActions
            placeholder="Any date"
            triggerClassName="h-8 text-sm"
          />
        </FilterField>
      </FilterCard>

      <Card className="overflow-hidden p-0">
        <ResultsHeader
          left={loading ? '…' : `${events.length} ${events.length === 1 ? 'event' : 'events'} on this page${hasActiveFilters ? ' (filtered)' : ''}`}
        />
        {loading ? (
          <RowSkeleton rows={6} />
        ) : events.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No card events"
            description="Card issue and revoke actions appear here automatically."
          />
        ) : (
          <ul className="divide-y">
            {events.map((e) => (
              <CardEventRow key={e.id} event={e} />
            ))}
          </ul>
        )}
        {!loading && events.length > 0 && (
          <Pagination
            page={page}
            limit={limit}
            total={null}
            totalPages={hasMore ? page + 1 : page}
            itemLabel="events"
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            itemsOnPage={events.length}
          />
        )}
      </Card>
    </div>
  )
}

function CardEventRow({ event }: { event: CardEvent }) {
  const isIssue = event.action === 'issued'
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40">
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          isIssue
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
        )}
      >
        {isIssue ? <Sparkles className="size-3.5" /> : <ShieldOff className="size-3.5" />}
      </div>
      <span className="hidden w-32 shrink-0 text-[11px] tabular-nums text-muted-foreground sm:block">
        {formatShortTimestamp(event.at)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate">
          <span className="font-medium">
            {event.student.firstName} {event.student.lastName}
          </span>
          {event.student.admissionNumber && (
            <span className="ml-1.5 text-[11px] text-muted-foreground">
              Adm {event.student.admissionNumber}
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          <code className="font-mono">{event.uid}</code>
          {' · '}
          {event.academicYear}
          {event.performedByName ? ` · by ${event.performedByName}` : ''}
          {event.reason ? ` · "${event.reason}"` : ''}
          <span className="sm:hidden"> · {formatShortTimestamp(event.at)}</span>
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn(
          'shrink-0 text-[10px] uppercase',
          isIssue
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        )}
      >
        {event.action}
      </Badge>
    </li>
  )
}

// ─── Shared layout primitives ───────────────────────────────────────────────

function FilterCard({
  children,
  quickFilters,
  hasActiveFilters,
  onClear,
  onExport,
}: {
  children: React.ReactNode
  quickFilters: React.ReactNode
  hasActiveFilters: boolean
  onClear: () => void
  onExport: () => void
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="space-y-2.5 p-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">{children}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Filter className="size-3" />
              Quick:
            </span>
            {quickFilters}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClear}
                className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
                Clear
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onExport} className="h-7 gap-1.5 text-xs">
            <Download className="size-3" />
            Export CSV
          </Button>
        </div>
      </div>
    </Card>
  )
}

function FilterField({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function ResultsHeader({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      <span>{left}</span>
      {right && <span>{right}</span>}
    </div>
  )
}

function RowSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <Skeleton className="hidden h-3.5 w-28 sm:block" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

/**
 * Pagination — matches the students-page layout exactly:
 *   • Left:  "Rows per page" selector + "Showing X to Y of Z items"
 *   • Right: <  1  2  3 ... N  >  with numbered page buttons (max 5 visible)
 *
 * Supports two modes:
 *   - When `total` is known → "Showing X to Y of Z" with full numbered nav
 *   - When `total` is null  → "Showing N events on this page" with Prev/Next
 *     (used by cards tab where the flattened event total isn't computed)
 */
function Pagination({
  page,
  limit,
  total,
  totalPages,
  itemLabel,
  itemsOnPage,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  limit: number
  total: number | null
  totalPages: number
  itemLabel: string
  itemsOnPage?: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const knowsTotal = total !== null
  const from = knowsTotal ? (total === 0 ? 0 : (page - 1) * limit + 1) : 0
  const to = knowsTotal ? Math.min(page * limit, total!) : 0

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
          {knowsTotal
            ? `Showing ${from} to ${to} of ${total} ${itemLabel}`
            : `Showing ${itemsOnPage ?? 0} ${itemLabel} on this page`}
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

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mx-auto max-w-xs text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

// ─── Utils ──────────────────────────────────────────────────────────────────

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
