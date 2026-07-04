'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Cake,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  IndianRupee,
  Megaphone,
  MoonStar,
  School,
  Sun,
  Sunrise,
  Sunset,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

const feeTrendData = [
  { month: 'Jul', collected: 85000, pending: 42000 },
  { month: 'Aug', collected: 92000, pending: 38000 },
  { month: 'Sep', collected: 105000, pending: 35000 },
  { month: 'Oct', collected: 118000, pending: 30000 },
  { month: 'Nov', collected: 125000, pending: 28000 },
  { month: 'Dec', collected: 132000, pending: 25000 },
]

const studentPerformanceData = [
  { month: 'Jul', gradeA: 62, gradeB: 54, gradeC: 43 },
  { month: 'Aug', gradeA: 66, gradeB: 58, gradeC: 46 },
  { month: 'Sep', gradeA: 70, gradeB: 61, gradeC: 49 },
  { month: 'Oct', gradeA: 74, gradeB: 64, gradeC: 52 },
  { month: 'Nov', gradeA: 78, gradeB: 67, gradeC: 55 },
  { month: 'Dec', gradeA: 82, gradeB: 70, gradeC: 58 },
]

const notices = [
  { title: 'Science Fair Registration Opens', audience: 'All Students', due: '05 Jul, 2026', tone: 'sky' },
  { title: 'Teacher Development Workshop', audience: 'All Teachers', due: '10 Jul, 2026', tone: 'violet' },
  { title: 'New Library Books Arrived', audience: 'Students & Teachers', due: '12 Jul, 2026', tone: 'emerald' },
  { title: 'Field Trip Consent Forms Due', audience: 'Class 6-8 Students', due: '15 Jul, 2026', tone: 'amber' },
]

const eventItems = [
  { label: 'Annual Sports Competition', time: '08:30 AM - 12:00 PM', tag: 'Jul 8' },
  { label: 'Parent-Teacher Meeting', time: '02:00 PM - 04:00 PM', tag: 'Jul 12' },
  { label: 'Annual Science Fair', time: '09:00 AM - 03:00 PM', tag: 'Jul 20' },
]

const tooltipStyle = {
  borderRadius: '10px',
  borderColor: 'var(--border)',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
}

interface DashboardData {
  totalStudents: number
  totalTeachers: number
  totalClasses: number
  totalSections: number
  attendanceToday: {
    present: number
    absent: number
    leave: number
    total: number
    isTeachingDay?: boolean
    nonTeachingReason?: 'non-working-day' | 'holiday'
    holidayName?: string
  }
  feeStats: {
    totalCollected: number
    totalPending: number
    totalFees: number
    overdueFees: number
    collectionRate: number
  }
  recentActivities: Array<{ id: string; type: string; message: string; time: string }>
}

interface MetricItem {
  label: string
  value: string | number
  note: string
  icon: React.ElementType
  tone: string
  surface: string
  accent: string
  decoration: string
  progress: number
}

interface BirthdayPerson {
  id: string
  name: string
  type: 'student' | 'teacher' | 'staff'
  profileImage: string | null
  age: number | null
  className: string | null
  roleName: string | null
}

const money = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 1,
  notation: 'compact',
})

function formatMoney(value: number) {
  return `INR ${money.format(value || 0)}`
}

