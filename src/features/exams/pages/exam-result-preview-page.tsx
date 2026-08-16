'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState, TintedStatCard } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import {
  AlertCircle,
  Award,
  BarChart3,
  Calculator,
  CircleAlert,
  CircleCheck,
  CircleX,
  FileText,
  Loader2,
  Percent,
  Printer,
  Send,
  Target,
  Trophy,
  Undo2,
  Users,
} from 'lucide-react'

interface SubjectSummary {
  id: string
  subjectId: string
  subjectName: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  status: string
}

interface ExamResultRow {
  id: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  rankInClass: number | null
  rankInSection: number | null
  status: string
  failedSubjects: string | null
  computedAt: string | null
  subjectSummaries: SubjectSummary[]
  student: {
    id: string
    firstName: string
    lastName: string
    rollNumber: string | null
    classId: string
    sectionId: string | null
  }
}

interface ExamInfo {
  id: string
  name: string
  status: string
  visibleToParent?: boolean
  publishedAt?: string | null
  group: { name: string; paradigm: { name: string; academicYear: string } }
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

const STATUS_TONE: Record<string, string> = {
  pass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  fail: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
  absent: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
}

interface Props {
  examId: string
}

interface ExamResultPreviewListState {
  classFilter?: string
  sectionFilter?: string | null
}

export function ExamResultPreviewPage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const listStateKey = `exams:result-preview:${examId}:list`
  const savedListState = useAppStore((state) => state.pageState[listStateKey] as ExamResultPreviewListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [confirmingRecompute, setConfirmingRecompute] = useState(false)
  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [results, setResults] = useState<ExamResultRow[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [classFilter, setClassFilter] = useState(savedListState?.classFilter ?? '')
  const [sectionFilter, setSectionFilter] = useState<string | null>(savedListState?.sectionFilter ?? null)
  const [publishing, setPublishing] = useState(false)
  const [unpublishOpen, setUnpublishOpen] = useState(false)
  const [unpublishReason, setUnpublishReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (classFilter) params.classId = classFilter
      if (sectionFilter) params.sectionId = sectionFilter
      const [resultsRes, classesRes] = await Promise.all([
        api.get<{ results: ExamResultRow[]; exam: ExamInfo }>(
          `/api/school/exams/${examId}/results`,
          params,
        ),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
      ])
      setResults(resultsRes.results)
      setExam(resultsRes.exam)
      setClasses(classesRes.classes)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load results',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [examId, classFilter, sectionFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  const sections = useMemo(
    () => classes.find((c) => c.id === classFilter)?.sections ?? [],
    [classes, classFilter],
  )

  const handleClassFilterChange = (value: string) => {
    const nextClassFilter = value === '__all' ? '' : value
    setClassFilter(nextClassFilter)
    setSectionFilter(null)
    setPageState(listStateKey, { classFilter: nextClassFilter, sectionFilter: null })
  }

  const handleSectionFilterChange = (value: string) => {
    const nextSectionFilter = value === '__all' ? null : value
    setSectionFilter(nextSectionFilter)
    setPageState(listStateKey, { classFilter, sectionFilter: nextSectionFilter })
  }

  async function handleRecompute() {
    setConfirmingRecompute(false)
    setComputing(true)
    try {
      const res = await api.post<{ computed: number; message: string }>(
        `/api/school/exams/${examId}/compute-result`,
        {
          ...(classFilter ? { classIds: [classFilter] } : {}),
        },
      )
      toast({ title: 'Results computed', description: res.message })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not compute',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setComputing(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    try {
      const res = await api.post<{ publishedCount: number; message: string }>(
        `/api/school/exams/${examId}/publish`,
      )
      toast({ title: 'Published', description: res.message })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not publish',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPublishing(false)
    }
  }

  async function handleUnpublish() {
    if (!unpublishReason.trim()) {
      toast({ variant: 'destructive', title: 'Reason required' })
      return
    }
    setPublishing(true)
    try {
      await api.post(`/api/school/exams/${examId}/unpublish`, { reason: unpublishReason.trim() })
      toast({ title: 'Unpublished' })
      setUnpublishOpen(false)
      setUnpublishReason('')
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not unpublish',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPublishing(false)
    }
  }

  function handleOpenPrint() {
    if (results.length === 0) {
      toast({ variant: 'destructive', title: 'No results to print yet.' })
      return
    }
    const ids = results.map((r) => r.student.id).join(',')
    window.open(`/print/report-cards/${examId}?students=${ids}&action=print`, '_blank')
  }

  const stats = useMemo(() => {
    const total = results.length
    const passed = results.filter((r) => r.status === 'pass').length
    const failed = results.filter((r) => r.status === 'fail').length
    const partial = results.filter((r) => r.status === 'partial').length
    const absent = results.filter((r) => r.status === 'absent').length
    const avg = total > 0 ? results.reduce((s, r) => s + r.percentage, 0) / total : 0
    return { total, passed, failed, partial, absent, avg }
  }, [results])

  if (loading) return <LoadingState />
  if (!exam) return null

  return (
    <div className="space-y-5">
      <GradientHero
        icon={BarChart3}
        title={`Results: ${exam.name}`}
        badge={results.length > 0 ? `${results.length} student${results.length === 1 ? '' : 's'}` : undefined}
        description={`${exam.group.paradigm.name} · ${exam.group.name}`}
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_PUBLISH])
            ? exam.visibleToParent
              ? {
                  label: publishing ? 'Working…' : 'Unpublish',
                  icon: Undo2,
                  onClick: () => setUnpublishOpen(true),
                }
              : {
                  label: publishing ? 'Publishing…' : 'Publish',
                  icon: Send,
                  onClick: () => void handlePublish(),
                }
            : undefined
        }
        secondaryAction={{
          label: 'Print report cards',
          icon: Printer,
          onClick: handleOpenPrint,
        }}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-3 py-2 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        {exam.visibleToParent ? (
          <Badge className="bg-emerald-100 text-emerald-700">
            PUBLISHED · visible to parents
          </Badge>
        ) : (
          <Badge variant="outline">DRAFT · not visible to parents</Badge>
        )}
        {hasAnyPermission([PERMISSIONS.EXAM_RESULTS]) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmingRecompute(true)}
            disabled={computing}
          >
            <Calculator className="mr-1.5 size-3.5" /> {computing ? 'Computing…' : 'Recompute'}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/exams/${examId}/configure`)}
        >
          <FileText className="mr-1.5 size-3.5" /> Configure
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/exams/${examId}/reports`)}
        >
          <BarChart3 className="mr-1.5 size-3.5" /> Reports
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</span>
            <Select
              value={classFilter || '__all'}
              onValueChange={handleClassFilterChange}
            >
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All classes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All classes</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {classFilter && sections.length > 0 && (
            <div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Section</span>
              <Select
                value={sectionFilter ?? '__all'}
                onValueChange={handleSectionFilterChange}
              >
                <SelectTrigger className="h-9 w-32"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All sections</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {results.length === 0 ? (
        <GradientEmptyState
          icon={Award}
          title="No results computed yet"
          description="Run the calculator to compute results from the marks entered."
          {...(hasAnyPermission([PERMISSIONS.EXAM_RESULTS])
            ? { actionLabel: 'Compute results', onAction: () => setConfirmingRecompute(true) }
            : {})}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <TintedStatCard icon={Users} label="Total" value={stats.total} tone="sky" />
            <TintedStatCard icon={CircleCheck} label="Passed" value={stats.passed} tone="emerald" />
            <TintedStatCard icon={CircleAlert} label="Partial" value={stats.partial} tone="violet" />
            <TintedStatCard icon={CircleX} label="Failed" value={stats.failed} tone="amber" />
            <TintedStatCard icon={Percent} label="Average" value={`${stats.avg.toFixed(1)}%`} tone="sky" />
          </div>

          <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2 text-xs font-medium">Rank</th>
                      <th className="px-3 py-2 text-xs font-medium">Roll</th>
                      <th className="px-3 py-2 text-xs font-medium">Student</th>
                      <th className="px-3 py-2 text-xs font-medium text-right">Total</th>
                      <th className="px-3 py-2 text-xs font-medium text-right">Obtained</th>
                      <th className="px-3 py-2 text-xs font-medium text-right">%</th>
                      <th className="px-3 py-2 text-xs font-medium">Grade</th>
                      <th className="px-3 py-2 text-xs font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const tone = STATUS_TONE[r.status] ?? STATUS_TONE.absent
                      return (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2 text-sm">
                            {r.rankInClass ? (
                              <span className={r.rankInClass <= 3 ? 'font-bold' : ''}>
                                {r.rankInClass === 1 && <Trophy className="inline size-3.5 text-amber-500" />} {r.rankInClass}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.student.rollNumber ?? '—'}</td>
                          <td className="px-3 py-2 font-medium">{r.student.firstName} {r.student.lastName}</td>
                          <td className="px-3 py-2 text-right">{r.totalMarks}</td>
                          <td className="px-3 py-2 text-right">{r.obtainedMarks}</td>
                          <td className="px-3 py-2 text-right font-medium">{r.percentage.toFixed(1)}%</td>
                          <td className="px-3 py-2">
                            {r.grade ? <Badge variant="outline" className="font-mono text-[10px]">{r.grade}</Badge> : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={tone}>{r.status}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={unpublishOpen} onOpenChange={setUnpublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unpublish exam results?</DialogTitle>
            <DialogDescription>
              Parents and students will no longer see these results. The audit log
              records this action with your reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium">Reason</label>
            <Textarea
              value={unpublishReason}
              onChange={(e) => setUnpublishReason(e.target.value)}
              placeholder="e.g. Marks need correction for 2 students."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnpublishOpen(false)}
              disabled={publishing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleUnpublish()}
              disabled={publishing || !unpublishReason.trim()}
            >
              {publishing ? 'Working…' : 'Unpublish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingRecompute} onOpenChange={(next) => { if (!computing) setConfirmingRecompute(next) }}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-indigo-500/20 bg-card p-0 shadow-2xl shadow-indigo-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#4f46e5_0%,#7c3aed_48%,#db2777_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-indigo-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-fuchsia-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Calculator className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Compute / recompute results?</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Rebuild result rows from the latest marks for this exam.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-indigo-500/[0.04] via-background to-fuchsia-500/[0.05] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm"><Calculator className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">What the engine does</h3><p className="text-[10px] text-muted-foreground">Pure computation from the marks grid</p></div>
              </div>
              <ol className="relative space-y-1.5">
                {[
                  'Rebuilds ExamResult and ResultSubjectSummary rows from the latest marks.',
                  'Applies grace where eligible and resolves grades from the exam band.',
                  'Computes pass / fail / partial and assigns class & section ranks.',
                ].map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-[9px] font-bold text-white">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {classFilter && (
              <p className="flex items-start gap-2 rounded-md border border-indigo-200/80 bg-indigo-50 px-3 py-2.5 text-xs text-indigo-800 dark:border-indigo-500/25 dark:bg-indigo-950/30 dark:text-indigo-200">
                <Target className="mt-0.5 size-3.5 shrink-0" />
                <span>Scoped to the selected class — results for other classes are untouched.</span>
              </p>
            )}

            <p className="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Existing computed values for these students will be overwritten. Results stay stable until you recompute again, and each run is recorded in the audit trail.</span>
            </p>
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setConfirmingRecompute(false)} disabled={computing}>Cancel</Button>
            <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => void handleRecompute()} disabled={computing}>
              {computing ? <Loader2 className="size-4 animate-spin" /> : <Calculator className="size-4" />}
              {computing ? 'Computing…' : 'Compute results'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
