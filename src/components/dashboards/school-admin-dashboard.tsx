'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  Bus,
  Cake,
  Calendar,
  CalendarCheck,
  ClipboardList,
  Clock,
  GraduationCap,
  IndianRupee,
  Layers,
  Megaphone,
  PlusCircle,
  Settings,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
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
import { Progress } from '@/components/ui/progress'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { useAppStore, type PageName } from '@/lib/store'
import { resolveMigratedUrl } from '@/lib/migrated-routes'
import { cn } from '@/lib/utils'

const feeTrendData = [
  { month: 'Jul', collected: 85000, pending: 42000 },
  { month: 'Aug', collected: 92000, pending: 38000 },
  { month: 'Sep', collected: 105000, pending: 35000 },
  { month: 'Oct', collected: 118000, pending: 30000 },
  { month: 'Nov', collected: 125000, pending: 28000 },
  { month: 'Dec', collected: 132000, pending: 25000 },
]

interface DashboardData {
  totalStudents: number
  totalTeachers: number
  totalClasses: number
  totalSections: number
  attendanceToday: { present: number; absent: number; leave: number; total: number }
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

function activityIcon(type: string) {
  switch (type) {
    case 'student':
      return GraduationCap
    case 'fee':
      return IndianRupee
    case 'attendance':
      return ClipboardList
    case 'announcement':
      return Megaphone
    case 'exam':
      return TrendingUp
    default:
      return Activity
  }
}

export function SchoolAdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [birthdays, setBirthdays] = useState<BirthdayPerson[]>([])
  const [now, setNow] = useState(() => new Date())
  const router = useRouter()
  const { currentSchool } = useAppStore()

  const navigatePage = (page: PageName) => {
    const url = resolveMigratedUrl(page)
    if (url) router.push(url)
  }

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
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
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
  const attendancePercent = dashboard.attendanceToday.total > 0
    ? Math.round((dashboard.attendanceToday.present / dashboard.attendanceToday.total) * 100)
    : 0
  const today = format(now, 'EEEE, d MMM yyyy')
  const currentTime = format(now, 'hh:mm:ss a')
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

  const metrics: MetricItem[] = [
    {
      label: 'Students',
      value: dashboard.totalStudents,
      note: `${dashboard.totalClasses} classes, ${dashboard.totalSections} sections`,
      icon: GraduationCap,
      tone: 'bg-primary/10 text-primary',
      progress: Math.min(100, dashboard.totalStudents > 0 ? 82 : 0),
    },
    {
      label: 'Teachers',
      value: dashboard.totalTeachers,
      note: 'Active teaching staff',
      icon: BookOpen,
      tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
      progress: Math.min(100, dashboard.totalTeachers > 0 ? 76 : 0),
    },
    {
      label: 'Collected Fees',
      value: formatMoney(dashboard.feeStats.totalCollected),
      note: `${collectionRate}% collection rate`,
      icon: IndianRupee,
      tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
      progress: collectionRate,
    },
    {
      label: 'Pending Fees',
      value: formatMoney(dashboard.feeStats.totalPending),
      note: `${formatMoney(dashboard.feeStats.overdueFees)} overdue`,
      icon: AlertCircle,
      tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
      progress: Math.min(100, pendingRate),
    },
  ]

  const heroKpis = [
    { label: 'Attendance', value: `${attendancePercent}%`, icon: CalendarCheck },
    { label: 'Collection', value: `${collectionRate}%`, icon: IndianRupee },
  ]

