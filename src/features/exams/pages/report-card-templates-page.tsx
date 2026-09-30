'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, TintedStatCard } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { cn } from '@/lib/utils'
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Layers,
  LayoutTemplate,
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

interface ReportCardTemplate {
  id: string
  name: string
  description: string | null
  format: string
  appliesToParadigmId: string | null
  includeAttendance: boolean
  includeRank: boolean
  includeCoScholastic: boolean
  showPrincipalRemarks: boolean
  showTeacherRemarks: boolean
  isDefault: boolean
  isActive: boolean
}

const FORMAT_CONFIG: Record<
  string,
  { label: string; cls: string; desc: string }
> = {
  cbse: {
    label: 'CBSE 2-Term',
    cls: 'bg-blue-50 text-blue-800 border-blue-200/90 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    desc: 'Dual-term evaluation with scholastic & co-scholastic grading',
  },
  term_wise: {
    label: 'Term-Wise',
    cls: 'bg-violet-50 text-violet-800 border-violet-200/90 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60',
    desc: 'Structured term-by-term assessment breakdown',
  },
  simple: {
    label: 'Standard Marks',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200/90 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    desc: 'Clean single-exam subject marks, totals, and percentages',
  },
  grade_only: {
    label: 'Grade Only',
    cls: 'bg-amber-50 text-amber-800 border-amber-200/90 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    desc: 'Letter grades without raw numerical marks',
  },
  coaching: {
    label: 'Competitive / Test',
    cls: 'bg-rose-50 text-rose-800 border-rose-200/90 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    desc: 'Rank, percentile, and negative marking analysis',
  },
}

