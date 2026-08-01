'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import {
  ClipboardCheck,
  ClipboardList,
  Plus,
  Search,
  Settings2,
  Calendar as CalIcon,
  TicketCheck,
  BarChart3,
  Filter,
  Layers3,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { examStatusMeta } from '@/features/exams/lib/status-meta'

interface ExamRow {
  id: string
  name: string
  shortCode: string | null
  examType: string
  status: string
  startDate: string | null
  endDate: string | null
  academicYear: string
  examGroupId: string
  group: { id: string; name: string; paradigmId: string }
  _count: { subjectConfigs: number; schedules: number }
}

interface GroupOption {
  id: string
  name: string
  paradigmId: string
  paradigm: { id: string; name: string; academicYear: string }
}

interface ExamListState {
  search: string
  statusFilter: string
  groupFilter: string
}

const STATUSES = ['', 'draft', 'scheduled', 'ongoing', 'completed', 'result_published']
const EXAM_LIST_STATE_KEY = 'exams:list'

const CARD_TONES = [
  {
    card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    header: 'from-sky-500/[0.08] via-white/40 to-cyan-500/[0.08]',
    icon: 'from-sky-500 to-cyan-600',
  },
  {
    card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
    header: 'from-emerald-500/[0.08] via-white/40 to-teal-500/[0.08]',
    icon: 'from-emerald-500 to-teal-600',
  },
  {
    card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    header: 'from-violet-500/[0.08] via-white/40 to-purple-500/[0.08]',
    icon: 'from-violet-500 to-purple-600',
  },
  {
    card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    header: 'from-amber-500/[0.08] via-white/40 to-orange-500/[0.08]',
    icon: 'from-amber-500 to-orange-600',
  },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ExamListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const initialGroup = searchParams.get('examGroupId') ?? ''
  const savedListState = useAppStore((state) => state.pageState[EXAM_LIST_STATE_KEY] as ExamListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)

  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<ExamRow[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [statusFilter, setStatusFilter] = useState(savedListState?.statusFilter ?? '')
  const [groupFilter, setGroupFilter] = useState(initialGroup || savedListState?.groupFilter || '')
  const [search, setSearch] = useState(savedListState?.search ?? '')

  const rememberListState = useCallback((patch: Partial<ExamListState>) => {
    setPageState(EXAM_LIST_STATE_KEY, {
      search,
      statusFilter,
      groupFilter,
      ...patch,
    })
  }, [groupFilter, search, setPageState, statusFilter])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusFilter) params.status = statusFilter
      if (groupFilter) params.examGroupId = groupFilter
      const [examsRes, groupsRes] = await Promise.all([
        api.get<{ exams: ExamRow[] }>('/api/school/exams', params),
        api.get<{ groups: GroupOption[] }>('/api/school/exams/groups'),
      ])
      setExams(examsRes.exams)
      setGroups(groupsRes.groups)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load exams',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, groupFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (!search.trim()) return exams
    const q = search.trim().toLowerCase()
    return exams.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.shortCode ?? '').toLowerCase().includes(q) ||
        e.group.name.toLowerCase().includes(q),
    )
  }, [exams, search])

  return (
    <div className="space-y-4">
      <GradientHero
        icon={ClipboardList}
        title="Exams"
        badge={`${exams.length} exam${exams.length === 1 ? '' : 's'}`}
        description="All exams across patterns and terms."
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'New exam',
                icon: Plus,
                onClick: () => router.push('/exams/new'),
              }
            : undefined
        }
      />

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 border-sky-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
              placeholder="Search by name, code, or term…"
              value={search}
              onChange={(e) => {
                const value = e.target.value
                setSearch(value)
                rememberListState({ search: value })
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  rememberListState({ search: '' })
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => {
              const value = v === 'all' ? '' : v
              setStatusFilter(value)
              rememberListState({ statusFilter: value })
            }}
          >
            <SelectTrigger
              leadingIcon={<Filter className="size-3.5 text-white" />}
              leadingIconClassName="from-violet-500 to-purple-600"
              className="h-9 w-40 border-violet-200 bg-white dark:border-violet-500/25 dark:bg-input/30"
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.filter(Boolean).map((s) => (
                <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={groupFilter || 'all'}
            onValueChange={(v) => {
              const value = v === 'all' ? '' : v
              setGroupFilter(value)
              rememberListState({ groupFilter: value })
            }}
          >
            <SelectTrigger
              leadingIcon={<Layers3 className="size-3.5 text-white" />}
              leadingIconClassName="from-sky-500 to-cyan-600"
              className="h-9 w-56 border-sky-200 bg-white dark:border-sky-500/25 dark:bg-input/30"
            >
              <SelectValue placeholder="Term" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All terms</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.paradigm.name} · {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {exams.length > 0 && (
            <Badge className="h-9 w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              {filtered.length} showing
            </Badge>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <GradientEmptyState
          icon={ClipboardList}
          title="No exams found"
          description={
            exams.length === 0
              ? 'Create your first exam to get started.'
              : 'Try adjusting the filters above.'
          }
          {...(exams.length === 0 && hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? { actionLabel: 'Create exam', onAction: () => router.push('/exams/new') }
            : {})}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((e, index) => {
            const status = examStatusMeta(e.status)
            const tone = CARD_TONES[index % CARD_TONES.length]
            return (
              <Card
                key={e.id}
                className={cn('group cursor-pointer gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', tone.card)}
                onClick={() =>
                  hasAnyPermission([PERMISSIONS.EXAM_MARKS, PERMISSIONS.EXAM_MANAGE]) &&
                  router.push(`/exams/${e.id}/marks-entry`)
                }
              >
                <div className={cn('flex items-start gap-3 border-b border-current/10 bg-gradient-to-r p-3.5', tone.header)}>
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', tone.icon)}>
                    <ClipboardList className="size-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 truncate text-base font-semibold leading-tight">{e.name}</h3>
                      {e.shortCode && (
                        <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 font-mono text-[10px]">
                          {e.shortCode}
                        </Badge>
                      )}
                      <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                      <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 text-[10px] capitalize">
                        {e.examType}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.group.name} · {e.academicYear} · {formatDate(e.startDate)}
                      {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <p className="text-xs text-muted-foreground">
                    {e._count.subjectConfigs} subject{e._count.subjectConfigs === 1 ? '' : 's'} ·{' '}
                    {e._count.schedules} schedule row{e._count.schedules === 1 ? '' : 's'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          router.push(`/exams/${e.id}/configure`)
                        }}
                      >
                        <Settings2 className="size-3.5" /> Configure
                      </Button>
                    )}
                    {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          router.push(`/exams/${e.id}/schedule`)
                        }}
                      >
                        <CalIcon className="size-3.5" /> Schedule
                      </Button>
                    )}
                    {hasAnyPermission([PERMISSIONS.EXAM_RESULTS]) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          router.push(`/exams/${e.id}/results`)
                        }}
                      >
                        <BarChart3 className="size-3.5" /> Results
                      </Button>
                    )}
                    {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          router.push(`/exams/${e.id}/admit-cards`)
                        }}
                      >
                        <TicketCheck className="size-3.5" /> Admit cards
                      </Button>
                    )}
                    {hasAnyPermission([PERMISSIONS.EXAM_MARKS, PERMISSIONS.EXAM_MANAGE]) && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          router.push(`/exams/${e.id}/marks-entry`)
                        }}
                      >
                        <ClipboardCheck className="size-3.5" /> Enter marks
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
