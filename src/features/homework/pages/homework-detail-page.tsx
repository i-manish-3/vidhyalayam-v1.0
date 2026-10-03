'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpenCheck,
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Users,
  Search,
  Check,
  X,
  FileSpreadsheet,
  Link as LinkIcon,
  Download,
  Eye,
  Printer,
  Edit,
  Trash2,
  TrendingUp,
  MessageSquare,
  Award,
  Sparkles,
  Loader2,
  ExternalLink,
  ChevronDown,
  Layers,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

interface StudentInfo {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
  section?: { name: string } | null
}

interface SubmissionItem {
  id: string
  schoolId: string
  homeworkId: string
  studentId: string
  status: 'PENDING' | 'SUBMITTED' | 'LATE' | 'EVALUATED' | 'RESUBMISSION'
  submittedAt: string | null
  content: string | null
  attachments: any[] | null
  marksObtained: number | null
  feedback: string | null
  evaluatedAt: string | null
  evaluatedBy: string | null
  student: StudentInfo
}

interface HomeworkDetails {
  id: string
  title: string
  description: string
  assignedDate: string
  dueDate: string
  submissionType: string
  maxMarks: number | null
  attachments: any[] | null
  status: string
  class: { id: string; name: string }
  section: { id: string; name: string } | null
  subject: { id: string; name: string; code?: string | null; type?: string }
  teacher: { id: string; firstName: string; lastName: string; employeeId?: string | null }
  submissions: SubmissionItem[]
}

interface HomeworkDetailStats {
  totalStudents: number
  submittedCount: number
  evaluatedCount: number
  pendingCount: number
  averageMarks: number | null
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

export function HomeworkDetailPage({ homeworkId }: { homeworkId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)

  const [loading, setLoading] = useState(true)
  const [savingBatch, setSavingBatch] = useState(false)
  const [homework, setHomework] = useState<HomeworkDetails | null>(null)
  const [stats, setStats] = useState<HomeworkDetailStats | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Local editing cache for inline marks & feedback
  const [marksMap, setMarksMap] = useState<Record<string, string>>({})
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({})

  // Modal State for grading single student (following AGENTS.md convention)
  const [activeGradingSubmission, setActiveGradingSubmission] = useState<SubmissionItem | null>(null)
  const [modalMarks, setModalMarks] = useState('')
  const [modalFeedback, setModalFeedback] = useState('')
  const [modalStatus, setModalStatus] = useState<'EVALUATED' | 'RESUBMISSION' | 'SUBMITTED'>('EVALUATED')
  const [modalSaving, setModalSaving] = useState(false)

  // Fetch homework data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{
        homework: HomeworkDetails
        stats: HomeworkDetailStats
      }>(`/api/school/homework/${homeworkId}`)

      setHomework(res.homework)
      setStats(res.stats)

