'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
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
import {
  AggregationRuleBuilder,
  type AggregationRule,
} from '@/features/exams/components/aggregation-rule-builder'
import { Layers, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'

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
      <PageHeader
        title={`Terms under "${paradigm.name}"`}
        description={`${paradigm.academicYear} · organise exams under each term for term-level and final aggregation.`}
        backAction={{ onClick: () => router.push('/exams/paradigms') }}
        action={{
          label: 'New term',
          icon: Plus,
          onClick: () => setEditing('new'),
        }}
      />

      {paradigm.examGroups.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No terms yet"
          description='Add a term — e.g. "Term 1" — to start defining exams under this pattern.'
          action={{ label: 'Create term', onClick: () => setEditing('new') }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {paradigm.examGroups.map((g) => (
            <Card key={g.id} className="transition hover:border-primary/40">
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
                      <DropdownMenuItem onClick={() => setEditing(g)}>
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(g)}
                      >
                        <Trash2 className="mr-2 size-4" /> Delete
                      </DropdownMenuItem>
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New term' : `Edit ${existing?.name}`}</DialogTitle>
          <DialogDescription>
            A group bundles exams that aggregate together — e.g. Unit Test 1 + Half Yearly = Term 1.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs">Name</Label>
              <Input
                className="h-9"
                placeholder="Term 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Short code (optional)</Label>
              <Input
                className="h-9"
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
                className="h-9"
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
                className="h-9"
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

          <AggregationRuleBuilder
            value={agg}
            onChange={setAgg}
            items={[]}
            itemNoun="exam"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving ? 'Saving…' : isNew ? 'Create term' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