  const quickActions: Array<{ label: string; page: PageName; icon: React.ElementType; iconClassName: string }> = [
    { label: 'Students', page: 'students', icon: GraduationCap, iconClassName: 'text-cyan-600 dark:text-cyan-300' },
    { label: 'New Admission', page: 'admission-form', icon: PlusCircle, iconClassName: 'text-emerald-600 dark:text-emerald-300' },
    { label: 'Classes', page: 'classes', icon: Layers, iconClassName: 'text-indigo-600 dark:text-indigo-300' },
    { label: 'Attendance', page: 'mark-attendance', icon: CalendarCheck, iconClassName: 'text-amber-600 dark:text-amber-300' },
    { label: 'Fees', page: 'fee-collections', icon: IndianRupee, iconClassName: 'text-green-600 dark:text-green-300' },
    { label: 'Timetable', page: 'timetable', icon: Calendar, iconClassName: 'text-sky-600 dark:text-sky-300' },
    { label: 'Exams', page: 'exams', icon: TrendingUp, iconClassName: 'text-blue-600 dark:text-blue-300' },
    { label: 'Transport', page: 'transport', icon: Bus, iconClassName: 'text-violet-600 dark:text-violet-300' },
    { label: 'Staff', page: 'staff', icon: Users, iconClassName: 'text-pink-600 dark:text-pink-300' },
    { label: 'Announcements', page: 'announcements', icon: Megaphone, iconClassName: 'text-fuchsia-600 dark:text-fuchsia-300' },
    { label: 'Alerts', page: 'notifications', icon: Bell, iconClassName: 'text-orange-500 dark:text-orange-300' },
    { label: 'Settings', page: 'settings', icon: Settings, iconClassName: 'text-slate-600 dark:text-slate-300' },
  ]

