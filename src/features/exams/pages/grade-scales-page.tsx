'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState, TintedStatCard } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  GraduationCap,
  ListOrdered,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'

interface GradeBand {
  id?: string
  code: string
  minValue: number
  maxValue: number
  gradePoint: number | null
  remark: string | null
  sequence: number
}

interface GradeScale {
  id: string
  name: string
  scaleType: string
  isActive: boolean
  isDefault: boolean
  paradigmId: string | null
  examGroupId: string | null
  classId: string | null
  bands: GradeBand[]
}

interface ClassOption {
  id: string
  name: string
}

const SCALE_TYPES = ['percentage', 'marks', 'cgpa']

function makeBand(
  code: string,
  min: number,
  max: number,
  gp: number | null,
  seq: number,
  remark: string | null = null,
): GradeBand {
  return { code, minValue: min, maxValue: max, gradePoint: gp, remark, sequence: seq }
}

const CBSE_PRESET: GradeBand[] = [
  makeBand('A1', 91, 100, 10, 0, 'Outstanding'),
  makeBand('A2', 81, 90, 9, 1, 'Excellent'),
  makeBand('B1', 71, 80, 8, 2, 'Very Good'),
  makeBand('B2', 61, 70, 7, 3, 'Good'),
  makeBand('C1', 51, 60, 6, 4, 'Fair'),
  makeBand('C2', 41, 50, 5, 5, 'Average'),
  makeBand('D', 33, 40, 4, 6, 'Marginal / Pass'),
  makeBand('E1', 21, 32, null, 7, 'Needs Improvement'),
  makeBand('E2', 0, 20, null, 8, 'Needs Immediate Attention'),
]

function getGradeColorStyle(code: string, minValue: number) {
  const c = code.toUpperCase().trim()
  if (c.startsWith('A') || minValue >= 80) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200/90 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
  }
  if (c.startsWith('B') || minValue >= 65) {
    return 'bg-sky-50 text-sky-800 border-sky-200/90 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60'
  }
  if (c.startsWith('C') || minValue >= 45) {
    return 'bg-violet-50 text-violet-800 border-violet-200/90 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60'
  }
  if (c === 'D' || minValue >= 33) {
    return 'bg-amber-50 text-amber-800 border-amber-200/90 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
  }
  return 'bg-rose-50 text-rose-800 border-rose-200/90 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
}

function validateBands(bands: GradeBand[]): string | null {
  if (bands.length === 0) return 'At least one band required.'
  const seenCodes = new Set<string>()
  for (const b of bands) {
    if (!b.code.trim()) return 'Each band needs a code.'
    const key = b.code.trim().toLowerCase()
    if (seenCodes.has(key)) return `Duplicate code "${b.code}".`
    seenCodes.add(key)
    if (b.maxValue < b.minValue) return `"${b.code}" max must be >= min.`
  }
  const sorted = [...bands].sort((a, b) => a.minValue - b.minValue)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minValue < sorted[i - 1].maxValue) {
      return `"${sorted[i - 1].code}" and "${sorted[i].code}" overlap. Adjust ranges.`
    }
  }
  return null
}

