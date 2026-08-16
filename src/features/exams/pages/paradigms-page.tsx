'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import {
  AggregationRuleBuilder,
  type AggregationRule,
} from '@/features/exams/components/aggregation-rule-builder'
import {
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  MoreVertical,
  Pencil,
  Percent,
  Plus,
  Sigma,
  Star,
  Trash2,
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
  perSubject: number
  overall: number
  allowGrace: boolean
  graceMax: number
}

function parseRule<T>(json: string, fallback: T): T {
  try {
    const v = JSON.parse(json)
    return typeof v === 'object' && v !== null ? (v as T) : fallback
  } catch {
    return fallback
  }
}

const DEFAULT_AGG: AggregationRule = { type: 'sum_all' }
const DEFAULT_PASSING: PassingRule = { perSubject: 33, overall: 33, allowGrace: true, graceMax: 5 }

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

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/exams/paradigms/${deleteTarget.id}`)
      toast({ title: 'Exam pattern deleted' })
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

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <GradientHero
        icon={Layers}
        title="Exam patterns"
        badge={`${paradigms.length} pattern${paradigms.length === 1 ? '' : 's'}`}
        description="An exam pattern defines an academic year's exam framework — its terms, weighting, and passing rules."
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'New exam pattern',
                icon: Plus,
                onClick: () => setEditing('new'),
              }
            : undefined
        }
      />

      {paradigms.length === 0 ? (
        <GradientEmptyState
          icon={Layers}
          title="No exam patterns yet"
          description='Create your first exam pattern — e.g. "CBSE Term Pattern 2026-27".'
          {...(hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? { actionLabel: 'Create exam pattern', onAction: () => setEditing('new') }
            : {})}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paradigms.map((p) => (
            <Card
              key={p.id}
              className="group gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold">{p.name}</h3>
                      {p.isDefault && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Star className="size-2.5 fill-current" /> Default
                        </Badge>
                      )}
                      {!p.isActive && (
                        <Badge variant="outline" className="text-[10px] text-amber-600">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.academicYear}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                        <>
                          <DropdownMenuItem onClick={() => setEditing(p)}>
                            <Pencil className="mr-2 size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/exams/patterns/${p.id}/groups`)}>
                            <Layers className="mr-2 size-4" /> Manage groups
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="mr-2 size-4" /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {p.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {p._count.examGroups} group{p._count.examGroups === 1 ? '' : 's'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) &&
                      router.push(`/exams/patterns/${p.id}/groups`)
                    }
                  >
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              toast({ title: 'Exam pattern updated' })
            } else {
              await api.post('/api/school/exams/paradigms', payload)
              toast({ title: 'Exam pattern created' })
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this exam pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be removed. Exam patterns with live exams cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function ParadigmEditDialog({ open, target, years, saving, onClose, onSave }: ParadigmEditDialogProps) {
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
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
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
                {isNew ? 'New exam pattern' : `Edit ${existing?.name}`}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                An exam pattern groups its exams under shared aggregation and passing rules.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.04] via-background to-violet-500/[0.055] p-4 sm:p-5">
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><FileText className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Basic details</h3><p className="text-[10px] text-muted-foreground">Academic year, name, and a short description</p></div>
            </div>
            <div className="relative space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Academic year</Label>
                  <Select
                    value={academicYear}
                    onValueChange={setAcademicYear}
                    disabled={!isNew}
                  >
                    <SelectTrigger className="h-9 bg-white shadow-sm dark:bg-input/30">
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
                  <Label className="text-xs">Name</Label>
                  <Input
                    className="h-9 bg-white shadow-sm dark:bg-input/30"
                    placeholder="CBSE Term Pattern 2026-27"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Textarea
                  rows={2}
                  placeholder="Two-term CBSE pattern with weighted aggregation."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-white dark:bg-input/30"
                />
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm"><Sigma className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Aggregation rule</h3><p className="text-[10px] text-muted-foreground">How group scores combine into the final result</p></div>
            </div>
            <AggregationRuleBuilder
              value={agg}
              onChange={setAgg}
              items={[]}
              itemNoun="group"
            />
          </section>

          <section className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm"><Percent className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Passing rule</h3><p className="text-[10px] text-muted-foreground">Minimum percentages and grace allowance</p></div>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Per subject %
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  value={passing.perSubject}
                  onChange={(e) =>
                    setPassing({ ...passing, perSubject: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Overall %
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  value={passing.overall}
                  onChange={(e) =>
                    setPassing({ ...passing, overall: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Grace max
                </Label>
                <Input
                  type="number"
                  min={0}
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  value={passing.graceMax}
                  onChange={(e) =>
                    setPassing({ ...passing, graceMax: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <input
                  id="allowGrace"
                  type="checkbox"
                  checked={passing.allowGrace}
                  onChange={(e) =>
                    setPassing({ ...passing, allowGrace: e.target.checked })
                  }
                />
                <Label htmlFor="allowGrace" className="text-xs">
                  Allow grace
                </Label>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><CheckCircle2 className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Status</h3><p className="text-[10px] text-muted-foreground">Activation and default preference for this year</p></div>
            </div>
            <div className="relative flex flex-wrap items-center gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                Default for this academic year
              </label>
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? 'Saving…' : isNew ? 'Create exam pattern' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
