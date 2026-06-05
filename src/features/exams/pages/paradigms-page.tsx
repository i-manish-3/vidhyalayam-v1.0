'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
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
import {
  AggregationRuleBuilder,
  type AggregationRule,
} from '@/features/exams/components/aggregation-rule-builder'
import { Layers, MoreVertical, Pencil, Plus, Star, Trash2 } from 'lucide-react'

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
        api.get<{ academicYears: AcademicYear[] }>('/api/school/academic-years'),
      ])
      setParadigms(paradigmsRes.paradigms)
      setYears(yearsRes.academicYears)
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
      <PageHeader
        title="Exam patterns"
        description="An exam pattern defines an academic year's exam framework — its terms, weighting, and passing rules."
        backAction={{ onClick: () => router.push('/exams'), label: 'Back to exams' }}
        action={{
          label: 'New exam pattern',
          icon: Plus,
          onClick: () => setEditing('new'),
        }}
      />

      {paradigms.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No exam patterns yet"
          description='Create your first exam pattern — e.g. "CBSE Term Pattern 2026-27".'
          action={{ label: 'Create exam pattern', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paradigms.map((p) => (
            <Card key={p.id} className="group transition hover:border-primary/40 hover:shadow-sm">
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
                      <DropdownMenuItem onClick={() => setEditing(p)}>
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/exams/paradigms/${p.id}/groups`)}>
                        <Layers className="mr-2 size-4" /> Manage groups
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="mr-2 size-4" /> Delete
                      </DropdownMenuItem>
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
                    onClick={() => router.push(`/exams/paradigms/${p.id}/groups`)}
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New exam pattern' : `Edit ${existing?.name}`}</DialogTitle>
          <DialogDescription>
            An exam pattern groups its exams under shared aggregation and passing rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Academic year</Label>
              <Select
                value={academicYear}
                onValueChange={setAcademicYear}
                disabled={!isNew}
              >
                <SelectTrigger className="h-9">
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
                className="h-9"
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
            />
          </div>

          <AggregationRuleBuilder
            value={agg}
            onChange={setAgg}
            items={[]}
            itemNoun="group"
          />

          <div className="rounded-lg border bg-card p-4">
            <Label className="text-sm font-medium">Passing rule</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Minimum percentages and grace allowance.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Per subject %
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-9"
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
                  className="h-9"
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
                  className="h-9"
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
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving ? 'Saving…' : isNew ? 'Create exam pattern' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
