'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  BookOpenCheck,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Paperclip,
  Users,
  Award,
  ExternalLink,
  Baby,
  ChevronRight,
  Loader2,
  GraduationCap,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ChildInfo {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
  class: { id: string; name: string }
  section: { id: string; name: string } | null
}

interface ParentHomeworkItem {
  id: string
  title: string
  description: string
  assignedDate: string
  dueDate: string
  submissionType: string
  maxMarks: number | null
  attachments: any[] | null
  subject: { id: string; name: string; code?: string | null }
  teacher: { id: string; firstName: string; lastName: string }
  isPastDue: boolean
  status: 'PENDING' | 'SUBMITTED' | 'LATE' | 'EVALUATED' | 'OVERDUE'
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

export function ParentHomeworkPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [selectedChildId, setSelectedChildId] = useState<string>(searchParams?.get('studentId') || '')
  const [homeworkList, setHomeworkList] = useState<ParentHomeworkItem[]>([])
  const [stats, setStats] = useState({ total: 0, pending: 0, submitted: 0, evaluated: 0 })
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'completed'>('all')

  const fetchParentData = useCallback(async (childId?: string) => {
    setLoading(true)
    try {
      const res = await api.get<{
        children: ChildInfo[]
        selectedChild: ChildInfo | null
        homework: ParentHomeworkItem[]
        stats: { total: number; pending: number; submitted: number; evaluated: number }
      }>('/api/parent/homework', { studentId: childId || selectedChildId })

      setChildren(res.children || [])
      setHomeworkList(res.homework || [])
      if (res.stats) setStats(res.stats)

      if (res.selectedChild && !selectedChildId) {
        setSelectedChildId(res.selectedChild.id)
      }
    } catch (err) {
      console.error(err)
      toast({
        title: "Couldn't Load Homework Diary",
        description: 'Failed to load homework diary for your child.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedChildId, toast])

  useEffect(() => {
    fetchParentData(selectedChildId)
  }, [selectedChildId, fetchParentData])

  const activeChild = useMemo(() => {
    return children.find((c) => c.id === selectedChildId) || children[0] || null
  }, [children, selectedChildId])

  // Filtered List
  const displayedHomework = useMemo(() => {
    if (filterTab === 'pending') {
      return homeworkList.filter((h) => h.status === 'PENDING' || h.status === 'OVERDUE')
    }
    if (filterTab === 'completed') {
      return homeworkList.filter((h) => h.status === 'EVALUATED' || h.status === 'SUBMITTED' || h.status === 'LATE')
    }
    return homeworkList
  }, [homeworkList, filterTab])

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
                <h1 className="text-xl font-bold tracking-tight">Daily Homework Diary</h1>
                {activeChild && (
                  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                    {activeChild.firstName} {activeChild.lastName} ({activeChild.class.name})
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Review daily homework assignments, completion status, and teacher remarks for your child.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Child Switcher Tabs (if parent has multiple children) */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((child) => {
            const isSelected = child.id === activeChild?.id
            return (
              <Button
                key={child.id}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'gap-1.5 text-xs font-semibold',
                  !isSelected && 'border-sky-200 bg-white hover:bg-sky-50 dark:border-sky-500/25 dark:bg-card'
                )}
                onClick={() => setSelectedChildId(child.id)}
              >
                <Baby className="size-3.5" />
                {child.firstName} {child.lastName} ({child.class.name})
              </Button>
            )
          })}
        </div>
      )}

      {/* Active Child Hero Banner Card */}
      {activeChild && (
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          <CardContent className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="size-11 border-2 border-primary/25 shadow-xs">
                <AvatarImage src={activeChild.profileImage || undefined} />
                <AvatarFallback className="font-bold text-primary">
                  {activeChild.firstName[0]}
                  {activeChild.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-foreground">
                    {activeChild.firstName} {activeChild.lastName}
                  </h2>
                  <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                    {activeChild.class.name}
                    {activeChild.section ? ` - Sec ${activeChild.section.name}` : ''}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {activeChild.rollNumber && `Roll: ${activeChild.rollNumber} • `}
                  {activeChild.admissionNumber && `Admission No: ${activeChild.admissionNumber}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sky-200 bg-sky-100/60 px-3 py-1 text-xs font-semibold text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/20 dark:text-sky-300">
                {stats.pending} pending task(s)
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. 4-Column Stat Cards Row */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="sky"
          icon={BookOpenCheck}
          label="Total Assigned"
          value={stats.total}
          note="Daily tasks in class"
        />
        <StatCard
          tone="amber"
          icon={Clock}
          label="Pending / To Do"
          value={stats.pending}
          note="Requires completion"
        />
        <StatCard
          tone="violet"
          icon={CheckCircle2}
          label="Submitted"
          value={stats.submitted}
          note="Work turned in"
        />
        <StatCard
          tone="emerald"
          icon={Award}
          label="Graded & Checked"
          value={stats.evaluated}
          note="With teacher feedback"
        />
      </div>

      {/* Filter Tabs Bar */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-wrap items-center gap-1.5 p-3">
          {[
            { label: 'All Diary Entries', value: 'all', count: stats.total },
            { label: 'Pending Completion', value: 'pending', count: stats.pending },
            { label: 'Completed & Checked', value: 'completed', count: stats.evaluated + stats.submitted },
          ].map((tab) => (
            <Button
              key={tab.value}
              variant={filterTab === tab.value ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'h-8 gap-1.5 text-xs font-semibold',
                filterTab !== tab.value && 'border-sky-200 bg-white hover:bg-sky-50 dark:border-sky-500/25 dark:bg-card'
              )}
              onClick={() => setFilterTab(tab.value as any)}
            >
              <span>{tab.label}</span>
              <span className={cn(
                'rounded-full px-1.5 py-0.2 text-[10px]',
                filterTab === tab.value ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              )}>
                {tab.count}
              </span>
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Homework Entries */}
      {loading ? (
        <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-card to-violet-50/60 p-12 text-center shadow-sm dark:border-sky-500/25">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Loading homework diary entries...</p>
        </Card>
      ) : displayedHomework.length === 0 ? (
        <Card className="gap-0 overflow-hidden border-dashed border-sky-200/80 bg-gradient-to-br from-sky-50/40 via-card to-violet-50/40 p-12 text-center shadow-sm dark:border-sky-500/25">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
            <BookOpenCheck className="size-6 text-white" />
          </div>
          <h3 className="mt-3 text-base font-semibold">No Homework Entries</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No homework assignments found for {activeChild?.firstName || 'your child'} in this view.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {displayedHomework.map((hw) => {
            const isCompleted = hw.status === 'EVALUATED'
            const isSubmitted = hw.status === 'SUBMITTED' || hw.status === 'LATE'

            return (
              <Card
                key={hw.id}
                className="group flex flex-col justify-between overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/40 via-card to-violet-50/40 shadow-sm transition-all hover:border-sky-300 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10"
              >
                <div>
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
                          Checked & Graded
                        </Badge>
                      ) : isSubmitted ? (
                        <Badge className="border-blue-300 bg-blue-50 text-[11px] font-semibold text-blue-700 dark:bg-blue-950/30">
                          Submitted
                        </Badge>
                      ) : hw.isPastDue ? (
                        <Badge variant="outline" className="border-red-300 bg-red-50 text-[11px] font-bold text-red-700 dark:bg-red-950/30">
                          Past Due
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-700 dark:bg-amber-950/30">
                          Pending
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
                      <span>Teacher: {hw.teacher.firstName} {hw.teacher.lastName}</span>
                    </div>
                  </div>

                  <div className="space-y-3 p-3.5">
                    {/* Description */}
                    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {hw.description || 'No detailed instructions.'}
                    </p>

                    {/* Attached Resources */}
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

                    {/* Teacher Remarks & Score Card */}
                    {hw.submission && hw.submission.status === 'EVALUATED' && (
                      <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-2.5 text-xs dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/10">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 font-bold text-emerald-800 dark:text-emerald-300">
                            <Award className="size-3.5" />
                            Score: {hw.submission.marksObtained !== null ? `${hw.submission.marksObtained} / ${hw.maxMarks || 100}` : 'Completed'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">Teacher Assessment</span>
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

                <div className="flex items-center justify-between border-t border-sky-200/60 bg-white/70 p-3 text-xs text-muted-foreground dark:border-sky-500/20 dark:bg-card">
                  <span>
                    Assigned: {new Date(hw.assignedDate).toLocaleDateString()}
                  </span>
                  <span className="font-medium text-foreground">
                    Mode: {hw.submissionType.toLowerCase()}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
