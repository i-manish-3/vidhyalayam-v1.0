'use client'

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Cake,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  IndianRupee,
  Layers,
  Sparkles,
  TrendingUp,
  UserPlus,
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
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useRouter } from 'next/navigation'
import { usePermissions } from '@/hooks/use-permissions'
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
  const router = useRouter()
  const { hasPermission } = usePermissions()

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

  const metrics: MetricItem[] = [
    canSeeStudents && {
      label: 'Students',
      value: dashboard.totalStudents,
      note: `${dashboard.totalClasses} classes, ${dashboard.totalSections} sections`,
      icon: GraduationCap,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      progress: Math.min(100, dashboard.totalStudents > 0 ? 82 : 0),
    },
    canSeeTeachers && {
      label: 'Teachers',
      value: dashboard.totalTeachers,
      note: 'Active teaching staff',
      icon: BookOpen,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      progress: Math.min(100, dashboard.totalTeachers > 0 ? 76 : 0),
    },
    canSeeFees && {
      label: 'Collected Fees',
      value: formatMoney(dashboard.feeStats.totalCollected),
      note: `${collectionRate}% collection rate`,
      icon: IndianRupee,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      progress: collectionRate,
    },
    canSeeFees && {
      label: 'Pending Fees',
      value: formatMoney(dashboard.feeStats.totalPending),
      note: `${formatMoney(dashboard.feeStats.overdueFees)} overdue`,
      icon: AlertCircle,
      tone: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
      progress: Math.min(100, pendingRate),
    },
  ].filter(Boolean) as MetricItem[]

  const quickActions = [
    canSeeStudents && { label: 'Admit Student', icon: UserPlus, href: '/students/admit' },
    canSeeFees && { label: 'Collect Fee', icon: IndianRupee, href: '/fees/collections' },
    canSeeAttendance && { label: 'Mark Attendance', icon: ClipboardCheck, href: '/attendance/mark' },
  ].filter(Boolean) as Array<{ label: string; icon: React.ElementType; href: string }>

  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary via-primary to-primary/85 px-4 py-4 text-primary-foreground shadow-md shadow-primary/10 sm:px-5">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-sm backdrop-blur-sm">
              <Sparkles className="size-5 text-amber-200" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-xl font-bold tracking-tight">School Overview</h1>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-primary-foreground/70">
                  <Calendar className="size-3" />
                  <span suppressHydrationWarning>{todayLabel}</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-primary-foreground/70">
                Attendance, fees and school updates at a glance.
              </p>
            </div>
          </div>

          {quickActions.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:max-w-md lg:justify-end">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="secondary"
                  className="h-8 justify-start gap-1.5 border border-white/15 bg-white/95 px-2.5 text-xs text-primary shadow-sm hover:bg-white sm:justify-center"
                  onClick={() => router.push(action.href)}
                >
                  <action.icon className="size-3.5" />
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={cn('grid gap-4', (canSeeStudents || canSeeTeachers) && 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.38fr)]')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.map((metric, index) => (
            <Card
              key={metric.label}
              className={cn(
                'group relative min-h-24 overflow-hidden border-primary/15 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md hover:shadow-primary/10',
                index % 4 === 0 && 'bg-gradient-to-br from-primary/[0.18] via-card to-card',
                index % 4 === 1 && 'bg-gradient-to-br from-card via-primary/[0.07] to-primary/[0.14]',
                index % 4 === 2 && 'bg-gradient-to-br from-primary/[0.13] via-card to-primary/[0.05]',
                index % 4 === 3 && 'bg-gradient-to-br from-card via-card to-primary/[0.16]',
              )}
            >
              <div aria-hidden className="absolute -bottom-6 -right-4 size-14 rounded-full bg-primary/[0.08] transition-transform duration-300 group-hover:scale-125" />
              <div aria-hidden className="absolute right-12 top-2.5 size-1.5 rounded-full bg-primary/20" />
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/70 to-transparent" />
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
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/65 transition-all" style={{ width: `${metric.progress}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{metric.note}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {(canSeeStudents || canSeeTeachers) && <TodaysBirthdaysCard people={birthdays} />}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {canSeeAttendance && (
          <InsightCard
            title="Attendance health"
            value={isTeachingDayToday ? `${attendancePercent}% present` : 'No classes today'}
            description={isTeachingDayToday
              ? `${dashboard.attendanceToday.present} of ${dashboard.attendanceToday.total} students are present.`
              : 'Attendance is paused for the non-teaching day.'}
            icon={TrendingUp}
          />
        )}
        {canSeeClasses && canSeeStudents && (
          <InsightCard
            title="Average class size"
            value={`${classDensity} students`}
            description={`Across ${dashboard.totalClasses} classes and ${dashboard.totalSections} sections.`}
            icon={Layers}
          />
        )}
        {canSeeFees && (
          <InsightCard
            title="Outstanding fee share"
            value={`${pendingRate}% pending`}
            description={`${formatMoney(dashboard.feeStats.overdueFees)} is currently overdue.`}
            icon={BarChart3}
          />
        )}
      </section>

      {(canSeeFees || canSeeAttendance) && (
      <section className={cn('grid gap-6', canSeeFees && canSeeAttendance ? 'xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]' : '')}>
        {canSeeFees && (
        <Card className="gap-3 overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-primary/[0.055] py-4 shadow-sm">
          <CardHeader className="flex flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between">
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
          <CardContent className="px-4">
            <div className="h-60">
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
        )}

        {canSeeAttendance && (
        <Card className="gap-3 overflow-hidden border-primary/15 bg-gradient-to-br from-card via-primary/[0.035] to-primary/[0.09] py-4 shadow-sm">
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

function InsightCard({ title, value, description, icon: Icon }: { title: string; value: string; description: string; icon: React.ElementType }) {
  return (
    <Card className="group overflow-hidden border-primary/15 bg-gradient-to-br from-card via-primary/[0.035] to-primary/[0.10] py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-primary/10">
      <CardContent className="flex items-start gap-3 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm shadow-primary/20 transition-transform group-hover:scale-105">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-0.5 text-base font-semibold tracking-tight text-foreground/85">{value}</p>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
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
    <Card className="h-full gap-3 overflow-hidden border-primary/15 bg-gradient-to-br from-card via-primary/[0.025] to-primary/[0.09] py-4 shadow-sm">
      <CardHeader className="flex flex-col gap-1 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/10">
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
      <CardContent className="px-4">
        {people.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed bg-muted/30 py-4 text-sm text-muted-foreground">
            Nobody is celebrating today.
          </div>
        ) : (
          <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {people.map((person) => (
              <div
                key={`${person.type}-${person.id}`}
                className="flex items-center gap-2.5 rounded-lg border bg-background p-2.5 transition-colors hover:border-primary/25 hover:bg-primary/[0.03]"
              >
                <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-primary/10 text-primary">
                  {person.profileImage ? (
                    <img src={person.profileImage} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-semibold">
                      {getInitials(person.name)}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
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