export function ReportCardTemplatesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<ReportCardTemplate[]>([])
  const [deleteTarget, setDeleteTarget] = useState<ReportCardTemplate | null>(null)
  const [busy, setBusy] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [formatFilter, setFormatFilter] = useState<'all' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'default'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ templates: ReportCardTemplate[] }>(
        '/api/school/exams/report-card-templates',
      )
      setTemplates(res.templates)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load templates',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  function handleCreate() {
    router.push('/exams/report-card-templates/new/edit')
  }

  function handleClone(target: ReportCardTemplate) {
    router.push(`/exams/report-card-templates/new/edit?cloneFrom=${target.id}`)
  }

  async function handleSetDefault(target: ReportCardTemplate) {
    setBusy(true)
    try {
      await api.patch(`/api/school/exams/report-card-templates/${target.id}`, { isDefault: true })
      toast({
        variant: 'success',
        title: 'Default template updated',
        description: `"${target.name}" is now the school default template.`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleActive(target: ReportCardTemplate) {
    setBusy(true)
    try {
      await api.patch(`/api/school/exams/report-card-templates/${target.id}`, {
        isActive: !target.isActive,
      })
      toast({
        variant: 'success',
        title: target.isActive ? 'Template deactivated' : 'Template activated',
        description: `"${target.name}" is now ${target.isActive ? 'inactive' : 'active'}.`,
      })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not update template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api.delete(`/api/school/exams/report-card-templates/${deleteTarget.id}`)
      toast({ variant: 'success', title: 'Template deleted' })
      setDeleteTarget(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  // Filtered list
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      const matchesFormat = formatFilter === 'all' || t.format === formatFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && t.isActive) ||
        (statusFilter === 'inactive' && !t.isActive) ||
        (statusFilter === 'default' && t.isDefault)

      return matchesSearch && matchesFormat && matchesStatus
    })
  }, [templates, searchQuery, formatFilter, statusFilter])

  const defaultTemplate = useMemo(() => templates.find((t) => t.isDefault), [templates])
  const activeCount = useMemo(() => templates.filter((t) => t.isActive).length, [templates])
  const multiTermCount = useMemo(
    () => templates.filter((t) => t.format === 'cbse' || t.format === 'term_wise').length,
    [templates],
  )

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || formatFilter !== 'all' || statusFilter !== 'all'

  function resetFilters() {
    setSearchQuery('')
    setFormatFilter('all')
    setStatusFilter('all')
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <GradientHero
        icon={LayoutTemplate}
        title="Report Card Templates"
        description="Design and manage printable report card layouts. Customize school banners, grading tables, remarks, signatures, and attendance sections."
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'New Template',
                icon: Plus,
                onClick: handleCreate,
              }
            : undefined
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TintedStatCard
          icon={LayoutTemplate}
          label="Templates"
          value={templates.length}
          note="Configured layouts"
          tone="sky"
        />
        <TintedStatCard
          icon={Star}
          label="Default Template"
          value={defaultTemplate ? defaultTemplate.name : 'Not set'}
          note={defaultTemplate ? `${FORMAT_CONFIG[defaultTemplate.format]?.label ?? 'Standard'} format` : 'Set default layout'}
          tone="amber"
        />
        <TintedStatCard
          icon={CheckCircle2}
          label="Active Layouts"
          value={activeCount}
          note="Ready for print & download"
          tone="violet"
        />
        <TintedStatCard
          icon={Award}
          label="Multi-Term / CBSE"
          value={multiTermCount}
          note="Comprehensive formats"
          tone="emerald"
        />
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-2xs dark:border-slate-800 dark:bg-card">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 border border-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800 shadow-sm">
            <LayoutTemplate className="size-7" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">No report card templates yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Create a custom layout or clone the default CBSE template to start issuing professional report cards.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              className="gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 text-xs font-semibold text-white shadow-sm hover:from-sky-700 hover:to-indigo-700"
              onClick={handleCreate}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create First Template
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
                placeholder="Search templates by name or description..."
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
              {/* Format Filter */}
              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="h-9 w-[150px] bg-white dark:bg-background text-xs">
                  <SelectValue placeholder="Format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Formats</SelectItem>
                  {Object.entries(FORMAT_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label}
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

          {/* Templates Grid (Soft, Calm Card Styling - No Sharp Gradients) */}
          {filteredTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-800">
              <Search className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold text-foreground">No matching templates</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Try clearing your search query or adjusting your filters.
              </p>
              <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4 h-8 text-xs">
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((t) => {
                const fmt = FORMAT_CONFIG[t.format] ?? FORMAT_CONFIG.simple

                return (
                  <Card
                    key={t.id}
                    className={cn(
                      'group relative flex flex-col justify-between overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
                      t.isDefault
                        ? 'border-amber-200/90 bg-white/95 shadow-2xs dark:border-amber-500/30 dark:bg-card'
                        : 'border-slate-200/90 bg-white/95 shadow-2xs hover:border-sky-300/80 dark:border-slate-800 dark:bg-card dark:hover:border-sky-500/40',
                    )}
                  >
                    <div>
                      {/* Card Header (Clean & Soft) */}
                      <CardHeader className="p-4 pb-3 border-b border-slate-100 bg-slate-50/50 dark:border-slate-800/80 dark:bg-slate-900/20">
                        {/* Meta Badges Row */}
                        <div className="flex items-center justify-between gap-1.5 pb-2 text-[10px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Format Pill */}
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full border px-2.5 py-0.5 font-bold shadow-2xs',
                                fmt.cls,
                              )}
                            >
                              {fmt.label}
                            </span>

                            {/* Default Badge */}
                            {t.isDefault && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 font-bold text-amber-900 shadow-2xs dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-300">
                                <Star className="size-3 fill-amber-500 text-amber-600 dark:fill-amber-400" />
                                Default Layout
                              </span>
                            )}

                            {/* Active / Inactive */}
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 font-semibold text-[10px]',
                                t.isActive
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
                              )}
                            >
                              {t.isActive ? 'Active' : 'Inactive'}
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
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/exams/report-card-templates/${t.id}/edit`)}
                                  >
                                    <Pencil className="mr-2 size-4 text-sky-600" /> Customize Layout
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void handleClone(t)} disabled={busy}>
                                    <Copy className="mr-2 size-4" /> Clone Template
                                  </DropdownMenuItem>
                                  {!t.isDefault && (
                                    <DropdownMenuItem onClick={() => void handleSetDefault(t)} disabled={busy}>
                                      <Star className="mr-2 size-4 text-amber-500" /> Set as Default
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => void handleToggleActive(t)} disabled={busy}>
                                    <Power className="mr-2 size-4" />
                                    {t.isActive ? 'Deactivate Template' : 'Activate Template'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setDeleteTarget(t)}
                                    disabled={busy}
                                  >
                                    <Trash2 className="mr-2 size-4" /> Delete Template
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Title and Soft Icon */}
                        <div className="flex items-start gap-3 pt-1">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                            <LayoutTemplate className="size-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base font-bold text-foreground truncate">
                              {t.name}
                            </CardTitle>
                            {t.description ? (
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                                {t.description}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-xs text-muted-foreground italic">
                                {fmt.desc}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      {/* Card Content - Included Modules & Layout Highlights */}
                      <CardContent className="p-4 pt-3.5 space-y-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Included Modules
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {t.includeAttendance && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                              <Check className="size-3 text-emerald-600" />
                              Attendance
                            </span>
                          )}
                          {t.includeRank && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                              <Check className="size-3 text-emerald-600" />
                              Class Rank
                            </span>
                          )}
                          {t.includeCoScholastic && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                              <Check className="size-3 text-emerald-600" />
                              Co-Scholastic
                            </span>
                          )}
                          {(t.showTeacherRemarks || t.showPrincipalRemarks) && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                              <Check className="size-3 text-emerald-600" />
                              Teacher & Principal Remarks
                            </span>
                          )}
                          {!t.includeAttendance &&
                            !t.includeRank &&
                            !t.includeCoScholastic &&
                            !t.showTeacherRemarks &&
                            !t.showPrincipalRemarks && (
                              <span className="text-xs text-muted-foreground italic">
                                Minimal marksheet layout
                              </span>
                            )}
                        </div>
                      </CardContent>
                    </div>

                    {/* Card Footer Quick Actions */}
                    <CardFooter className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 p-3 px-4 dark:border-slate-800/80 dark:bg-slate-900/20">
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500"
                        onClick={() => router.push(`/exams/report-card-templates/${t.id}/edit`)}
                      >
                        <Pencil className="size-3.5" />
                        Customize Layout
                      </Button>

                      <div className="flex items-center gap-1">
                        {!t.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                            onClick={() => void handleSetDefault(t)}
                            disabled={busy}
                            title="Set as default template"
                          >
                            <Star className="size-3.5 fill-amber-400 text-amber-500" />
                            Default
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground transition hover:text-foreground"
                          onClick={() => void handleClone(t)}
                          disabled={busy}
                          title="Clone this template"
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

      {/* Delete Confirmation Modal (Conforming to AGENTS.md) */}
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
                <DialogTitle className="text-lg font-bold text-white">Delete this template?</DialogTitle>
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
                Existing report cards already issued will keep their stored format. Default templates should not be deleted.
              </span>
            </p>
          </div>
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 text-xs"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 px-4 text-xs"
              onClick={() => void handleDelete()}
              disabled={busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? 'Deleting…' : 'Delete template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
