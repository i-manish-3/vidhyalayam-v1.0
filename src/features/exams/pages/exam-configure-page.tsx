'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import {
  ComponentEditor,
  type ExamComponentRow,
} from '@/features/exams/components/component-editor'
import { Pencil, Plus, Settings2, Trash2, Calendar as CalIcon } from 'lucide-react'

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

export function ExamConfigurePage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [configs, setConfigs] = useState<SubjectConfig[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<SubjectConfig | null>(null)
  const [componentEditing, setComponentEditing] = useState<SubjectConfig | null>(null)
  const [savingComponents, setSavingComponents] = useState(false)

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

  async function handleDeleteConfig(c: SubjectConfig) {
    if (!confirm(`Remove ${subjectLookup.get(c.subjectId)?.name ?? 'this subject'} from ${classLookup.get(c.classId)?.name ?? 'class'}?`)) return
    try {
      await api.delete(`/api/school/exams/subject-configs/${c.id}`)
      toast({ title: 'Subject removed' })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not remove',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
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

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Configure: ${exam.name}`}
        description={`${exam.group.paradigm.name} · ${exam.group.name}`}
        backAction={{ onClick: () => router.push('/exams/list') }}
        action={{
          label: 'Add subjects',
          icon: Plus,
          onClick: () => setAddOpen(true),
        }}
        secondaryAction={{
          label: 'Schedule',
          icon: CalIcon,
          onClick: () => router.push(`/exams/${examId}/schedule`),
        }}
      />

      {configs.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="No subjects configured yet"
          description="Pick the classes and subjects this exam covers, then split each into components."
          action={{ label: 'Add subjects', onClick: () => setAddOpen(true) }}
        />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([classId, configsForClass]) => {
            const klass = classLookup.get(classId)
            return (
              <Card key={classId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {klass?.name ?? classId}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      · {configsForClass.length} subject{configsForClass.length === 1 ? '' : 's'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {configsForClass.map((c) => {
                    const subject = subjectLookup.get(c.subjectId)
                    const componentSum = c.components.reduce((s, x) => s + x.maxMarks, 0)
                    const sumOk = c.gradeOnly || c.components.length === 0 || Math.abs(componentSum - c.totalMarks) < 0.01
                    return (
                      <div
                        key={c.id}
                        className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{subject?.name ?? c.subjectId}</span>
                            {c.gradeOnly && (
                              <Badge variant="secondary" className="text-[10px]">Grade only</Badge>
                            )}
                            {c.isOptional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
                            {c.isAdditional && <Badge variant="outline" className="text-[10px]">Additional</Badge>}
                            {c.sectionId && (
                              <Badge variant="outline" className="text-[10px]">
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setComponentEditing(c)}
                          >
                            <Settings2 className="size-3.5" /> Components
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditing(c)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => void handleDeleteConfig(c)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add subjects</DialogTitle>
          <DialogDescription>
            Bulk-add a subject set across multiple classes. Defaults can be tuned per row afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Classes</p>
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
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
            <p className="mb-2 text-xs font-medium text-muted-foreground">Subjects</p>
            <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
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

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs">Total marks</label>
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
            <label className="text-xs">Passing marks</label>
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
            <input
              type="checkbox"
              checked={gradeOnly}
              onChange={(e) => setGradeOnly(e.target.checked)}
            />
            Grade only
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          Will create {willCreate.length} subject config(s).
          {willCreate.length < selectedClassIds.length * selectedSubjectIds.length &&
            ` ${selectedClassIds.length * selectedSubjectIds.length - willCreate.length} already exist and will be skipped.`}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={!valid || saving || willCreate.length === 0}>
            {saving ? 'Adding…' : `Add ${willCreate.length} subject${willCreate.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit subject config</DialogTitle>
          <DialogDescription>
            Adjust marks ceiling, grace allowance, and optional/additional flags.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={gradeOnly} onChange={(e) => setGradeOnly(e.target.checked)} />
            Grade only (no numeric marks)
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs">Total</label>
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
              <label className="text-xs">Passing</label>
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
              <label className="text-xs">Grace max</label>
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
              <input type="checkbox" checked={isOptional} onChange={(e) => setIsOptional(e.target.checked)} />
              Optional
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isAdditional} onChange={(e) => setIsAdditional(e.target.checked)} />
              Additional
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
