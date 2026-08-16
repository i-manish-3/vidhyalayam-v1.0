'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import { CheckCheck, Save, Trash2, ClipboardList, Users, ArrowLeft, X } from 'lucide-react'
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
import { examStatusMeta } from '@/features/exams/lib/status-meta'

interface GroupOption {
  id: string
  name: string
  paradigmId: string
  paradigm: { id: string; name: string; academicYear: string }
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface ExamDetail {
  id: string
  schoolId: string
  academicYear: string
  examGroupId: string
  name: string
  shortCode: string | null
  examType: string
  startDate: string | null
  endDate: string | null
  status: string
  includeInResult: boolean
  examClasses: { classId: string; sectionIds: string | null }[]
  group: { id: string; name: string; paradigm: { id: string; name: string; academicYear: string } }
}

const EXAM_TYPES = [
  'written',
  'practical',
  'oral',
  'project',
  'internal',
  'activity',
  'attendance',
  'reexam',
] as const

function parseSections(json: string | null): string[] | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? (v as string[]) : null
  } catch {
    return null
  }
}

function toInputDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // yyyy-mm-dd for <input type=date> (uses local timezone for display)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  examId?: string
}

interface ClassSelection {
  classId: string
  // null = all sections of class, string[] = explicit selection
  sectionIds: string[] | null
}

