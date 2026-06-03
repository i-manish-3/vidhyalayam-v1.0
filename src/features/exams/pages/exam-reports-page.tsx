'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { BarChart3, Trophy, Users, Activity, ArrowDown, ArrowUp } from 'lucide-react'

interface ClassSummaryRow {
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  total: number
  pass: number
  fail: number
  partial: number
  absent: number
  averagePercentage: number
  highestPercentage: number
  lowestPercentage: number
  passRate: number
}

interface Performer {
  studentId: string
  firstName: string
  lastName: string | null
  rollNumber: string | null
  obtainedMarks: number
  totalMarks: number
  percentage: number
  grade: string | null
}

interface SubjectStats {
  subjectId: string
  subjectName: string
  total: number
  pass: number
  fail: number
  absent: number
  averagePercentage: number
  passRate: number
  topPerformers: Performer[]
  bottomPerformers: Performer[]
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface ExamReportsListState {
  tab?: 'class' | 'subject'
  classFilter?: string
  sectionFilter?: string | null
}

export function ExamReportsPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const search = useSearchParams()
  const examId = params?.id ?? ''
  const { toast } = useToast()
  const listStateKey = `exams:reports:${examId}:list`
  const savedListState = useAppStore((state) => state.pageState[listStateKey] as ExamReportsListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)

  const [tab, setTab] = useState<'class' | 'subject'>(
    search.get('tab') === 'subject' ? 'subject' : savedListState?.tab ?? 'class',
  )
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [classFilter, setClassFilter] = useState(savedListState?.classFilter ?? '')
  const [sectionFilter, setSectionFilter] = useState<string | null>(savedListState?.sectionFilter ?? null)
  const [classSummary, setClassSummary] = useState<ClassSummaryRow[]>([])
  const [subjects, setSubjects] = useState<SubjectStats[]>([])
  const [examName, setExamName] = useState('')

  const load = useCallback(async () => {
    if (!examId) return
    setLoading(true)
    try {
      const cls = await api.get<{ classes: ClassOption[] }>('/api/school/classes')
      setClasses(cls.classes)

      const filterParams: Record<string, string> = {}
      if (classFilter) filterParams.classId = classFilter
      if (sectionFilter) filterParams.sectionId = sectionFilter

      const [summary, subj] = await Promise.all([
        api.get<{ rows: ClassSummaryRow[]; exam: { name: string } }>(
          `/api/school/exams/${examId}/reports/class-summary`,
        ),
        api.get<{ subjects: SubjectStats[]; exam: { name: string } }>(
          `/api/school/exams/${examId}/reports/subject-stats`,
          filterParams,
        ),
      ])
      setClassSummary(summary.rows)
      setSubjects(subj.subjects)
      setExamName(summary.exam.name || subj.exam.name)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load reports',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [examId, classFilter, sectionFilter, toast])

  useEffect(() => {
    void load()
  }, [load])

  const sections = classes.find((c) => c.id === classFilter)?.sections ?? []

  if (loading && classSummary.length === 0 && subjects.length === 0) return <LoadingState />

  const totals = classSummary.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      pass: acc.pass + r.pass,
      fail: acc.fail + r.fail,
      absent: acc.absent + r.absent,
    }),
    { total: 0, pass: 0, fail: 0, absent: 0 },
  )
  const passRate = totals.total > 0 ? Math.round((totals.pass / totals.total) * 1000) / 10 : 0

  const rememberListState = (patch: Partial<ExamReportsListState>) => {
    setPageState(listStateKey, { tab, classFilter, sectionFilter, ...patch })
  }

  const handleTabChange = (value: string) => {
    const nextTab = value as 'class' | 'subject'
    setTab(nextTab)
    rememberListState({ tab: nextTab })
  }

  const handleClassFilterChange = (value: string) => {
    const nextClassFilter = value === '__all' ? '' : value
    setClassFilter(nextClassFilter)
    setSectionFilter(null)
    rememberListState({ classFilter: nextClassFilter, sectionFilter: null })
  }

