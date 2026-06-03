'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
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
import { ClipboardList, Plus, Search, Settings2, Calendar as CalIcon, TicketCheck } from 'lucide-react'

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
const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  ongoing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  result_published: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
}

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
    <div className="space-y-5">
      <PageHeader
        title="Exams"
        description="All exams across paradigms and groups."
        backAction={{ onClick: () => router.push('/exams') }}
        action={{
          label: 'New exam',
          icon: Plus,
          onClick: () => router.push('/exams/new'),
        }}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Search by name, code, or group…"
              value={search}
              onChange={(e) => {
                const value = e.target.value
                setSearch(value)
                rememberListState({ search: value })
              }}
            />
          </div>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => {
              const value = v === 'all' ? '' : v
              setStatusFilter(value)
              rememberListState({ statusFilter: value })
            }}
          >
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
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
            <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Group" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.paradigm.name} · {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No exams found"
          description={
            exams.length === 0
              ? 'Create your first exam to get started.'
              : 'Try adjusting the filters above.'
          }
          action={
            exams.length === 0
              ? { label: 'Create exam', onClick: () => router.push('/exams/new') }
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const tone = STATUS_TONE[e.status] ?? STATUS_TONE.draft
            return (
              <Card
                key={e.id}
                className="cursor-pointer transition hover:border-primary/40"
                onClick={() => router.push(`/exams/${e.id}/configure`)}
              >
                <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{e.name}</h3>
                      {e.shortCode && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {e.shortCode}
                        </Badge>
                      )}
                      <Badge className={tone}>{e.status.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{e.examType}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.group.name} · {e.academicYear} · {formatDate(e.startDate)}
                      {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e._count.subjectConfigs} subject{e._count.subjectConfigs === 1 ? '' : 's'} ·{' '}
                      {e._count.schedules} schedule row{e._count.schedules === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        router.push(`/exams/${e.id}/configure`)
                      }}
                    >
                      <Settings2 className="size-3.5" /> Configure
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        router.push(`/exams/${e.id}/schedule`)
                      }}
                    >
                      <CalIcon className="size-3.5" /> Schedule
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        router.push(`/exams/${e.id}/admit-cards`)
                      }}
                    >
                      <TicketCheck className="size-3.5" /> Admit cards
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
