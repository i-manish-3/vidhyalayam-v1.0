'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  GradientHero,
  LoadingState,
  GradientEmptyState,
  TintedStatCard,
} from '@/components/shared'
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
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import {
  ClipboardCheck,
  Search,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  FileSpreadsheet,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Filter,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { examStatusMeta } from '@/features/exams/lib/status-meta'
import { ExamInstructionsButton } from '@/features/exams/components/exam-instructions-button'
import { MarksEntryPage } from '@/features/exams/pages/marks-entry-page'

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
    card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    header: 'from-amber-500/[0.08] via-white/40 to-orange-500/[0.08]',
    icon: 'from-amber-500 to-orange-600',
  },
  {
    card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    header: 'from-violet-500/[0.08] via-white/40 to-purple-500/[0.08]',
    icon: 'from-violet-500 to-purple-600',
  },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function MarksEntryHubPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()

  const urlExamId = searchParams.get('examId')
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<ExamRow[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [examsRes, groupsRes] = await Promise.all([
        api.get<{ exams: ExamRow[] }>('/api/school/exams'),
        api.get<{ groups: GroupOption[] }>('/api/school/exams/groups'),
      ])
      setExams(examsRes.exams || [])
      setGroups(groupsRes.groups || [])
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load exams',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredExams = useMemo(() => {
    return exams.filter((e) => {
      if (statusFilter && statusFilter !== 'all' && e.status !== statusFilter) return false
      if (groupFilter && groupFilter !== 'all' && e.examGroupId !== groupFilter) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const matchesName = e.name.toLowerCase().includes(q)
        const matchesCode = (e.shortCode ?? '').toLowerCase().includes(q)
        const matchesGroup = e.group.name.toLowerCase().includes(q)
        if (!matchesName && !matchesCode && !matchesGroup) return false
      }
      return true
    })
  }, [exams, groupFilter, search, statusFilter])

  // If a specific examId is provided in URL query parameters, render the MarksEntryPage directly with a header switcher
  if (urlExamId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-500/10"
            onClick={() => router.push('/exams/marks-entry')}
          >
            <ArrowLeft className="size-4" /> Switch Exam
          </Button>

          {exams.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">Change exam:</span>
              <Select
                value={urlExamId}
                onValueChange={(val) => router.push(`/exams/marks-entry?examId=${val}`)}
              >
                <SelectTrigger className="h-8 w-48 text-xs sm:w-60">
                  <SelectValue placeholder="Select another exam..." />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id} className="text-xs">
                      {ex.name} ({ex.academicYear})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <MarksEntryPage examId={urlExamId} />
      </div>
    )
  }

  const ongoingCount = exams.filter((e) => e.status === 'ongoing').length
  const completedCount = exams.filter((e) => e.status === 'completed').length

  return (
    <div className="space-y-4">
      <GradientHero
        icon={ClipboardCheck}
        title="Enter Marks"
        badge={`${exams.length} Exam${exams.length === 1 ? '' : 's'}`}
        description="Select an exam below to enter, review, and finalize student scores and grades."
        extraActions={<ExamInstructionsButton />}
      />

      {/* Quick Summary Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TintedStatCard
          icon={ClipboardCheck}
          value={exams.length}
          label="Total Exams"
          tone="sky"
          subtitle="All academic sessions"
        />
        <TintedStatCard
          icon={Sparkles}
          value={ongoingCount}
          label="Ongoing Exams"
          tone="amber"
          subtitle="Ready for marks entry"
        />
        <TintedStatCard
          icon={CheckCircle2}
          value={completedCount}
          label="Completed"
          tone="emerald"
          subtitle="Evaluation finished"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Filter and Search Bar */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by exam name or group..."
              className="h-9 pl-9 text-xs"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 text-xs sm:w-44">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="result_published">Result Published</SelectItem>
            </SelectContent>
          </Select>

          {groups.length > 0 && (
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="h-9 w-36 text-xs sm:w-44">
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(search || statusFilter !== 'all' || groupFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setGroupFilter('all')
              }}
            >
              Reset Filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <LoadingState />
      ) : filteredExams.length === 0 ? (
        <GradientEmptyState
          icon={ClipboardCheck}
          title="No exams found"
          description={
            search || statusFilter || groupFilter
              ? 'Try adjusting your search criteria or resetting filters.'
              : 'There are no exams configured in the system yet.'
          }
          tone="sky"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredExams.map((e, idx) => {
            const tone = CARD_TONES[idx % CARD_TONES.length]
            const status = examStatusMeta(e.status)
            const hasSubjects = e._count.subjectConfigs > 0

            return (
              <Card
                key={e.id}
                className={cn(
                  'group flex flex-col justify-between overflow-hidden border bg-gradient-to-br shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                  tone.card,
                )}
              >
                <div>
                  <div className={cn('flex items-start gap-3 border-b border-current/10 bg-gradient-to-r p-3.5', tone.header)}>
                    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', tone.icon)}>
                      <ClipboardCheck className="size-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <h3 className="mr-1 truncate text-base font-semibold leading-tight">{e.name}</h3>
                        {e.shortCode && (
                          <Badge variant="outline" className="h-5 shrink-0 rounded-md px-1.5 font-mono text-[10px]">
                            {e.shortCode}
                          </Badge>
                        )}
                        <Badge variant="outline" className={status.tone}>
                          {status.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {e.group.name} · {e.academicYear}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5 shrink-0 opacity-70" />
                      <span>
                        {formatDate(e.startDate)}
                        {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <BookOpen className="size-3.5 shrink-0 opacity-70" />
                      <span>
                        {e._count.subjectConfigs} subject{e._count.subjectConfigs === 1 ? '' : 's'} configured
                      </span>
                    </div>

                    {!hasSubjects && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertCircle className="size-3 shrink-0" />
                        <span>No subjects configured yet</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-current/10 bg-background/40 p-3 backdrop-blur-xs">
                  {hasAnyPermission([PERMISSIONS.EXAM_MARKS, PERMISSIONS.EXAM_MANAGE]) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => router.push(`/exams/${e.id}/marksheet`)}
                    >
                      <FileSpreadsheet className="size-3.5" /> Marksheet
                    </Button>
                  )}

                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 text-xs font-semibold text-white shadow-xs hover:from-amber-600 hover:to-amber-700"
                    onClick={() => router.push(`/exams/${e.id}/marks-entry`)}
                  >
                    <ClipboardCheck className="size-3.5" /> Enter Marks
                    <ArrowRight className="size-3" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