  const handleSectionFilterChange = (value: string) => {
    const nextSectionFilter = value === '__all' ? null : value
    setSectionFilter(nextSectionFilter)
    rememberListState({ sectionFilter: nextSectionFilter })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={examName ? `Reports: ${examName}` : 'Exam reports'}
        description="Pass/fail breakdown, subject stats, and top/bottom performers."
        backAction={{ onClick: () => router.push(`/exams/${examId}/results`) }}
      />

      {/* Roll-up tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={<Users className="size-4" />} label="Total students" value={totals.total} />
        <Tile
          icon={<Activity className="size-4 text-emerald-600" />}
          label="Pass rate"
          value={`${passRate}%`}
        />
        <Tile
          icon={<ArrowUp className="size-4 text-emerald-500" />}
          label="Passed"
          value={totals.pass}
        />
        <Tile
          icon={<ArrowDown className="size-4 text-red-500" />}
          label="Failed"
          value={totals.fail}
        />
      </div>

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="class" className="gap-1.5">
            <BarChart3 className="size-3.5" /> Class summary
          </TabsTrigger>
          <TabsTrigger value="subject" className="gap-1.5">
            <Trophy className="size-3.5" /> Subject stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="class" className="mt-3">
          {classSummary.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No computed results yet"
              description="Compute results on the Results page first."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      <th className="px-3 py-2 text-xs font-medium">Class</th>
                      <th className="px-3 py-2 text-xs font-medium">Section</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Total</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Pass</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Fail</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Absent</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Pass rate</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">Avg %</th>
                      <th className="px-3 py-2 text-right text-xs font-medium">High / Low</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classSummary.map((r) => (
                      <tr key={`${r.classId}-${r.sectionId ?? 'n'}`} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{r.className}</td>
                        <td className="px-3 py-2">{r.sectionName ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.pass}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-700">{r.fail}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.absent}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {r.passRate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.averagePercentage.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {r.highestPercentage.toFixed(0)}% / {r.lowestPercentage.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="subject" className="mt-3 space-y-3">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</div>
                <Select
                  value={classFilter || '__all'}
                  onValueChange={handleClassFilterChange}
                >
                  <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All" /></SelectTrigger>
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
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Section</div>
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
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Refresh
              </Button>
            </CardContent>
          </Card>

          {subjects.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="No subject data"
              description="Subject summaries are derived from computed results. Run the calculator on the Results page first."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {subjects.map((s) => (
                <Card key={s.subjectId}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{s.subjectName}</CardTitle>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {s.averagePercentage.toFixed(1)}% avg
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                      <Badge variant="outline">Total {s.total}</Badge>
                      <Badge className="bg-emerald-100 text-emerald-700">Pass {s.pass}</Badge>
                      <Badge className="bg-red-100 text-red-700">Fail {s.fail}</Badge>
                      <Badge variant="outline">Absent {s.absent}</Badge>
                      <Badge variant="secondary">Pass rate {s.passRate.toFixed(1)}%</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 text-xs sm:grid-cols-2">
                    <PerformerList
                      title="Top"
                      icon={<ArrowUp className="size-3.5 text-emerald-600" />}
                      performers={s.topPerformers}
                    />
                    <PerformerList
                      title="Needs help"
                      icon={<ArrowDown className="size-3.5 text-red-500" />}
                      performers={s.bottomPerformers}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-muted">{icon}</span>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function PerformerList({
  title,
  icon,
  performers,
}: {
  title: string
  icon: React.ReactNode
  performers: Performer[]
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      {performers.length === 0 ? (
        <div className="text-xs italic text-muted-foreground">No data.</div>
      ) : (
        <ul className="space-y-0.5">
          {performers.map((p, i) => (
            <li
              key={p.studentId}
              className="flex items-center justify-between rounded px-1.5 py-0.5 odd:bg-muted/30"
            >
              <span className="truncate">
                <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                {p.firstName} {p.lastName ?? ''}
                {p.rollNumber && (
                  <span className="ml-1 text-[10px] text-muted-foreground">#{p.rollNumber}</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                {p.obtainedMarks}/{p.totalMarks}
                {p.grade && <span className="ml-1 font-mono text-[10px]">{p.grade}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