export function ExamFormPage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const isEdit = Boolean(examId)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [exam, setExam] = useState<ExamDetail | null>(null)

  // Form state
  const [examGroupId, setExamGroupId] = useState('')
  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [examType, setExamType] = useState<typeof EXAM_TYPES[number]>('written')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [includeInResult, setIncludeInResult] = useState(true)
  const [autoAddSubjects, setAutoAddSubjects] = useState(true)
  const [selectedClasses, setSelectedClasses] = useState<ClassSelection[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const requests: Promise<unknown>[] = [
        api.get<{ groups: GroupOption[] }>('/api/school/exams/groups'),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
      ]
      if (examId) {
        requests.push(api.get<{ exam: ExamDetail }>(`/api/school/exams/${examId}`))
      }
      const [groupsRes, classesRes, examRes] = (await Promise.all(requests)) as [
        { groups: GroupOption[] },
        { classes: ClassOption[] },
        { exam: ExamDetail } | undefined,
      ]
      setGroups(groupsRes.groups)
      setClasses(classesRes.classes)
      if (examRes?.exam) {
        const e = examRes.exam
        setExam(e)
        setExamGroupId(e.examGroupId)
        setName(e.name)
        setShortCode(e.shortCode ?? '')
        setExamType(EXAM_TYPES.includes(e.examType as typeof EXAM_TYPES[number])
          ? (e.examType as typeof EXAM_TYPES[number])
          : 'written')
        setStartDate(toInputDate(e.startDate))
        setEndDate(toInputDate(e.endDate))
        setIncludeInResult(e.includeInResult)
        setSelectedClasses(
          e.examClasses.map((ec) => ({
            classId: ec.classId,
            sectionIds: parseSections(ec.sectionIds),
          })),
        )
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load exam form',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [examId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const selectedGroup = groups.find((g) => g.id === examGroupId)
  const academicYear = exam?.academicYear ?? selectedGroup?.paradigm.academicYear ?? ''
  const isLocked = exam?.status === 'result_published'

  const valid = useMemo(() => {
    if (!examGroupId) return false
    if (!name.trim()) return false
    if (!academicYear) return false
    if (startDate && endDate && endDate < startDate) return false
    return true
  }, [examGroupId, name, academicYear, startDate, endDate])

  function toggleClass(classId: string) {
    setSelectedClasses((prev) => {
      const exists = prev.find((c) => c.classId === classId)
      if (exists) return prev.filter((c) => c.classId !== classId)
      return [...prev, { classId, sectionIds: null }]
    })
  }

  function toggleSection(classId: string, sectionId: string) {
    setSelectedClasses((prev) =>
      prev.map((c) => {
        if (c.classId !== classId) return c
        const current = c.sectionIds ?? []
        if (current.includes(sectionId)) {
          const next = current.filter((s) => s !== sectionId)
          return { ...c, sectionIds: next.length > 0 ? next : [] }
        }
        return { ...c, sectionIds: [...current, sectionId] }
      }),
    )
  }

  function setAllSections(classId: string) {
    setSelectedClasses((prev) =>
      prev.map((c) => (c.classId === classId ? { ...c, sectionIds: null } : c)),
    )
  }

  function selectAllClasses() {
    setSelectedClasses(classes.map((c) => ({ classId: c.id, sectionIds: null })))
  }

  function clearClasses() {
    setSelectedClasses([])
  }

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    try {
      const payload = {
        ...(isEdit ? {} : { academicYear, examGroupId, autoAddSubjects }),
        name: name.trim(),
        shortCode: shortCode.trim() || null,
        examType,
        startDate: startDate || null,
        endDate: endDate || null,
        includeInResult,
        classes: selectedClasses.map((c) => ({
          classId: c.classId,
          sectionIds:
            c.sectionIds === null || c.sectionIds.length === 0 ? null : c.sectionIds,
        })),
      }
      if (isEdit && examId) {
        await api.patch(`/api/school/exams/${examId}`, payload)
        toast({ title: 'Exam updated' })
        router.push(`/exams/${examId}/configure`)
      } else {
        const res = await api.post<{ exam: { id: string }; autoAddedSubjects?: number }>('/api/school/exams', payload)
        const autoAdded = res.autoAddedSubjects ?? 0
        toast({
          title: 'Exam created',
          description: autoAdded > 0
            ? `${autoAdded} subject(s) auto-included. Next, set up components.`
            : 'Next, configure subjects and components.',
        })
        router.push(`/exams/${res.exam.id}/configure`)
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!examId) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/exams/${examId}`)
      toast({ title: 'Exam deleted' })
      router.push('/exams/list')
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  if (loading) return <LoadingState />

  const status = examStatusMeta(exam?.status ?? 'draft')

  return (
    <div className="space-y-4">
      <GradientHero
        icon={ClipboardList}
        title={isEdit ? `Edit ${exam?.name ?? 'exam'}` : 'New exam'}
        badge={academicYear || undefined}
        description={
          isEdit
            ? `${exam?.group.paradigm.name} · ${exam?.group.name}`
            : 'Set the basics. Subjects and schedule come next.'
        }
        secondaryAction={{
          label: 'Back',
          icon: ArrowLeft,
          onClick: () => router.push(isEdit && examId ? `/exams/${examId}/configure` : '/exams/list'),
        }}
      />

      {isEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-3 py-2 text-xs shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
          <span className="text-muted-foreground">Status:</span>
          <Badge variant="outline" className={status.tone}>{status.label}</Badge>
          {isLocked && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              Locked — only metadata edits allowed
            </Badge>
          )}
        </div>
      )}

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Details</CardTitle>
          </div>
          <CardDescription className="text-xs">Basic exam information.</CardDescription>
        </div>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="text-xs font-medium">Term</Label>
              <Select value={examGroupId} onValueChange={setExamGroupId} disabled={isEdit}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pick a term" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.paradigm.name} ({g.paradigm.academicYear}) · {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isEdit && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Term cannot be changed after creation.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs font-medium">Name</Label>
              <Input
                className="h-9"
                placeholder="Half Yearly"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Short code (optional)</Label>
              <Input
                className="h-9"
                placeholder="HY"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Exam type</Label>
              <Select value={examType} onValueChange={(v) => setExamType(v as typeof examType)}>
                <SelectTrigger className="h-9 capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium">Academic year</Label>
              <Input className="h-9" value={academicYear} disabled />
            </div>
            <div>
              <Label className="text-xs font-medium">Start date</Label>
              <Input
                type="date"
                className="h-9"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">End date</Label>
              <Input
                type="date"
                className="h-9"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2 pb-1.5 sm:col-span-2">
              <Checkbox
                id="includeInResult"
                checked={includeInResult}
                onCheckedChange={(checked) => setIncludeInResult(Boolean(checked))}
              />
              <Label htmlFor="includeInResult" className="text-xs font-medium">
                Include this exam in result aggregation
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10">
        <div className="border-b bg-muted/30 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Classes</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="h-5 text-[10px]">
                {selectedClasses.length} of {classes.length} selected
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs"
                onClick={selectAllClasses}
                disabled={classes.length === 0}
              >
                <CheckCheck className="size-3.5" /> Select all
              </Button>
              {selectedClasses.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs text-muted-foreground"
                  onClick={clearClasses}
                >
                  <X className="size-3.5" /> Clear
                </Button>
              )}
            </div>
          </div>
          <CardDescription className="text-xs">
            Pick the classes this exam runs for. Leave sections unselected to apply to all sections of a class.
          </CardDescription>
        </div>
        <CardContent className="p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {classes.map((c) => {
              const sel = selectedClasses.find((s) => s.classId === c.id)
              const allSections = sel?.sectionIds === null
              return (
                <div
                  key={c.id}
                  className="rounded-md border border-violet-200/60 bg-white/70 p-2.5 shadow-sm dark:border-violet-500/20 dark:bg-card/60"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={Boolean(sel)}
                      onCheckedChange={() => toggleClass(c.id)}
                    />
                    {c.name}
                  </label>
                  {sel && c.sections && c.sections.length > 0 && (
                    <div className="mt-2 ml-6 space-y-1">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={allSections}
                          onChange={(e) =>
                            e.target.checked
                              ? setAllSections(c.id)
                              : setSelectedClasses((prev) =>
                                  prev.map((p) =>
                                    p.classId === c.id ? { ...p, sectionIds: [] } : p,
                                  ),
                                )
                          }
                        />
                        All sections
                      </label>
                      {!allSections && (
                        <div className="flex flex-wrap gap-1.5">
                          {c.sections.map((s) => {
                            const checked = (sel.sectionIds ?? []).includes(s.id)
                            return (
                              <label
                                key={s.id}
                                className="flex cursor-pointer items-center gap-1.5 rounded border border-primary/15 bg-white/70 px-2 py-0.5 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSection(c.id, s.id)}
                                />
                                {s.name}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-3 border-t border-violet-200/60 pt-3 dark:border-violet-500/20">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                id="autoAddSubjects"
                checked={autoAddSubjects}
                onCheckedChange={(v) => setAutoAddSubjects(Boolean(v))}
                disabled={isEdit}
              />
              <span className="text-xs font-medium">
                Automatically include all subjects of the selected classes
              </span>
            </label>
            <p className="ml-6 mt-0.5 text-[11px] text-muted-foreground">
              {isEdit
                ? 'Subject inclusion is managed on the configure page.'
                : 'Every subject mapped to the selected classes is added at creation — no manual entry needed.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {isEdit && hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) ? (
          <Button
            variant="outline"
            className="h-8 gap-1.5 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
            disabled={deleting || isLocked || (exam?.status !== 'draft' && exam?.status !== 'scheduled')}
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="size-4" /> Delete exam
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={!valid || saving || !hasAnyPermission([PERMISSIONS.EXAM_MANAGE])}
            className="gap-1.5"
          >
            <Save className="size-4" /> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create exam'}
          </Button>
        </div>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this exam?</AlertDialogTitle>
            <AlertDialogDescription>
              "{exam?.name}" will be removed along with its subject configs. Exams with entered marks or published
              results cannot be deleted.
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
