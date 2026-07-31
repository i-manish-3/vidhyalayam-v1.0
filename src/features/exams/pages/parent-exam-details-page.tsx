'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GradientHero, GradientEmptyState, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  AlertCircle,
  Award,
  CalendarDays,
  Download,
  FileText,
  GraduationCap,
  Printer,
  Trophy,
} from 'lucide-react'

interface ChildOption {
  id: string
  fullName: string
  admissionNumber: string | null
  rollNumber: string | null
  isActive: boolean
  className: string | null
  sectionName: string | null
}

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

interface ExamRow {
  id: string
  name: string
  shortCode: string | null
  academicYear: string
  examType: string
  status: string
  startDate: string | null
  endDate: string | null
  publishedAt: string | null
  visibleToParent: boolean
  group: {
    id: string
    name: string
    shortCode: string | null
    paradigm: { id: string; name: string; academicYear: string }
  }
  schedule: Array<{
    id: string
    subjectName: string
    examDate: string
    startTime: string
    endTime: string
    roomNumber: string | null
    maxMarks: number
    durationMinutes: number
  }>
  canDownloadAdmitCard: boolean
  canDownloadReportCard: boolean
  result: {
    id: string
    totalMarks: number
    obtainedMarks: number
    percentage: number
    grade: string | null
    rankInClass: number | null
    rankInSection: number | null
    status: string
    remarks: string | null
    subjectSummaries: SubjectSummary[]
  } | null
}

interface ParentExamsResponse {
  children: ChildOption[]
  selectedStudentId: string | null
  exams: ExamRow[]
}

const STATUS_TONE: Record<string, string> = {
  scheduled: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  ongoing: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  completed: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
  result_published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  pass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  fail: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  partial: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  absent: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
}

const TINTED_CARD =
  'border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ')
}

