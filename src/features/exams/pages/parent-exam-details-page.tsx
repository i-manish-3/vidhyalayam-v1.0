'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GradientHero, GradientEmptyState, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import {
  AlertCircle,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Printer,
  Sparkles,
  Trophy,
  User,
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

interface ExamScheduleItem {
  id: string
  subjectName: string
  examDate: string
  startTime: string
  endTime: string
  roomNumber: string | null
  maxMarks: number
  durationMinutes: number
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
  schedule: ExamScheduleItem[]
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

const STATUS_CONFIG: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  scheduled: {
    label: 'Scheduled',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  ongoing: {
    label: 'Ongoing',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  completed: {
    label: 'Completed',
    badge: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
  result_published: {
    label: 'Result Published',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  pass: {
    label: 'Passed',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  fail: {
    label: 'Needs Improvement',
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  partial: {
    label: 'Compartment',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  absent: {
    label: 'Absent',
    badge: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    dot: 'bg-slate-500',
  },
}

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
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function statusLabel(value: string) {
  return (
    STATUS_CONFIG[value]?.label ||
    value
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
  )
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

  // Full Schedule Modal
  const [activeScheduleExam, setActiveScheduleExam] = useState<ExamRow | null>(null)

  const load = useCallback(
    async (studentId?: string) => {
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
          title: "Couldn't load exam records",
          description:
            err instanceof Error ? err.message : 'Please refresh and try again.',
          variant: 'destructive',
        })
        setExams([])
      } finally {
        setLoading(false)
        setLoadingData(false)
      }
    },
    [children.length, toast],
  )

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
    const scheduled = exams.filter((exam) => exam.status === 'scheduled' || exam.status === 'ongoing').length
    return { total: exams.length, published, admitReady, scheduled }
  }, [exams])

  const handleStudentChange = (studentId: string) => {
    setSelectedId(studentId)
    void load(studentId)
  }

  const openAdmitCard = (exam: ExamRow) => {
    window.open(
      `/print/admit-cards/${exam.id}?students=${selectedId}&action=download&scope=parent`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const openReportCard = (exam: ExamRow) => {
    window.open(
      `/print/report-cards/${exam.id}?students=${selectedId}&action=download&scope=parent`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  if (loading) return <LoadingState />

  if (children.length === 0) {
    return (
      <div className="space-y-5">
        <GradientHero
          icon={GraduationCap}
          title="Examinations & Results"
          description="Exam schedule, datesheets, admit cards, and report cards for your children."
        />
        <GradientEmptyState
          icon={Award}
          title="No active children found"
          description="No students are associated with your parent account yet. Please contact the school administration office."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Hero Header */}
      <GradientHero
        icon={GraduationCap}
        title="Examinations & Results"
        description="View exam schedules, datesheets, download admit cards, and review published report cards."
        gradientClassName="bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#0284c7_100%)]"
        badge={
          stats.published > 0
            ? `${stats.published} Report Card${stats.published > 1 ? 's' : ''} Published`
            : `${stats.total} Exam Sessions`
        }
      />

      {/* Child Switcher Pills (if multiple children) */}
      {children.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="mr-1 shrink-0 text-xs font-semibold text-muted-foreground">
            Child:
          </span>
          {children.map((child) => {
            const active = child.id === selectedId
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => handleStudentChange(child.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-primary/20'
                    : 'border-border/70 bg-card text-foreground hover:border-primary/40 hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full text-[9px] font-bold',
                    active
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {initials(child.fullName)}
                </span>
                <span>{child.fullName}</span>
                {child.admissionNumber && (
                  <span
                    className={cn(
                      'font-mono text-[10px] opacity-75',
                      active ? 'text-white/80' : 'text-muted-foreground',
                    )}
                  >
                    #{child.admissionNumber}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Child Profile & Stats Bar */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Child Profile Card */}
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary shadow-xs">
              {initials(selectedChild?.fullName || 'ST')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                {selectedChild?.fullName || 'Student'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selectedChild?.className || 'Class -'}
                {selectedChild?.sectionName ? ` - ${selectedChild.sectionName}` : ''}
                {selectedChild?.rollNumber ? ` · Roll #${selectedChild.rollNumber}` : ''}
              </p>
            </div>
          </div>
          {selectedChild?.admissionNumber && (
            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <span>Admission ID:</span>
              <span className="font-mono font-bold text-foreground">
                #{selectedChild.admissionNumber}
              </span>
            </div>
          )}
        </div>

        {/* Total Examinations */}
        <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-card to-sky-50/30 p-4 shadow-sm dark:border-sky-500/20 dark:from-sky-500/10 dark:via-card dark:to-sky-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Exams
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <CalendarDays className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
              {stats.total}
            </span>
            <span className="text-xs text-muted-foreground">in current session</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {stats.scheduled} upcoming or active
          </p>
        </div>

        {/* Admit Cards */}
        <div className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/70 via-card to-violet-50/30 p-4 shadow-sm dark:border-violet-500/20 dark:from-violet-500/10 dark:via-card dark:to-violet-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Admit Cards
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Printer className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-violet-600 dark:text-violet-400 tabular-nums">
              {stats.admitReady}
            </span>
            <span className="text-xs text-muted-foreground">available for download</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Carry printed pass to exam hall
          </p>
        </div>

        {/* Report Cards */}
        <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-card to-emerald-50/30 p-4 shadow-sm dark:border-emerald-500/20 dark:from-emerald-500/10 dark:via-card dark:to-emerald-500/5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Report Cards
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Award className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
              {stats.published}
            </span>
            <span className="text-xs text-muted-foreground">results published</span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Full score sheets available
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      {loadingData ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-border/80 bg-card py-16 shadow-sm">
          <div className="size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
          <p className="mt-3 text-xs text-muted-foreground">
            Loading examination schedules and results...
          </p>
        </div>
      ) : exams.length === 0 ? (
        <GradientEmptyState
          icon={CalendarDays}
          title="No exams found"
          description="There are currently no scheduled or published exams for this student."
        />
      ) : (
        <div className="space-y-4">
          {exams.map((exam) => {
            const result = exam.result
            const statusConfig = STATUS_CONFIG[exam.status] || STATUS_CONFIG.completed
            const resultConfig = result
              ? STATUS_CONFIG[result.status] || STATUS_CONFIG.completed
              : null
            const resultPercent = result
              ? Math.max(0, Math.min(100, Math.round(result.percentage)))
              : 0

            return (
              <section
                key={exam.id}
                className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition hover:shadow-md"
              >
                {/* Exam Card Header */}
                <div className="flex flex-col gap-3 border-b border-border/70 bg-gradient-to-r from-card via-card to-muted/20 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-foreground sm:text-lg">
                        {exam.name}
                      </h2>
                      <Badge
                        variant="outline"
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-semibold shadow-2xs',
                          statusConfig.badge,
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', statusConfig.dot)} />
                        {statusConfig.label}
                      </Badge>
                      {resultConfig && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-semibold shadow-2xs',
                            resultConfig.badge,
                          )}
                        >
                          <span className={cn('size-1.5 rounded-full', resultConfig.dot)} />
                          {resultConfig.label}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {exam.group.paradigm.name}
                      </span>
                      <span>•</span>
                      <span>{exam.group.name}</span>
                      <span>•</span>
                      <span>Academic Year {exam.academicYear}</span>
                      {exam.startDate && (
                        <>
                          <span>•</span>
                          <span>
                            {formatDate(exam.startDate)} - {formatDate(exam.endDate)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8.5 rounded-lg text-xs font-semibold shadow-2xs transition"
                      disabled={!exam.canDownloadAdmitCard}
                      onClick={() => openAdmitCard(exam)}
                    >
                      <Printer className="mr-1.5 size-3.5 text-violet-500" />
                      Admit Card
                    </Button>
                    <Button
                      variant={exam.canDownloadReportCard ? 'default' : 'outline'}
                      size="sm"
                      className="h-8.5 rounded-lg text-xs font-semibold shadow-2xs transition"
                      disabled={!exam.canDownloadReportCard}
                      onClick={() => openReportCard(exam)}
                    >
                      <Download className="mr-1.5 size-3.5" />
                      Report Card
                    </Button>
                  </div>
                </div>

                {/* Exam Details Grid (Schedule on Left, Results on Right) */}
                <div className="grid gap-0 lg:grid-cols-[1fr_1.1fr]">
                  {/* Left Column: Datesheet & Schedule */}
                  <div className="border-b border-border/70 p-4 sm:p-5 lg:border-b-0 lg:border-r">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <CalendarDays className="size-4" />
                        </span>
                        <h3 className="text-sm font-bold text-foreground">
                          Examination Datesheet
                        </h3>
                      </div>
                      {exam.schedule.length > 0 && (
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {exam.schedule.length} {exam.schedule.length === 1 ? 'Paper' : 'Papers'}
                        </span>
                      )}
                    </div>

                    {exam.schedule.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                        <CalendarDays className="size-8 text-muted-foreground/40" />
                        <p className="mt-2 font-medium">Datesheet not yet announced</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/75">
                          Timetable will appear here once finalized by the exam cell.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
                          {exam.schedule.slice(0, 5).map((row) => (
                            <div
                              key={row.id}
                              className="grid grid-cols-[1fr_auto] items-center gap-3 px-3.5 py-2.5 text-xs transition hover:bg-muted/30"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-foreground">
                                  {row.subjectName}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {formatDate(row.examDate)}
                                  {row.roomNumber ? ` · Room ${row.roomNumber}` : ''}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-foreground">
                                  {row.startTime} - {row.endTime}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Max: {row.maxMarks} marks
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {exam.schedule.length > 5 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs font-semibold text-primary hover:bg-primary/10"
                            onClick={() => setActiveScheduleExam(exam)}
                          >
                            View all {exam.schedule.length} subjects timetable
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Results & Score Breakdown */}
                  <div className="p-4 sm:p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Award className="size-4" />
                        </span>
                        <h3 className="text-sm font-bold text-foreground">
                          Performance & Scorecard
                        </h3>
                      </div>
                      {result?.grade && (
                        <Badge
                          variant="secondary"
                          className="font-bold text-primary"
                        >
                          Grade {result.grade}
                        </Badge>
                      )}
                    </div>

                    {!result ? (
                      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                        <AlertCircle className="size-8 text-amber-500/60" />
                        <p className="mt-2 font-medium text-foreground">
                          Result awaiting publication
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                          Marks evaluation is ongoing. Official report card will appear once declared.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {/* Summary Score Bar */}
                        <div className="rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/20 p-3.5 shadow-2xs">
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                Aggregate Score
                              </p>
                              <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-2xl font-black tracking-tight text-foreground">
                                  {result.percentage.toFixed(1)}%
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({result.obtainedMarks} / {result.totalMarks})
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {result.rankInClass && (
                                <div className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                                  <Trophy className="size-3.5 text-amber-500" />
                                  <span>Rank #{result.rankInClass}</span>
                                </div>
                              )}
                              {result.rankInSection && (
                                <div className="rounded-lg border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                  Sec #{result.rankInSection}
                                </div>
                              )}
                            </div>
                          </div>

                          <Progress value={resultPercent} className="mt-3 h-2" />
                        </div>

                        {/* Subject Marks Breakdown */}
                        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
                          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <span>Subject</span>
                            <span className="text-right">Marks</span>
                            <span className="w-14 text-right">Grade</span>
                          </div>
                          <div className="divide-y divide-border/50 text-xs">
                            {result.subjectSummaries.slice(0, 5).map((subject) => {
                              const pctSub =
                                subject.totalMarks > 0
                                  ? Math.round((subject.obtainedMarks / subject.totalMarks) * 100)
                                  : 0
                              return (
                                <div
                                  key={subject.id}
                                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2 transition hover:bg-muted/30"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-foreground">
                                      {subject.subjectName}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {pctSub}% performance
                                    </p>
                                  </div>
                                  <div className="text-right tabular-nums">
                                    <span className="font-bold text-foreground">
                                      {subject.obtainedMarks}
                                    </span>
                                    <span className="text-muted-foreground">
                                      /{subject.totalMarks}
                                    </span>
                                  </div>
                                  <div className="w-14 text-right">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'px-2 py-0.5 text-[10px] font-bold shadow-2xs',
                                        pctSub >= 75
                                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                          : pctSub >= 50
                                            ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                                            : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                                      )}
                                    >
                                      {subject.grade || `${pctSub}%`}
                                    </Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {result.remarks && (
                          <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-xs">
                            <span className="font-bold text-primary">Class Teacher Remarks: </span>
                            <span className="text-muted-foreground">{result.remarks}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Helpful Info Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5 text-xs text-muted-foreground shadow-2xs">
        <span className="flex items-center gap-1.5">
          <FileText className="size-3.5 text-primary" />
          Admit & Report cards open print-ready templates. Use "Save as PDF" to store records offline.
        </span>
        <span className="flex items-center gap-1.5">
          <GraduationCap className="size-3.5 text-primary" />
          Official marks cards are verified by school examination board.
        </span>
      </div>

      {/* Full Datesheet Dialog (follows AGENTS.md convention!) */}
      <Dialog
        open={!!activeScheduleExam}
        onOpenChange={(open) => {
          if (!open) setActiveScheduleExam(null)
        }}
      >
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div
              aria-hidden
              className="absolute -right-8 -top-12 size-36 rounded-full border-[18px] border-white/10"
            />
            <div
              aria-hidden
              className="absolute -bottom-8 right-16 size-24 rounded-full bg-cyan-300/20 blur-2xl"
            />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
                <FileSpreadsheet className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-white">
                  {activeScheduleExam?.name || 'Exam Timetable'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Complete subject-wise examination schedule and timing
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.055] p-4 sm:p-5">
            {activeScheduleExam && (
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 bg-muted/40 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>Subject & Room</span>
                  <span>Date</span>
                  <span className="text-right">Time & Marks</span>
                </div>
                {activeScheduleExam.schedule.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-xs transition hover:bg-muted/30"
                  >
                    <div>
                      <p className="font-bold text-foreground">{item.subjectName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.roomNumber ? `Room: ${item.roomNumber}` : 'General Hall'} · {item.durationMinutes} mins
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-foreground">
                      {formatDate(item.examDate)}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground">
                        {item.startTime} - {item.endTime}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Max: {item.maxMarks} marks
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-4 text-xs font-medium"
              onClick={() => setActiveScheduleExam(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
