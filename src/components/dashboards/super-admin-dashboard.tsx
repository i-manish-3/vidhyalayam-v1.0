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
import {
  School, CheckCircle2, Clock, Users, Building2, GraduationCap,
  ArrowRight, ArrowUpRight, ArrowDownRight, AlertTriangle, LifeBuoy,
  Mail, ShieldCheck, KeyRound, Plus, TrendingUp,
  Sparkles, Zap, type LucideIcon,
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
  trialExpiryList: { id: string; name: string; subdomain: string; trialEndsAt: string | null }[]
}

interface SchoolOption {
  id: string
  name: string
  status: string
  subdomain: string
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

// ─── Sub-components ──────────────────────────────────────────────────────────

interface HeroStatProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: number
  trendLabel?: string
  tone?: 'emerald' | 'blue' | 'amber' | 'violet'
  accent?: string
}

const TONES: Record<NonNullable<HeroStatProps['tone']>, { bg: string; ring: string; text: string }> = {
  emerald: {
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  blue: {
    bg: 'bg-sky-500/10',
    ring: 'ring-sky-500/20',
    text: 'text-sky-600 dark:text-sky-400',
  },
  amber: {
    bg: 'bg-amber-500/10',
    ring: 'ring-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  violet: {
    bg: 'bg-violet-500/10',
    ring: 'ring-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
}

function HeroStat({ title, value, icon: Icon, trend, trendLabel, tone = 'emerald' }: HeroStatProps) {
  const t = TONES[tone]
  const trendPositive = (trend ?? 0) >= 0
  return (
    <Card className="overflow-hidden py-0">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground/85 tabular-nums">{value}</p>
            {typeof trend === 'number' && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium',
                    trendPositive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  )}
                >
                  {trendPositive ? <ArrowUpRight className="size-2.5" /> : <ArrowDownRight className="size-2.5" />}
                  {trendPositive ? '+' : ''}{trend}%
                </span>
                {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
              </div>
            )}
            {typeof trend !== 'number' && trendLabel && (
              <p className="mt-1 text-[11px] text-muted-foreground">{trendLabel}</p>
            )}
          </div>
          <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', t.bg, t.text)}>
            <Icon className="size-4" />
          </div>
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
    amber: { wrap: 'border-amber-500/30 hover:bg-amber-500/[0.04]', dot: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
    rose:  { wrap: 'border-rose-500/30  hover:bg-rose-500/[0.04]',  dot: 'bg-rose-500/15  text-rose-600  dark:text-rose-400'  },
    sky:   { wrap: 'border-sky-500/30   hover:bg-sky-500/[0.04]',   dot: 'bg-sky-500/15   text-sky-600   dark:text-sky-400'   },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg border bg-card p-2 text-left transition-all',
        toneClasses.wrap
      )}
    >
      <div className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', toneClasses.dot)}>
        <Icon className="size-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold tabular-nums">{count}</span>
          <span className="text-[11px] font-medium truncate">{title}</span>
        </div>
        <p className="text-[10px] leading-3 text-muted-foreground line-clamp-1">{description}</p>
      </div>
      <ArrowRight className="size-3.5 text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
    </button>
  )
}

interface QuickActionProps {
  label: string
  icon: LucideIcon
  onClick: () => void
}

