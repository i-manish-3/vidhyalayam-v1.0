'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Award, MoreVertical, Pencil, Plus, Star, Trash2 } from 'lucide-react'

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

function makeBand(code: string, min: number, max: number, gp: number | null, seq: number): GradeBand {
  return { code, minValue: min, maxValue: max, gradePoint: gp, remark: null, sequence: seq }
}

const CBSE_PRESET: GradeBand[] = [
  makeBand('A1', 91, 100, 10, 0),
  makeBand('A2', 81, 90, 9, 1),
  makeBand('B1', 71, 80, 8, 2),
  makeBand('B2', 61, 70, 7, 3),
  makeBand('C1', 51, 60, 6, 4),
  makeBand('C2', 41, 50, 5, 5),
  makeBand('D', 33, 40, 4, 6),
  makeBand('E1', 21, 32, null, 7),
  makeBand('E2', 0, 20, null, 8),
]

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
  const [loading, setLoading] = useState(true)
  const [scales, setScales] = useState<GradeScale[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [editing, setEditing] = useState<GradeScale | 'new' | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<GradeScale | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/exams/grade-scales/${deleteTarget.id}`)
      toast({ title: 'Grade scale deleted' })
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
        icon={Award}
        title="Grade scales"
        description="Percentage/marks ranges that map to letter grades. Assignable per exam pattern, term, or class."
        primaryAction={{
          label: 'New scale',
          icon: Plus,
          onClick: () => setEditing('new'),
        }}
      />

      {scales.length === 0 ? (
        <GradientEmptyState
          icon={Award}
          title="No grade scales yet"
          description="Create a grading scale — CBSE 9-point, state 5-point, or your own custom bands."
          actionLabel="Create scale"
          onAction={() => setEditing('new')}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scales.map((scale) => (
            <Card
              key={scale.id}
              className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10"
            >
              <CardHeader className="border-b border-current/10 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="text-sm">{scale.name}</CardTitle>
                      {scale.isDefault && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Star className="size-2.5 fill-current" /> Default
                        </Badge>
                      )}
                      {!scale.isActive && (
                        <Badge variant="outline" className="text-[10px] text-amber-600">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{scale.scaleType}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7 shrink-0">
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(scale)}>
                        <Pencil className="mr-2 size-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(scale)}
                      >
                        <Trash2 className="mr-2 size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {scale.bands.slice(0, 6).map((b) => (
                    <Badge key={b.id ?? b.code} variant="outline" className="font-mono text-[10px]">
                      {b.code} {b.minValue}–{b.maxValue}
                    </Badge>
                  ))}
                  {scale.bands.length > 6 && (
                    <Badge variant="outline" className="text-[10px]">+{scale.bands.length - 6}</Badge>
                  )}
                  {scale.bands.length === 0 && (
                    <span className="text-xs text-muted-foreground">No bands defined</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
              toast({ title: 'Scale updated' })
            } else {
              const res = await api.post<{ scale: { id: string } }>(
                '/api/school/exams/grade-scales',
                payload,
              )
              savedId = res.scale.id
              toast({ title: 'Scale created' })
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this grade scale?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be removed. Default scales cannot be deleted.
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
      { code: '', minValue: 0, maxValue: 100, gradePoint: null, remark: null, sequence: prev.length },
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
    await onSave(
      payload,
      { bands },
      existing?.id,
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New grade scale' : `Edit ${existing?.name}`}</DialogTitle>
          <DialogDescription>
            Define the letter-grade bands for percentage/mark resolution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Name</Label>
              <Input
                className="h-9"
                placeholder="CBSE 9-point"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={scaleType} onValueChange={(v) => setScaleType(v)}>
                <SelectTrigger className="h-9 capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCALE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Select value={classId || '__school'} onValueChange={(v) => setClassId(v === '__school' ? '' : v)}>
              <SelectTrigger className="h-9 w-48"><SelectValue placeholder="School-wide" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__school">School-wide</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Default
            </label>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Bands</Label>
              <Button type="button" variant="ghost" size="sm" onClick={applyCBSEPreset}>
                Use CBSE preset
              </Button>
            </div>
            {bandError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                {bandError}
              </p>
            )}
            <div className="space-y-1">
              {bands.map((b, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-center rounded-md border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-1.5 dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
                  <div className="col-span-3 sm:col-span-2">
                    <Input
                      className="h-8 text-xs font-mono"
                      placeholder="A1"
                      value={b.code}
                      onChange={(e) => updateBand(idx, { code: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-[9px] text-muted-foreground">Min</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={b.minValue}
                      onChange={(e) => updateBand(idx, { minValue: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-[9px] text-muted-foreground">Max</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={b.maxValue}
                      onChange={(e) => updateBand(idx, { maxValue: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-2">
                    <Label className="text-[9px] text-muted-foreground">GP</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-xs"
                      value={b.gradePoint ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        updateBand(idx, { gradePoint: v === '' ? null : Number(v) })
                      }}
                    />
                  </div>
                  <div className="col-span-1 flex items-end justify-end pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => removeBand(idx)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addBand}>
              <Plus className="size-3.5" /> Add band
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving ? 'Saving…' : isNew ? 'Create scale' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
