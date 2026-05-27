'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingState, EmptyState } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  GraduationCap,
  IndianRupee,
  Megaphone,
  NotebookPen,
  School,
  Sparkles,
  UsersRound,
} from 'lucide-react'

interface TeacherDashboardData {
  role: string
  teacherId: string
  teacherName: string
  stats: {
    myClasses: number
    todayPeriods: number
    totalStudents: number
    netSalary: number
  }
  schedule: Array<{
    period: number
    subject: string
    class: string
    section: string
    className: string
    room: string
    startTime: string
    endTime: string
  }>
  salary: {
    basic: number
    hra: number
    da: number
    gross: number
    deductions: number
    net: number
  } | null
  announcements: Array<{
    id: string
    title: string
    priority: string
    createdAt: string
  }>
}

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN')}`
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function StatTile({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: typeof BookOpen
  tone: 'emerald' | 'cyan' | 'amber' | 'rose'
}) {
  const toneMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl border ${toneMap[tone]}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function QuickAction({
  label,
  description,
  icon: Icon,
  onClick,
}: {
  label: string
  description: string
  icon: typeof BookOpen
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

export function TeacherDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TeacherDashboardData | null>(null)
  const router = useRouter()
  const { user } = useAppStore()

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api.get<TeacherDashboardData>('/api/school/dashboard', undefined, { skipLogoutOn401: true })
      setData(result)
    } catch {
      // Dashboard fetch failed - will show fallback data.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const today = useMemo(() => new Date(), [])
  const dayName = today.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

  const stats = data?.stats
  const schedule = useMemo(
    () => [...(data?.schedule || [])].sort((a, b) => a.period - b.period),
    [data?.schedule]
  )
  const salary = data?.salary
  const announcements = data?.announcements || []
  const teacherName = data?.teacherName || user?.name || 'Teacher'
  const firstName = teacherName.trim().split(/\s+/)[0] || 'Teacher'
  const nextClass = schedule[0]
  const completedPeriods = 0
  const totalPeriods = schedule.length
  const salaryDeductionPercent = salary?.gross ? Math.min(100, Math.round((salary.deductions / salary.gross) * 100)) : 0

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-7">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Sparkles className="size-3.5" />
              {dayName}, {dateStr}
            </div>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Good to see you, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Your teaching day at a glance: classes, students, timetable, and important school updates in one place.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => router.push('/attendance/mark')}>
                <ClipboardList className="mr-2 size-4" />
                Mark Attendance
              </Button>
              <Button variant="outline" onClick={() => router.push('/academics/timetable')}>
                <Calendar className="mr-2 size-4" />
                View Timetable
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-muted/25 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next Class</p>
            {nextClass ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold">{nextClass.subject}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{nextClass.className}</p>
                  </div>
                  <Badge>P{nextClass.period}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl border bg-card p-3">
                    <p className="text-muted-foreground">Time</p>
                    <p className="mt-1 font-semibold">
                      {nextClass.startTime && nextClass.endTime ? `${nextClass.startTime} - ${nextClass.endTime}` : `Period ${nextClass.period}`}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <p className="text-muted-foreground">Room</p>
                    <p className="mt-1 font-semibold">{nextClass.room || 'Not set'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border bg-card p-4">
                <p className="font-semibold">No classes scheduled</p>
                <p className="mt-1 text-sm text-muted-foreground">Your timetable is clear for today.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile title="My Classes" value={stats?.myClasses || 0} icon={School} description="Assigned class groups" tone="emerald" />
        <StatTile title="Today's Periods" value={stats?.todayPeriods || 0} icon={Calendar} description={dayName} tone="cyan" />
        <StatTile title="Students" value={stats?.totalStudents || 0} icon={UsersRound} description="Across your classes" tone="amber" />
        <StatTile title="Net Salary" value={salary ? formatCurrency(salary.net) : '--'} icon={IndianRupee} description="Monthly payable" tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Today&apos;s Schedule</CardTitle>
              <CardDescription>{totalPeriods} period{totalPeriods === 1 ? '' : 's'} assigned for {dayName}</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit gap-1.5">
              <CheckCircle2 className="size-3.5" />
              {completedPeriods}/{totalPeriods} done
            </Badge>
          </CardHeader>
          <CardContent>
            {schedule.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No Classes Today"
                description="You do not have any classes scheduled for today."
              />
            ) : (
              <div className="space-y-3">
                {schedule.map((item, index) => (
                  <div key={`${item.period}-${item.subject}-${index}`} className="grid gap-3 rounded-xl border bg-card p-3 transition hover:border-primary/30 hover:bg-primary/5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
                        P{item.period}
                      </div>
                      <div className="sm:hidden">
                        <p className="font-semibold">{item.subject}</p>
                        <p className="text-xs text-muted-foreground">{item.className}</p>
                      </div>
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <p className="truncate text-sm font-semibold">{item.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.startTime && item.endTime ? `${item.startTime} - ${item.endTime}` : `Period ${item.period}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant="secondary">{item.className}</Badge>
                      {item.room && <Badge variant="outline">Room {item.room}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Common teacher workflows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <QuickAction label="Mark Attendance" description="Record present, absent, or leave" icon={ClipboardList} onClick={() => router.push('/attendance/mark')} />
              <QuickAction label="Exam Marks" description="Open exam workspace" icon={NotebookPen} onClick={() => router.push('/exams')} />
              <QuickAction label="Timetable" description="View your daily schedule" icon={Clock} onClick={() => router.push('/academics/timetable')} />
              <QuickAction label="Attendance Reports" description="Review student attendance" icon={BookOpen} onClick={() => router.push('/attendance/reports')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Salary Snapshot</CardTitle>
              <CardDescription>Current monthly structure</CardDescription>
            </CardHeader>
            <CardContent>
              {salary ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-primary/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net Pay</p>
                    <p className="mt-1 text-2xl font-bold">{formatCurrency(salary.net)}</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross</span>
                      <span className="font-medium">{formatCurrency(salary.gross)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deductions</span>
                      <span className="font-medium text-destructive">-{formatCurrency(salary.deductions)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-destructive" style={{ width: `${salaryDeductionPercent}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No salary structure assigned yet. Contact your school administrator.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="size-5 text-primary" />
              Announcements
            </CardTitle>
            <CardDescription>Latest school updates for staff</CardDescription>
          </div>
          {announcements.length > 0 && <Badge variant="secondary">{announcements.length} update{announcements.length === 1 ? '' : 's'}</Badge>}
        </CardHeader>
        <CardContent>
          {announcements.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Megaphone className="mx-auto size-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium">No announcements right now</p>
              <p className="mt-1 text-xs text-muted-foreground">New updates from school administration will appear here.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Badge variant={a.priority === 'urgent' ? 'destructive' : a.priority === 'high' ? 'default' : 'secondary'} className="text-[10px]">
                      {a.priority}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatShortDate(a.createdAt)}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold">{a.title}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