  const recentActivities = useMemo(() => {
    if (dashboard.recentActivities.length > 0) return dashboard.recentActivities
    return [
      { id: 'empty-1', type: 'student', message: 'No recent activity yet. New school events will appear here.', time: 'Today' },
    ]
  }, [dashboard.recentActivities])

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 lg:flex-1 lg:min-w-0">
            <Badge variant="secondary" className="w-fit gap-2 bg-primary/10 text-primary hover:bg-primary/10">
              <Clock className="size-3.5" />
              <span>{today}</span>
              <span className="text-primary/45">|</span>
              <span className="font-mono tabular-nums">{currentTime}</span>
            </Badge>
            <h1 className="text-lg font-semibold tracking-tight text-foreground/85 sm:text-xl">
              {currentSchool?.name || 'School'}
            </h1>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-md lg:shrink-0">
            {heroKpis.map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-1.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <item.icon className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-semibold text-foreground/85">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="px-3.5 pt-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/90">
            <Zap className="size-3.5 text-amber-500 fill-amber-500" />
            Quick Actions
          </h2>
        </div>
        <div className="quick-actions-scrollbar overflow-x-auto px-3.5 pb-2 pt-1.5">
          <div className="flex min-w-max items-center gap-2.5">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => navigatePage(action.page)}
                className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground/85 shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <action.icon className={cn('size-3.5', action.iconClassName)} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden py-0">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground/85">{metric.value}</p>
                </div>
                <div className={cn('flex size-8 items-center justify-center rounded-lg', metric.tone)}>
                  <metric.icon className="size-4" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-[11px] text-muted-foreground">{metric.note}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <TodaysBirthdaysCard people={birthdays} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Fee Collection</CardTitle>
              <CardDescription>Collected versus pending fee trend</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-primary/5 text-primary">
                Collected {formatMoney(dashboard.feeStats.totalCollected)}
              </Badge>
              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                Pending {formatMoney(dashboard.feeStats.totalPending)}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => router.push('/fees/collections')}>
                View Fees
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={feeTrendData} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="dashboardCollected" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashboardPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--warning)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--warning)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `INR ${Number(v) / 1000}k`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatMoney(value),
                      name === 'collected' ? 'Collected' : 'Pending',
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      borderColor: 'var(--border)',
                      background: 'var(--popover)',
                      color: 'var(--popover-foreground)',
                    }}
                  />
                  <Area type="monotone" dataKey="collected" stroke="var(--primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardCollected)" />
                  <Area type="monotone" dataKey="pending" stroke="var(--warning)" strokeWidth={2.5} fillOpacity={1} fill="url(#dashboardPending)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Attendance</CardTitle>
            <CardDescription>{attendancePercent}% students present today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-48">
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
            <div className="mt-4 grid grid-cols-3 gap-2">
              {attendanceData.map((entry) => (
                <div key={entry.name} className="rounded-lg border bg-background p-3 text-center">
                  <div className="mx-auto mb-2 size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <p className="text-lg font-semibold text-foreground/85">{entry.value}</p>
                  <p className="text-xs text-muted-foreground">{entry.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Operations Snapshot</CardTitle>
            <CardDescription>Quick health check for today</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SnapshotRow label="Attendance Marking" value={dashboard.attendanceToday.total > 0 ? 'In progress' : 'Not started'} progress={attendancePercent} tone={dashboard.attendanceToday.total > 0 ? 'good' : 'warn'} />
            <SnapshotRow label="Fee Collection Rate" value={`${collectionRate}%`} progress={collectionRate} tone={collectionRate >= 70 ? 'good' : 'warn'} />
            <SnapshotRow label="Pending Follow-ups" value={formatMoney(dashboard.feeStats.totalPending)} progress={100 - Math.min(100, pendingRate)} tone={dashboard.feeStats.totalPending > 0 ? 'warn' : 'good'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest events across school modules</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/notifications')}>
              Notifications
              <ArrowRight className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 space-y-1 overflow-y-auto custom-scrollbar pr-1">
              {recentActivities.map((activity) => {
                const Icon = activityIcon(activity.type)
                return (
                  <div key={activity.id} className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/60">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-5">{activity.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] capitalize">
                      {activity.type}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function InsightCard({ title, value, description, icon: Icon }: { title: string; value: string; description: string; icon: React.ElementType }) {
  return (
    <Card className="bg-card/80">
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-lg font-semibold tracking-tight text-foreground/85">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function SnapshotRow({ label, value, progress, tone }: { label: string; value: string; progress: number; tone: 'good' | 'warn' }) {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">Current status</p>
        </div>
        <Badge
          className={cn(
            'shrink-0',
            tone === 'good'
              ? 'bg-primary/10 text-primary hover:bg-primary/10'
              : 'bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300'
          )}
        >
          {value}
        </Badge>
      </div>
      <Progress value={Math.min(100, Math.max(0, progress))} className={cn('h-1.5', tone === 'warn' && '[&_[data-slot=progress-indicator]]:bg-amber-500')} />
    </div>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function TodaysBirthdaysCard({ people }: { people: BirthdayPerson[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-300">
            <Cake className="size-4" />
          </div>
          <div>
            <CardTitle>Today&apos;s Birthdays</CardTitle>
            <CardDescription>
              {people.length === 0
                ? 'No birthdays today — check back tomorrow'
                : `${people.length} birthday${people.length === 1 ? '' : 's'} today — wish them a wonderful day`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {people.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/30 py-6 text-sm text-muted-foreground">
            Nobody is celebrating today.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {people.map((person) => (
              <div
                key={`${person.type}-${person.id}`}
                className="flex items-center gap-3 rounded-lg border bg-background p-3"
              >
                <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-primary/10 text-primary">
                  {person.profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={person.profileImage} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-semibold">
                      {getInitials(person.name)}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-background bg-pink-500 text-white">
                    <Cake className="size-2.5" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium text-foreground/85">{person.name}</p>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className={cn(
                        'h-4 px-1.5 text-[10px] capitalize',
                        person.type === 'teacher' && 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
                        person.type === 'staff' && 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
                        person.type === 'student' && 'bg-primary/10 text-primary',
                      )}
                    >
                      {person.type === 'staff' && person.roleName ? person.roleName : person.type}
                    </Badge>
                    <p className="truncate text-xs text-muted-foreground">
                      {person.age != null ? `Turns ${person.age}` : ''}
                      {person.age != null && person.className ? ' · ' : ''}
                      {person.className || ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