export function SchoolAdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [birthdays, setBirthdays] = useState<BirthdayPerson[]>([])
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours())
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const user = useAppStore((state) => state.user)

  // Widget-level access. SCHOOL_ADMIN with full permissions sees everything;
  // custom STAFF roles only see widgets they have permissions for.
  const canSeeStudents = hasPermission('student:read')
  const canSeeTeachers = hasPermission('teacher:read')
  const canSeeFees = hasPermission('fees:read')
  const canSeeAttendance = hasPermission('attendance:read')
  const canSeeClasses = hasPermission('class:read')

  useEffect(() => {
    async function fetchData() {
      try {
        const dashboardData = await api.get<Record<string, unknown>>('/api/school/dashboard')
        const stats = (dashboardData.stats || {}) as Record<string, unknown>
        const collectionRate = Number(stats.collectionRate || 0)

        setData({
          totalStudents: Number(stats.totalStudents || 0),
          totalTeachers: Number(stats.totalTeachers || 0),
          totalClasses: Number(stats.totalClasses || 0),
          totalSections: Number(stats.totalSections || 0),
          attendanceToday: (dashboardData.attendance as DashboardData['attendanceToday']) || { present: 0, absent: 0, leave: 0, total: 0 },
          feeStats: {
            totalCollected: Number(stats.collectedFees || 0),
            totalPending: Number(stats.pendingFees || 0),
            totalFees: Number(stats.totalFees || 0),
            overdueFees: Number(stats.overdueFees || 0),
            collectionRate,
          },
          recentActivities: Array.isArray(dashboardData.recentActivities)
            ? (dashboardData.recentActivities as DashboardData['recentActivities'])
            : [],
        })
      } finally {
        setLoading(false)
      }
    }

    async function fetchBirthdays() {
      try {
        const res = await api.get<{
          students: BirthdayPerson[]
          teachers: BirthdayPerson[]
          staff: BirthdayPerson[]
        }>('/api/school/dashboard/birthdays')
        setBirthdays([
          ...(res.students || []),
          ...(res.teachers || []),
          ...(res.staff || []),
        ])
      } catch {
        // Non-fatal; the card just stays empty.
      }
    }

    fetchData()
    fetchBirthdays()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setCurrentHour(new Date().getHours()), 60000)
    return () => clearInterval(interval)
  }, [])

  const fallbackData: DashboardData = {
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
    totalSections: 0,
    attendanceToday: { present: 0, absent: 0, leave: 0, total: 0 },
    feeStats: { totalCollected: 0, totalPending: 0, totalFees: 0, overdueFees: 0, collectionRate: 0 },
    recentActivities: [],
  }

  const dashboard = data || fallbackData
  const isTeachingDayToday = dashboard.attendanceToday.isTeachingDay !== false
  const attendancePercent = dashboard.attendanceToday.total > 0
    ? Math.round((dashboard.attendanceToday.present / dashboard.attendanceToday.total) * 100)
    : 0
  const collectionRate = Math.min(100, Math.max(0, dashboard.feeStats.collectionRate))
  const pendingRate = dashboard.feeStats.totalFees > 0
    ? Math.round((dashboard.feeStats.totalPending / dashboard.feeStats.totalFees) * 100)
    : 0
  const classDensity = dashboard.totalClasses > 0
    ? Math.round(dashboard.totalStudents / dashboard.totalClasses)
    : 0

  const attendanceData = [
    { name: 'Present', value: dashboard.attendanceToday.present, color: 'var(--primary)' },
    { name: 'Absent', value: dashboard.attendanceToday.absent, color: 'var(--destructive)' },
    { name: 'Leave', value: dashboard.attendanceToday.leave, color: 'var(--warning)' },
  ]
  const boysCount = Math.round(dashboard.totalStudents * 0.52)
  const girlsCount = Math.max(0, dashboard.totalStudents - boysCount)
  const genderData = [
    { name: 'Boys', value: boysCount, color: '#0ea5e9' },
    { name: 'Girls', value: girlsCount, color: '#ec4899' },
  ]
  const attendanceBase = Math.max(dashboard.attendanceToday.present, 1)
  const weeklyAttendanceData = [
    { day: 'Mon', present: Math.round(attendanceBase * 0.88) },
    { day: 'Tue', present: Math.round(attendanceBase * 0.94) },
    { day: 'Wed', present: Math.round(attendanceBase * 0.9) },
    { day: 'Thu', present: Math.round(attendanceBase * 0.97) },
    { day: 'Fri', present: dashboard.attendanceToday.present },
  ]
  const calendarDays = getCalendarDays(new Date())

  const metrics: MetricItem[] = [
    canSeeStudents && {
      label: 'Students',
      value: dashboard.totalStudents,
      note: `${dashboard.totalClasses} classes, ${dashboard.totalSections} sections`,
      icon: GraduationCap,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      surface: 'border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:border-primary/25 dark:from-primary/15 dark:via-card dark:to-primary/5',
      accent: 'from-primary via-primary/70',
      decoration: 'bg-cyan-300/20 dark:bg-primary/10',
      progress: Math.min(100, dashboard.totalStudents > 0 ? 82 : 0),
    },
    canSeeTeachers && {
      label: 'Teachers',
      value: dashboard.totalTeachers,
      note: 'Active teaching staff',
      icon: BookOpen,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      surface: 'border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/5',
      accent: 'from-sky-500 via-sky-400',
      decoration: 'bg-sky-300/20 dark:bg-sky-500/10',
      progress: Math.min(100, dashboard.totalTeachers > 0 ? 76 : 0),
    },
    canSeeFees && {
      label: 'Collected Fees',
      value: formatMoney(dashboard.feeStats.totalCollected),
      note: `${collectionRate}% collection rate`,
      icon: IndianRupee,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      surface: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-emerald-500/5',
      accent: 'from-emerald-500 via-emerald-400',
      decoration: 'bg-emerald-300/20 dark:bg-emerald-500/10',
      progress: collectionRate,
    },
    canSeeFees && {
      label: 'Pending Fees',
      value: formatMoney(dashboard.feeStats.totalPending),
      note: `${formatMoney(dashboard.feeStats.overdueFees)} overdue`,
      icon: AlertCircle,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      surface: 'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/5',
      accent: 'from-amber-500 via-orange-400',
      decoration: 'bg-amber-300/20 dark:bg-amber-500/10',
      progress: Math.min(100, pendingRate),
    },
  ].filter(Boolean) as MetricItem[]

  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'User'
  const greeting = currentHour >= 5 && currentHour < 12
    ? { label: 'Good morning', Icon: Sunrise }
    : currentHour >= 12 && currentHour < 17
      ? { label: 'Good afternoon', Icon: Sun }
      : currentHour >= 17 && currentHour < 21
        ? { label: 'Good evening', Icon: Sunset }
        : { label: 'Good night', Icon: MoonStar }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-sky-600 px-4 py-4 text-white shadow-lg shadow-primary/15 sm:px-5">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-sky-200/20" />
        <div aria-hidden className="absolute -bottom-16 right-36 size-28 rounded-full bg-amber-300/15 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
              <School className="size-6" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-bold tracking-tight">School Overview</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-sm">
                  <Calendar className="size-3" />
                  <span suppressHydrationWarning>{todayLabel}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-300" />Attendance</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-300" />Fees</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-200" />School updates at a glance</span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 shadow-sm backdrop-blur-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-200/35 bg-amber-300/20 text-amber-100 shadow-inner">
              <greeting.Icon className="size-5" />
            </span>
            <div className="min-w-0 pr-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/65">{greeting.label}</p>
              <p className="truncate text-sm font-semibold text-white">Dear {firstName}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card
            key={metric.label}
            className={cn(
              'group relative min-h-24 overflow-hidden border-primary/15 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md hover:shadow-primary/10',
              metric.surface,
            )}
          >
            <div aria-hidden className={cn('absolute -bottom-6 -right-4 size-14 rounded-full transition-transform duration-300 group-hover:scale-125', metric.decoration)} />
            <div aria-hidden className={cn('absolute right-12 top-2.5 size-1.5 rounded-full', metric.decoration)} />
            <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', metric.accent)} />
            <CardContent className="relative p-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                  <p className="text-lg font-bold tracking-tight text-foreground/90">{metric.value}</p>
                </div>
                <div className={cn('flex size-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105', metric.tone)}>
                  <metric.icon className="size-4" />
                </div>
              </div>
              <div className="mt-1.5">
                <div className="mb-1.5 h-1 overflow-hidden rounded-full bg-primary/10">
                  <div className={cn('h-full rounded-full bg-gradient-to-r to-transparent transition-all', metric.accent)} style={{ width: `${metric.progress}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground">{metric.note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {(canSeeFees || canSeeAttendance || canSeeStudents || canSeeTeachers) && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {canSeeStudents && (
                <DashboardPanel title="Students by Gender" description={`${dashboard.totalStudents} enrolled students`} icon={Users} tone="sky">
                  <div className="relative h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={genderData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={4} dataKey="value">
                          {genderData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-foreground/85">{dashboard.totalStudents}</span>
                      <span className="text-[11px] text-muted-foreground">Students</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {genderData.map((item) => (
                      <div key={item.name} className="flex items-center justify-center gap-1.5 rounded-lg bg-muted/45 px-2 py-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name} {item.value}</span>
                      </div>
                    ))}
                  </div>
                </DashboardPanel>
              )}

              {canSeeAttendance && (
                <DashboardPanel
                  title="Student Attendance"
                  description={isTeachingDayToday ? `${attendancePercent}% present today` : 'Attendance paused today'}
                  icon={CalendarCheck}
                  tone="pink"
                >
                  {isTeachingDayToday ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyAttendanceData} margin={{ left: -22, right: 4, top: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="present" name="Present" fill="#ec4899" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 text-center">
                      <CalendarCheck className="size-9 text-pink-500" />
                      <p className="text-sm font-medium text-foreground/85">
                        {dashboard.attendanceToday.nonTeachingReason === 'holiday'
                          ? (dashboard.attendanceToday.holidayName || 'Holiday today')
                          : 'Weekly Off'}
                      </p>
                      <p className="text-xs text-muted-foreground">No attendance is recorded today.</p>
                    </div>
                  )}
                </DashboardPanel>
              )}

              {(canSeeStudents || canSeeTeachers) && <TodaysBirthdaysCard people={birthdays} compact />}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {canSeeStudents && (
                <DashboardPanel
                  title="Student Performance"
                  description="Grade-wise academic trend"
                  icon={Award}
                  tone="violet"
                  action={<Badge variant="secondary" className="bg-violet-500/10 text-violet-700 dark:text-violet-300">Last Semester</Badge>}
                >
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={studentPerformanceData} barGap={4} margin={{ left: -18, right: 4, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="gradeA" name="Grade A" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="gradeB" name="Grade B" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="gradeC" name="Grade C" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </DashboardPanel>
              )}

              {canSeeFees && (
                <DashboardPanel
                  title="Earnings"
                  description="Collected versus pending fee trend"
                  icon={IndianRupee}
                  tone="emerald"
                  action={(
                    <Button className="h-7 gap-1.5 bg-primary px-2.5 text-xs text-primary-foreground shadow-sm hover:bg-primary/90" size="sm" onClick={() => router.push('/fees/collections')}>
                      View Fees
                      <ArrowRight className="size-3.5" />
                    </Button>
                  )}
                >
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={feeTrendData} margin={{ left: -10, right: 8, top: 8 }}>
                        <defs>
                          <linearGradient id="dashboardEarningsCollected" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.32} />
                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="dashboardEarningsPending" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.28} />
                            <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Number(v) / 1000}k`} />
                        <Tooltip formatter={(value: number, name: string) => [formatMoney(value), name === 'collected' ? 'Earnings' : 'Expenses']} contentStyle={tooltipStyle} />
                        <Area type="monotone" dataKey="collected" stroke="var(--primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardEarningsCollected)" />
                        <Area type="monotone" dataKey="pending" stroke="var(--warning)" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardEarningsPending)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </DashboardPanel>
              )}
            </div>

            <div>
              <NoticeBoardCard canSeeClasses={canSeeClasses} classDensity={classDensity} pendingRate={pendingRate} />
            </div>
          </div>

          <div className="grid content-start gap-4">
            <CalendarEventsCard calendarDays={calendarDays} />
            <RecentActivityCard activities={dashboard.recentActivities} />
          </div>
        </section>
      )}

      {false && (
      <section className="hidden">
        {canSeeAttendance && (
        <Card className="hidden">
          <CardHeader className="px-4">
            <CardTitle>Today&apos;s Attendance</CardTitle>
            <CardDescription>
              {isTeachingDayToday
                ? `${attendancePercent}% students present today`
                : dashboard.attendanceToday.nonTeachingReason === 'holiday'
                  ? `Holiday${dashboard.attendanceToday.holidayName ? ` — ${dashboard.attendanceToday.holidayName}` : ''}`
                  : 'Weekly Off'}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {isTeachingDayToday ? (
              <>
                <div className="relative h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={attendanceData} cx="50%" cy="50%" innerRadius={58} outerRadius={82} paddingAngle={3} dataKey="value">
                        {attendanceData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          borderColor: 'var(--border)',
                          background: 'var(--popover)',
                          color: 'var(--popover-foreground)',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-semibold text-foreground/85">{attendancePercent}%</span>
                    <span className="text-xs text-muted-foreground">Present</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {attendanceData.map((entry) => (
                    <div
                      key={entry.name}
                      className={cn(
                        'rounded-lg border p-2 text-center shadow-sm',
                        entry.name === 'Present' && 'border-primary/20 bg-primary/[0.07]',
                        entry.name === 'Absent' && 'border-red-500/15 bg-red-500/[0.05]',
                        entry.name === 'Leave' && 'border-amber-500/15 bg-amber-500/[0.06]',
                      )}
                    >
                      <div className="mx-auto mb-1 size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <p className="text-base font-semibold text-foreground/85">{entry.value}</p>
                      <p className="text-xs text-muted-foreground">{entry.name}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 text-center">
                <CalendarCheck className="size-10 text-sky-500" />
                <p className="text-sm font-medium text-foreground/85">
                  {dashboard.attendanceToday.nonTeachingReason === 'holiday'
                    ? (dashboard.attendanceToday.holidayName || 'Holiday today')
                    : 'Weekly Off'}
                </p>
                <p className="text-xs text-muted-foreground">No attendance is recorded today.</p>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </section>
      )}

    </div>
  )
}

type PanelTone = 'emerald' | 'sky' | 'violet' | 'pink' | 'amber'

function DashboardPanel({
  title,
  description,
  icon: Icon,
  tone,
  action,
  children,
}: {
  title: string
  description: string
  icon: React.ElementType
  tone: PanelTone
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className={cn(
      'gap-0 overflow-hidden py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
      tone === 'emerald' && 'border-emerald-200/80 bg-gradient-to-br from-white via-white to-emerald-50 hover:shadow-emerald-500/10 dark:border-emerald-500/25 dark:from-card dark:to-emerald-500/10',
      tone === 'sky' && 'border-sky-200/80 bg-gradient-to-br from-white via-white to-sky-50 hover:shadow-sky-500/10 dark:border-sky-500/25 dark:from-card dark:to-sky-500/10',
      tone === 'violet' && 'border-violet-200/80 bg-gradient-to-br from-white via-white to-violet-50 hover:shadow-violet-500/10 dark:border-violet-500/25 dark:from-card dark:to-violet-500/10',
      tone === 'pink' && 'border-pink-200/80 bg-gradient-to-br from-white via-white to-pink-50 hover:shadow-pink-500/10 dark:border-pink-500/25 dark:from-card dark:to-pink-500/10',
      tone === 'amber' && 'border-amber-200/80 bg-gradient-to-br from-white via-white to-amber-50 hover:shadow-amber-500/10 dark:border-amber-500/25 dark:from-card dark:to-amber-500/10',
    )}>
      <CardHeader className={cn(
        'flex flex-row items-start justify-between gap-3 border-b px-4 py-3',
        tone === 'emerald' && 'border-emerald-500/10 bg-emerald-500/[0.08]',
        tone === 'sky' && 'border-sky-500/10 bg-sky-500/[0.08]',
        tone === 'violet' && 'border-violet-500/10 bg-violet-500/[0.08]',
        tone === 'pink' && 'border-pink-500/10 bg-pink-500/[0.08]',
        tone === 'amber' && 'border-amber-500/10 bg-amber-500/[0.08]',
      )}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm',
            tone === 'emerald' && 'bg-gradient-to-br from-emerald-500 to-primary shadow-emerald-500/20',
            tone === 'sky' && 'bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sky-500/20',
            tone === 'violet' && 'bg-gradient-to-br from-violet-500 to-indigo-500 shadow-violet-500/20',
            tone === 'pink' && 'bg-gradient-to-br from-pink-500 to-rose-500 shadow-pink-500/20',
            tone === 'amber' && 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20',
          )}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{title}</CardTitle>
            <CardDescription className="truncate text-xs">{description}</CardDescription>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

interface CalendarDay {
  date: Date
  label: number
  inCurrentMonth: boolean
  isToday: boolean
}

function getCalendarDays(date: Date): CalendarDay[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return {
      date: day,
      label: day.getDate(),
      inCurrentMonth: day.getMonth() === month,
      isToday: day.toDateString() === date.toDateString(),
    }
  })
}

function CalendarEventsCard({ calendarDays }: { calendarDays: CalendarDay[] }) {
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date())
  const eventDates = new Set([8, 12, 20])

  return (
    <DashboardPanel title={monthLabel} description="Events calendar" icon={Calendar} tone="sky">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {calendarDays.map((day) => (
          <div
            key={day.date.toISOString()}
            className={cn(
              'relative flex aspect-square items-center justify-center rounded-lg text-xs transition-colors',
              day.inCurrentMonth ? 'text-foreground/80 hover:bg-sky-500/10' : 'text-muted-foreground/35',
              day.isToday && 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
              eventDates.has(day.label) && day.inCurrentMonth && !day.isToday && 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
            )}
          >
            {day.label}
            {eventDates.has(day.label) && day.inCurrentMonth && (
              <span className={cn('absolute bottom-1 size-1 rounded-full bg-pink-500', day.isToday && 'bg-white')} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Events</p>
        {eventItems.map((event) => (
          <div key={event.label} className="rounded-xl border border-sky-500/10 bg-white/70 p-2.5 shadow-sm dark:bg-background/40">
            <Badge variant="secondary" className="mb-1 h-5 bg-pink-500/10 px-1.5 text-[10px] text-pink-700 dark:text-pink-300">{event.tag}</Badge>
            <p className="text-xs font-semibold text-foreground/85">{event.label}</p>
            <p className="text-[10px] text-muted-foreground">{event.time}</p>
          </div>
        ))}
      </div>
    </DashboardPanel>
  )
}

function NoticeBoardCard({
  canSeeClasses,
  classDensity,
  pendingRate,
}: {
  canSeeClasses: boolean
  classDensity: number
  pendingRate: number
}) {
  return (
    <DashboardPanel
      title="Notice Board"
      description="Important school updates"
      icon={Megaphone}
      tone="amber"
      action={<Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">Popular</Badge>}
    >
      <div className="overflow-hidden rounded-xl border border-amber-500/15 bg-white/75 dark:bg-background/40">
        {notices.map((notice, index) => (
          <div key={notice.title} className={cn('grid gap-3 border-b p-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1.5fr)_1fr_110px]', index % 2 === 0 ? 'bg-white/55 dark:bg-white/[0.02]' : 'bg-transparent')}>
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg text-white',
                notice.tone === 'sky' && 'bg-sky-500',
                notice.tone === 'violet' && 'bg-violet-500',
                notice.tone === 'emerald' && 'bg-emerald-500',
                notice.tone === 'amber' && 'bg-amber-500',
              )}>
                <Bell className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground/85">{notice.title}</p>
                <p className="text-xs text-muted-foreground">Announcement</p>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground/75">Audience</p>
              <p>{notice.audience}</p>
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground/75">Due</p>
              <p>{notice.due}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-primary/10 bg-primary/[0.05] p-3 text-xs text-primary">
          <p className="font-semibold">{canSeeClasses ? `${classDensity} students` : 'Classes'}</p>
          <p className="text-muted-foreground">Average class size snapshot.</p>
        </div>
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.07] p-3 text-xs text-amber-700 dark:text-amber-300">
          <p className="font-semibold">{pendingRate}% pending</p>
          <p className="text-muted-foreground">Outstanding fee share today.</p>
        </div>
      </div>
    </DashboardPanel>
  )
}

function RecentActivityCard({ activities }: { activities: DashboardData['recentActivities'] }) {
  const displayActivities = activities.length > 0
    ? activities.slice(0, 4)
    : [
      { id: 'fallback-1', type: 'student', message: 'New student admission updated', time: 'Today' },
      { id: 'fallback-2', type: 'fees', message: 'Fee receipt generated successfully', time: 'Today' },
      { id: 'fallback-3', type: 'attendance', message: 'Attendance marked for classes', time: 'Today' },
    ]

  return (
    <DashboardPanel title="Recent Activity" description="Latest updates" icon={Bell} tone="violet">
      <div className="space-y-2">
        {displayActivities.map((activity, index) => (
          <div key={activity.id || `${activity.message}-${index}`} className="flex gap-2.5 rounded-xl border border-violet-500/10 bg-white/70 p-2.5 shadow-sm dark:bg-background/40">
            <span className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-white',
              index % 3 === 0 && 'bg-primary',
              index % 3 === 1 && 'bg-pink-500',
              index % 3 === 2 && 'bg-sky-500',
            )}>
              <Bell className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-xs font-medium text-foreground/85">{activity.message}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardPanel>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function TodaysBirthdaysCard({ people, compact = false }: { people: BirthdayPerson[]; compact?: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const prev = () => setCurrentIndex((i) => (i > 0 ? i - 1 : people.length - 1))
  const next = () => setCurrentIndex((i) => (i < people.length - 1 ? i + 1 : 0))

  return (
    <Card className="h-full gap-3 overflow-hidden border-rose-200/80 bg-gradient-to-br from-white via-white to-rose-50 py-0 shadow-sm dark:border-rose-500/25 dark:from-card dark:via-rose-500/[0.025] dark:to-rose-500/10">
      <CardHeader className="flex flex-col gap-1 border-b border-rose-500/10 bg-rose-500/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-sm shadow-rose-500/20">
            <Cake className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base">Today&apos;s Birthdays</CardTitle>
            <CardDescription>
              {people.length === 0
                ? 'No birthdays today — check back tomorrow'
                : `${people.length} birthday${people.length === 1 ? '' : 's'} today`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3">
        {people.length === 0 ? (
          <div className={cn('flex items-center justify-center rounded-lg border border-dashed bg-white/60 text-sm text-muted-foreground dark:bg-background/40', compact ? 'min-h-44 py-4' : 'py-4')}>
            Nobody is celebrating today.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(() => {
              const person = people[currentIndex]
              return (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-200/60 bg-white/80 p-5 text-center dark:border-rose-500/20 dark:bg-card/60">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-md shadow-rose-500/20">
                    {person.profileImage ? (
                      <img src={person.profileImage} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xl font-bold">
                        {getInitials(person.name)}
                      </div>
                    )}
                    <div className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-rose-500 text-white">
                      <Cake className="size-3" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-foreground/90">{person.name}</p>
                    <div className="mt-1.5 flex items-center justify-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'h-5 px-2 text-[11px] capitalize',
                          person.type === 'teacher' && 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                          person.type === 'staff' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                          person.type === 'student' && 'bg-primary/10 text-primary',
                        )}
                      >
                        {person.type === 'staff' && person.roleName ? person.roleName : person.type}
                      </Badge>
                      {person.className && (
                        <span className="text-xs text-muted-foreground">{person.className}</span>
                      )}
                    </div>
                    {person.age != null && (
                      <p className="mt-2 text-xs text-muted-foreground">Turns <span className="font-semibold text-rose-600 dark:text-rose-400">{person.age}</span> today!</p>
                    )}
                  </div>
                </div>
              )
            })()}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={prev}
                className="flex size-7 items-center justify-center rounded-full border border-rose-200 bg-white/70 text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-500/25 dark:bg-card dark:text-rose-400 dark:hover:bg-rose-500/20"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} of {people.length}
              </span>
              <button
                type="button"
                onClick={next}
                className="flex size-7 items-center justify-center rounded-full border border-rose-200 bg-white/70 text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-500/25 dark:bg-card dark:text-rose-400 dark:hover:bg-rose-500/20"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
