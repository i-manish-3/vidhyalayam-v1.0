'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, TintedStatCard } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import {
  AggregationRuleBuilder,
  type AggregationRule,
} from '@/features/exams/components/aggregation-rule-builder'
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Copy,
  FileText,
  FolderKanban,
  Layers,
  Loader2,
  MoreVertical,
  Pencil,
  Percent,
  Plus,
  Power,
  RotateCcw,
  Search,
  Sigma,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'

interface Paradigm {
  id: string
  schoolId: string
  academicYear: string
  name: string
  description: string | null
  aggregationRule: string
  passingRule: string
  isActive: boolean
  isDefault: boolean
  _count: { examGroups: number }
}

interface AcademicYear {
  id: string
  name: string
  isCurrent: boolean
}

interface PassingRule {
  overall: number
}

function parseRule<T>(json: string, fallback: T): T {
  try {
    const v = JSON.parse(json)
    return typeof v === 'object' && v !== null ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function getAggregationLabel(ruleJson: string): string {
  try {
    const parsed = JSON.parse(ruleJson)
    if (parsed.type === 'weighted') return 'Weighted Avg'
    if (parsed.type === 'best_of_n') return `Best of ${parsed.bestOf ?? 'N'}`
    if (parsed.type === 'sum_all') return 'Sum of All'
    return parsed.type || 'Sum of All'
  } catch {
    return 'Sum of All'
  }
}

function getPassingLabel(ruleJson: string): string {
  try {
    const parsed = JSON.parse(ruleJson)
    if (parsed.overall !== undefined) return `${parsed.overall}% Pass`
    return '33% Pass'
  } catch {
    return '33% Pass'
  }
}

const DEFAULT_AGG: AggregationRule = { type: 'sum_all' }
const DEFAULT_PASSING: PassingRule = { overall: 33 }

export function ExamParadigmsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [paradigms, setParadigms] = useState<Paradigm[]>([])
  const [years, setYears] = useState<AcademicYear[]>([])
  const [editing, setEditing] = useState<Paradigm | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Paradigm | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [creatingPreset, setCreatingPreset] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState<'all' | string>('all')
  const [aggFilter, setAggFilter] = useState<'all' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'default'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [paradigmsRes, yearsRes] = await Promise.all([
        api.get<{ paradigms: Paradigm[] }>('/api/school/exams/paradigms'),
        api.get<{ years: AcademicYear[] }>('/api/school/academic-years'),
      ])
      setParadigms(paradigmsRes.paradigms)
      setYears(yearsRes.years)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load exam patterns',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSetDefault(target: Paradigm) {
    try {
      await api.patch(`/api/school/exams/paradigms/${target.id}`, { isDefault: true })
      toast({
        variant: 'success',
        title: 'Default pattern updated',
        description: `"${target.name}" is now default for ${target.academicYear}.`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not set default',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  async function handleToggleActive(target: Paradigm) {
    try {
      await api.patch(`/api/school/exams/paradigms/${target.id}`, { isActive: !target.isActive })
      toast({
        variant: 'success',
        title: target.isActive ? 'Pattern deactivated' : 'Pattern activated',
        description: `"${target.name}" is now ${target.isActive ? 'inactive' : 'active'}.`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not update pattern',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  async function handleDuplicate(target: Paradigm) {
    try {
      await api.post('/api/school/exams/paradigms', {
        name: `${target.name} (Copy)`,
        academicYear: target.academicYear,
        description: target.description,
        aggregationRule: parseRule(target.aggregationRule, DEFAULT_AGG),
        passingRule: parseRule(target.passingRule, DEFAULT_PASSING),
        isActive: target.isActive,
        isDefault: false,
      })
      toast({
        variant: 'success',
        title: 'Exam pattern duplicated',
        description: `Created a copy of "${target.name}".`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not duplicate pattern',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  async function handleCreateCBSEDefault() {
    setCreatingPreset(true)
    const currentYear = years.find((y) => y.isCurrent)?.name ?? years[0]?.name ?? '2026-27'
    try {
      const res = await api.post<{ paradigm: { id: string } }>('/api/school/exams/paradigms', {
        name: `CBSE Term Pattern ${currentYear}`,
        academicYear: currentYear,
        description: 'Standard two-term CBSE assessment framework with Term 1 & Term 2 evaluation.',
        aggregationRule: { type: 'sum_all' },
        passingRule: { overall: 33 },
        isActive: true,
        isDefault: paradigms.filter((p) => p.academicYear === currentYear).length === 0,
      })
      toast({
        variant: 'success',
        title: 'CBSE Term Pattern created',
        description: `Pattern created for ${currentYear}. You can now configure terms/groups.`,
      })
      void load()
      if (res?.paradigm?.id) {
        router.push(`/exams/patterns/${res.paradigm.id}/groups`)
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not create CBSE pattern',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setCreatingPreset(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/exams/paradigms/${deleteTarget.id}`)
      toast({ variant: 'success', title: 'Exam pattern deleted' })
      setDeleteTarget(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeleting(false)
    }
  }

  // Filtered paradigms
  const filteredParadigms = useMemo(() => {
    return paradigms.filter((p) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.academicYear.toLowerCase().includes(q)

      const matchesYear = yearFilter === 'all' || p.academicYear === yearFilter

      let matchesAgg = true
      if (aggFilter !== 'all') {
        const parsed = parseRule<AggregationRule>(p.aggregationRule, DEFAULT_AGG)
        matchesAgg = parsed.type === aggFilter
      }

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && p.isActive) ||
        (statusFilter === 'inactive' && !p.isActive) ||
        (statusFilter === 'default' && p.isDefault)

      return matchesSearch && matchesYear && matchesAgg && matchesStatus
    })
  }, [paradigms, searchQuery, yearFilter, aggFilter, statusFilter])

  const defaultPattern = useMemo(() => paradigms.find((p) => p.isDefault), [paradigms])
  const totalGroupsCount = useMemo(
    () => paradigms.reduce((acc, p) => acc + (p._count?.examGroups || 0), 0),
    [paradigms],
  )

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    yearFilter !== 'all' ||
    aggFilter !== 'all' ||
    statusFilter !== 'all'

  function resetFilters() {
    setSearchQuery('')
    setYearFilter('all')
    setAggFilter('all')
    setStatusFilter('all')
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <GradientHero
        icon={Layers}
        title="Exam Patterns"
        description="An exam pattern defines an academic year's exam framework — its terms, assessment weightings, and passing thresholds."
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'New Exam Pattern',
                icon: Plus,
                onClick: () => setEditing('new'),
              }
            : undefined
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TintedStatCard
          icon={Layers}
          label="Exam Patterns"
          value={paradigms.length}
          note="Configured frameworks"
          tone="sky"
        />
        <TintedStatCard
          icon={Star}
          label="Default Pattern"
          value={defaultPattern ? defaultPattern.name : 'Not set'}
          note={defaultPattern ? `${defaultPattern.academicYear}` : 'Set default for year'}
          tone="amber"
        />
        <TintedStatCard
          icon={CheckCircle2}
          label="Active Patterns"
          value={paradigms.filter((p) => p.isActive).length}
          note="Available for exams"
          tone="violet"
        />
        <TintedStatCard
          icon={FolderKanban}
          label="Exam Groups"
          value={totalGroupsCount}
          note="Terms, assessments & cycles"
          tone="emerald"
        />
      </div>

      {paradigms.length === 0 ? (
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-8 text-center shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-600 text-white shadow-md">
            <Layers className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">No exam patterns yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Exam patterns organize exams into structured terms (e.g., Term 1, Term 2, Pre-boards)
            with shared aggregation and passing rules.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              className="gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 text-xs font-semibold text-white shadow-md hover:from-sky-700 hover:to-indigo-700"
              onClick={() => void handleCreateCBSEDefault()}
              disabled={creatingPreset}
            >
              {creatingPreset ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {creatingPreset ? 'Setting up…' : 'Create CBSE Term Pattern'}
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-xs font-semibold"
              onClick={() => setEditing('new')}
            >
              <Plus className="size-3.5" />
              Create Custom Pattern
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white/70 p-3 shadow-2xs backdrop-blur-xs dark:border-slate-800 dark:bg-card/70 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patterns by name, academic year, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 pr-8 bg-white dark:bg-background text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Year Filter */}
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="h-9 w-[130px] bg-white dark:bg-background text-xs">
                  <SelectValue placeholder="Academic Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.name}>
                      {y.name}{y.isCurrent ? ' (current)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Aggregation Filter */}
              <Select value={aggFilter} onValueChange={setAggFilter}>
                <SelectTrigger className="h-9 w-[135px] bg-white dark:bg-background text-xs">
                  <SelectValue placeholder="Aggregation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Aggregations</SelectItem>
                  <SelectItem value="sum_all">Sum of All</SelectItem>
                  <SelectItem value="weighted">Weighted Avg</SelectItem>
                  <SelectItem value="best_of_n">Best of N</SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="h-9 w-[120px] bg-white dark:bg-background text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="inactive">Inactive Only</SelectItem>
                  <SelectItem value="default">Default Only</SelectItem>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="size-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {/* Patterns Grid or Empty Search */}
          {filteredParadigms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-800">
              <Search className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold text-foreground">No matching exam patterns</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Try clearing your search query or adjusting your filters.
              </p>
              <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 h-8 text-xs">
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredParadigms.map((p) => {
                const aggLabel = getAggregationLabel(p.aggregationRule)
                const passingLabel = getPassingLabel(p.passingRule)

                return (
                  <Card
                    key={p.id}
                    className={cn(
                      'group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-gradient-to-br transition-all duration-200 hover:-translate-y-1 hover:shadow-lg',
                      p.isDefault
                        ? 'border-amber-300/80 from-amber-50/40 via-white to-sky-50/40 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10 dark:via-card dark:to-sky-500/10'
                        : 'border-sky-200/80 from-sky-50/40 via-white to-indigo-50/30 shadow-2xs dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-indigo-500/10',
                    )}
                  >
                    <div>
                      {/* Card Header */}
                      <CardHeader className="p-4 pb-3 border-b border-slate-100 bg-white/60 dark:border-slate-800/80 dark:bg-card/60">
                        {/* Meta Tags Row */}
                        <div className="flex items-center justify-between gap-1.5 pb-2 text-[10px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Academic Year */}
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50/70 px-2.5 py-0.5 font-bold text-sky-800 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                              <Calendar className="size-3 text-sky-600" />
                              {p.academicYear}
                            </span>

                            {/* Default Badge */}
                            {p.isDefault && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-bold text-amber-900 shadow-2xs dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-300">
                                <Star className="size-3 fill-amber-500 text-amber-600 dark:fill-amber-400" />
                                Default
                              </span>
                            )}

                            {/* Active / Inactive */}
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[10px]',
                                p.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
                              )}
                            >
                              {p.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>

                          {/* Dropdown Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                              >
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-50">
                              {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                                <>
                                  <DropdownMenuItem onClick={() => router.push(`/exams/patterns/${p.id}/groups`)}>
                                    <FolderKanban className="mr-2 size-4 text-sky-600" /> Manage Terms & Groups
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setEditing(p)}>
                                    <Pencil className="mr-2 size-4" /> Edit Details
                                  </DropdownMenuItem>
                                  {!p.isDefault && (
                                    <DropdownMenuItem onClick={() => void handleSetDefault(p)}>
                                      <Star className="mr-2 size-4 text-amber-500" /> Set as Year Default
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => void handleDuplicate(p)}>
                                    <Copy className="mr-2 size-4" /> Duplicate Pattern
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleToggleActive(p)}>
                                    <Power className="mr-2 size-4" />
                                    {p.isActive ? 'Deactivate Pattern' : 'Activate Pattern'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(p)}
                                  >
                                    <Trash2 className="mr-2 size-4" /> Delete Pattern
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Title and Icon */}
                        <div className="flex items-start gap-3 pt-1">
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-600 text-white shadow-md">
                            <Layers className="size-5 text-white" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base font-bold text-foreground truncate">
                              {p.name}
                            </CardTitle>
                            {p.description ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                                {p.description}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-xs text-muted-foreground italic">
                                No description provided
                              </p>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      {/* Card Content - Configuration Metrics */}
                      <CardContent className="p-4 pt-3.5">
                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/40">
                          {/* Groups Metric */}
                          <div className="text-center border-r border-slate-200/80 pr-1 dark:border-slate-800">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Groups
                            </p>
                            <p className="mt-0.5 text-sm font-extrabold text-sky-700 dark:text-sky-300">
                              {p._count.examGroups}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Terms / phases</p>
                          </div>

                          {/* Aggregation Rule */}
                          <div className="text-center border-r border-slate-200/80 px-1 dark:border-slate-800">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Aggregation
                            </p>
                            <p className="mt-0.5 text-xs font-bold text-slate-800 truncate dark:text-slate-200">
                              {aggLabel}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Group weight</p>
                          </div>

                          {/* Passing Rule */}
                          <div className="text-center pl-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Passing
                            </p>
                            <p className="mt-0.5 text-xs font-bold text-emerald-700 truncate dark:text-emerald-300">
                              {passingLabel}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Min required</p>
                          </div>
                        </div>
                      </CardContent>
                    </div>

                    {/* Card Footer Quick Actions */}
                    <CardFooter className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 p-3 px-4 dark:border-slate-800/80 dark:bg-slate-900/30">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          className="h-8 gap-1.5 bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-600 px-3.5 text-xs font-semibold text-white shadow-2xs hover:from-sky-700 hover:to-violet-700"
                          onClick={() => router.push(`/exams/patterns/${p.id}/groups`)}
                        >
                          <FolderKanban className="size-3.5" />
                          Manage Groups
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-card dark:text-slate-300"
                          onClick={() => setEditing(p)}
                        >
                          <Pencil className="size-3" />
                          Edit
                        </Button>
                      </div>

                      <div className="flex items-center gap-1">
                        {!p.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                            onClick={() => void handleSetDefault(p)}
                            title="Set as default pattern for year"
                          >
                            <Star className="size-3.5 fill-amber-400 text-amber-500" />
                            Default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground transition hover:text-foreground"
                          onClick={() => void handleDuplicate(p)}
                          title="Duplicate this pattern"
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit / Create Pattern Dialog */}
      <ParadigmEditDialog
        open={editing !== null}
        target={editing}
        years={years}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={async (payload, id) => {
          setSaving(true)
          try {
            if (id) {
              await api.patch(`/api/school/exams/paradigms/${id}`, payload)
              toast({ variant: 'success', title: 'Exam pattern updated' })
            } else {
              await api.post('/api/school/exams/paradigms', payload)
              toast({ variant: 'success', title: 'Exam pattern created' })
            }
            setEditing(null)
            void load()
          } catch (err) {
            toast({
              variant: 'destructive',
              title: 'Could not save',
              description: err instanceof Error ? err.message : 'Please try again.',
            })
          } finally {
            setSaving(false)
          }
        }}
      />

      {/* Delete Pattern Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#dc2626_0%,#e11d48_48%,#7c3aed_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-rose-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-violet-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
                <Trash2 className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold text-white">Delete this exam pattern?</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  "{deleteTarget?.name}" will be removed.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.04] via-background to-violet-500/[0.05] p-4 sm:p-5">
            <p className="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Patterns with active or recorded exams cannot be deleted. Any unlinked configuration will be permanently purged.
              </span>
            </p>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 text-xs"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 px-4 text-xs"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete pattern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface ParadigmEditDialogProps {
  open: boolean
  target: Paradigm | 'new' | null
  years: AcademicYear[]
  saving: boolean
  onClose: () => void
  onSave: (payload: Record<string, unknown>, id?: string) => Promise<void>
}

function ParadigmEditDialog({
  open,
  target,
  years,
  saving,
  onClose,
  onSave,
}: ParadigmEditDialogProps) {
  const isNew = target === 'new'
  const existing = !isNew && target ? target : null

  const initialYear = useMemo(
    () => existing?.academicYear ?? years.find((y) => y.isCurrent)?.name ?? years[0]?.name ?? '',
    [existing, years],
  )
  const [academicYear, setAcademicYear] = useState(initialYear)
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false)
  const [agg, setAgg] = useState<AggregationRule>(
    existing ? parseRule(existing.aggregationRule, DEFAULT_AGG) : DEFAULT_AGG,
  )
  const [passing, setPassing] = useState<PassingRule>(
    existing ? parseRule(existing.passingRule, DEFAULT_PASSING) : DEFAULT_PASSING,
  )

  useEffect(() => {
    if (!open) return
    setAcademicYear(existing?.academicYear ?? years.find((y) => y.isCurrent)?.name ?? years[0]?.name ?? '')
    setName(existing?.name ?? '')
    setDescription(existing?.description ?? '')
    setIsActive(existing?.isActive ?? true)
    setIsDefault(existing?.isDefault ?? false)
    setAgg(existing ? parseRule(existing.aggregationRule, DEFAULT_AGG) : DEFAULT_AGG)
    setPassing(existing ? parseRule(existing.passingRule, DEFAULT_PASSING) : DEFAULT_PASSING)
  }, [open, existing, years])

  const valid = name.trim().length > 0 && academicYear.length > 0

  async function handleSave() {
    if (!valid) return
    const payload = {
      ...(isNew ? { academicYear } : {}),
      name: name.trim(),
      description: description.trim() || null,
      aggregationRule: agg,
      passingRule: passing,
      isActive,
      isDefault,
    }
    await onSave(payload, existing?.id)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-sky-500/20 bg-card p-0 shadow-2xl shadow-sky-500/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7_0%,#4f46e5_48%,#7c3aed_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-sky-300/20 blur-2xl" />
          <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-violet-300/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              <Layers className="size-5 text-white" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-normal text-white">
                {isNew ? 'New Exam Pattern' : `Edit "${existing?.name}"`}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                Configure academic year, aggregation framework, and passing criteria.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.03] via-background to-violet-500/[0.055] p-4 sm:p-5">
          {/* Section 1: Basic Details */}
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                <FileText className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Basic Details</h3>
                <p className="text-[10px] text-muted-foreground">Academic year, name, and description</p>
              </div>
            </div>

            <div className="relative space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Academic Year</Label>
                  <Select
                    value={academicYear}
                    onValueChange={setAcademicYear}
                    disabled={!isNew}
                  >
                    <SelectTrigger className="mt-1 h-9 bg-white dark:bg-background">
                      <SelectValue placeholder="Pick a year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={y.name}>
                          {y.name}{y.isCurrent ? ' (current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Pattern Name</Label>
                  <Input
                    className="mt-1 h-9 bg-white dark:bg-background"
                    placeholder="e.g. CBSE Term Pattern 2026-27"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Description (optional)</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. Two-term CBSE pattern with weighted aggregation across terms."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 bg-white dark:bg-background text-xs"
                />
              </div>
            </div>
          </section>

          {/* Section 2: Aggregation Rule */}
          <section className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10 sm:p-5">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-emerald-200/35 blur-xl dark:bg-emerald-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
                <Sigma className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Aggregation Rule</h3>
                <p className="text-[10px] text-muted-foreground">How group scores combine into the final report card result</p>
              </div>
            </div>
            <AggregationRuleBuilder
              value={agg}
              onChange={setAgg}
              items={[]}
              itemNoun="group"
            />
          </section>

          {/* Section 3: Passing Rule */}
          <section className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10 sm:p-5">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-amber-200/35 blur-xl dark:bg-amber-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
                <Percent className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Passing Rule</h3>
                <p className="text-[10px] text-muted-foreground">Minimum overall percentage required to pass</p>
              </div>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Overall Minimum Pass %
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="mt-1 h-9 bg-white dark:bg-background font-mono text-xs tabular-nums"
                  value={passing.overall}
                  onChange={(e) =>
                    setPassing({ ...passing, overall: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </section>

          {/* Section 4: Status & Defaults */}
          <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10 sm:p-5">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-violet-200/35 blur-xl dark:bg-violet-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                <CheckCircle2 className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Status & Preferences</h3>
                <p className="text-[10px] text-muted-foreground">Activation status and default preference for this year</p>
              </div>
            </div>
            <div className="relative mt-2 flex flex-wrap items-center gap-3 text-xs">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200/80 bg-white/80 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-white dark:border-violet-500/25 dark:bg-card/80 dark:text-slate-200 shadow-2xs">
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Active Pattern</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-violet-200/80 bg-white/80 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-white dark:border-violet-500/25 dark:bg-card/80 dark:text-slate-200 shadow-2xs">
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>Default Pattern for {academicYear || 'Year'}</span>
              </label>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:from-sky-700 hover:to-indigo-700 disabled:opacity-50"
            onClick={() => void handleSave()}
            disabled={!valid || saving}
          >
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            {saving ? 'Saving…' : isNew ? 'Create Pattern' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

