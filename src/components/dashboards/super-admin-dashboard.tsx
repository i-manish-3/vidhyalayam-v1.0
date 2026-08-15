'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type PageName } from '@/lib/store'
import { resolveMigratedUrl } from '@/lib/migrated-routes'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import {
  School, CheckCircle2, Clock, Users, Building2, GraduationCap,
  ArrowRight, ArrowUpRight, ArrowDownRight, AlertTriangle, LifeBuoy,
  Mail, TrendingUp, Layers, Calendar, Sunrise, Sun, Sunset, MoonStar,
  type LucideIcon,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { LoadingState } from '@/components/shared'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Active: 'oklch(0.596 0.145 163.225)',
  Trial: 'oklch(0.769 0.159 57.7)',
  Pending: 'oklch(0.562 0.118 175.5)',
  Suspended: 'oklch(0.577 0.245 27.325)',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Analytics {
  totalSchools: number
  activeSchools: number
  trialSchools: number
  suspendedSchools: number
  pendingSchools: number
  totalStudents: number
  totalTeachers: number
  totalUsers: number
  schoolsThisMonth: number
  studentsThisMonth: number
  schoolsTrend: number
  studentsTrend: number
  trialExpiringSoon: number
  openTickets: number
  newContactRequests: number
  growthByMonth: { month: string; schools: number }[]
  statusBreakdown: { name: string; value: number }[]
  trialExpiryList: { id: string; name: string; trialEndsAt: string | null }[]
}

interface SchoolOption {
  id: string
  name: string
  status: string
  studentCount?: number
  teacherCount?: number
  createdAt?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function daysUntil(date: string | null): number {
  if (!date) return 0
  const ms = new Date(date).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

// ─── Tone system (mirrors the school dashboard language) ─────────────────────

type Tone = 'emerald' | 'sky' | 'violet' | 'amber'

const TONE_META: Record<
  Tone,
  { surface: string; accent: string; decoration: string; tile: string; header: string; border: string }
> = {
  emerald: {
    surface:
      'border-primary/15 bg-gradient-to-br from-teal-50 via-white to-cyan-50 hover:border-primary/35 dark:border-primary/25 dark:from-primary/15 dark:via-card dark:to-primary/5',
    accent: 'from-primary via-primary/70',
    decoration: 'bg-cyan-300/20 dark:bg-primary/10',
    tile: 'bg-primary text-primary-foreground shadow-sm shadow-primary/20',
    header: 'border-primary/10 bg-emerald-500/[0.08]',
    border: 'border-emerald-200/80 dark:border-emerald-500/25',
  },
  sky: {
    surface:
      'border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 hover:border-sky-500/35 hover:shadow-sky-500/10 dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/5',
    accent: 'from-sky-500 via-sky-400',
    decoration: 'bg-sky-300/20 dark:bg-sky-500/10',
    tile: 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/20',
    header: 'border-sky-500/10 bg-sky-500/[0.08]',
    border: 'border-sky-200/80 dark:border-sky-500/25',
  },
  violet: {
    surface:
      'border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 hover:border-violet-500/35 hover:shadow-violet-500/10 dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/5',
    accent: 'from-violet-500 via-purple-400',
    decoration: 'bg-violet-300/20 dark:bg-violet-500/10',
    tile: 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-sm shadow-violet-500/20',
    header: 'border-violet-500/10 bg-violet-500/[0.08]',
    border: 'border-violet-200/80 dark:border-violet-500/25',
  },
  amber: {
    surface:
      'border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 hover:border-amber-500/35 hover:shadow-amber-500/10 dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-amber-500/5',
    accent: 'from-amber-500 via-orange-400',
    decoration: 'bg-amber-300/20 dark:bg-amber-500/10',
    tile: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20',
    header: 'border-amber-500/10 bg-amber-500/[0.08]',
    border: 'border-amber-200/80 dark:border-amber-500/25',
  },
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface HeroStatProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: number
  trendLabel?: string
  tone?: Tone
}

function HeroStat({ title, value, icon: Icon, trend, trendLabel, tone = 'emerald' }: HeroStatProps) {
  const t = TONE_META[tone]
  const trendPositive = (trend ?? 0) >= 0
  return (
    <Card
      className={cn(
        'group relative min-h-24 overflow-hidden border-primary/15 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        t.surface,
      )}
    >
      <div aria-hidden className={cn('absolute -bottom-6 -right-4 size-14 rounded-full transition-transform duration-300 group-hover:scale-125', t.decoration)} />
      <div aria-hidden className={cn('absolute right-12 top-2.5 size-1.5 rounded-full', t.decoration)} />
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', t.accent)} />
      <CardContent className="relative p-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="mt-0.5 text-lg font-bold tracking-tight text-foreground/90 tabular-nums">{value}</p>
          </div>
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105', t.tile)}>
            <Icon className="size-4" />
          </div>
        </div>
        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5">
          {typeof trend === 'number' && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                trendPositive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400',
              )}
            >
              {trendPositive ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
              {trendPositive ? '+' : ''}{trend}%
            </span>
          )}
          {trendLabel && <span className="text-[11px] text-muted-foreground">{trendLabel}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

interface ActionTileProps {
  title: string
  count: number
  description: string
  icon: LucideIcon
  tone: 'amber' | 'rose' | 'sky'
  onClick: () => void
}

function ActionTile({ title, count, description, icon: Icon, tone, onClick }: ActionTileProps) {
  const toneClasses = {
    amber: { wrap: 'border-amber-500/25 hover:bg-amber-500/[0.04]', tile: 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-amber-500/20' },
    rose:  { wrap: 'border-rose-500/25  hover:bg-rose-500/[0.04]',  tile: 'bg-gradient-to-br from-rose-500 to-pink-500 shadow-rose-500/20'  },
    sky:   { wrap: 'border-sky-500/25   hover:bg-sky-500/[0.04]',   tile: 'bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sky-500/20'   },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border bg-gradient-to-br from-white via-white to-transparent p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        toneClasses.wrap,
      )}
    >
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', toneClasses.tile)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold leading-none tabular-nums">{count}</span>
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{description}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
}

interface PanelProps {
  title: string
  description: string
  icon: LucideIcon
  tone: Tone
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}

function Panel({ title, description, icon: Icon, tone, action, className, children }: PanelProps) {
  const t = TONE_META[tone]
  return (
    <Card
      className={cn(
        'group gap-0 overflow-hidden border py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        t.border,
        className,
      )}
    >
      <CardHeader className={cn('flex flex-row items-start justify-between gap-3 border-b px-4 py-3', t.header)}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-transform group-hover:scale-105', t.tile)}>
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminDashboard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours())

  const router = useRouter()
  const userName = useAppStore((state) => state.user?.name)

  const go = (page: PageName) => () => {
    const url = resolveMigratedUrl(page)
    if (url) router.push(url)
  }

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const [analyticsData, schoolsData] = await Promise.all([
          api.get<Analytics>('/api/super-admin/analytics'),
          api.get<{ schools: SchoolOption[] }>('/api/super-admin/schools?limit=6'),
        ])
        if (cancelled) return
        setAnalytics(analyticsData)
        setSchools(schoolsData.schools || [])
      } catch {
        if (!cancelled) {
          toast({
            title: "Couldn't Load Dashboard",
            description: 'We had trouble fetching platform data. Please refresh the page.',
            variant: 'destructive',
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [toast])

  useEffect(() => {
    const interval = setInterval(() => setCurrentHour(new Date().getHours()), 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return <LoadingState />

  const a = analytics
  const totalSchools = a?.totalSchools ?? 0
  const activeSchools = a?.activeSchools ?? 0
  const trialSchools = a?.trialSchools ?? 0
  const suspendedSchools = a?.suspendedSchools ?? 0
  const totalStudents = a?.totalStudents ?? 0
  const totalTeachers = a?.totalTeachers ?? 0
  const growthData = a?.growthByMonth ?? []
  const statusData = (a?.statusBreakdown ?? []).filter((s) => s.value > 0)
  const trialExpiryList = a?.trialExpiryList ?? []
  const openTickets = a?.openTickets ?? 0
  const newLeads = a?.newContactRequests ?? 0
  const trialExpiringSoon = a?.trialExpiringSoon ?? 0
  const statusTotal = statusData.reduce((acc, s) => acc + s.value, 0)

  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
  const firstName = userName?.trim().split(/\s+/)[0] || 'Admin'
  const greeting = currentHour >= 5 && currentHour < 12
    ? { label: 'Good morning', Icon: Sunrise }
    : currentHour >= 12 && currentHour < 17
      ? { label: 'Good afternoon', Icon: Sun }
      : currentHour >= 17 && currentHour < 21
        ? { label: 'Good evening', Icon: Sunset }
        : { label: 'Good night', Icon: MoonStar }

  return (
    <div className="space-y-6">
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-sky-600 px-4 py-4 text-white shadow-lg shadow-primary/15 sm:px-5">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-sky-200/20" />
        <div aria-hidden className="absolute -bottom-16 right-36 size-28 rounded-full bg-amber-300/15 blur-sm" />
        <div aria-hidden className="absolute left-1/3 top-0 h-px w-48 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md shadow-black/10 backdrop-blur-sm">
              <Layers className="size-6" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-lg font-bold tracking-tight text-white">Platform Overview</h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-sm">
                  <Calendar className="size-3" />
                  <span suppressHydrationWarning>{todayLabel}</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/75">
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-300" />{activeSchools} active</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-amber-300" />{trialSchools} on trial</span>
                {suspendedSchools > 0 && (
                  <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-rose-300" />{suspendedSchools} suspended</span>
                )}
                <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky-200" />Platform health at a glance</span>
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

      {/* ── Hero KPI grid ──────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HeroStat
          title="Total Schools"
          value={formatNumber(totalSchools)}
          icon={School}
          trend={a?.schoolsTrend}
          trendLabel="vs last month"
          tone="emerald"
        />
        <HeroStat
          title="Active Schools"
          value={formatNumber(activeSchools)}
          icon={CheckCircle2}
          trendLabel={`${trialSchools} on trial`}
          tone="sky"
        />
        <HeroStat
          title="Total Students"
          value={formatNumber(totalStudents)}
          icon={GraduationCap}
          trend={a?.studentsTrend}
          trendLabel="vs last month"
          tone="violet"
        />
        <HeroStat
          title="Total Teachers"
          value={formatNumber(totalTeachers)}
          icon={Users}
          trendLabel="across platform"
          tone="amber"
        />
      </section>

      {/* ── Action items strip ────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ActionTile
          title="Trials expiring"
          count={trialExpiringSoon}
          description="Schools whose trial ends within 7 days"
          icon={AlertTriangle}
          tone="amber"
          onClick={go('schools')}
        />
        <ActionTile
          title="Open tickets"
          count={openTickets}
          description="Support tickets awaiting response"
          icon={LifeBuoy}
          tone="rose"
          onClick={go('support')}
        />
        <ActionTile
          title="New leads"
          count={newLeads}
          description="Fresh contact requests from prospects"
          icon={Mail}
          tone="sky"
          onClick={go('contact-requests')}
        />
      </section>

      {/* ── Charts row ────────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Growth chart */}
        <Panel
          title="Schools Growth"
          description="New schools onboarded over the last 12 months"
          icon={TrendingUp}
          tone="emerald"
          className="lg:col-span-2"
          action={
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Live
            </Badge>
          }
        >
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growthData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.596 0.145 163.225)" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="oklch(0.596 0.145 163.225)" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                  className="text-muted-foreground"
                />
                <Tooltip
                  cursor={{ fill: 'oklch(0.596 0.145 163.225 / 0.06)' }}
                  formatter={(value: number) => [`${value} schools`, '']}
                  labelClassName="font-medium"
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '12px',
                    background: 'var(--popover)',
                  }}
                />
                <Bar dataKey="schools" fill="url(#growthFill)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Status donut */}
        <Panel
          title="Schools by Status"
          description={`Distribution across ${statusTotal} schools`}
          icon={Building2}
          tone="violet"
          action={
            suspendedSchools > 0 ? (
              <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-[10px] text-rose-600 dark:text-rose-400">
                {suspendedSchools} suspended
              </Badge>
            ) : undefined
          }
        >
          <div className="relative h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData.length ? statusData : [{ name: 'No data', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={statusData.length > 1 ? 3 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {(statusData.length ? statusData : [{ name: 'No data', value: 1 }]).map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || 'oklch(0.85 0 0)'} />
                  ))}
                </Pie>
                {statusData.length > 0 && (
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value} schools`, name]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      fontSize: '12px',
                      background: 'var(--popover)',
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums">{statusTotal}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {(statusData.length ? statusData : []).map((entry) => {
              const pct = statusTotal > 0 ? Math.round((entry.value / statusTotal) * 100) : 0
              return (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[entry.name] }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                  </div>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="font-medium">{entry.value}</span>
                    <span className="w-9 text-right text-muted-foreground/60">{pct}%</span>
                  </div>
                </div>
              )
            })}
            {statusData.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">No schools yet</p>
            )}
          </div>
        </Panel>
      </section>

      {/* ── Trial expiry + Recent schools ─────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-5">
        {/* Trial expiry */}
        <Panel
          title="Trials Expiring Soon"
          description="Within the next 7 days"
          icon={Clock}
          tone="amber"
          className="lg:col-span-2"
          action={
            trialExpiryList.length > 0 ? (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
                {trialExpiryList.length}
              </Badge>
            ) : undefined
          }
        >
          {trialExpiryList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="mb-2 flex size-8 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <p className="text-sm font-medium">All clear</p>
              <p className="mt-0.5 text-xs text-muted-foreground">No trials expiring this week</p>
            </div>
          ) : (
            <div className="space-y-2">
              {trialExpiryList.map((s) => {
                const days = daysUntil(s.trialEndsAt)
                const urgent = days <= 2
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-200/60 bg-white/70 p-2.5 shadow-sm dark:border-amber-500/20 dark:bg-background/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm shadow-amber-500/20">
                        <Building2 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">Trial school</p>
                      </div>
                    </div>
                    <Badge
                      variant={urgent ? 'destructive' : 'secondary'}
                      className="shrink-0 text-[10px]"
                    >
                      {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {/* Recent schools */}
        <Panel
          title="Recent Schools"
          description="Newest schools onboarded to the platform"
          icon={Building2}
          tone="sky"
          className="lg:col-span-3"
          action={
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={go('schools')}>
              View all
              <ArrowRight className="size-3" />
            </Button>
          }
        >
          {schools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <Building2 className="mb-2 size-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No schools yet</p>
              <p className="mt-0.5 text-xs text-muted-foreground/60">Onboard your first school to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {schools.slice(0, 5).map((school) => (
                <div
                  key={school.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-sky-200/60 bg-white/70 p-2.5 shadow-sm transition-colors hover:bg-sky-500/[0.04] dark:border-sky-500/20 dark:bg-background/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/20">
                      <Building2 className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{school.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {(school.studentCount ?? 0).toLocaleString()} students | {(school.teacherCount ?? 0).toLocaleString()} teachers
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {typeof school.studentCount === 'number' && (
                      <span className="hidden items-center gap-1 text-[11px] text-muted-foreground tabular-nums sm:flex">
                        <GraduationCap className="size-3" />
                        {formatNumber(school.studentCount)}
                      </span>
                    )}
                    <Badge
                      variant={
                        school.status === 'active'
                          ? 'default'
                          : school.status === 'trial'
                          ? 'secondary'
                          : school.status === 'suspended'
                          ? 'destructive'
                          : 'outline'
                      }
                      className="text-[10px] capitalize"
                    >
                      {school.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  )
}