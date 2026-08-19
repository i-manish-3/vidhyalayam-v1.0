'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState, GradientDialogHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import {
  ComponentEditor,
  makeBlankComponentRow,
  type ExamComponentRow,
} from '@/features/exams/components/component-editor'
import { Pencil, Settings2, Trash2, Calendar as CalIcon, Layers3, Wand2, Plus, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { examStatusMeta } from '@/features/exams/lib/status-meta'

interface SubjectConfig {
  id: string
  classId: string
  sectionId: string | null
  subjectId: string
  isCompulsory: boolean
  isOptional: boolean
  isAdditional: boolean
  gradeOnly: boolean
  totalMarks: number
  passingMarks: number
  graceMarksMax: number
  examDate: string | null
  durationMinutes: number | null
  components: ExamComponentRow[]
  class?: { id: string; name: string } | null
  subject?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface SubjectOption {
  id: string
  name: string
  shortCode?: string | null
}

interface ExamDetail {
  id: string
  name: string
  status: string
  lockedAt: string | null
  group: { id: string; name: string; paradigm: { id: string; name: string; academicYear: string } }
  examClasses: { classId: string; sectionIds: string | null }[]
}

interface Props {
  examId: string
}

const CLASS_TONES = [
  'border-sky-200/80 from-sky-50 via-white to-cyan-50 dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-cyan-500/10',
  'border-violet-200/80 from-violet-50 via-white to-purple-50 dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10',
  'border-emerald-200/80 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/10',
  'border-amber-200/80 from-amber-50 via-white to-orange-50 dark:border-amber-500/25 dark:from-amber-500/12 dark:via-card dark:to-orange-500/10',
]

export function ExamConfigurePage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()

  const [loading, setLoading] = useState(true)
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [configs, setConfigs] = useState<SubjectConfig[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<SubjectConfig | null>(null)
  const [componentEditing, setComponentEditing] = useState<SubjectConfig | null>(null)
  const [savingComponents, setSavingComponents] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SubjectConfig | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [activeClassId, setActiveClassId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [examRes, classesRes, subjectsRes] = await Promise.all([
        api.get<{ exam: ExamDetail & { subjectConfigs: SubjectConfig[] } }>(
          `/api/school/exams/${examId}`,
        ),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ subjects: SubjectOption[] }>('/api/school/subjects'),
      ])
      setExam(examRes.exam)
      setConfigs(examRes.exam.subjectConfigs ?? [])
      setClasses(classesRes.classes)
      setSubjects(subjectsRes.subjects)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load configuration',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [examId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const classLookup = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c]))
    for (const c of configs) {
      if (c.class && !map.has(c.class.id)) {
        map.set(c.class.id, { id: c.class.id, name: c.class.name })
      }
    }
    return map
  }, [classes, configs])
  const subjectLookup = useMemo(() => {
    const map = new Map(subjects.map((s) => [s.id, s]))
    for (const c of configs) {
      if (c.subject && !map.has(c.subject.id)) {
        map.set(c.subject.id, { id: c.subject.id, name: c.subject.name })
      }
    }
    return map
  }, [subjects, configs])

  const grouped = useMemo(() => {
    const map = new Map<string, SubjectConfig[]>()
    for (const c of configs) {
      const arr = map.get(c.classId) ?? []
      arr.push(c)
      map.set(c.classId, arr)
    }
    return map
  }, [configs])

  const classIds = useMemo(() => Array.from(grouped.keys()), [grouped])
  const currentClassId = useMemo(
    () =>
      activeClassId && classIds.includes(activeClassId) ? activeClassId : classIds[0] ?? null,
    [activeClassId, classIds],
  )

  async function handleDeleteConfig() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/exams/subject-configs/${deleteTarget.id}`)
      toast({ title: 'Subject removed' })
      setDeleteTarget(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not remove',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveConfigEdit(updates: Partial<SubjectConfig>) {
    if (!editing) return
    try {
      await api.patch(`/api/school/exams/subject-configs/${editing.id}`, updates)
      toast({ title: 'Subject config updated' })
      setEditing(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  async function handleSaveComponents(rows: ExamComponentRow[]) {
    if (!componentEditing) return
    setSavingComponents(true)
    try {
      await api.post(
        `/api/school/exams/subject-configs/${componentEditing.id}/components`,
        { components: rows },
      )
      toast({ title: 'Components saved' })
      setComponentEditing(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save components',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSavingComponents(false)
    }
  }

  if (loading) return <LoadingState />
  if (!exam) return null

  const status = examStatusMeta(exam.status)

  return (
    <div className="space-y-4">
      <GradientHero
        icon={Settings2}
        title={`Configure: ${exam.name}`}
        badge={status.label}
        description={`${exam.group.paradigm.name} · ${exam.group.name}`}
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'Bulk components',
                icon: Wand2,
                onClick: () => setBulkOpen(true),
              }
            : undefined
        }
        secondaryAction={{
          label: 'Schedule',
          icon: CalIcon,
          onClick: () => router.push(`/exams/${examId}/schedule`),
        }}
        extraActions={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) ? (
            <Button
              variant="secondary"
              onClick={() => router.push(`/exams/${examId}/edit`)}
              className="gap-2 border border-white/60 bg-white/15 text-white shadow-md backdrop-blur-sm hover:bg-white/25"
            >
              <Pencil className="size-4" /> Edit classes
            </Button>
          ) : undefined
        }
      />

      {configs.length === 0 ? (
        <GradientEmptyState
          icon={Settings2}
          title="No subjects configured yet"
          description="All subjects of the exam's classes are auto-included at creation. Add extras if needed."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {classIds.map((classId, i) => {
              const active = classId === currentClassId
              const klass = classLookup.get(classId)
              const count = grouped.get(classId)?.length ?? 0
              return (
                <button
                  key={classId}
                  type="button"
                  onClick={() => setActiveClassId(classId)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border bg-gradient-to-br px-3 py-2 text-sm font-medium shadow-sm transition-all',
                    CLASS_TONES[i % CLASS_TONES.length],
                    active
                      ? 'ring-2 ring-primary/40'
                      : 'opacity-80 hover:opacity-100 hover:shadow-md',
                  )}
                >
                  <Layers3 className="size-3.5" />
                  {klass?.name ?? classId}
                  <span className="ml-0.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-foreground/70 dark:bg-card/70">
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          {currentClassId &&
            (() => {
              const configsForClass = grouped.get(currentClassId) ?? []
              const groupIndex = classIds.indexOf(currentClassId)
              const klass = classLookup.get(currentClassId)
              return (
                <Card
                  key={currentClassId}
                  className={cn('gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm', CLASS_TONES[groupIndex % CLASS_TONES.length])}
                >
                  <div className="flex items-center gap-2 border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] px-4 py-2.5">
                    <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white">
                      <Layers3 className="size-3 text-white" />
                    </span>
                    <h3 className="text-sm font-semibold">{klass?.name ?? currentClassId}</h3>
                    <span className="text-xs text-muted-foreground">
                      · {configsForClass.length} subject{configsForClass.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <CardContent className="space-y-2 p-3">
                    {configsForClass.map((c) => {
                      const subject = subjectLookup.get(c.subjectId)
                      const componentSum = c.components.reduce((s, x) => s + x.maxMarks, 0)
                      const sumOk = c.gradeOnly || c.components.length === 0 || Math.abs(componentSum - c.totalMarks) < 0.01
                      return (
                        <div
                          key={c.id}
                          className="flex flex-col gap-2 rounded-md border border-current/10 bg-white/70 p-3 shadow-sm transition-all hover:shadow-md dark:bg-card/60 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{subject?.name ?? c.subjectId}</span>
                              {c.gradeOnly && (
                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                                  Grade only
                                </Badge>
                              )}
                              {c.isOptional && (
                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                                  Optional
                                </Badge>
                              )}
                              {c.isAdditional && (
                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/25 dark:bg-teal-500/10 dark:text-teal-300">
                                  Additional
                                </Badge>
                              )}
                              {c.sectionId && (
                                <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px]">
                                  Section: {c.section?.name ?? klass?.sections?.find((s) => s.id === c.sectionId)?.name ?? c.sectionId}
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {c.gradeOnly
                                ? 'No numeric marks'
                                : `${c.totalMarks} marks · pass at ${c.passingMarks}`}
                              {c.graceMarksMax > 0 ? ` · grace ≤ ${c.graceMarksMax}` : ''}
                            </p>
                            <p className="mt-0.5 text-xs">
                              <span className="text-muted-foreground">Components: </span>
                              {c.components.length === 0 ? (
                                <span className="text-amber-600">none yet</span>
                              ) : (
                                <span className={sumOk ? 'text-emerald-600' : 'text-destructive'}>
                                  {c.components.map((x) => `${x.name} ${x.maxMarks}`).join(' · ')}
                                  {!sumOk ? ` (sum ${componentSum}/${c.totalMarks})` : ''}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                                onClick={() => setComponentEditing(c)}
                              >
                                <Settings2 className="size-3.5" /> Components
                              </Button>
                            )}
                            {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="size-8 border-sky-200 bg-sky-50 p-0 text-sky-700 hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                                onClick={() => setEditing(c)}
                                aria-label="Edit config"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            )}
                            {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="size-8 border-red-200 bg-red-50 p-0 text-red-700 hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
                                onClick={() => setDeleteTarget(c)}
                                aria-label="Remove subject"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            })()}
        </div>
      )}

      <EditSubjectConfigDialog
        open={!!editing}
        config={editing}
        onClose={() => setEditing(null)}
        onSave={handleSaveConfigEdit}
      />

      {componentEditing && (
        <ComponentEditor
          open={!!componentEditing}
          onOpenChange={(o) => !o && setComponentEditing(null)}
          totalMarks={componentEditing.totalMarks}
          initialComponents={componentEditing.components}
          isGradeOnlySubject={componentEditing.gradeOnly}
          saving={savingComponents}
          subjectLabel={subjectLookup.get(componentEditing.subjectId)?.name}
          onSave={handleSaveComponents}
        />
      )}

      <BulkComponentsDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        examId={examId}
        configs={configs}
        classLookup={classLookup}
        subjectLookup={subjectLookup}
        onSaved={() => {
          setBulkOpen(false)
          void load()
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !deleting && !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this subject?</AlertDialogTitle>
            <AlertDialogDescription>
              {subjectLookup.get(deleteTarget?.subjectId ?? '')?.name ?? 'This subject'} will be removed from{' '}
              {classLookup.get(deleteTarget?.classId ?? '')?.name ?? 'this class'}. Existing marks for this subject
              will be deleted too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteConfig()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface EditSubjectConfigDialogProps {
  open: boolean
  config: SubjectConfig | null
  onClose: () => void
  onSave: (updates: Partial<SubjectConfig>) => Promise<void>
}

function EditSubjectConfigDialog({ open, config, onClose, onSave }: EditSubjectConfigDialogProps) {
  const [totalMarks, setTotalMarks] = useState(100)
  const [passingMarks, setPassingMarks] = useState(33)
  const [graceMarksMax, setGraceMarksMax] = useState(0)
  const [gradeOnly, setGradeOnly] = useState(false)
  const [isOptional, setIsOptional] = useState(false)
  const [isAdditional, setIsAdditional] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!config) return
    setTotalMarks(config.totalMarks)
    setPassingMarks(config.passingMarks)
    setGraceMarksMax(config.graceMarksMax)
    setGradeOnly(config.gradeOnly)
    setIsOptional(config.isOptional)
    setIsAdditional(config.isAdditional)
  }, [config])

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ totalMarks, passingMarks, graceMarksMax, gradeOnly, isOptional, isAdditional })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={Settings2}
          title="Edit subject config"
          description="Adjust marks ceiling, grace allowance, and optional/additional flags."
        />

        <div className="themed-scrollbar grid max-h-[68svh] gap-3 overflow-y-auto bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={gradeOnly} onCheckedChange={(v) => setGradeOnly(Boolean(v))} />
            Grade only (no numeric marks)
          </label>
          <div className="grid gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10 sm:grid-cols-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Total</label>
              <Input
                type="number"
                min={0}
                className="h-9"
                disabled={gradeOnly}
                value={totalMarks}
                onChange={(e) => setTotalMarks(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Passing</label>
              <Input
                type="number"
                min={0}
                className="h-9"
                disabled={gradeOnly}
                value={passingMarks}
                onChange={(e) => setPassingMarks(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Grace max</label>
              <Input
                type="number"
                min={0}
                className="h-9"
                disabled={gradeOnly}
                value={graceMarksMax}
                onChange={(e) => setGraceMarksMax(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isOptional} onCheckedChange={(v) => setIsOptional(Boolean(v))} />
              Optional
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isAdditional} onCheckedChange={(v) => setIsAdditional(Boolean(v))} />
              Additional
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface BulkComponentsDialogProps {
  open: boolean
  onClose: () => void
  examId: string
  configs: SubjectConfig[]
  classLookup: Map<string, ClassOption>
  subjectLookup: Map<string, SubjectOption>
  onSaved: () => void
}

function BulkComponentsDialog({
  open,
  onClose,
  examId,
  configs,
  classLookup,
  subjectLookup,
  onSaved,
}: BulkComponentsDialogProps) {
  const { toast } = useToast()
  const [rows, setRows] = useState<ExamComponentRow[]>([])
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [saving, setSaving] = useState(false)

  const classIdsWithConfigs = useMemo(
    () => Array.from(new Set(configs.map((c) => c.classId))),
    [configs],
  )

  useEffect(() => {
    if (!open) return
    setRows([makeBlankComponentRow(0, false)])
    setSelectedClassIds(classIdsWithConfigs)
    setOnlyMissing(true)
  }, [open, classIdsWithConfigs])

  const seenNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const key = r.name.trim().toLowerCase()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [rows])

  const rowErrors = rows.map((r) => {
    if (!r.name.trim()) return 'Name required.'
    if (seenNames.get(r.name.trim().toLowerCase())! > 1) return 'Duplicate name.'
    if (!r.gradeOnly) {
      if (!Number.isFinite(r.maxMarks) || r.maxMarks < 0) return 'Max marks must be ≥ 0.'
      if (r.passingMarks < 0 || r.passingMarks > r.maxMarks) return 'Passing marks must be between 0 and max.'
    }
    return null
  })

  const numericSum = useMemo(
    () => rows.filter((r) => !r.gradeOnly).reduce((s, r) => s + (Number(r.maxMarks) || 0), 0),
    [rows],
  )

  const canApply =
    !saving &&
    rows.length > 0 &&
    rowErrors.every((e) => e === null) &&
    rows.some((r) => !r.gradeOnly && (Number(r.maxMarks) || 0) > 0)

  function updateRow(idx: number, patch: Partial<ExamComponentRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }
  function addRow(gradeOnly = false) {
    setRows((prev) => [...prev, makeBlankComponentRow(prev.length, gradeOnly)])
  }

  // Scale the user's split proportionally onto each subject's total marks.
  // The last numeric row absorbs rounding so sums always match the total.
  function buildForTotal(source: ExamComponentRow[], total: number): ExamComponentRow[] {
    const numeric = source.filter((r) => !r.gradeOnly)
    const sumMax = numeric.reduce((s, r) => s + (Number(r.maxMarks) || 0), 0)
    const lastNumeric = numeric[numeric.length - 1]
    let used = 0
    return source.map((r, i) => {
      if (r.gradeOnly) return { ...r, sequence: i, maxMarks: 0, passingMarks: 0 }
      const share = sumMax > 0 ? (Number(r.maxMarks) || 0) / sumMax : 1 / numeric.length
      const max = r === lastNumeric ? total - used : Math.round(total * share)
      used += max
      const pass =
        r.passingMarks > 0 && (Number(r.maxMarks) || 0) > 0
          ? Math.round((r.passingMarks / Number(r.maxMarks)) * max)
          : 0
      return { ...r, sequence: i, maxMarks: max, passingMarks: pass }
    })
  }

  const eligible = useMemo(
    () =>
      configs.filter((c) => {
        if (selectedClassIds.length > 0 && !selectedClassIds.includes(c.classId)) return false
        if (c.gradeOnly) return false
        if (onlyMissing && c.components.length > 0) return false
        return true
      }),
    [configs, selectedClassIds, onlyMissing],
  )

  const gradeOnlyInScope = useMemo(
    () =>
      configs.filter((c) => {
        if (selectedClassIds.length > 0 && !selectedClassIds.includes(c.classId)) return false
        return c.gradeOnly
      }).length,
    [configs, selectedClassIds],
  )

  async function handleApply() {
    if (eligible.length === 0) return
    setSaving(true)
    try {
      const res = await api.post<{
        updated: number
        skipped: number
        errors: { configId: string; message: string }[]
        message: string
      }>(`/api/school/exams/${examId}/components/bulk`, {
        configs: eligible.map((c) => ({
          configId: c.id,
          components: buildForTotal(rows, c.totalMarks),
        })),
      })
      toast({ title: 'Components applied', description: res.message })
      if (res.errors.length > 0) {
        toast({
          variant: 'destructive',
          title: `${res.errors.length} subject(s) skipped`,
          description: res.errors[0].message,
        })
      }
      onSaved()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not apply components',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={Wand2}
          title="Bulk components"
          description="Build a component split once and apply it to every subject at once."
        />

        <div className="themed-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
          <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-sm"><Layers3 className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Component split</h3><p className="text-[10px] text-muted-foreground">Build your own split — marks scale proportionally to each subject's total</p></div>
            </div>
            <div className="relative space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 rounded-md border border-current/10 bg-white/70 p-2 shadow-sm dark:bg-card/60">
                  <div className="col-span-12 sm:col-span-4">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</Label>
                    <Input
                      className="h-8"
                      placeholder="Theory"
                      value={row.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Code</Label>
                    <Input
                      className="h-8"
                      placeholder="TH"
                      value={row.shortCode ?? ''}
                      onChange={(e) => updateRow(idx, { shortCode: e.target.value })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8"
                      disabled={row.gradeOnly}
                      value={row.maxMarks}
                      onChange={(e) =>
                        updateRow(idx, { maxMarks: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Pass</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8"
                      disabled={row.gradeOnly}
                      value={row.passingMarks}
                      onChange={(e) =>
                        updateRow(idx, { passingMarks: Math.max(0, Number(e.target.value) || 0) })
                      }
                    />
                  </div>
                  <div className="col-span-9 flex items-center gap-2 sm:col-span-1">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={row.gradeOnly}
                        onCheckedChange={(v) => updateRow(idx, { gradeOnly: Boolean(v), maxMarks: 0, passingMarks: 0 })}
                      />
                      Grade
                    </label>
                  </div>
                  <div className="col-span-3 flex items-end justify-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => removeRow(idx)}
                      aria-label="Remove component"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {rowErrors[idx] && (
                    <p className="col-span-12 flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="size-3" /> {rowErrors[idx]}
                    </p>
                  )}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => addRow(false)}>
                    <Plus className="size-3.5" /> Add component
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => addRow(true)}>
                    <Plus className="size-3.5" /> Add grade-only
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  Total: {numericSum} (relative — scaled per subject)
                </span>
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
            <div className="relative mb-3 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm"><Wand2 className="size-4 text-white" /></span>
              <div><h3 className="text-sm font-semibold">Scope</h3><p className="text-[10px] text-muted-foreground">Which subjects get the split</p></div>
            </div>
            <div className="relative grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label className="text-xs">Classes</Label>
                  <div className="flex items-center gap-2 text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setSelectedClassIds(classIdsWithConfigs)}
                      className="text-primary hover:underline"
                    >
                      Select all
                    </button>
                    {selectedClassIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedClassIds([])}
                        className="text-muted-foreground hover:underline"
                      >
                        Deselect all
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1 rounded-md border border-violet-200/80 bg-white/70 p-2 shadow-sm dark:border-violet-500/25 dark:bg-card/60">
                  {classIdsWithConfigs.map((cid) => (
                    <label
                      key={cid}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedClassIds.includes(cid)}
                        onCheckedChange={(v) =>
                          setSelectedClassIds((prev) =>
                            v ? [...prev, cid] : prev.filter((id) => id !== cid),
                          )
                        }
                      />
                      {classLookup.get(cid)?.name ?? cid}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex cursor-pointer items-end gap-2 pb-1.5 text-sm">
                <Checkbox checked={onlyMissing} onCheckedChange={(v) => setOnlyMissing(Boolean(v))} />
                Only subjects without components
              </label>
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            Will update <strong className="text-foreground">{eligible.length}</strong> subject
            {eligible.length === 1 ? '' : 's'}
            {gradeOnlyInScope > 0 && ` · ${gradeOnlyInScope} grade-only skipped`}
            {onlyMissing && ` · subjects with components already set are untouched`}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleApply()} disabled={eligible.length === 0 || !canApply}>
              {saving ? 'Applying…' : `Apply to ${eligible.length} subject${eligible.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