      // Initialize inline inputs
      const marksInit: Record<string, string> = {}
      const feedbackInit: Record<string, string> = {}
      res.homework.submissions.forEach((s) => {
        marksInit[s.studentId] = s.marksObtained !== null && s.marksObtained !== undefined ? String(s.marksObtained) : ''
        feedbackInit[s.studentId] = s.feedback || ''
      })
      setMarksMap(marksInit)
      setFeedbackMap(feedbackInit)
    } catch (err) {
      console.error(err)
      toast({
        title: "Couldn't Load Homework",
        description: 'Failed to load homework details.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [homeworkId, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filtered submissions
  const filteredSubmissions = useMemo(() => {
    if (!homework) return []
    return homework.submissions.filter((sub) => {
      const studentName = `${sub.student.firstName} ${sub.student.lastName}`.toLowerCase()
      const roll = (sub.student.rollNumber || '').toLowerCase()
      const adm = (sub.student.admissionNumber || '').toLowerCase()
      const q = searchQuery.toLowerCase().trim()

      const matchesSearch = !q || studentName.includes(q) || roll.includes(q) || adm.includes(q)
      const matchesStatus = statusFilter === 'all' || sub.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [homework, searchQuery, statusFilter])

  // Open Grading Modal for single student
  const openGradingModal = (sub: SubmissionItem) => {
    setActiveGradingSubmission(sub)
    setModalMarks(sub.marksObtained !== null && sub.marksObtained !== undefined ? String(sub.marksObtained) : '')
    setModalFeedback(sub.feedback || '')
    setModalStatus(sub.status === 'EVALUATED' || sub.status === 'RESUBMISSION' ? sub.status : 'EVALUATED')
  }

  // Save Modal Evaluation
  const handleSaveModalEvaluation = async () => {
    if (!activeGradingSubmission || !homework) return

    setModalSaving(true)
    try {
      const marks = modalMarks.trim() !== '' ? Number(modalMarks) : null
      await api.patch(`/api/school/homework/${homework.id}/submissions`, {
        studentId: activeGradingSubmission.studentId,
        status: modalStatus,
        marksObtained: marks,
        feedback: modalFeedback,
      })

      toast({
        title: 'Evaluation Saved',
        description: `Updated assessment for ${activeGradingSubmission.student.firstName}.`,
      })

      // Update local state
      setHomework((prev) => {
        if (!prev) return null
        return {
          ...prev,
          submissions: prev.submissions.map((s) => {
            if (s.studentId === activeGradingSubmission.studentId) {
              return {
                ...s,
                status: modalStatus,
                marksObtained: marks,
                feedback: modalFeedback,
                evaluatedAt: new Date().toISOString(),
              }
            }
            return s
          }),
        }
      })

      setMarksMap((prev) => ({ ...prev, [activeGradingSubmission.studentId]: modalMarks }))
      setFeedbackMap((prev) => ({ ...prev, [activeGradingSubmission.studentId]: modalFeedback }))
      setActiveGradingSubmission(null)
    } catch (err: any) {
      toast({
        title: 'Evaluation Failed',
        description: err.message || 'Could not save student evaluation.',
        variant: 'destructive',
      })
    } finally {
      setModalSaving(false)
    }
  }

  // Bulk: Mark All Pending as Checked (Completed)
  const handleMarkAllPendingChecked = async () => {
    if (!homework) return
    const pendingSubs = homework.submissions.filter((s) => s.status === 'PENDING')
    if (pendingSubs.length === 0) {
      toast({ title: 'No Pending Students', description: 'All students are already evaluated or submitted.' })
      return
    }

    if (!confirm(`Mark ${pendingSubs.length} pending student notebooks as Checked / Completed?`)) return

    setSavingBatch(true)
    try {
      const evaluations = pendingSubs.map((s) => ({
        studentId: s.studentId,
        status: 'EVALUATED',
        marksObtained: homework.maxMarks !== null ? homework.maxMarks : null,
        feedback: 'Notebook checked in class.',
      }))

      await api.post(`/api/school/homework/${homework.id}/submissions`, { evaluations })

      toast({
        title: 'Batch Update Complete',
        description: `Marked ${pendingSubs.length} students as Evaluated / Checked.`,
      })
      fetchData()
    } catch (err: any) {
      toast({
        title: 'Batch Update Failed',
        description: err.message || 'Could not update submissions.',
        variant: 'destructive',
      })
    } finally {
      setSavingBatch(false)
    }
  }

  // Bulk Save all modified inline marks & feedback
  const handleSaveAllInline = async () => {
    if (!homework) return

    setSavingBatch(true)
    try {
      const evaluations = homework.submissions.map((s) => {
        const markVal = marksMap[s.studentId]
        const feedbackVal = feedbackMap[s.studentId]
        const marks = markVal !== undefined && markVal !== '' ? Number(markVal) : s.marksObtained
        const status = marks !== null && marks !== undefined ? 'EVALUATED' : s.status

        return {
          studentId: s.studentId,
          status,
          marksObtained: marks,
          feedback: feedbackVal !== undefined ? feedbackVal : s.feedback,
        }
      })

      await api.post(`/api/school/homework/${homework.id}/submissions`, { evaluations })

      toast({
        title: 'All Marks & Feedback Saved',
        description: 'Successfully updated student evaluation roster.',
      })
      fetchData()
    } catch (err: any) {
      toast({
        title: 'Save Failed',
        description: err.message || 'Could not save evaluations.',
        variant: 'destructive',
      })
    } finally {
      setSavingBatch(false)
    }
  }

  // Print assignment sheet
  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Loading homework details & roster...</p>
        </div>
      </div>
    )
  }

  if (!homework) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-lg font-bold">Homework Not Found</h2>
        <p className="mt-1 text-sm text-muted-foreground">This assignment might have been removed or does not exist.</p>
        <Link href="/homework">
          <Button size="sm" className="mt-4">
            Back to Homework List
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-16">
      {/* 1. Signature Hero Header Banner */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 print:hidden">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/homework">
              <Button
                variant="ghost"
                size="icon"
                className="size-9 rounded-full text-white hover:bg-white/20 hover:text-white"
              >
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <BookOpenCheck className="size-5 text-white" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight">{homework.title}</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                  {homework.subject.name}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/85">
                  {homework.class.name}{homework.section ? ` - Sec ${homework.section.name}` : ''}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                  {homework.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Assigned by {homework.teacher.firstName} {homework.teacher.lastName} &bull; Due: {new Date(homework.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-white/40 bg-white/10 text-xs text-white hover:bg-white/20 hover:text-white"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              Print Sheet
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 border border-white/60 shadow-md"
              style={{ backgroundColor: 'white', color: 'var(--primary)' }}
              onClick={handleSaveAllInline}
              disabled={savingBatch}
            >
              {savingBatch ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Save All Marks
            </Button>
          </div>
        </div>
      </section>

      {/* 2. 4-Column Stat Cards Row */}
      {stats && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
          <StatCard
            tone="sky"
            icon={Users}
            label="Enrolled Students"
            value={stats.totalStudents}
            note={homework.class.name}
          />
          <StatCard
            tone="amber"
            icon={Clock}
            label="Turned In"
            value={stats.submittedCount}
            note={`${stats.totalStudents > 0 ? Math.round((stats.submittedCount / stats.totalStudents) * 100) : 0}% completion`}
          />
          <StatCard
            tone="emerald"
            icon={CheckCircle2}
            label="Evaluated"
            value={stats.evaluatedCount}
            note="Graded & feedback given"
          />
          <StatCard
            tone="violet"
            icon={Award}
            label="Class Average"
            value={stats.averageMarks !== null ? `${stats.averageMarks} pts` : '—'}
            note={homework.maxMarks ? `Out of ${homework.maxMarks}` : 'Score average'}
          />
        </div>
      )}

      {/* 3. Assignment Overview Card */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardHeader className="gap-1 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-white/90 to-violet-100/60 px-4 py-3 !pb-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                <BookOpenCheck className="size-3.5 text-white" />
              </span>
              <span>Assignment Overview & Instructions</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="size-3 text-sky-600 dark:text-sky-300" />
                Assigned: {new Date(homework.assignedDate).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <Clock className="size-3 text-amber-600 dark:text-amber-300" />
                Due: {new Date(homework.dueDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
              {homework.maxMarks !== null && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Max {homework.maxMarks} Marks
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {/* Instructions */}
          <div className="whitespace-pre-wrap rounded-xl border border-sky-200/60 bg-white/80 p-3.5 text-xs leading-relaxed text-foreground shadow-2xs dark:border-sky-500/20 dark:bg-card">
            {homework.description || 'No detailed instructions provided.'}
          </div>

          {/* Teacher and Mode tags */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-200/50 pt-3 text-xs text-muted-foreground dark:border-sky-500/20">
            <div>
              Teacher:{' '}
              <strong className="text-foreground">
                {homework.teacher.firstName} {homework.teacher.lastName}
              </strong>{' '}
              {homework.teacher.employeeId && `(${homework.teacher.employeeId})`}
            </div>
            <div>
              Submission Mode: <strong className="text-foreground capitalize">{homework.submissionType.toLowerCase()}</strong>
            </div>
          </div>

          {/* Attached Files & Resources */}
          {homework.attachments && homework.attachments.length > 0 && (
            <div className="space-y-2 border-t border-sky-200/50 pt-3 dark:border-sky-500/20">
              <span className="text-xs font-semibold text-foreground">
                Attached Study Materials ({homework.attachments.length}):
              </span>
              <div className="flex flex-wrap gap-2">
                {homework.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 shadow-2xs transition hover:border-sky-400 hover:bg-sky-50 dark:border-sky-500/25 dark:bg-card dark:text-sky-300"
                  >
                    {att.type === 'link' ? <LinkIcon className="size-3.5 text-blue-500" /> : <Paperclip className="size-3.5 text-sky-600" />}
                    <span className="max-w-[200px] truncate">{att.name}</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Student Submissions & Evaluation Roster Card */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardHeader className="gap-1 border-b border-sky-200/70 bg-gradient-to-r from-sky-100/70 via-white/90 to-violet-100/60 px-4 py-3 !pb-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                  <Users className="size-3.5 text-white" />
                </span>
                <span>Student Evaluation Roster ({homework.submissions.length})</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Grade student submissions, enter marks, and add individual feedback
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-violet-200 bg-white text-xs font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-500/25 dark:bg-card dark:text-violet-300"
                onClick={handleMarkAllPendingChecked}
                disabled={savingBatch}
              >
                <Check className="mr-1.5 size-3.5" />
                Mark All Pending as Checked
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Filter and Search Bar */}
        <div className="border-b border-sky-200/60 bg-white/70 p-3 print:hidden dark:border-sky-500/20 dark:bg-card">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search student by name or roll..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 border-sky-200 bg-white pl-8 pr-8 text-xs shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'All', value: 'all' },
                { label: 'Pending', value: 'PENDING' },
                { label: 'Submitted', value: 'SUBMITTED' },
                { label: 'Evaluated', value: 'EVALUATED' },
              ].map((tab) => (
                <Button
                  key={tab.value}
                  variant={statusFilter === tab.value ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-7 px-2.5 text-xs',
                    statusFilter !== tab.value && 'border-sky-200 bg-white hover:bg-sky-50 dark:border-sky-500/25 dark:bg-card'
                  )}
                  onClick={() => setStatusFilter(tab.value)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-sky-200/60 bg-sky-50/50 hover:bg-sky-50/50 dark:border-sky-500/20 dark:bg-card">
                  <TableHead className="w-16 text-center text-xs font-semibold">Roll</TableHead>
                  <TableHead className="text-xs font-semibold">Student</TableHead>
                  <TableHead className="w-32 text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Response / Attached</TableHead>
                  <TableHead className="w-36 text-xs font-semibold">
                    Marks {homework.maxMarks ? `(Max ${homework.maxMarks})` : ''}
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Teacher Remarks</TableHead>
                  <TableHead className="w-28 text-right text-xs font-semibold print:hidden">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                      No students found matching current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const initials = `${sub.student.firstName[0] || ''}${sub.student.lastName[0] || ''}`

                    return (
                      <TableRow key={sub.studentId} className="hover:bg-sky-50/40 dark:hover:bg-sky-500/5">
                        {/* Roll Number */}
                        <TableCell className="text-center text-xs font-semibold text-muted-foreground">
                          {sub.student.rollNumber || '—'}
                        </TableCell>

                        {/* Student Name */}
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="size-7 border border-primary/20">
                              <AvatarImage src={sub.student.profileImage || undefined} />
                              <AvatarFallback className="text-[10px] font-bold text-primary">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-xs font-bold text-foreground">
                                {sub.student.firstName} {sub.student.lastName}
                              </p>
                              {sub.student.admissionNumber && (
                                <p className="text-[10px] text-muted-foreground">
                                  Adm: {sub.student.admissionNumber}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Status Badge */}
                        <TableCell>
                          {sub.status === 'EVALUATED' ? (
                            <Badge className="border-emerald-300 bg-emerald-50 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30">
                              Evaluated
                            </Badge>
                          ) : sub.status === 'SUBMITTED' ? (
                            <Badge className="border-blue-300 bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/30">
                              Turned In
                            </Badge>
                          ) : sub.status === 'LATE' ? (
                            <Badge className="border-orange-300 bg-orange-50 text-[11px] font-semibold text-orange-700 dark:bg-orange-950/30">
                              Late
                            </Badge>
                          ) : sub.status === 'RESUBMISSION' ? (
                            <Badge className="border-purple-300 bg-purple-50 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/30">
                              Redo Req.
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/30">
                              Pending
                            </Badge>
                          )}
                        </TableCell>

                        {/* Response / Files */}
                        <TableCell>
                          {sub.content || (sub.attachments && sub.attachments.length > 0) ? (
                            <div className="space-y-1">
                              {sub.content && (
                                <p className="max-w-[200px] truncate text-xs text-foreground">
                                  {sub.content}
                                </p>
                              )}
                              {sub.attachments && sub.attachments.length > 0 && (
                                <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                                  <Paperclip className="size-3" />
                                  <span>{sub.attachments.length} file(s)</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        {/* Marks Input */}
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={homework.maxMarks || 1000}
                            placeholder="Marks"
                            value={marksMap[sub.studentId] !== undefined ? marksMap[sub.studentId] : ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setMarksMap((prev) => ({ ...prev, [sub.studentId]: v }))
                            }}
                            className="h-8 border-sky-200 bg-white text-xs font-semibold shadow-2xs focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-card"
                          />
                        </TableCell>

                        {/* Teacher Remarks Input */}
                        <TableCell>
                          <Input
                            placeholder="Add feedback..."
                            value={feedbackMap[sub.studentId] !== undefined ? feedbackMap[sub.studentId] : ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setFeedbackMap((prev) => ({ ...prev, [sub.studentId]: v }))
                            }}
                            className="h-8 border-sky-200 bg-white text-xs shadow-2xs focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-card"
                          />
                        </TableCell>

                        {/* Action: Open Grading Modal */}
                        <TableCell className="text-right print:hidden">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2.5 text-xs text-primary hover:bg-primary/10"
                            onClick={() => openGradingModal(sub)}
                          >
                            <Award className="size-3.5" />
                            Grade
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* =========================================================================
          AGENTS.MD COMPLIANT STUDENT EVALUATION MODAL
          ========================================================================= */}
      <Dialog
        open={Boolean(activeGradingSubmission)}
        onOpenChange={(open) => {
          if (!open) setActiveGradingSubmission(null)
        }}
      >
        {activeGradingSubmission && (
          <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
            {/* 2. DialogHeader: brand-colored gradient with decorative blurs */}
            <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7,#2563eb)] px-5 py-4 pr-12 text-white sm:px-6">
              <div className="pointer-events-none absolute -right-6 -top-6 size-28 rounded-full border-[18px] border-white/10" />
              <div className="pointer-events-none absolute -bottom-8 right-16 size-24 rounded-full bg-sky-300/20 blur-2xl" />

              <div className="relative z-10 flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl border border-white/25 bg-white/15 backdrop-blur-sm">
                  <Award className="size-6 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">
                    Grade Submission
                  </DialogTitle>
                  <DialogDescription className="text-xs text-white/75">
                    {activeGradingSubmission.student.firstName} {activeGradingSubmission.student.lastName} (Roll:{' '}
                    {activeGradingSubmission.student.rollNumber || '—'})
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* 3. Body with themed scrollbar and sections */}
            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.055] p-4 sm:p-5">
              {/* Student Submitted Work Section */}
              <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm">
                    <BookOpenCheck className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Student Submitted Work</h3>
                    <p className="text-[10px] text-muted-foreground">
                      Submitted content and attached solution files
                    </p>
                  </div>
                </div>

                {activeGradingSubmission.content ? (
                  <div className="rounded-lg border border-border/80 bg-background/80 p-3 text-xs leading-relaxed text-foreground">
                    {activeGradingSubmission.content}
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">No written text notes submitted.</p>
                )}

                {activeGradingSubmission.attachments && activeGradingSubmission.attachments.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <span className="text-[11px] font-semibold text-foreground">Submitted Files:</span>
                    <div className="flex flex-wrap gap-2">
                      {activeGradingSubmission.attachments.map((att: any, idx: number) => (
                        <a
                          key={idx}
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-xs font-medium text-primary hover:bg-muted/40"
                        >
                          <Paperclip className="size-3" />
                          <span className="max-w-[150px] truncate">{att.name}</span>
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Evaluation & Marks Section */}
              <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/10">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
                    <Award className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">Score & Feedback</h3>
                    <p className="text-[10px] text-muted-foreground">
                      Assign points and give personalized constructive remarks
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">
                        Marks Obtained {homework.maxMarks ? `(Max ${homework.maxMarks})` : ''}
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max={homework.maxMarks || 1000}
                        placeholder="Marks"
                        value={modalMarks}
                        onChange={(e) => setModalMarks(e.target.value)}
                        className="h-8 text-xs font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Evaluation Status</label>
                      <select
                        value={modalStatus}
                        onChange={(e) => setModalStatus(e.target.value as any)}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="EVALUATED">Evaluated / Checked</option>
                        <option value="RESUBMISSION">Resubmission Requested</option>
                        <option value="SUBMITTED">Under Review</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Teacher Feedback & Remarks</label>
                    <Textarea
                      placeholder="e.g. Excellent presentation! Question 4 formula needs verification. Keep it up!"
                      value={modalFeedback}
                      onChange={(e) => setModalFeedback(e.target.value)}
                      rows={3}
                      className="text-xs leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Footer with small buttons */}
            <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => setActiveGradingSubmission(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs"
                onClick={handleSaveModalEvaluation}
                disabled={modalSaving}
              >
                {modalSaving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Save Evaluation
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
