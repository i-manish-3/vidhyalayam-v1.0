'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  FileText,
  Layers,
  Loader2,
  MoreVertical,
  NotebookPen,
  Pencil,
  Plus,
  Sigma,
  Trash2,
} from 'lucide-react'

interface ExamGroup {
  id: string
  schoolId: string
  paradigmId: string
  name: string
  shortCode: string | null
  sequence: number
  weight: number
  aggregationRule: string | null
  isCoScholastic: boolean
  _count: { exams: number }
}

interface ParadigmDetail {
  id: string
  name: string
  academicYear: string
  examGroups: ExamGroup[]
}

function parseAgg(json: string | null): AggregationRule {
  if (!json) return { type: 'sum_all' }
  try {
    const v = JSON.parse(json)
    return typeof v === 'object' && v !== null ? (v as AggregationRule) : { type: 'sum_all' }
  } catch {
    return { type: 'sum_all' }
  }
}

interface Props {
  paradigmId: string
}

export function ParadigmGroupsPage({ paradigmId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [paradigm, setParadigm] = useState<ParadigmDetail | null>(null)
  const [editing, setEditing] = useState<ExamGroup | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExamGroup | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ paradigm: ParadigmDetail }>(
        `/api/school/exams/paradigms/${paradigmId}`,
      )
      setParadigm(res.paradigm)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load exam pattern',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [paradigmId, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/exams/groups/${deleteTarget.id}`)
      toast({ title: 'Term deleted' })
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
  if (!paradigm) return null

  return (
    <div className="space-y-6">
      <GradientHero
        icon={Layers}
        title={`Terms under "${paradigm.name}"`}
        badge={`${paradigm.examGroups.length} term${paradigm.examGroups.length === 1 ? '' : 's'}`}
        description={`${paradigm.academicYear} · organise exams under each term for term-level and final aggregation.`}
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'New term',
                icon: Plus,
                onClick: () => setEditing('new'),
              }
            : undefined
        }
      />

      {paradigm.examGroups.length === 0 ? (
        <GradientEmptyState
          icon={Layers}
          title="No terms yet"
          description='Add a term — e.g. "Term 1" — to start defining exams under this pattern.'
          {...(hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? { actionLabel: 'Create term', onAction: () => setEditing('new') }
            : {})}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paradigm.examGroups.map((g) => (
            <Card
              key={g.id}
              className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold">{g.name}</h3>
                      {g.shortCode && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {g.shortCode}
                        </Badge>
                      )}
                      {g.isCoScholastic && (
                        <Badge variant="secondary" className="text-[10px]">Co-scholastic</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Weight {g.weight}% · Sequence {g.sequence}
                    </p>
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
                          <DropdownMenuItem onClick={() => setEditing(g)}>
                            <Pencil className="mr-2 size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(g)}
                          >
                            <Trash2 className="mr-2 size-4" /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {g._count.exams} exam{g._count.exams === 1 ? '' : 's'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      router.push(`/exams/list?examGroupId=${g.id}`)
                    }
                  >
                    View exams
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <GroupEditDialog
        open={editing !== null}
        target={editing}
        paradigmId={paradigmId}
        saving={saving}
        onClose={() => setEditing(null)}
        onSave={async (payload, id) => {
          setSaving(true)
          try {
            if (id) {
              await api.patch(`/api/school/exams/groups/${id}`, payload)
              toast({ title: 'Term updated' })
            } else {
              await api.post('/api/school/exams/groups', payload)
              toast({ title: 'Term created' })
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
            <AlertDialogTitle>Delete this term?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; will be removed. Terms with live exams cannot be deleted.
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

interface GroupEditDialogProps {
  open: boolean
  target: ExamGroup | 'new' | null
  paradigmId: string
  saving: boolean
  onClose: () => void
  onSave: (payload: Record<string, unknown>, id?: string) => Promise<void>
}

function GroupEditDialog({ open, target, paradigmId, saving, onClose, onSave }: GroupEditDialogProps) {
  const isNew = target === 'new'
  const existing = !isNew && target ? target : null

  const [name, setName] = useState(existing?.name ?? '')
  const [shortCode, setShortCode] = useState(existing?.shortCode ?? '')
  const [sequence, setSequence] = useState(existing?.sequence ?? 0)
  const [weight, setWeight] = useState(existing?.weight ?? 100)
  const [isCoScholastic, setIsCoScholastic] = useState(existing?.isCoScholastic ?? false)
  const [agg, setAgg] = useState<AggregationRule>(parseAgg(existing?.aggregationRule ?? null))

  useEffect(() => {
    if (!open) return
    setName(existing?.name ?? '')
    setShortCode(existing?.shortCode ?? '')
    setSequence(existing?.sequence ?? 0)
    setWeight(existing?.weight ?? 100)
    setIsCoScholastic(existing?.isCoScholastic ?? false)
    setAgg(parseAgg(existing?.aggregationRule ?? null))
  }, [open, existing])

  const valid = name.trim().length > 0

  async function handleSave() {
    if (!valid) return
    const payload = {
      ...(isNew ? { paradigmId } : {}),
      name: name.trim(),
      shortCode: shortCode.trim() || null,
      sequence,
      weight,
      // Send null to mean "sum_all default at group level".
      aggregationRule: agg.type === 'sum_all' ? null : agg,
      isCoScholastic,
    }
    await onSave(payload, existing?.id)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7_0%,#4f46e5_48%,#7c3aed_100%)] px-5 py-4 pr-12 text-white sm:px-6">
          <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
          <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-sky-300/20 blur-2xl" />
          <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-violet-300/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
              <NotebookPen className="size-5 text-white" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold tracking-normal text-white">
                {isNew ? 'New term' : `Edit ${existing?.name}`}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-white/75">
                A term bundles exams that aggregate together — e.g. Unit Test 1 + Half Yearly = Term 1.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.04] via-background to-violet-500/[0.055] p-4 sm:p-5">
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
            <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><FileText className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Term details</h3><p className="text-[10px] text-muted-foreground">Name, ordering, weight, and scope within the pattern</p></div>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs">Name</Label>
                <Input
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  placeholder="Term 1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Short code (optional)</Label>
                <Input
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  placeholder="T1"
                  value={shortCode}
                  onChange={(e) => setShortCode(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Sequence</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  value={sequence}
                  onChange={(e) => setSequence(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                />
              </div>
              <div>
                <Label className="text-xs">Weight %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-9 bg-white shadow-sm dark:bg-input/30"
                  value={weight}
                  onChange={(e) => setWeight(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                />
              </div>
              <div className="flex items-end gap-2 pb-1.5">
                <input
                  id="cosch"
                  type="checkbox"
                  checked={isCoScholastic}
                  onChange={(e) => setIsCoScholastic(e.target.checked)}
                />
                <Label htmlFor="cosch" className="text-xs">Co-scholastic (grade only)</Label>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm"><Sigma className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Aggregation rule</h3><p className="text-[10px] text-muted-foreground">How the exams under this term combine into a term result</p></div>
            </div>
            <AggregationRuleBuilder
              value={agg}
              onChange={setAgg}
              items={[]}
              itemNoun="exam"
            />
          </section>
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {saving ? 'Saving…' : isNew ? 'Create term' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
