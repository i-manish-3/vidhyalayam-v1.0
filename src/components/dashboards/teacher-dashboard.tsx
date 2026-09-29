'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { LoadingState } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import {
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ExternalLink,
  GraduationCap,
  Megaphone,
  Moon,
  School,
  Sparkles,
  Sun,
  Sunrise,
  UsersRound,
  Award,
  ArrowRight,
  FileSpreadsheet,
  Layers,
} from 'lucide-react'

interface TeacherDashboardData {
  role: string
  teacherId: string
  teacherName: string
  stats: {
    myClasses: number
    todayPeriods: number
    totalStudents: number
  }
  schedule: Array<{
    period: number
    subject: string
    class: string
    section: string
    className: string
    startTime: string
    endTime: string
  }>
  announcements: Array<{
    id: string
    title: string
    priority: string
    createdAt: string
  }>
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getGreeting(name: string) {
  const hour = new Date().getHours()
  if (hour < 12) return { text: `Good morning, ${name}!`, icon: Sunrise, emoji: '🌅' }
  if (hour < 17) return { text: `Good afternoon, ${name}!`, icon: Sun, emoji: '☀️' }
  return { text: `Good evening, ${name}!`, icon: Moon, emoji: '🌙' }
}

export function TeacherDashboard() {
  const router = useRouter()
  const { user } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TeacherDashboardData | null>(null)

  // Clock tick every 30s to update ongoing period radar
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api.get<TeacherDashboardData>('/api/school/dashboard', undefined, {
        skipLogoutOn401: true,
      })
      setData(result)
    } catch {
      // Fallback state on error
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const today = useMemo(() => new Date(), [])
  const dayName = today.toLocaleDateString('en-IN', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const stats = data?.stats
  const schedule = useMemo(
    () => [...(data?.schedule || [])].sort((a, b) => a.period - b.period),
    [data?.schedule]
  )
  const announcements = data?.announcements || []
  const teacherName = data?.teacherName || user?.name || 'Teacher'
  const firstName = teacherName.trim().split(/\s+/)[0] || 'Teacher'
  const greeting = getGreeting(firstName)

  // Helper to parse "09:30" or "09:30 AM" to minutes from midnight
  const toMinutes = useCallback((t: string) => {
    if (!t) return NaN
    const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!match) return NaN
    let h = parseInt(match[1], 10)
    const m = parseInt(match[2], 10)
    const ampm = match[3]?.toUpperCase()
    if (ampm === 'PM' && h < 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return h * 60 + m
  }, [])

  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // Track live, upcoming, and completed periods
  const currentOrNextClass = useMemo(() => {
    if (schedule.length === 0) return { item: null, status: 'none' as const }

    // 1. Check if any class is currently ongoing
    const ongoing = schedule.find((p) => {
      const start = toMinutes(p.startTime)
      const end = toMinutes(p.endTime)
      return !Number.isNaN(start) && !Number.isNaN(end) && nowMinutes >= start && nowMinutes < end
    })
    if (ongoing) return { item: ongoing, status: 'live' as const }

    // 2. Look for the next upcoming class
    const upcoming = schedule.find((p) => {
      const start = toMinutes(p.startTime)
      return !Number.isNaN(start) && start > nowMinutes
    })
    if (upcoming) return { item: upcoming, status: 'upcoming' as const }

    // 3. If all periods are past
    const allCompleted = schedule.every((p) => {
      const end = toMinutes(p.endTime)
      return !Number.isNaN(end) && nowMinutes >= end
    })
    if (allCompleted) return { item: null, status: 'completed' as const }

    // 4. Default fallback to first period
    return { item: schedule[0], status: 'scheduled' as const }
  }, [schedule, nowMinutes, toMinutes])

  const completedPeriods = useMemo(
    () =>
      schedule.filter((p) => {
        const end = toMinutes(p.endTime)
        return !Number.isNaN(end) && end <= nowMinutes
      }).length,
    [schedule, nowMinutes, toMinutes]
  )

  const totalPeriods = schedule.length
  const periodProgress = totalPeriods > 0 ? Math.round((completedPeriods / totalPeriods) * 100) : 0

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* 1. HERO SHOWCASE CARD (Brand Navbar Gradient + Live Teaching Radar) */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.06] shadow-sm">
        {/* Ambient glow orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(ellipse_at_center,var(--primary)_0%,transparent_70%)] opacity-20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/3 size-48 rounded-full bg-cyan-400/15 blur-3xl"
        />

        {/* Top Brand Gradient Accent Strip */}
        <div className="h-1.5 w-full bg-[linear-gradient(90deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)]" />

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Teacher Profile & Status */}
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="relative flex size-13 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white font-extrabold text-lg shadow-md shadow-primary/25 ring-2 ring-primary/40">
                {user?.avatar ? (
                  <img src={user.avatar} alt={teacherName} className="size-full object-cover" />
                ) : (
                  getInitials(teacherName)
                )}
                <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-emerald-500 animate-pulse" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                    {greeting.text} {greeting.emoji}
                  </h1>
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/10 text-primary text-[10px] font-bold"
                  >
                    Faculty Desk
                  </Badge>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    AY 2026-27 Active
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{teacherName}</span>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="flex items-center gap-1 text-foreground/80 font-medium">
                    <Sparkles className="size-3 text-primary" />
                    {dayName}, {dateStr}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-xs">
                    {totalPeriods} {totalPeriods === 1 ? 'Period' : 'Periods'} Today
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Live Class Radar Tile */}
            <div className="self-stretch rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.04] via-card to-cyan-500/[0.05] p-3 shadow-2xs lg:w-96">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-foreground">
                  {currentOrNextClass.status === 'live' ? (
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                      Class in Progress
                    </span>
                  ) : currentOrNextClass.status === 'upcoming' ? (
                    <span className="flex items-center gap-1.5 text-primary">
                      <Clock className="size-3.5" />
                      Next Class Up
                    </span>
                  ) : currentOrNextClass.status === 'completed' ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                      Classes Concluded
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Class Schedule</span>
                  )}
                </div>
                {currentOrNextClass.item && (
                  <Badge className="bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white text-[10px] font-bold shadow-xs">
                    Period {currentOrNextClass.item.period}
                  </Badge>
                )}
              </div>

              {currentOrNextClass.item ? (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">
                      {currentOrNextClass.item.subject}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="rounded bg-primary/10 px-1.5 py-0.2 font-semibold text-primary text-[11px]">
                        {currentOrNextClass.item.className}
                      </span>
                      {currentOrNextClass.item.startTime && currentOrNextClass.item.endTime && (
                        <span className="text-[11px] font-mono">
                          {currentOrNextClass.item.startTime} - {currentOrNextClass.item.endTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 shrink-0 px-2.5 text-xs font-semibold gap-1 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                    onClick={() => router.push('/attendance/mark')}
                  >
                    <ClipboardCheck className="size-3" />
                    Attendance
                  </Button>
                </div>
              ) : currentOrNextClass.status === 'completed' ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    All teaching periods for {dayName} are complete.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs font-medium"
                    onClick={() => router.push('/academics/timetable')}
                  >
                    Timetable
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">No classes scheduled for today.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs font-medium"
                    onClick={() => router.push('/academics/timetable')}
                  >
                    Timetable
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. COLORFUL QUICK ACTIONS STRIP (4 Micro-Interactive Launcher Tiles) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {/* Launcher 1: Mark Attendance */}
        <button
          type="button"
          onClick={() => router.push('/attendance/mark')}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/[0.04] p-3 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md hover:shadow-emerald-500/10 dark:border-emerald-500/20"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20 transition-transform duration-200 group-hover:scale-105">
            <ClipboardCheck className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">Mark Attendance</p>
            <p className="truncate text-[10px] text-muted-foreground">Daily Student Roll-Call</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
        </button>

        {/* Launcher 2: Weekly Timetable */}
        <button
          type="button"
          onClick={() => router.push('/academics/timetable')}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-br from-card via-card to-sky-500/[0.04] p-3 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-md hover:shadow-sky-500/10 dark:border-sky-500/20"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20 transition-transform duration-200 group-hover:scale-105">
            <CalendarDays className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">Weekly Timetable</p>
            <p className="truncate text-[10px] text-muted-foreground">Schedule & Routines</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sky-600 dark:group-hover:text-sky-400" />
        </button>

        {/* Launcher 3: Exam Marks Entry */}
        <button
          type="button"
          onClick={() => router.push('/exams')}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-card via-card to-violet-500/[0.04] p-3 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/40 hover:shadow-md hover:shadow-violet-500/10 dark:border-violet-500/20"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/20 transition-transform duration-200 group-hover:scale-105">
            <Award className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">Exam Results</p>
            <p className="truncate text-[10px] text-muted-foreground">Grade Assessment</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-violet-600 dark:group-hover:text-violet-400" />
        </button>

        {/* Launcher 4: Student Directory */}
        <button
          type="button"
          onClick={() => router.push('/students')}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-card via-card to-amber-500/[0.04] p-3 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-500/40 hover:shadow-md hover:shadow-amber-500/10 dark:border-amber-500/20"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20 transition-transform duration-200 group-hover:scale-105">
            <GraduationCap className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-foreground">Student Roster</p>
            <p className="truncate text-[10px] text-muted-foreground">Enrolled Students</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
        </button>
      </div>

      {/* 3. THREE HIGH-IMPACT METRIC CARDS (Fintech-Grade Palette) */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Metric 1: My Classes */}
        <div className="group relative overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-card via-card to-emerald-500/[0.05] p-4 shadow-sm transition hover:border-emerald-500/40 hover:shadow-md dark:border-emerald-500/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                My Classes
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
                {stats?.myClasses || 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Distinct section groups</p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
              <School className="size-5" />
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px]">
            <span className="font-medium text-emerald-700 dark:text-emerald-300">Teaching Incharge</span>
            <button
              type="button"
              onClick={() => router.push('/academics/timetable')}
              className="flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              Timetable <ArrowRight className="size-3" />
            </button>
          </div>
        </div>

        {/* Metric 2: Today's Periods Progress */}
        <div className="group relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/[0.05] p-4 shadow-sm transition hover:border-primary/45 hover:shadow-md dark:border-primary/25">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Today&apos;s Periods
              </p>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold tracking-tight text-foreground">
                  {completedPeriods}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">/ {totalPeriods}</span>
                <Badge
                  variant="outline"
                  className="ml-auto text-[10px] font-bold border-primary/30 text-primary"
                >
                  {periodProgress}% Done
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{dayName} teaching load</p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-md shadow-primary/20">
              <Calendar className="size-5" />
            </div>
          </div>
          <div className="mt-3.5 border-t border-border/50 pt-2.5">
            <Progress value={periodProgress} className="h-1.5 bg-primary/15" />
          </div>
        </div>

        {/* Metric 3: Total Students */}
        <div className="group relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-card via-card to-indigo-500/[0.05] p-4 shadow-sm transition hover:border-indigo-500/40 hover:shadow-md dark:border-indigo-500/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Total Students
              </p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-foreground">
                {stats?.totalStudents || 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Across teaching sections</p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20">
              <UsersRound className="size-5" />
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px]">
            <span className="font-medium text-indigo-700 dark:text-indigo-300">Enrolled Learners</span>
            <button
              type="button"
              onClick={() => router.push('/students')}
              className="flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              Student List <ArrowRight className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. MAIN DUAL-COLUMN SECTION (Schedule & Notices/Quick Tools) */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_0.9fr]">
        {/* Left Column: Today's Interactive Schedule */}
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 bg-muted/20 py-3.5 px-4 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-xs">
                    <Calendar className="size-4" />
                  </div>
                  Today&apos;s Class Schedule
                </CardTitle>
                <CardDescription className="text-xs">
                  {totalPeriods} period{totalPeriods === 1 ? '' : 's'} assigned for {dayName}
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-semibold gap-1 bg-background">
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  {completedPeriods} of {totalPeriods} Completed
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-medium"
                  onClick={() => router.push('/academics/timetable')}
                >
                  Full Week
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5">
            {schedule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-8 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Calendar className="size-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-foreground">No Classes Scheduled Today</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  You have no teaching periods assigned for {dayName}. Check your full weekly routine or review student attendance.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-medium"
                    onClick={() => router.push('/academics/timetable')}
                  >
                    View Timetable
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs font-semibold"
                    onClick={() => router.push('/attendance/mark')}
                  >
                    Mark Attendance
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {schedule.map((item, index) => {
                  const startM = toMinutes(item.startTime)
                  const endM = toMinutes(item.endTime)
                  const isLive =
                    !Number.isNaN(startM) &&
                    !Number.isNaN(endM) &&
                    nowMinutes >= startM &&
                    nowMinutes < endM
                  const isDone = !Number.isNaN(endM) && endM <= nowMinutes

                  return (
                    <div
                      key={`${item.period}-${item.subject}-${index}`}
                      className={`group relative flex flex-col gap-2 rounded-xl border p-3 transition-all sm:flex-row sm:items-center sm:justify-between ${
                        isLive
                          ? 'border-primary/60 bg-gradient-to-r from-primary/[0.08] via-card to-cyan-500/[0.05] shadow-sm shadow-primary/10 ring-1 ring-primary/40'
                          : isDone
                          ? 'border-border/60 bg-muted/20 opacity-80'
                          : 'border-border/70 bg-card hover:border-primary/40 hover:bg-primary/[0.02]'
                      }`}
                    >
                      {/* Left: Period Badge & Class details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex size-11 shrink-0 flex-col items-center justify-center rounded-xl text-xs font-black shadow-xs ${
                            isLive
                              ? 'bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white'
                              : isDone
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          <span className="text-[10px] font-semibold opacity-75">PERIOD</span>
                          <span className="text-sm font-black leading-none">{item.period}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-bold text-foreground">
                              {item.subject}
                            </p>
                            {isLive && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                                In Session
                              </span>
                            )}
                            {isDone && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                <CheckCircle2 className="size-3 text-emerald-500" /> Done
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge
                              variant="secondary"
                              className="text-[11px] font-semibold bg-muted/70 text-foreground"
                            >
                              {item.className}
                            </Badge>
                            {item.startTime && item.endTime ? (
                              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                                <Clock className="size-3" />
                                {item.startTime} - {item.endTime}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">Period {item.period}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Attendance action button */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          size="sm"
                          variant={isLive ? 'default' : 'outline'}
                          className={`h-7.5 px-3 text-xs font-semibold gap-1.5 shadow-xs ${
                            isLive
                              ? 'bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white hover:opacity-95'
                              : 'hover:bg-primary/10 hover:text-primary hover:border-primary/40'
                          }`}
                          onClick={() => router.push('/attendance/mark')}
                        >
                          <ClipboardCheck className="size-3.5" />
                          Mark Attendance
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Staff Noticeboard & Academic Shortcuts */}
        <div className="space-y-4">
          {/* School Announcements Card */}
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-muted/20 py-3.5 px-4 sm:px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-xs">
                    <Megaphone className="size-4" />
                  </div>
                  Staff Noticeboard
                </CardTitle>
                {announcements.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    {announcements.length} {announcements.length === 1 ? 'Notice' : 'Notices'}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
              {announcements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 p-6 text-center">
                  <Megaphone className="mx-auto size-7 text-muted-foreground/40" />
                  <p className="mt-2 text-xs font-bold text-foreground">No Active Notices</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Administrative announcements and faculty circulars will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {announcements.map((a) => (
                    <div
                      key={a.id}
                      className="group rounded-xl border border-border/70 bg-card p-3 transition hover:border-primary/40 hover:bg-primary/[0.02]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0 ${
                            a.priority === 'urgent'
                              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                              : a.priority === 'high'
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                          }`}
                        >
                          {a.priority}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatShortDate(a.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {a.title}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Academic Shortcuts & Tools Card */}
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 bg-muted/20 py-3.5 px-4 sm:px-5">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <div className="flex size-7 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_50%,#0284c7_100%)] text-white shadow-xs">
                  <Layers className="size-4" />
                </div>
                Academic Quick Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 space-y-2">
              <button
                type="button"
                onClick={() => router.push('/attendance/view')}
                className="w-full flex items-center justify-between rounded-xl border border-border/70 bg-card p-2.5 text-left text-xs font-semibold transition hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <ClipboardList className="size-4" />
                  </div>
                  <div>
                    <p className="text-foreground font-bold">View Attendance Logs</p>
                    <p className="text-[10px] text-muted-foreground">Past dates & monthly summaries</p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={() => router.push('/academics/timetable')}
                className="w-full flex items-center justify-between rounded-xl border border-border/70 bg-card p-2.5 text-left text-xs font-semibold transition hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Calendar className="size-4" />
                  </div>
                  <div>
                    <p className="text-foreground font-bold">Class Timetable Routine</p>
                    <p className="text-[10px] text-muted-foreground">Full week period schedule</p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>

              <button
                type="button"
                onClick={() => router.push('/exams')}
                className="w-full flex items-center justify-between rounded-xl border border-border/70 bg-card p-2.5 text-left text-xs font-semibold transition hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                    <Award className="size-4" />
                  </div>
                  <div>
                    <p className="text-foreground font-bold">Examination Gradebook</p>
                    <p className="text-[10px] text-muted-foreground">Input student scores & marks</p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
