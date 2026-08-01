'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState, GradientDialogHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  type ExamComponentRow,
} from '@/features/exams/components/component-editor'
import { Pencil, Plus, Settings2, Trash2, Calendar as CalIcon, Layers3, BookOpen } from 'lucide-react'
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
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<SubjectConfig | null>(null)
  const [componentEditing, setComponentEditing] = useState<SubjectConfig | null>(null)
  const [savingComponents, setSavingComponents] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SubjectConfig | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const classLookup = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes],
  )
  const subjectLookup = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, SubjectConfig[]>()
    for (const c of configs) {
      const arr = map.get(c.classId) ?? []
      arr.push(c)
      map.set(c.classId, arr)
    }
    return map
  }, [configs])

  // The classes this exam covers (from exam.examClasses) — fall back to all classes if none.
  const eligibleClassIds = useMemo(() => {
    const ids = new Set(exam?.examClasses.map((ec) => ec.classId) ?? [])
    return ids.size > 0 ? ids : new Set(classes.map((c) => c.id))
  }, [exam, classes])

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
                label: 'Add subjects',
                icon: Plus,
                onClick: () => setAddOpen(true),
              }
            : undefined
        }
        secondaryAction={{
          label: 'Schedule',
          icon: CalIcon,
          onClick: () => router.push(`/exams/${examId}/schedule`),
        }}
      />

      {configs.length === 0 ? (
        <GradientEmptyState
          icon={Settings2}
          title="No subjects configured yet"
          description="Pick the classes and subjects this exam covers, then split each into components."
          {...(hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? { actionLabel: 'Add subjects', onAction: () => setAddOpen(true) }
            : {})}
        />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([classId, configsForClass], groupIndex) => {
            const klass = classLookup.get(classId)
            return (
              <Card
                key={classId}
                className={cn('gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm', CLASS_TONES[groupIndex % CLASS_TONES.length])}
              >
                <div className="flex items-center gap-2 border-b border-current/10 bg-gradient-to-r from-sky-500/[0.08] via-white/40 to-violet-500/[0.08] px-4 py-2.5">
                  <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white">
                    <Layers3 className="size-3 text-white" />
                  </span>
                  <h3 className="text-sm font-semibold">{klass?.name ?? classId}</h3>
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
                                Section: {klass?.sections?.find((s) => s.id === c.sectionId)?.name ?? c.sectionId}
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
          })}
        </div>
      )}

      <AddSubjectsDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        examId={examId}
        eligibleClassIds={Array.from(eligibleClassIds)}
        classes={classes}
        subjects={subjects}
        existing={configs}
        onSaved={() => {
          setAddOpen(false)
          void load()
        }}
      />

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

interface AddSubjectsDialogProps {
  open: boolean
  onClose: () => void
  examId: string
  eligibleClassIds: string[]
  classes: ClassOption[]
  subjects: SubjectOption[]
  existing: SubjectConfig[]
  onSaved: () => void
}

function AddSubjectsDialog({
  open,
  onClose,
  examId,
  eligibleClassIds,
  classes,
  subjects,
  existing,
  onSaved,
}: AddSubjectsDialogProps) {
  const { toast } = useToast()
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([])
  const [totalMarks, setTotalMarks] = useState(100)
  const [passingMarks, setPassingMarks] = useState(33)
  const [gradeOnly, setGradeOnly] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelectedClassIds([])
      setSelectedSubjectIds([])
      setTotalMarks(100)
      setPassingMarks(33)
      setGradeOnly(false)
    }
  }, [open])

  const eligibleClasses = useMemo(
    () => classes.filter((c) => eligibleClassIds.includes(c.id)),
    [classes, eligibleClassIds],
  )

  const existingKeys = useMemo(() => {
    const set = new Set<string>()
    for (const c of existing) {
      set.add(`${c.classId}::${c.sectionId ?? ''}::${c.subjectId}`)
    }
    return set
  }, [existing])

  const willCreate = selectedClassIds.flatMap((cid) =>
    selectedSubjectIds
      .filter((sid) => !existingKeys.has(`${cid}::::${sid}`))
      .map((sid) => ({ classId: cid, subjectId: sid })),
  )

  const valid =
    selectedClassIds.length > 0 &&
    selectedSubjectIds.length > 0 &&
    (gradeOnly || (totalMarks > 0 && passingMarks >= 0 && passingMarks <= totalMarks))

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    try {
      const configs = willCreate.map((wc) => ({
        ...wc,
        sectionId: null,
        isCompulsory: true,
        gradeOnly,
        totalMarks: gradeOnly ? 100 : totalMarks,
        passingMarks: gradeOnly ? 0 : passingMarks,
      }))
      if (configs.length === 0) {
        toast({ title: 'Nothing to add', description: 'All selected pairs already exist.' })
        return
      }
      const res = await api.post<{ created: unknown[]; skipped: unknown[]; message: string }>(
        `/api/school/exams/${examId}/subject-configs`,
        { configs },
      )
      toast({ title: 'Subjects added', description: res.message })
      onSaved()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not add subjects',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-2xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={Plus}
          title="Add subjects"
          description="Bulk-add a subject set across multiple classes. Defaults can be tuned per row afterwards."
        />

        <div className="themed-scrollbar grid max-h-[68svh] gap-3 overflow-y-auto bg-gradient-to-br from-primary/[0.025] via-background to-violet-500/[0.035] p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-600 text-white"><Layers3 className="size-3 text-white" /></span>
                Classes
              </p>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-sky-200/80 bg-white/70 p-2 shadow-sm dark:border-sky-500/25 dark:bg-card/60">
                {eligibleClasses.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedClassIds.includes(c.id)}
                      onCheckedChange={(v) =>
                        setSelectedClassIds((prev) =>
                          v ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white"><BookOpen className="size-3 text-white" /></span>
                Subjects
              </p>
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-violet-200/80 bg-white/70 p-2 shadow-sm dark:border-violet-500/25 dark:bg-card/60">
                {subjects.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedSubjectIds.includes(s.id)}
                      onCheckedChange={(v) =>
                        setSelectedSubjectIds((prev) =>
                          v ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        )
                      }
                    />
                    {s.name}
                    {s.shortCode && <span className="text-xs text-muted-foreground">({s.shortCode})</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-3 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-cyan-500/10 sm:grid-cols-3">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Total marks</label>
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
              <label className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Passing marks</label>
              <Input
                type="number"
                min={0}
                className="h-9"
                disabled={gradeOnly}
                value={passingMarks}
                onChange={(e) => setPassingMarks(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <label className="flex cursor-pointer items-end gap-2 pb-1.5 text-sm">
              <Checkbox checked={gradeOnly} onCheckedChange={(v) => setGradeOnly(Boolean(v))} />
              Grade only
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            Will create {willCreate.length} subject config(s).
            {willCreate.length < selectedClassIds.length * selectedSubjectIds.length &&
              ` ${selectedClassIds.length * selectedSubjectIds.length - willCreate.length} already exist and will be skipped.`}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={!valid || saving || willCreate.length === 0}>
              {saving ? 'Adding…' : `Add ${willCreate.length} subject${willCreate.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
