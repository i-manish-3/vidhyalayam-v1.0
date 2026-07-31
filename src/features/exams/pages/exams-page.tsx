'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  GradientHero,
  TintedStatCard,
  LoadingState,
  GradientEmptyState,
} from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  GraduationCap,
} from 'lucide-react'
import { ExamInstructionsButton } from '@/features/exams/components/exam-instructions-button'
import { examStatusMeta } from '@/features/exams/lib/status-meta'

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
    <div className="space-y-4">
      <GradientHero
        icon={ClipboardList}
        title="Exams"
        badge={`${exams.length} exam${exams.length === 1 ? '' : 's'}`}
        description="Set up exam patterns, configure subjects, schedule papers, and publish results."
        extraActions={<ExamInstructionsButton />}
        primaryAction={{
          label: 'New exam',
          icon: Plus,
          onClick: () => router.push('/exams/new'),
        }}
        secondaryAction={{
          label: 'Manage exam patterns',
          icon: Layers,
          onClick: () => router.push('/exams/paradigms'),
        }}
      />

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <TintedStatCard tone="sky" icon={ClipboardList} label="Draft" value={counts.draft} note="Not yet scheduled" />
        <TintedStatCard tone="violet" icon={Calendar} label="Scheduled" value={counts.scheduled} note="Datesheet ready" />
        <TintedStatCard tone="amber" icon={Settings2} label="Ongoing" value={counts.ongoing} note="Marks being entered" />
        <TintedStatCard tone="emerald" icon={FileText} label="Completed" value={counts.completed} note="Awaiting publish" />
        <TintedStatCard tone="sky" icon={Award} label="Published" value={counts.result_published} note="Visible to parents" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white">
                <Calendar className="size-3 text-white" />
              </span>
              Upcoming exams
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => router.push('/exams/list')}>
              View all <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <CardContent className="p-3">
            {upcoming.length === 0 ? (
              <GradientEmptyState
                icon={Calendar}
                title="Nothing scheduled yet"
                description="Create an exam and set its start date to see it here."
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((e) => {
                  const status = examStatusMeta(e.status)
                  return (
                    <li
                      key={e.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-sky-100/80 bg-white/70 p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-sky-500/20 dark:bg-card/60"
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
                      <Badge variant="outline" className={status.tone}>{status.label}</Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10">
          <div className="flex items-center justify-between border-b border-current/10 bg-gradient-to-r from-violet-500/[0.08] via-white/40 to-purple-500/[0.08] px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                <Layers className="size-3 text-white" />
              </span>
              Exam patterns
            </div>
          </div>
          <CardContent className="p-3">
            {paradigms.length === 0 ? (
              <GradientEmptyState
                icon={Layers}
                title="No exam patterns yet"
                description="Create an exam pattern to start setting up exams."
              />
            ) : (
              <ul className="space-y-2">
                {paradigms.slice(0, 6).map((p) => (
                  <li
                    key={p.id}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-violet-100/80 bg-white/70 p-2.5 text-sm shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md dark:border-violet-500/20 dark:bg-card/60"
                    onClick={() => router.push(`/exams/paradigms/${p.id}/groups`)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.isDefault && (
                          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.academicYear} · {p._count.examGroups} term{p._count.examGroups === 1 ? '' : 's'}
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
              Manage exam patterns
            </Button>
          </CardContent>
        </Card>
      </div>

      {!hasAnything && (
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          <CardContent className="relative py-10 text-center">
            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md">
              <GraduationCap className="size-6 text-white" />
            </span>
            <h3 className="text-base font-semibold">Get started</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Exams are organised in three layers: an <strong>exam pattern</strong> (your school&apos;s overall framework for the year),
              which holds <strong>terms</strong>, which hold individual <strong>exams</strong> with their subjects.
              Start by creating an exam pattern.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button onClick={() => router.push('/exams/paradigms')} className="gap-1.5">
                <Layers className="size-4" /> Create exam pattern
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