export function GradeScalesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [scales, setScales] = useState<GradeScale[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [editing, setEditing] = useState<GradeScale | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GradeScale | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [creatingPreset, setCreatingPreset] = useState(false)

  // Filters & Expanded State
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all')
  const [scopeFilter, setScopeFilter] = useState<'all' | '__school' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'default'>('all')
  const [expandedScaleIds, setExpandedScaleIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [scalesRes, classesRes] = await Promise.all([
        api.get<{ scales: GradeScale[] }>('/api/school/exams/grade-scales'),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
      ])
      setScales(scalesRes.scales)
      setClasses(classesRes.classes)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load grade scales',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  function toggleExpand(id: string) {
    setExpandedScaleIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSetDefault(scale: GradeScale) {
    try {
      await api.patch(`/api/school/exams/grade-scales/${scale.id}`, { isDefault: true })
      toast({
        variant: 'success',
        title: 'Default scale updated',
        description: `"${scale.name}" is now the school-wide default grading scale.`,
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

  async function handleToggleActive(scale: GradeScale) {
    try {
      await api.patch(`/api/school/exams/grade-scales/${scale.id}`, { isActive: !scale.isActive })
      toast({
        variant: 'success',
        title: scale.isActive ? 'Scale deactivated' : 'Scale activated',
        description: `"${scale.name}" is now ${scale.isActive ? 'inactive' : 'active'}.`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not update scale',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  async function handleDuplicate(scale: GradeScale) {
    try {
      const res = await api.post<{ scale: { id: string } }>('/api/school/exams/grade-scales', {
        name: `${scale.name} (Copy)`,
        scaleType: scale.scaleType,
        isActive: scale.isActive,
        isDefault: false,
        classId: scale.classId,
      })
      if (res.scale?.id && scale.bands?.length) {
        const cleanBands = scale.bands.map((b, idx) => ({
          code: b.code,
          minValue: b.minValue,
          maxValue: b.maxValue,
          gradePoint: b.gradePoint,
          remark: b.remark,
          sequence: idx,
        }))
        await api.post(`/api/school/exams/grade-scales/${res.scale.id}/bands`, { bands: cleanBands })
      }
      toast({
        variant: 'success',
        title: 'Scale duplicated',
        description: `Created a copy of "${scale.name}".`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not duplicate',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  async function handleCreateCBSEDefault() {
    setCreatingPreset(true)
    try {
      const res = await api.post<{ scale: { id: string } }>('/api/school/exams/grade-scales', {
        name: 'CBSE 9-point',
        scaleType: 'percentage',
        isActive: true,
        isDefault: scales.length === 0,
        classId: null,
      })
      if (res.scale?.id) {
        await api.post(`/api/school/exams/grade-scales/${res.scale.id}/bands`, {
          bands: CBSE_PRESET,
        })
      }
      toast({
        variant: 'success',
        title: 'CBSE 9-Point Scale created',
        description: 'Successfully set up with 9 standard grade bands and remarks.',
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not create CBSE scale',
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
      await api.delete(`/api/school/exams/grade-scales/${deleteTarget.id}`)
      toast({ variant: 'success', title: 'Grade scale deleted' })
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

  // Filtered scales
  const filteredScales = useMemo(() => {
    return scales.filter((scale) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        scale.name.toLowerCase().includes(q) ||
        scale.bands.some(
          (b) =>
            b.code.toLowerCase().includes(q) ||
            (b.remark && b.remark.toLowerCase().includes(q)),
        )
      const matchesType = typeFilter === 'all' || scale.scaleType === typeFilter
      const matchesScope =
        scopeFilter === 'all' ||
        (scopeFilter === '__school' ? !scale.classId : scale.classId === scopeFilter)
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && scale.isActive) ||
        (statusFilter === 'inactive' && !scale.isActive) ||
        (statusFilter === 'default' && scale.isDefault)

      return matchesSearch && matchesType && matchesScope && matchesStatus
    })
  }, [scales, searchQuery, typeFilter, scopeFilter, statusFilter])

  const defaultScale = useMemo(() => scales.find((s) => s.isDefault), [scales])
  const totalBandsCount = useMemo(() => scales.reduce((acc, s) => acc + s.bands.length, 0), [scales])

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    typeFilter !== 'all' ||
    scopeFilter !== 'all' ||
    statusFilter !== 'all'

  function resetFilters() {
    setSearchQuery('')
    setTypeFilter('all')
    setScopeFilter('all')
    setStatusFilter('all')
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <GradientHero
        icon={Award}
        title="Grade Scales"
        description="Configure letter-grade boundaries, grade points, and report card remarks across percentage, marks, or CGPA systems."
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'New Scale',
                icon: Plus,
                onClick: () => setEditing('new'),
              }
            : undefined
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TintedStatCard
          icon={Award}
          label="Grade Scales"
          value={scales.length}
          note="Configured grading systems"
          tone="sky"
        />
        <TintedStatCard
          icon={Star}
          label="Default Scale"
          value={defaultScale ? defaultScale.name : 'Not set'}
          note={defaultScale ? `${defaultScale.bands.length} bands configured` : 'Set a default scale'}
          tone="amber"
        />
        <TintedStatCard
          icon={CheckCircle2}
          label="Active Scales"
          value={scales.filter((s) => s.isActive).length}
          note="Available for report cards"
          tone="violet"
        />
        <TintedStatCard
          icon={ListOrdered}
          label="Grade Bands"
          value={totalBandsCount}
          note="Across all scales"
          tone="emerald"
        />
      </div>

      {scales.length === 0 ? (
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-8 text-center shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-md">
            <Award className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">No grade scales configured yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Grade scales translate marks and percentages into letter grades (A1, A2, B1...) and
            automatic student remarks on report cards.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              className="gap-2 bg-gradient-to-r from-sky-600 to-violet-600 text-xs font-semibold text-white shadow-md hover:from-sky-700 hover:to-violet-700"
              onClick={() => void handleCreateCBSEDefault()}
              disabled={creatingPreset}
            >
              {creatingPreset ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {creatingPreset ? 'Setting up…' : 'Create CBSE 9-Point Scale'}
            </Button>
            <Button
              variant="outline"
              className="gap-1.5 text-xs font-semibold"
              onClick={() => setEditing('new')}
            >
              <Plus className="size-3.5" />
              Create Custom Scale
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
                placeholder="Search scales by name, grade code (e.g. A1), or remark..."
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
              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-[130px] bg-white dark:bg-background text-xs capitalize">
                  <SelectValue placeholder="Scale Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {SCALE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Scope Filter */}
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="h-9 w-[140px] bg-white dark:bg-background text-xs">
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="__school">School-wide</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
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

          {/* Scale Cards Grid or Empty Search */}
          {filteredScales.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-800">
              <Search className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold text-foreground">No matching grade scales</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Try clearing your search query or loosening your filters.
              </p>
              <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 h-8 text-xs">
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredScales.map((scale) => {
                const isExpanded = expandedScaleIds.has(scale.id)
                const visibleBands = isExpanded ? scale.bands : scale.bands.slice(0, 4)
                const hasMoreBands = scale.bands.length > 4
                const assignedClass = classes.find((c) => c.id === scale.classId)

                return (
                  <Card
                    key={scale.id}
                    className={cn(
                      'group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-gradient-to-br transition-all duration-200 hover:-translate-y-1 hover:shadow-lg',
                      scale.isDefault
                        ? 'border-amber-300/80 from-amber-50/40 via-white to-sky-50/40 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10 dark:via-card dark:to-sky-500/10'
                        : 'border-sky-200/80 from-sky-50/40 via-white to-violet-50/30 shadow-2xs dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10',
                    )}
                  >
                    <div>
                      {/* Card Header */}
                      <CardHeader className="p-4 pb-3 border-b border-slate-100 bg-white/60 dark:border-slate-800/80 dark:bg-card/60">
                        {/* Meta Tags Row */}
                        <div className="flex items-center justify-between gap-1.5 pb-2 text-[10px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Default Badge */}
                            {scale.isDefault && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-bold text-amber-900 shadow-2xs dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-300">
                                <Star className="size-3 fill-amber-500 text-amber-600 dark:fill-amber-400" />
                                Default Scale
                              </span>
                            )}

                            {/* Active / Inactive */}
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[10px]',
                                scale.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
                              )}
                            >
                              {scale.isActive ? 'Active' : 'Inactive'}
                            </span>

                            {/* Scope Pill */}
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-medium text-slate-700 dark:border-slate-700 dark:bg-background dark:text-slate-300">
                              {assignedClass ? (
                                <>
                                  <GraduationCap className="size-3 text-violet-600" />
                                  <span>{assignedClass.name}</span>
                                </>
                              ) : (
                                <>
                                  <Globe className="size-3 text-sky-600" />
                                  <span>School-wide</span>
                                </>
                              )}
                            </span>

                            {/* Scale Type */}
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {scale.scaleType}
                            </span>
                          </div>

                          {/* Dropdown Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-foreground">
                                <MoreVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                                <>
                                  <DropdownMenuItem onClick={() => setEditing(scale)}>
                                    <Pencil className="mr-2 size-4" /> Edit Scale & Bands
                                  </DropdownMenuItem>
                                  {!scale.isDefault && (
                                    <DropdownMenuItem onClick={() => void handleSetDefault(scale)}>
                                      <Star className="mr-2 size-4 text-amber-500" /> Set as School Default
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => void handleDuplicate(scale)}>
                                    <Copy className="mr-2 size-4" /> Duplicate Scale
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleToggleActive(scale)}>
                                    <Power className="mr-2 size-4" />
                                    {scale.isActive ? 'Deactivate Scale' : 'Activate Scale'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {!scale.isDefault ? (
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteTarget(scale)}
                                    >
                                      <Trash2 className="mr-2 size-4" /> Delete Scale
                                    </DropdownMenuItem>
                                  ) : (
                                    <div className="px-2 py-1 text-[10px] text-muted-foreground italic">
                                      Default scale cannot be deleted
                                    </div>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Title and Icon */}
                        <div className="flex items-center gap-3 pt-1">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 text-white shadow-sm">
                            <Award className="size-5 text-white" />
                          </span>
                          <div className="min-w-0">
                            <CardTitle className="text-base font-bold text-foreground truncate">
                              {scale.name}
                            </CardTitle>
                            <p className="text-[11px] text-muted-foreground">
                              {scale.bands.length} grade band{scale.bands.length === 1 ? '' : 's'} configured
                            </p>
                          </div>
                        </div>
                      </CardHeader>

                      {/* Card Content - Bands Preview */}
                      <CardContent className="p-4 space-y-2">
                        {scale.bands.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-slate-200 py-4 text-center text-xs text-muted-foreground dark:border-slate-800">
                            No grade bands configured yet
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {visibleBands.map((b) => {
                              const colorStyle = getGradeColorStyle(b.code, b.minValue)
                              return (
                                <div
                                  key={b.id ?? b.code}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2.5 py-1.5 text-xs transition-colors hover:bg-slate-100/90 dark:border-slate-800/80 dark:bg-slate-900/40 dark:hover:bg-slate-900/80"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className={cn(
                                        'inline-flex items-center justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-black shadow-2xs',
                                        colorStyle,
                                      )}
                                    >
                                      {b.code}
                                    </span>
                                    <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                      {b.minValue}–{b.maxValue}
                                      {scale.scaleType === 'percentage' ? '%' : ''}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5 min-w-0 justify-end">
                                    {b.gradePoint !== null && (
                                      <span className="rounded bg-sky-100/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-800 dark:bg-sky-950/70 dark:text-sky-300">
                                        {b.gradePoint} GP
                                      </span>
                                    )}
                                    {b.remark ? (
                                      <span
                                        className="truncate max-w-[130px] rounded-md bg-violet-100/80 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-950/70 dark:text-violet-300"
                                        title={b.remark}
                                      >
                                        {b.remark}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}

                            {hasMoreBands && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(scale.id)}
                                className="flex w-full items-center justify-center gap-1 pt-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="size-3.5" />
                                    Show fewer bands
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="size-3.5" />
                                    View all {scale.bands.length} bands (+{scale.bands.length - 4} more)
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </div>

                    {/* Card Footer Quick Actions */}
                    <CardFooter className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 p-3 px-4 dark:border-slate-800/80 dark:bg-slate-900/30">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 border-sky-300/80 bg-white text-xs font-semibold text-sky-800 shadow-2xs hover:bg-sky-50 dark:border-sky-500/30 dark:bg-card dark:text-sky-300"
                          onClick={() => setEditing(scale)}
                        >
                          <Pencil className="size-3.5" />
                          Edit Scale
                        </Button>

                        {!scale.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                            onClick={() => void handleSetDefault(scale)}
                            title="Set as school default"
                          >
                            <Star className="size-3.5 fill-amber-400 text-amber-500" />
                            Set Default
                          </Button>
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground transition hover:text-foreground"
                        onClick={() => void handleDuplicate(scale)}
                        title="Duplicate this scale"
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Scale Dialog */}
      <GradeScaleEditDialog
        open={editing !== null}
        target={editing}
        classes={classes}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={async (payload, bandPayload, id) => {
          setSaving(true)
          try {
            let savedId = id
            if (id) {
              await api.patch(`/api/school/exams/grade-scales/${id}`, payload)
              toast({ variant: 'success', title: 'Scale updated' })
            } else {
              const res = await api.post<{ scale: { id: string } }>(
                '/api/school/exams/grade-scales',
                payload,
              )
              savedId = res.scale.id
              toast({ variant: 'success', title: 'Scale created' })
            }
            if (savedId && bandPayload) {
              await api.post(`/api/school/exams/grade-scales/${savedId}/bands`, bandPayload)
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

      {/* Delete Scale Confirmation Dialog */}
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
                <DialogTitle className="text-lg font-bold text-white">Delete this grade scale?</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  "{deleteTarget?.name}" will be permanently removed.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.04] via-background to-violet-500/[0.05] p-4 sm:p-5">
            <p className="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Default scales cannot be deleted. Exams already using this scale will keep their stored grades.</span>
            </p>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => void handleDelete()} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete scale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface GradeScaleEditDialogProps {
  open: boolean
  target: GradeScale | 'new' | null
  classes: ClassOption[]
  saving: boolean
  onClose: () => void
  onSave: (
    payload: Record<string, unknown>,
    bands: Record<string, unknown> | null,
    id?: string,
  ) => Promise<void>
}

function GradeScaleEditDialog({
  open,
  target,
  classes,
  saving,
  onClose,
  onSave,
}: GradeScaleEditDialogProps) {
  const isNew = target === 'new'
  const existing = !isNew && target ? target : null

  const [name, setName] = useState(existing?.name ?? '')
  const [scaleType, setScaleType] = useState(existing?.scaleType ?? 'percentage')
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false)
  const [classId, setClassId] = useState(existing?.classId ?? '')
  const [bands, setBands] = useState<GradeBand[]>(existing?.bands ?? [])

  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? '')
    setScaleType(existing?.scaleType ?? 'percentage')
    setIsActive(existing?.isActive ?? true)
    setIsDefault(existing?.isDefault ?? false)
    setClassId(existing?.classId ?? '')
    setBands(existing?.bands ?? [])
  }, [open, existing])

  const bandError = validateBands(bands)

  const valid = name.trim().length > 0 && !bandError

  function updateBand(idx: number, patch: Partial<GradeBand>) {
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }
  function removeBand(idx: number) {
    setBands((prev) => prev.filter((_, i) => i !== idx))
  }
  function addBand() {
    setBands((prev) => [
      ...prev,
      { code: '', minValue: 0, maxValue: 100, gradePoint: null, remark: '', sequence: prev.length },
    ])
  }
  function applyCBSEPreset() {
    setBands(JSON.parse(JSON.stringify(CBSE_PRESET)))
  }

  async function handleSave() {
    if (!valid) return
    const payload = {
      ...(isNew ? {} : {}),
      name: name.trim(),
      scaleType,
      isActive,
      isDefault,
      classId: classId || null,
    }
    const cleanBands = bands.map((b) => ({
      ...b,
      remark: b.remark?.trim() || null,
    }))
    await onSave(
      payload,
      { bands: cleanBands },
      existing?.id,
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-sky-500/20 bg-card p-0 shadow-2xl shadow-sky-500/15 sm:max-w-3xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7_0%,#2563eb_48%,#7c3aed_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-sky-300/20 blur-2xl" />
          <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-violet-300/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              {isNew ? <Plus className="size-5 text-white" /> : <Pencil className="size-5 text-white" />}
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-normal text-white">
                {isNew ? 'New Grade Scale' : 'Edit Grade Scale'}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                {isNew
                  ? 'Define the letter-grade bands and report card remarks.'
                  : `Update "${existing?.name}" and its grade bands.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.03] via-background to-violet-500/[0.055] p-4 sm:p-5">
          {/* Section 1: Scale Details */}
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                <Award className="size-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Scale Details</h3>
                <p className="text-[10px] text-muted-foreground">Name, scale type, and applicable class scope</p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-6">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Scale Name</Label>
                <Input
                  className="mt-1 h-9 bg-white dark:bg-background"
                  placeholder="e.g. CBSE 9-point"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="sm:col-span-3">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Scale Type</Label>
                <Select value={scaleType} onValueChange={(v) => setScaleType(v)}>
                  <SelectTrigger className="mt-1 h-9 capitalize bg-white dark:bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SCALE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-3">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-200">Applicable Scope</Label>
                <Select value={classId || '__school'} onValueChange={(v) => setClassId(v === '__school' ? '' : v)}>
                  <SelectTrigger className="mt-1 h-9 bg-white dark:bg-background"><SelectValue placeholder="School-wide" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__school">School-wide</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-3 pt-1 text-xs">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200/80 bg-white/80 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-white dark:border-sky-500/25 dark:bg-card/80 dark:text-slate-200 shadow-2xs">
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Active Scale</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200/80 bg-white/80 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-white dark:border-sky-500/25 dark:bg-card/80 dark:text-slate-200 shadow-2xs">
                <input
                  type="checkbox"
                  className="size-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span>Set as Default Scale</span>
              </label>
            </div>
          </section>

          {/* Section 2: Grade Bands & Remarks */}
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10 sm:p-5">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-violet-200/35 blur-xl dark:bg-violet-500/15" />
            <div className="relative mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm">
                  <ListOrdered className="size-4 text-white" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Grade Bands & Remarks</h3>
                  <p className="text-[10px] text-muted-foreground">
                    Define percentage ranges, grade points, and remarks shown on report cards
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-sky-300/80 bg-white text-xs font-semibold text-sky-800 shadow-2xs hover:bg-sky-50 hover:text-sky-900 dark:border-sky-500/30 dark:bg-card dark:text-sky-300"
                  onClick={applyCBSEPreset}
                >
                  <Star className="size-3.5 fill-amber-400 text-amber-500" />
                  Use CBSE Preset
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-violet-300/80 bg-white text-xs font-semibold text-violet-800 shadow-2xs hover:bg-violet-50 hover:text-violet-900 dark:border-violet-500/30 dark:bg-card dark:text-violet-300"
                  onClick={addBand}
                >
                  <Plus className="size-3.5" />
                  Add Band
                </Button>
              </div>
            </div>

            {bandError && (
              <p className="mt-2 mb-3 flex items-center gap-1.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{bandError}</span>
              </p>
            )}

            {/* Column Headers */}
            <div className="hidden sm:grid grid-cols-12 gap-2 rounded-t-lg border border-b-0 border-sky-200/90 bg-sky-100/80 px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-200">
              <span className="col-span-2">Grade Code</span>
              <span className="col-span-2 text-center">Min %</span>
              <span className="col-span-2 text-center">Max %</span>
              <span className="col-span-1 text-center">GP</span>
              <span className="col-span-4">Remark (Report Card)</span>
              <span className="col-span-1 text-right">Action</span>
            </div>

            {/* Bands Rows */}
            <div className="space-y-1.5 sm:space-y-0 sm:divide-y sm:divide-sky-100 sm:rounded-b-lg sm:border sm:border-sky-200/90 sm:bg-white dark:sm:divide-sky-500/15 dark:sm:border-sky-500/30 dark:sm:bg-card shadow-2xs">
              {bands.map((b, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center rounded-lg sm:rounded-none bg-white p-2.5 sm:px-3 sm:py-2 transition-colors hover:bg-sky-50/50 dark:bg-card dark:hover:bg-sky-500/5"
                >
                  {/* Grade Code */}
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="sm:hidden text-[9px] font-bold text-muted-foreground uppercase">Grade</Label>
                    <Input
                      className="h-8 font-mono text-xs font-black uppercase text-[#0a4d8c] dark:text-sky-300 bg-sky-50/50 sm:bg-transparent"
                      placeholder="A1"
                      value={b.code}
                      onChange={(e) => updateBand(idx, { code: e.target.value })}
                    />
                  </div>

                  {/* Min */}
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="sm:hidden text-[9px] font-bold text-muted-foreground uppercase">Min</Label>
                    <Input
                      type="number"
                      className="h-8 font-mono text-xs text-center tabular-nums"
                      placeholder="0"
                      value={b.minValue}
                      onChange={(e) => updateBand(idx, { minValue: Number(e.target.value) || 0 })}
                    />
                  </div>

                  {/* Max */}
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="sm:hidden text-[9px] font-bold text-muted-foreground uppercase">Max</Label>
                    <Input
                      type="number"
                      className="h-8 font-mono text-xs text-center tabular-nums"
                      placeholder="100"
                      value={b.maxValue}
                      onChange={(e) => updateBand(idx, { maxValue: Number(e.target.value) || 0 })}
                    />
                  </div>

                  {/* Grade Point */}
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="sm:hidden text-[9px] font-bold text-muted-foreground uppercase">GP</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      className="h-8 font-mono text-xs text-center tabular-nums px-1"
                      placeholder="—"
                      value={b.gradePoint ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateBand(idx, { gradePoint: v === '' ? null : Number(v) })
                      }}
                    />
                  </div>

                  {/* Remark */}
                  <div className="col-span-7 sm:col-span-4">
                    <Label className="sm:hidden text-[9px] font-bold text-muted-foreground uppercase">Remark</Label>
                    <Input
                      className="h-8 text-xs font-medium placeholder:text-muted-foreground/50"
                      placeholder="e.g. Outstanding"
                      value={b.remark ?? ''}
                      onChange={(e) => updateBand(idx, { remark: e.target.value || null })}
                    />
                  </div>

                  {/* Delete button */}
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                      onClick={() => removeBand(idx)}
                      title="Remove grade band"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="text-[11px] font-medium text-muted-foreground">
              <span className="font-bold text-foreground">{bands.length}</span> grade band{bands.length === 1 ? '' : 's'} configured
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-gradient-to-r from-sky-600 to-violet-600 px-4 text-xs font-semibold text-white shadow-sm hover:from-sky-700 hover:to-violet-700 disabled:opacity-50"
                onClick={() => void handleSave()}
                disabled={!valid || saving}
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {saving ? 'Saving…' : isNew ? 'Create Scale' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