function QuickAction({ label, icon: Icon, onClick }: QuickActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium text-foreground/85 shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <Icon className="size-3.5 text-primary" />
      <span>{label}</span>
    </button>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminDashboard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [schools, setSchools] = useState<SchoolOption[]>([])

  const router = useRouter()

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

  if (loading) return <LoadingState />

  const a = analytics
  const totalSchools = a?.totalSchools ?? 0
  const activeSchools = a?.activeSchools ?? 0
  const trialSchools = a?.trialSchools ?? 0
  const totalStudents = a?.totalStudents ?? 0
  const totalTeachers = a?.totalTeachers ?? 0
  const growthData = a?.growthByMonth ?? []
  const statusData = (a?.statusBreakdown ?? []).filter((s) => s.value > 0)
  const trialExpiryList = a?.trialExpiryList ?? []
  const openTickets = a?.openTickets ?? 0
  const newLeads = a?.newContactRequests ?? 0
  const trialExpiringSoon = a?.trialExpiringSoon ?? 0
  const statusTotal = statusData.reduce((acc, s) => acc + s.value, 0)

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2 lg:min-w-0 lg:flex-1">
              <Badge variant="secondary" className="w-fit gap-2 bg-primary/10 text-primary hover:bg-primary/10">
                <Sparkles className="size-3.5" />
                <span>Super Admin</span>
              </Badge>
              <h1 className="text-lg font-semibold tracking-tight text-foreground/85 sm:text-xl">
                Vidhyalayam Platform
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time pulse across schools, trials, support, and admissions leads.
              </p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:max-w-md lg:shrink-0">
              <Button variant="outline" size="sm" className="h-9 justify-start gap-2" onClick={go('schools')}>
                <Building2 className="size-3.5" />
                All Schools
              </Button>
              <Button size="sm" className="h-9 justify-start gap-2" onClick={go('add-school')}>
                <Plus className="size-3.5" />
                Onboard School
              </Button>
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
            <QuickAction label="Onboard School" icon={Plus} onClick={go('add-school')} />
            <QuickAction label="All Schools" icon={Building2} onClick={go('schools')} />
            <QuickAction label="Manage Roles" icon={ShieldCheck} onClick={go('super-admin-roles')} />
            <QuickAction label="Permissions" icon={KeyRound} onClick={go('super-admin-permissions')} />
            <QuickAction label="Support" icon={LifeBuoy} onClick={go('support')} />
            <QuickAction label="Leads" icon={Mail} onClick={go('contact-requests')} />
          </div>
        </div>
      </section>

      {/* ── Hero KPI grid ──────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
          tone="blue"
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
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Growth chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="size-4 text-primary" />
                  Schools Growth
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  New schools onboarded over the last 12 months
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-[10px] gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Live
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* Status donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schools by Status</CardTitle>
            <CardDescription className="text-xs mt-0.5">Distribution across {statusTotal} schools</CardDescription>
          </CardHeader>
          <CardContent>
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
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
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
                      <span className="text-muted-foreground/60 w-9 text-right">{pct}%</span>
                    </div>
                  </div>
                )
              })}
              {statusData.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No schools yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Trial expiry + Recent schools ─────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-5">
        {/* Trial expiry */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="size-4 text-amber-600" />
                  Trials Expiring Soon
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Within the next 7 days
                </CardDescription>
              </div>
              {trialExpiryList.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {trialExpiryList.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {trialExpiryList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <div className="size-8 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                </div>
                <p className="text-sm font-medium">All clear</p>
                <p className="text-xs text-muted-foreground mt-0.5">No trials expiring this week</p>
              </div>
            ) : (
              <div className="space-y-2">
                {trialExpiryList.map((s) => {
                  const days = daysUntil(s.trialEndsAt)
                  const urgent = days <= 2
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10">
                          <Building2 className="size-4 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{s.subdomain}.vidhyalayam.com</p>
                        </div>
                      </div>
                      <Badge
                        variant={urgent ? 'destructive' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent schools */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="size-4 text-primary" />
                  Recent Schools
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Newest schools onboarded to the platform
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={go('schools')}>
                View all
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {schools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <Building2 className="size-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No schools yet</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Onboard your first school to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schools.slice(0, 5).map((school) => (
                  <div
                    key={school.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                        <Building2 className="size-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{school.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {school.subdomain}.vidhyalayam.com
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {typeof school.studentCount === 'number' && (
                        <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
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
          </CardContent>
        </Card>
      </section>

      {/* ── Quick actions ─────────────────────────────────────────────── */}
    </div>
  )
}