export function ParentExamDetailsPage() {
  const searchParams = useSearchParams()
  const queryStudentId = searchParams.get('studentId')
  const { toast } = useToast()
  const [children, setChildren] = useState<ChildOption[]>([])
  const [selectedId, setSelectedId] = useState(queryStudentId || '')
  const [exams, setExams] = useState<ExamRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  const load = useCallback(async (studentId?: string) => {
    if (children.length === 0) setLoading(true)
    else setLoadingData(true)
    try {
      const res = await api.get<ParentExamsResponse>(
        '/api/parent/exams',
        studentId ? { studentId } : undefined,
      )
      setChildren(res.children || [])
      setExams(res.exams || [])
      setSelectedId(res.selectedStudentId || '')
    } catch (err) {
      toast({
        title: "Couldn't load exam details",
        description: err instanceof Error ? err.message : 'Please refresh and try again.',
        variant: 'destructive',
      })
      setExams([])
    } finally {
      setLoading(false)
      setLoadingData(false)
    }
  }, [children.length, toast])

  useEffect(() => {
    void load(queryStudentId || undefined)
  }, [load, queryStudentId])

  const selectedChild = useMemo(
    () => children.find((child) => child.id === selectedId),
    [children, selectedId],
  )

  const stats = useMemo(() => {
    const published = exams.filter((exam) => exam.canDownloadReportCard).length
    const admitReady = exams.filter((exam) => exam.canDownloadAdmitCard).length
    return { total: exams.length, published, admitReady }
  }, [exams])

  const handleStudentChange = (studentId: string) => {
    setSelectedId(studentId)
    void load(studentId)
  }

  const openAdmitCard = (exam: ExamRow) => {
    window.open(`/print/admit-cards/${exam.id}?students=${selectedId}&action=download&scope=parent`, '_blank', 'noopener,noreferrer')
  }

  const openReportCard = (exam: ExamRow) => {
    window.open(`/print/report-cards/${exam.id}?students=${selectedId}&action=download&scope=parent`, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <LoadingState />

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        <GradientHero
          icon={GraduationCap}
          title="Exam Details"
          description="Exam schedule, admit cards, and report cards for your children"
        />
        <GradientEmptyState
          icon={Award}
          title="No active children"
          description="No students are linked to your parent account yet."
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <GradientHero
        icon={GraduationCap}
        title="Exam Details"
        description="View ward exams, admit cards, and published report cards"
      />

      <div className={`rounded-xl border ${TINTED_CARD}`}>
        <div className="flex flex-col gap-3 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selectedChild?.fullName || 'Student'}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedChild?.className || 'Class -'}
              {selectedChild?.sectionName ? ` - ${selectedChild.sectionName}` : ''}
              {selectedChild?.admissionNumber ? ` · ${selectedChild.admissionNumber}` : ''}
            </p>
          </div>
          {children.length > 1 && (
            <Select value={selectedId} onValueChange={handleStudentChange}>
              <SelectTrigger className="h-9 w-full sm:w-64">
                <SelectValue placeholder="Select child" />
              </SelectTrigger>
              <SelectContent>
                {children.map((child) => (
                  <SelectItem key={child.id} value={child.id}>
                    {child.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="grid grid-cols-3 border-t border-current/10 text-xs">
          <div className="border-r border-current/10 px-3 py-2">
            <p className="text-muted-foreground">Exams</p>
            <p className="mt-0.5 text-lg font-bold">{stats.total}</p>
          </div>
          <div className="border-r border-current/10 px-3 py-2">
            <p className="text-muted-foreground">Admit Cards</p>
            <p className="mt-0.5 text-lg font-bold text-sky-600">{stats.admitReady}</p>
          </div>
          <div className="px-3 py-2">
            <p className="text-muted-foreground">Report Cards</p>
            <p className="mt-0.5 text-lg font-bold text-emerald-600">{stats.published}</p>
          </div>
        </div>
      </div>

      {loadingData ? (
        <div className={`flex justify-center rounded-xl border py-10 ${TINTED_CARD}`}>
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : exams.length === 0 ? (
        <GradientEmptyState
          icon={CalendarDays}
          title="No exams found"
          description="No scheduled or published exams are available for this child yet."
        />
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => {
            const result = exam.result
            const statusTone = STATUS_TONE[exam.status] || STATUS_TONE.completed
            const resultTone = result ? STATUS_TONE[result.status] || STATUS_TONE.absent : ''
            const resultPercent = result ? Math.max(0, Math.min(100, Math.round(result.percentage))) : 0

            return (
              <section key={exam.id} className={`overflow-hidden rounded-xl border ${TINTED_CARD}`}>
                <div className="flex flex-col gap-3 border-b border-current/10 px-3 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold">{exam.name}</h2>
                      <Badge className={cn('capitalize', statusTone)}>{statusLabel(exam.status)}</Badge>
                      {result && <Badge className={cn('capitalize', resultTone)}>{result.status}</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {exam.group.paradigm.name} · {exam.group.name} · {exam.academicYear}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!exam.canDownloadAdmitCard}
                      onClick={() => openAdmitCard(exam)}
                    >
                      <Printer className="mr-1.5 size-4" />
                      Admit Card
                    </Button>
                    <Button
                      size="sm"
                      disabled={!exam.canDownloadReportCard}
                      onClick={() => openReportCard(exam)}
                    >
                      <Download className="mr-1.5 size-4" />
                      Report Card
                    </Button>
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="border-b border-current/10 p-3 lg:border-b-0 lg:border-r lg:border-current/10">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <CalendarDays className="size-4 text-primary" />
                      Schedule
                    </div>
                    {exam.schedule.length === 0 ? (
                      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                        Datesheet is not available yet.
                      </p>
                    ) : (
                      <div className="divide-y rounded-lg border">
                        {exam.schedule.slice(0, 6).map((row) => (
                          <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{row.subjectName}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(row.examDate)}
                                {row.roomNumber ? ` · Room ${row.roomNumber}` : ''}
                              </p>
                            </div>
                            <div className="text-right text-xs">
                              <p className="font-semibold">{row.startTime} - {row.endTime}</p>
                              <p className="text-muted-foreground">{row.maxMarks} marks</p>
                            </div>
                          </div>
                        ))}
                        {exam.schedule.length > 6 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">
                            +{exam.schedule.length - 6} more subjects on admit card
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <Award className="size-4 text-primary" />
                      Result
                    </div>
                    {!result ? (
                      <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <p>Result is not published yet. Report card will appear here after school publishes it.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <p className="text-xs text-muted-foreground">Percentage</p>
                              <p className="text-2xl font-extrabold">{result.percentage.toFixed(1)}%</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>
                                <span className="font-semibold text-foreground">{result.obtainedMarks}</span> / {result.totalMarks}
                              </p>
                              {result.grade && <p>Grade {result.grade}</p>}
                              {result.rankInClass && (
                                <p className="flex items-center justify-end gap-1">
                                  <Trophy className="size-3 text-amber-500" />
                                  Rank {result.rankInClass}
                                </p>
                              )}
                            </div>
                          </div>
                          <Progress value={resultPercent} className="mt-3" />
                        </div>

                        <div className="divide-y rounded-lg border">
                          {result.subjectSummaries.slice(0, 5).map((subject) => (
                            <div key={subject.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 text-xs">
                              <p className="truncate font-medium">{subject.subjectName}</p>
                              <p className="tabular-nums text-muted-foreground">
                                {subject.obtainedMarks}/{subject.totalMarks}
                              </p>
                              <Badge variant="outline" className="text-[10px]">
                                {subject.grade || `${subject.percentage.toFixed(0)}%`}
                              </Badge>
                            </div>
                          ))}
                          {result.subjectSummaries.length > 5 && (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                              +{result.subjectSummaries.length - 5} more subjects on report card
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <FileText className="size-3.5" />
          Downloads open a print-ready page. Use Save as PDF from the print dialog.
        </span>
        <span className="flex items-center gap-1.5">
          <GraduationCap className="size-3.5" />
          Report cards are shown only after school publishes results.
        </span>
      </div>
    </div>
  )
}
