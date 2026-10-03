'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BookOpenCheck,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Upload,
  Link as LinkIcon,
  ExternalLink,
  Award,
  Loader2,
  FileSpreadsheet,
  Trash2,
  MessageSquare,
  Sparkles,
  Layers,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface HomeworkItem {
  id: string
  title: string
  description: string
  assignedDate: string
  dueDate: string
  submissionType: string
  maxMarks: number | null
  attachments: any[] | null
  subject: { id: string; name: string; code?: string | null }
  class: { id: string; name: string }
  section: { id: string; name: string } | null
  teacher: { id: string; firstName: string; lastName: string }
  isPastDue: boolean
  status: 'PENDING' | 'SUBMITTED' | 'LATE' | 'EVALUATED' | 'OVERDUE' | 'RESUBMISSION'
  submission: {
    id: string
    status: string
    submittedAt: string | null
    content: string | null
    attachments: any[] | null
    marksObtained: number | null
    feedback: string | null
  } | null
}

// ---------------------------------------------------------------------------
// Standard StatCard component (sky / amber / emerald / violet)
// ---------------------------------------------------------------------------
const STAT_TONES = {
  sky: {
    border: 'border-sky-200/80 dark:border-sky-500/25',
    card: 'from-sky-50 via-white to-cyan-50 dark:from-sky-500/12 dark:via-card dark:to-cyan-500/10',
    header: 'from-sky-100/70 via-white/80 to-cyan-100/60 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    iconBg: 'from-sky-500 to-cyan-600',
    text: 'text-sky-700 dark:text-sky-300',
    blob: 'bg-sky-400/10 dark:bg-sky-400/5',
  },
  emerald: {
    border: 'border-emerald-200/80 dark:border-emerald-500/25',
    card: 'from-emerald-50 via-white to-teal-50 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/10',
    header: 'from-emerald-100/70 via-white/80 to-teal-100/60 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
    iconBg: 'from-emerald-500 to-teal-600',
    text: 'text-emerald-700 dark:text-emerald-300',
    blob: 'bg-emerald-400/10 dark:bg-emerald-400/5',
  },
  violet: {
    border: 'border-violet-200/80 dark:border-violet-500/25',
    card: 'from-violet-50 via-white to-purple-50 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10',
    header: 'from-violet-100/70 via-white/80 to-purple-100/60 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
    iconBg: 'from-violet-500 to-purple-600',
    text: 'text-violet-700 dark:text-violet-300',
    blob: 'bg-violet-400/10 dark:bg-violet-400/5',
  },
  amber: {
    border: 'border-amber-200/80 dark:border-amber-500/25',
    card: 'from-amber-50 via-white to-orange-50 dark:from-amber-500/12 dark:via-card dark:to-orange-500/10',
    header: 'from-amber-100/70 via-white/80 to-orange-100/60 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
    iconBg: 'from-amber-500 to-orange-600',
    text: 'text-amber-700 dark:text-amber-300',
    blob: 'bg-amber-400/10 dark:bg-amber-400/5',
  },
} as const

function StatCard({
  tone,
  icon: Icon,
  label,
  value,
  note,
}: {
  tone: keyof typeof STAT_TONES
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  note: string
}) {
  const t = STAT_TONES[tone]
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-gradient-to-br p-3.5 shadow-sm transition-all hover:shadow-md',
        t.border,
        t.card
      )}
    >
      <div aria-hidden className={cn('pointer-events-none absolute -right-4 -top-4 size-20 rounded-full blur-xl', t.blob)} />
      <div className="relative flex items-center justify-between">
        <span className={cn('text-xs font-semibold tracking-wide uppercase', t.text)}>{label}</span>
        <span className={cn('flex size-8 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-xs', t.iconBg)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="relative mt-2">
        <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
      </div>
    </div>
  )
}

