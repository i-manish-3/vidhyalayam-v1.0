'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  Clock,
  GraduationCap,
  IndianRupee,
  Megaphone,
  PlusCircle,
  TrendingUp,
  Users,
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
import { useAppStore, type PageName } from '@/lib/store'
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
  const [now, setNow] = useState(() => new Date())
  const { currentSchool, setCurrentPage } = useAppStore()

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

    fetchData()
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
    { label: 'Class Avg', value: classDensity || '-', icon: Users },
  ]

  const quickActions: Array<{ label: string; page: PageName; icon: React.ElementType; description: string }> = [
    { label: 'New Admission', page: 'admission-form', icon: PlusCircle, description: 'Register a student' },
    { label: 'Mark Attendance', page: 'mark-attendance', icon: CalendarCheck, description: 'Daily attendance' },
    { label: 'Collect Fees', page: 'fee-collections', icon: IndianRupee, description: 'Record payment' },
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
        <div className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit gap-2 bg-primary/10 text-primary hover:bg-primary/10">
              <Clock className="size-3.5" />
              <span>{today}</span>
              <span className="text-primary/45">|</span>
              <span className="font-mono tabular-nums">{currentTime}</span>
            </Badge>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {currentSchool?.name || 'School'} Dashboard
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Monitor admissions, attendance, fees, and daily school operations from one place.
              </p>
            </div>
            <div className="grid max-w-2xl gap-2 sm:grid-cols-3">
              {heroKpis.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-bold">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:max-w-[500px] lg:justify-end">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => setCurrentPage(action.page)}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-transparent bg-[var(--button-primary,var(--primary))] px-3 text-xs font-semibold text-[var(--button-primary-foreground,var(--primary-foreground))] shadow-sm transition-all hover:bg-[var(--button-primary-hover,var(--primary))]"
              >
                <action.icon className="size-3.5" />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{metric.value}</p>
                </div>
                <div className={cn('flex size-10 items-center justify-center rounded-lg', metric.tone)}>
                  <metric.icon className="size-5" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">{metric.note}</p>
                  <span className="text-xs font-semibold text-muted-foreground">{metric.progress}%</span>
                </div>
                <Progress value={metric.progress} className="h-1.5 bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <InsightCard
          title="Student Coverage"
          value={`${dashboard.totalClasses} Classes`}
          description={`${dashboard.totalSections} active sections with ${classDensity || 0} students per class on average`}
          icon={GraduationCap}
        />
        <InsightCard
          title="Fee Health"
          value={collectionRate >= 75 ? 'Healthy' : 'Needs Focus'}
          description={`${formatMoney(dashboard.feeStats.totalCollected)} collected against ${formatMoney(dashboard.feeStats.totalFees)} total fee demand`}
          icon={TrendingUp}
        />
        <InsightCard
          title="Today Status"
          value={attendancePercent >= 75 ? 'On Track' : 'Follow Up'}
          description={`${dashboard.attendanceToday.present} present, ${dashboard.attendanceToday.absent} absent, ${dashboard.attendanceToday.leave} on leave`}
          icon={ClipboardList}
        />
      </section>

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
              <Button variant="outline" size="sm" onClick={() => setCurrentPage('fee-collections')}>
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
                <span className="text-3xl font-bold">{attendancePercent}%</span>
                <span className="text-xs text-muted-foreground">Present</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {attendanceData.map((entry) => (
                <div key={entry.name} className="rounded-lg border bg-background p-3 text-center">
                  <div className="mx-auto mb-2 size-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <p className="text-lg font-bold">{entry.value}</p>
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
            <Button variant="outline" size="sm" onClick={() => setCurrentPage('notifications')}>
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
          <p className="mt-1 text-lg font-bold tracking-tight">{value}</p>
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
