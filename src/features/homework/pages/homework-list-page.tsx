'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookOpenCheck,
  PlusCircle,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Users,
  Paperclip,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  FileSpreadsheet,
  Layers,
  Printer,
  ChevronRight,
  TrendingUp,
  Loader2,
  X,
  BookOpen,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'

interface HomeworkItem {
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
  subject: { id: string; name: string; code?: string | null }
  teacher: { id: string; firstName: string; lastName: string; employeeId?: string | null }
  stats: {
    totalStudents: number
    submittedCount: number
    evaluatedCount: number
    pendingCount: number
  }
}

export function HomeworkListPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchool?.academicYear || getCurrentAcademicYear()

  const [loading, setLoading] = useState(true)
  const [filtering, setFiltering] = useState(false)
  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([])
  const [filterClasses, setFilterClasses] = useState<{ id: string; name: string }[]>([])
  const [filterSubjects, setFilterSubjects] = useState<{ id: string; name: string }[]>([])

  // Filters
  const [search, setSearch] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('all')
  const [selectedSubjectId, setSelectedSubjectId] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')

  // Load available filter options from teacher classes
  useEffect(() => {
    api
      .get<{ classes: { id: string; name: string; subjects: { id: string; name: string }[] }[] }>(
        '/api/school/teacher/homework-classes',
        { academicYear }
      )
      .then((res) => {
        if (res.classes && res.classes.length > 0) {
          setFilterClasses(res.classes.map((c) => ({ id: c.id, name: c.name })))
          const subs = new Map<string, string>()
          res.classes.forEach((c) => {
            c.subjects?.forEach((s) => subs.set(s.id, s.name))
          })
          setFilterSubjects(Array.from(subs.entries()).map(([id, name]) => ({ id, name })))
        }
      })
      .catch(() => {})
  }, [academicYear])

  const fetchHomework = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (academicYear) params.academicYear = academicYear
      if (selectedClassId && selectedClassId !== 'all') params.classId = selectedClassId
      if (selectedSubjectId && selectedSubjectId !== 'all') params.subjectId = selectedSubjectId
      if (selectedStatus && selectedStatus !== 'all') params.status = selectedStatus
      if (search?.trim()) params.search = search.trim()

      const res = await api.get<{
        items: HomeworkItem[]
        pagination: { total: number }
      }>('/api/school/homework', params)

      setHomeworkList(res.items || [])
    } catch (err) {
      console.error(err)
      toast({
        title: "Couldn't Load Homework",
        description: 'Failed to load homework assignments list.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setFiltering(false)
    }
  }, [academicYear, selectedClassId, selectedSubjectId, selectedStatus, search, toast])

  useEffect(() => {
    fetchHomework()
  }, [fetchHomework])

  // Summary Metrics
  const summary = useMemo(() => {
    const total = homeworkList.length
    const now = new Date()
    const active = homeworkList.filter((h) => h.status === 'PUBLISHED' && new Date(h.dueDate) >= now).length
    const totalSubmissions = homeworkList.reduce((acc, h) => acc + h.stats.submittedCount, 0)
    const totalEvaluated = homeworkList.reduce((acc, h) => acc + h.stats.evaluatedCount, 0)

    return { total, active, totalSubmissions, totalEvaluated }
  }, [homeworkList])

  // Delete Homework Handler
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete homework "${title}"?`)) return

    try {
      await api.delete(`/api/school/homework/${id}`)
      toast({
        title: 'Homework Deleted',
        description: 'The assignment has been removed.',
      })
      setHomeworkList((prev) => prev.filter((h) => h.id !== id))
    } catch (err: any) {
      toast({
        title: 'Delete Failed',
        description: err.message || 'Could not delete homework assignment.',
        variant: 'destructive',
      })
    }
  }

  const clearFilters = () => {
    setSearch('')
    setSelectedClassId('all')
    setSelectedSubjectId('all')
    setSelectedStatus('all')
  }

  const hasActiveFilters =
    search.trim() !== '' ||
    selectedClassId !== 'all' ||
    selectedSubjectId !== 'all' ||
    selectedStatus !== 'all'

  // Due Date Badge Formatter
  const getDueBadge = (dueDateStr: string, status: string) => {
    if (status === 'DRAFT') {
      return (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30">
          Draft
        </Badge>
      )
    }

    const due = new Date(dueDateStr)
    const now = new Date()
    const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (diffHours < 0) {
      return (
        <Badge variant="outline" className="border-red-300 bg-red-50 text-[10px] font-semibold text-red-700 dark:bg-red-950/30">
          Past Due
        </Badge>
      )
    }
    if (diffHours <= 24) {
      return (
        <Badge variant="outline" className="border-orange-300 bg-orange-50 text-[10px] font-semibold text-orange-700 dark:bg-orange-950/30">
          Due Tomorrow
        </Badge>
      )
    }
    if (diffHours <= 72) {
      return (
        <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/30">
          Due in {Math.ceil(diffHours / 24)}d
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/30">
        Due {due.toLocaleDateString()}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
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
                <h1 className="text-xl font-bold tracking-tight">Homework & Assignments</h1>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">
                  {homeworkList.length} assignments
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/85">
                  {academicYear}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/80">
                Assign daily homework, track submissions, evaluate notebooks, and notify students & parents.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => router.push('/homework/new')}
            className="relative gap-2 border border-white/60 shadow-md"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <PlusCircle className="size-4" /> Assign Homework
          </Button>
        </div>
      </section>

      {/* 2. 4-Column Stat Cards Row */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="sky"
          icon={BookOpenCheck}
          label="Total Assigned"
          value={summary.total}
          note="In this academic year"
        />
        <StatCard
          tone="amber"
          icon={Clock}
          label="Active / Due Soon"
          value={summary.active}
          note="Submissions open"
        />
        <StatCard
          tone="emerald"
          icon={CheckCircle2}
          label="Submissions"
          value={summary.totalSubmissions}
          note="Turned in by students"
        />
        <StatCard
          tone="violet"
          icon={Award}
          label="Evaluated"
          value={summary.totalEvaluated}
          note="Graded & feedback sent"
        />
      </div>

      {/* 3. Signature Gradient Filter Bar */}
      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <CardContent className="flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Search Input */}
          <div className="relative w-full xl:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search homework title, subject, or class..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-sky-200 bg-white pl-9 pr-9 shadow-sm focus-visible:border-sky-400 focus-visible:ring-sky-400/20 dark:border-sky-500/25 dark:bg-input/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Select Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedClassId} onValueChange={setSelectedClassId}>
              <SelectTrigger
                leadingIcon={<GraduationCap className="size-3.5 text-white" />}
                leadingIconClassName="from-sky-500 to-cyan-600"
                className="h-9 w-[150px] border-sky-200 bg-white text-xs dark:border-sky-500/25 dark:bg-input/30"
              >
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {filterClasses.map((cls) => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSubjectId} onValueChange={setSelectedSubjectId}>
              <SelectTrigger
                leadingIcon={<BookOpen className="size-3.5 text-white" />}
                leadingIconClassName="from-violet-500 to-purple-600"
                className="h-9 w-[150px] border-violet-200 bg-white text-xs dark:border-violet-500/25 dark:bg-input/30"
              >
                <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {filterSubjects.map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger
                leadingIcon={<Filter className="size-3.5 text-white" />}
                leadingIconClassName="from-amber-500 to-orange-600"
                className="h-9 w-[130px] border-amber-200 bg-white text-xs dark:border-amber-500/25 dark:bg-input/30"
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Badge className="h-9 w-fit rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              {filtering && <Loader2 className="mr-1.5 size-3 animate-spin" />}
              {homeworkList.length} showing
            </Badge>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={clearFilters}
                aria-label="Clear filters"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. Homework Cards Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto size-7 animate-spin text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Loading homework assignments...</p>
          </div>
        </div>
      ) : homeworkList.length === 0 ? (
        <EmptySearch
          icon={BookOpenCheck}
          title={hasActiveFilters ? 'No homework found' : 'No Homework Yet'}
          description={
            hasActiveFilters
              ? 'No assignment matches the selected filters.'
              : 'Add homework assignments to start distributing tasks to students.'
          }
          actionLabel={hasActiveFilters ? 'Clear Filters' : 'Assign Homework'}
          onAction={hasActiveFilters ? clearFilters : () => router.push('/homework/new')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {homeworkList.map((hw) => {
            const submissionPercent =
              hw.stats.totalStudents > 0
                ? Math.round((hw.stats.submittedCount / hw.stats.totalStudents) * 100)
                : 0

            return (
              <Card
                key={hw.id}
                className="group gap-0 overflow-hidden border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10"
              >
                <CardContent className="p-0">
                  {/* Card Header row */}
                  <div className="flex items-start gap-3 border-b border-current/10 bg-gradient-to-r from-sky-100/80 via-white/90 to-cyan-100/70 p-3.5 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md">
                      <BookOpenCheck className="size-5 text-white" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 rounded-md border-sky-200 bg-sky-50 px-1.5 text-[11px] text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                        >
                          {hw.subject.name}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 rounded-md border-violet-200 bg-violet-50 px-1.5 text-[11px] text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
                        >
                          {hw.class.name}
                          {hw.section ? ` - ${hw.section.name}` : ' (All Sec)'}
                        </Badge>
                        {getDueBadge(hw.dueDate, hw.status)}
                      </div>

                      <h3
                        className="mt-1 line-clamp-1 text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-primary"
                        title={hw.title}
                      >
                        <Link href={`/homework/${hw.id}`}>{hw.title}</Link>
                      </h3>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Assigned by {hw.teacher.firstName} {hw.teacher.lastName}
                        {hw.teacher.employeeId ? ` (${hw.teacher.employeeId})` : ''}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => router.push(`/homework/${hw.id}`)}>
                          <Eye className="mr-2 size-3.5" />
                          View & Grade
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(hw.id, hw.title)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* 3-Column Metric Row */}
                  <div className="grid grid-cols-3 border-b border-current/10 bg-white/55 text-center dark:bg-card/40">
                    <Metric label="Enrolled" value={hw.stats.totalStudents} />
                    <Metric
                      label="Turned In"
                      value={hw.stats.submittedCount}
                      display={`${hw.stats.submittedCount} (${submissionPercent}%)`}
                    />
                    <Metric label="Evaluated" value={hw.stats.evaluatedCount} />
                  </div>

                  {/* Submission Progress Bar */}
                  <div className="space-y-1.5 p-3.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <SectionTitle icon={TrendingUp} label="Completion Rate" />
                      <span className="font-semibold text-foreground">{submissionPercent}%</span>
                    </div>
                    <Progress value={submissionPercent} className="h-1.5" />

                    {hw.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {hw.description}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom Footer */}
                  <div className="flex items-center justify-between border-t border-current/10 bg-white/60 px-3.5 py-2.5 dark:bg-card/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {hw.attachments && hw.attachments.length > 0 && (
                        <span className="flex items-center gap-1 text-[11px]">
                          <Paperclip className="size-3" />
                          {hw.attachments.length} file{hw.attachments.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {hw.maxMarks !== null && (
                        <span className="font-medium text-primary text-[11px]">
                          Max {hw.maxMarks} pts
                        </span>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 border-sky-200 bg-sky-50 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                      onClick={() => router.push(`/homework/${hw.id}`)}
                    >
                      <Eye className="size-3" />
                      View & Grade
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof BookOpenCheck
  label: string
  value: number
  note: string
  tone: 'sky' | 'emerald' | 'violet' | 'amber'
}) {
  const styles = {
    sky: {
      card: 'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
      icon: 'from-sky-500 to-cyan-600',
      value: 'text-sky-700 dark:text-sky-300',
    },
    emerald: {
      card: 'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
      icon: 'from-emerald-500 to-teal-600',
      value: 'text-emerald-700 dark:text-emerald-300',
    },
    violet: {
      card: 'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
      icon: 'from-violet-500 to-purple-600',
      value: 'text-violet-700 dark:text-violet-300',
    },
    amber: {
      card: 'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
      icon: 'from-amber-500 to-orange-600',
      value: 'text-amber-700 dark:text-amber-300',
    },
  }[tone]

  return (
    <Card
      className={cn(
        'group gap-0 border bg-gradient-to-r py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        styles.card
      )}
    >
      <CardContent className="flex items-center gap-2.5 p-2.5">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm',
            styles.icon
          )}
        >
          <Icon className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn('text-lg font-bold leading-tight', styles.value)}>{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({
  label,
  value,
  display,
}: {
  label: string
  value: number
  display?: string
}) {
  return (
    <div className="border-r px-3 py-2 last:border-r-0">
      <p className="text-sm font-semibold leading-tight">{display || value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, label }: { icon: typeof Layers; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white">
        <Icon className="size-3 text-white" />
      </span>
      {label}
    </div>
  )
}

function EmptySearch({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof Search
  title: string
  description: string
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <Card className="relative gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
      <div
        aria-hidden
        className="absolute -right-8 -top-10 size-28 rounded-full border-[14px] border-sky-200/25 dark:border-sky-500/10"
      />
      <CardContent className="relative flex flex-col items-center justify-center py-10 text-center">
        <span className="mb-3 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md">
          <Icon className="size-6 text-white" />
        </span>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {actionLabel ? (
          <Button size="sm" onClick={onAction} className="mt-3 h-8 gap-1.5 px-3 text-xs">
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