export function StudentHomeworkPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([])
  const [stats, setStats] = useState({ total: 0, pending: 0, submitted: 0, evaluated: 0 })
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'submitted' | 'evaluated'>('all')

  // Submit Homework Modal State (AGENTS.md pattern)
  const [submittingHw, setSubmittingHw] = useState<HomeworkItem | null>(null)
  const [submitContent, setSubmitContent] = useState('')
  const [submitAttachments, setSubmitAttachments] = useState<any[]>([])
  const [savingSubmission, setSavingSubmission] = useState(false)

  const fetchStudentHomework = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{
        homework: HomeworkItem[]
        stats: { total: number; pending: number; submitted: number; evaluated: number }
      }>('/api/student/homework', { status: statusFilter })

      setHomeworkList(res.homework || [])
      if (res.stats) setStats(res.stats)
    } catch (err) {
      console.error(err)
      toast({
        title: "Couldn't Load Homework",
        description: 'Failed to load your homework assignments.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [statusFilter, toast])

  useEffect(() => {
    fetchStudentHomework()
  }, [fetchStudentHomework])

  // Open modal
  const openSubmitModal = (hw: HomeworkItem) => {
    setSubmittingHw(hw)
    setSubmitContent(hw.submission?.content || '')
    setSubmitAttachments(hw.submission?.attachments || [])
  }

  // Upload file handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setSubmitAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            url: reader.result as string,
            size: file.size,
            type: file.type,
          },
        ])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  // Submit Homework to API
  const handleSaveSubmission = async () => {
    if (!submittingHw) return

    if (!submitContent.trim() && submitAttachments.length === 0) {
      toast({
        title: 'Submission Empty',
        description: 'Please type an answer note or attach photos of your completed work.',
        variant: 'destructive',
      })
      return
    }

    setSavingSubmission(true)
    try {
      await api.post(`/api/school/homework/${submittingHw.id}/submit`, {
        content: submitContent,
        attachments: submitAttachments,
      })

      toast({
        title: 'Homework Submitted!',
        description: 'Your solution has been submitted to your teacher.',
      })

      setSubmittingHw(null)
      fetchStudentHomework()
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err.message || 'Could not submit your homework.',
        variant: 'destructive',
      })
    } finally {
      setSavingSubmission(false)
    }
  }

  return (
    <div className="space-y-4 pb-16">
      {/* 1. Signature Hero Header Banner */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <BookOpenCheck className="size-5 text-white" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">My Homework</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                  {stats.total} assignments
                </span>
                {stats.pending > 0 && (
                  <span className="rounded-full border border-amber-300/30 bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                    {stats.pending} to do
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Track your daily assignments, submit notebook photos or answers, and view teacher marks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 4-Column Stat Cards Row */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="sky"
          icon={BookOpenCheck}
          label="Total Assigned"
          value={stats.total}
          note="In your class"
        />
        <StatCard
          tone="amber"
          icon={Clock}
          label="To Do / Due"
          value={stats.pending}
          note="Pending completion"
        />
        <StatCard
          tone="violet"
          icon={Upload}
          label="Submitted"
          value={stats.submitted}
          note="Turned in to teacher"
        />
        <StatCard
          tone="emerald"
          icon={CheckCircle2}
          label="Graded & Checked"
          value={stats.evaluated}
          note="With marks & remarks"
        />
      </div>

      {/* 3. Filter Bar */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { label: 'All Assignments', value: 'all', count: stats.total },
              { label: 'To Do / Pending', value: 'pending', count: stats.pending },
              { label: 'Submitted', value: 'submitted', count: stats.submitted },
              { label: 'Graded & Checked', value: 'evaluated', count: stats.evaluated },
            ].map((tab) => (
              <Button
                key={tab.value}
                variant={statusFilter === tab.value ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'h-8 gap-1.5 text-xs font-semibold',
                  statusFilter !== tab.value && 'border-sky-200 bg-white hover:bg-sky-50 dark:border-sky-500/25 dark:bg-card'
                )}
                onClick={() => setStatusFilter(tab.value as any)}
              >
                <span>{tab.label}</span>
                <span className={cn(
                  'rounded-full px-1.5 py-0.2 text-[10px]',
                  statusFilter === tab.value ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 4. Homework Cards Grid */}
      {loading ? (
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 p-12 text-center shadow-sm dark:border-sky-500/25">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Loading your homework assignments...</p>
        </Card>
      ) : homeworkList.length === 0 ? (
        <Card className="gap-0 overflow-hidden border-dashed border-sky-200/80 bg-gradient-to-br from-sky-50/40 via-card to-violet-50/40 p-12 text-center shadow-sm dark:border-sky-500/25">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
            <BookOpenCheck className="size-6 text-white" />
          </div>
          <h3 className="mt-3 text-base font-semibold">No Homework Found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            You have no assignments under this category right now.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {homeworkList.map((hw) => {
            const isCompleted = hw.status === 'EVALUATED'
            const isSubmitted = hw.status === 'SUBMITTED' || hw.status === 'LATE'

            return (
              <Card
                key={hw.id}
                className="group flex flex-col justify-between overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/40 via-card to-violet-50/40 shadow-sm transition-all hover:border-sky-300 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10"
              >
                <div>
                  {/* Card Header */}
                  <div className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/60 via-white/80 to-violet-100/50 p-3.5 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className="border-primary/20 bg-primary/10 text-xs font-semibold text-primary">
                          {hw.subject.name}
                        </Badge>
                        {hw.maxMarks && (
                          <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-500/25 dark:bg-card dark:text-sky-300">
                            Max {hw.maxMarks} pts
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      {isCompleted ? (
                        <Badge className="border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/30">
                          Graded
                        </Badge>
                      ) : isSubmitted ? (
                        <Badge className="border-blue-300 bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/30">
                          Turned In
                        </Badge>
                      ) : hw.isPastDue ? (
                        <Badge variant="outline" className="border-red-300 bg-red-50 text-[11px] font-bold text-red-700 dark:bg-red-950/30">
                          Past Due
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-700 dark:bg-amber-950/30">
                          To Do
                        </Badge>
                      )}
                    </div>

                    <h3 className="mt-2 text-sm font-bold text-foreground line-clamp-1">
                      {hw.title}
                    </h3>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1 font-semibold text-foreground">
                        <Clock className="size-3 text-amber-600 dark:text-amber-300" />
                        Due: {new Date(hw.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                      <span>&bull;</span>
                      <span>By {hw.teacher.firstName} {hw.teacher.lastName}</span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="space-y-3 p-3.5">
                    {/* Description */}
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {hw.description || 'No detailed instructions provided.'}
                    </p>

                    {/* Teacher Study Attachments */}
                    {hw.attachments && hw.attachments.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Study Materials ({hw.attachments.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {hw.attachments.map((att, idx) => (
                            <a
                              key={idx}
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-50 dark:border-sky-500/25 dark:bg-card dark:text-sky-300"
                            >
                              {att.type === 'link' ? <LinkIcon className="size-3" /> : <Paperclip className="size-3" />}
                              <span className="max-w-[120px] truncate">{att.name}</span>
                              <ExternalLink className="size-2.5 text-muted-foreground" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Teacher Grading Feedback Box */}
                    {hw.submission && hw.submission.status === 'EVALUATED' && (
                      <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-2.5 text-xs dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/10">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 font-bold text-emerald-800 dark:text-emerald-300">
                            <Award className="size-3.5" />
                            Score: {hw.submission.marksObtained !== null ? `${hw.submission.marksObtained} / ${hw.maxMarks || 100}` : 'Completed'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">Checked by Teacher</span>
                        </div>
                        {hw.submission.feedback && (
                          <p className="mt-1 text-[11px] italic text-muted-foreground">
                            &ldquo;{hw.submission.feedback}&rdquo;
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="border-t border-sky-200/60 bg-white/70 p-3 dark:border-sky-500/20 dark:bg-card">
                  {hw.submissionType === 'OFFLINE' ? (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BookOpenCheck className="size-3.5 text-emerald-600" />
                        In-class notebook check
                      </span>
                      {isCompleted ? (
                        <span className="font-semibold text-emerald-600">Verified</span>
                      ) : (
                        <span className="text-amber-600 font-medium">Show in class</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-muted-foreground">
                        {isSubmitted ? (
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                            Submitted on {new Date(hw.submission?.submittedAt || '').toLocaleDateString()}
                          </span>
                        ) : (
                          <span>Online submission required</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isSubmitted ? 'outline' : 'default'}
                        className="h-8 gap-1.5 text-xs shadow-xs"
                        onClick={() => openSubmitModal(hw)}
                      >
                        <Upload className="size-3" />
                        {isSubmitted ? 'View / Edit' : 'Submit Work'}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* =========================================================================
          AGENTS.MD COMPLIANT STUDENT HOMEWORK SUBMISSION MODAL
          ========================================================================= */}
      <Dialog open={Boolean(submittingHw)} onOpenChange={(open) => !open && setSubmittingHw(null)}>
        {submittingHw && (
          <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
            {/* Header: brand-colored gradient with decorative blurs */}
            <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7,#2563eb)] px-5 py-4 pr-12 text-white sm:px-6">
              <div className="pointer-events-none absolute -right-6 -top-6 size-28 rounded-full border-[18px] border-white/10" />
              <div className="pointer-events-none absolute -bottom-8 right-16 size-24 rounded-full bg-sky-300/20 blur-2xl" />

              <div className="relative z-10 flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm">
                  <Upload className="size-6 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">
                    Submit Homework Solution
                  </DialogTitle>
                  <DialogDescription className="text-xs text-white/75">
                    {submittingHw.title} &bull; {submittingHw.subject.name}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Body */}
            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.055] p-4 sm:p-5">
              {/* Task Details Section */}
              <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm">
                    <BookOpenCheck className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Assignment Instructions</h3>
                    <p className="text-[10px] text-muted-foreground">Due: {new Date(submittingHw.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </div>
                <p className="rounded-lg border border-border/80 bg-background/80 p-3 text-xs leading-relaxed text-foreground">
                  {submittingHw.description || 'No detailed instructions.'}
                </p>
              </div>

              {/* Solution Answer Box */}
              <div className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-violet-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-violet-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                    <Sparkles className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Your Solution / Answer Notes</h3>
                    <p className="text-[10px] text-muted-foreground">Type your answers, explanation, or notebook page references</p>
                  </div>
                </div>

                <Textarea
                  placeholder="Type your answer, observations, key steps, or question notes..."
                  value={submitContent}
                  onChange={(e) => setSubmitContent(e.target.value)}
                  rows={4}
                  className="border-violet-200 bg-white text-xs leading-relaxed dark:border-violet-500/25 dark:bg-card"
                />
              </div>

              {/* Upload Notebook Photos Section */}
              <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                    <Paperclip className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Notebook Photos or PDF Upload</h3>
                    <p className="text-[10px] text-muted-foreground">Attach images of completed homework or typed documents</p>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-400 bg-emerald-50/70 p-4 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <Upload className="size-4" />
                  Tap to upload notebook photos or files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/*,.pdf,.doc,.docx"
                  />
                </label>

                {submitAttachments.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {submitAttachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-emerald-200/80 bg-white px-3 py-1.5 text-xs shadow-2xs dark:border-emerald-500/20 dark:bg-card"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileSpreadsheet className="size-3.5 text-emerald-600" />
                          <span className="truncate font-medium">{att.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive"
                          onClick={() => setSubmitAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => setSubmittingHw(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs"
                onClick={handleSaveSubmission}
                disabled={savingSubmission}
              >
                {savingSubmission ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Submit Homework
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
