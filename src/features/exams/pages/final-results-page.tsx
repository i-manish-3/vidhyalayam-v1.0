'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Award, Calculator, Trophy } from 'lucide-react'

interface FinalResultRow {
  id: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  rankInClass: number | null
  rankInSection: number | null
  attendancePct: number | null
  promotionStatus: string
  computedAt: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    rollNumber: string | null
    classId: string
    sectionId: string | null
    admissionStatus: string
  }
}

interface ParadigmInfo {
  id: string
  name: string
  academicYear: string
  isDefault: boolean
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

const PROMOTION_TONE: Record<string, string> = {
  promoted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  detained: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200',
  conditional: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  withheld: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
}

interface Props {
  paradigmId: string
}

interface FinalResultsListState {
  classFilter?: string
  sectionFilter?: string | null
}

export function FinalResultsPage({ paradigmId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const listStateKey = `exams:final-results:${paradigmId}:list`
  const savedListState = useAppStore((state) => state.pageState[listStateKey] as FinalResultsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [confirmingRecompute, setConfirmingRecompute] = useState(false)
  const [paradigm, setParadigm] = useState<ParadigmInfo | null>(null)
  const [results, setResults] = useState<FinalResultRow[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [classFilter, setClassFilter] = useState(savedListState?.classFilter ?? '')
  const [sectionFilter, setSectionFilter] = useState<string | null>(savedListState?.sectionFilter ?? null)
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (classFilter) params.classId = classFilter
      if (sectionFilter) params.sectionId = sectionFilter
      const [resRes, classesRes] = await Promise.all([
        api.get<{ paradigm: ParadigmInfo; results: FinalResultRow[]; message?: string }>(
          `/api/school/paradigms/${paradigmId}/final-results`,
          params,
        ),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
      ])
      setParadigm(resRes.paradigm)
      setResults(resRes.results)
      setEmptyMessage(resRes.message ?? null)
      setClasses(classesRes.classes)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load final results',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [paradigmId, classFilter, sectionFilter, toast])

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
      const res = await api.post<{ computed: { groupWritten: number; finalWritten: number }; message: string }>(
        `/api/school/paradigms/${paradigmId}/compute-final`,
        {
          ...(classFilter ? { classIds: [classFilter] } : {}),
        },
      )
      toast({ title: 'Final results computed', description: res.message })
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

  const stats = useMemo(() => {
    const total = results.length
    const promoted = results.filter((r) => r.promotionStatus === 'promoted').length
    const detained = results.filter((r) => r.promotionStatus === 'detained').length
    const conditional = results.filter((r) => r.promotionStatus === 'conditional').length
    const avg = total > 0 ? results.reduce((s, r) => s + r.percentage, 0) / total : 0
    return { total, promoted, detained, conditional, avg }
  }, [results])

  if (loading) return <LoadingState />
  if (!paradigm) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Final results: ${paradigm.name}`}
        description={`Academic year ${paradigm.academicYear} · year-level rollup with promotion preview`}
        backAction={{ onClick: () => router.push('/exams/paradigms') }}
        action={{
          label: computing ? 'Computing…' : 'Recompute final',
          icon: Calculator,
          onClick: () => setConfirmingRecompute(true),
        }}
      />

      <Card>
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
        <EmptyState
          icon={Award}
          title={emptyMessage ? 'No final results yet' : 'No results found'}
          description={emptyMessage ?? 'Try a different class or section, or recompute.'}
          action={{ label: 'Compute final results', onClick: () => setConfirmingRecompute(true) }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">Total</div></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-emerald-600">{stats.promoted}</div><div className="text-xs text-muted-foreground">Promoted</div></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold text-red-600">{stats.detained}</div><div className="text-xs text-muted-foreground">Detained</div></CardContent></Card>
            <Card><CardContent className="p-3 text-center"><div className="text-2xl font-bold">{stats.avg.toFixed(1)}%</div><div className="text-xs text-muted-foreground">Average</div></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2 text-xs font-medium">Rank</th>
                      <th className="px-3 py-2 text-xs font-medium">Roll</th>
                      <th className="px-3 py-2 text-xs font-medium">Student</th>
                      <th className="px-3 py-2 text-xs font-medium text-right">Obtained / Total</th>
                      <th className="px-3 py-2 text-xs font-medium text-right">%</th>
                      <th className="px-3 py-2 text-xs font-medium">Grade</th>
                      <th className="px-3 py-2 text-xs font-medium">Promotion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const tone = PROMOTION_TONE[r.promotionStatus] ?? PROMOTION_TONE.pending
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
                          <td className="px-3 py-2 font-medium">
                            {r.student.firstName} {r.student.lastName}
                            {r.student.admissionStatus === 'withdrawn' && (
                              <Badge variant="outline" className="ml-2 text-[10px]">Withdrawn</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{r.obtainedMarks} / {r.totalMarks}</td>
                          <td className="px-3 py-2 text-right font-medium">{r.percentage.toFixed(1)}%</td>
                          <td className="px-3 py-2">
                            {r.grade ? <Badge variant="outline" className="font-mono text-[10px]">{r.grade}</Badge> : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge className={tone}>{r.promotionStatus}</Badge>
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

      <AlertDialog open={confirmingRecompute} onOpenChange={setConfirmingRecompute}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Compute / recompute final results?</AlertDialogTitle>
            <AlertDialogDescription>
              This aggregates every exam result under this exam pattern into term and final results.
              Withdrawn students are excluded. Existing final results will be overwritten.
              {classFilter && ' (Scoped to the selected class.)'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={computing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={computing}
              onClick={(e) => {
                e.preventDefault()
                void handleRecompute()
              }}
            >
              {computing ? 'Computing…' : 'Compute'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
