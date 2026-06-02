'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PageHeader,
  StatsCard,
  LoadingState,
  EmptyState,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import {
  ClipboardList,
  Layers,
  Calendar,
  Plus,
  Settings2,
  FileText,
  Award,
  ChevronRight,
} from 'lucide-react'

interface ExamSummary {
  id: string
  name: string
  shortCode: string | null
  status: string
  startDate: string | null
  endDate: string | null
  examType: string
  group: { id: string; name: string; paradigmId: string }
  _count: { subjectConfigs: number; schedules: number }
}

interface ParadigmSummary {
  id: string
  name: string
  academicYear: string
  isActive: boolean
  isDefault: boolean
  _count: { examGroups: number }
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  scheduled: { label: 'Scheduled', tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200' },
  ongoing: { label: 'Ongoing', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  completed: { label: 'Completed', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200' },
  result_published: { label: 'Published', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ExamsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<ExamSummary[]>([])
  const [paradigms, setParadigms] = useState<ParadigmSummary[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [examsRes, paradigmsRes] = await Promise.all([
        api.get<{ exams: ExamSummary[] }>('/api/school/exams'),
        api.get<{ paradigms: ParadigmSummary[] }>('/api/school/exams/paradigms'),
      ])
      setExams(examsRes.exams)
      setParadigms(paradigmsRes.paradigms)
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
    void load()
  }, [load])

  const counts = useMemo(() => {
    const out: Record<string, number> = { draft: 0, scheduled: 0, ongoing: 0, completed: 0, result_published: 0 }
    for (const e of exams) {
      if (out[e.status] !== undefined) out[e.status]++
    }
    return out
  }, [exams])

  const upcoming = useMemo(() => {
    const now = Date.now()
    return [...exams]
      .filter((e) => e.startDate && new Date(e.startDate).getTime() >= now)
      .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime())
      .slice(0, 5)
  }, [exams])

  if (loading) return <LoadingState />

  const hasAnything = exams.length > 0 || paradigms.length > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exams"
        description="Set up exam paradigms, configure subjects, schedule papers, and publish results."
        action={{
          label: 'New exam',
          icon: Plus,
          onClick: () => router.push('/exams/new'),
        }}
        secondaryAction={{
          label: 'Manage paradigms',
          icon: Layers,
          onClick: () => router.push('/exams/paradigms'),
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatsCard icon={ClipboardList} title="Draft" value={counts.draft} />
        <StatsCard icon={Calendar} title="Scheduled" value={counts.scheduled} />
        <StatsCard icon={Settings2} title="Ongoing" value={counts.ongoing} />
        <StatsCard icon={FileText} title="Completed" value={counts.completed} />
        <StatsCard icon={Award} title="Published" value={counts.result_published} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Upcoming exams</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => router.push('/exams/list')}
            >
              View all <ChevronRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Nothing scheduled yet"
                description="Create an exam and set its start date to see it here."
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((e) => {
                  const status = STATUS_META[e.status] ?? STATUS_META.draft
                  return (
                    <li
                      key={e.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:border-primary/40"
                      onClick={() => router.push(`/exams/${e.id}/configure`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{e.name}</span>
                          {e.shortCode && (
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {e.shortCode}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {e.group.name} · {formatDate(e.startDate)}
                          {e.endDate && e.endDate !== e.startDate ? ` – ${formatDate(e.endDate)}` : ''}
                        </p>
                      </div>
                      <Badge className={status.tone}>{status.label}</Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paradigms</CardTitle>
          </CardHeader>
          <CardContent>
            {paradigms.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No paradigms yet"
                description="Create a paradigm to start setting up exams."
              />
            ) : (
              <ul className="space-y-2">
                {paradigms.slice(0, 6).map((p) => (
                  <li
                    key={p.id}
                    className="flex cursor-pointer items-center justify-between rounded-md border bg-card p-2.5 text-sm hover:border-primary/40"
                    onClick={() => router.push(`/exams/paradigms/${p.id}/groups`)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.isDefault && (
                          <Badge variant="secondary" className="text-[10px]">Default</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.academicYear} · {p._count.examGroups} group{p._count.examGroups === 1 ? '' : 's'}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => router.push('/exams/paradigms')}
            >
              Manage paradigms
            </Button>
          </CardContent>
        </Card>
      </div>

      {!hasAnything && (
        <Card>
          <CardContent className="py-10 text-center">
            <h3 className="text-base font-semibold">Get started</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              The exam module is multi-layered: paradigms hold groups, groups hold exams, exams hold subject configs.
              Start by creating a paradigm.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={() => router.push('/exams/paradigms')} className="gap-1.5">
                <Layers className="size-4" /> Create paradigm
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push('/exams/grade-scales')}
                className="gap-1.5"
              >
                <Award className="size-4" /> Set up grade scales
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
