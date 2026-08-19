'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import { detectScheduleConflicts, type ScheduleRow } from '@/features/exams/lib/schedule-conflict-checker'
import { Calendar as CalIcon, Plus, Save, Trash2, AlertTriangle, TicketCheck, Copy } from 'lucide-react'

interface ScheduleEntry {
  id?: string
  classId: string
  sectionId: string | null
  subjectId: string
  examDate: string // YYYY-MM-DD for input
  startTime: string
  endTime: string
  roomNumber: string | null
  invigilatorId: string | null
  maxMarks: number
  durationMinutes: number | null
  instructions: string | null
  _dirty?: boolean
  _new?: boolean
}

interface SubjectConfig {
  id: string
  classId: string
  sectionId: string | null
  subjectId: string
  totalMarks: number
  gradeOnly: boolean
  class?: { id: string; name: string } | null
  subject?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
}

interface ExamDetail {
  id: string
  name: string
  status: string
  lockedAt: string | null
  group: { paradigm: { name: string }; name: string }
  subjectConfigs: SubjectConfig[]
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface SubjectOption {
  id: string
  name: string
}

function toInputDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  examId: string
}

export function ExamSchedulePage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [rows, setRows] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [activeClassId, setActiveClassId] = useState('')
  const [patternSource, setPatternSource] = useState('')
  const [patternTarget, setPatternTarget] = useState('__all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [examRes, scheduleRes, classesRes, subjectsRes] = await Promise.all([
        api.get<{ exam: ExamDetail }>(`/api/school/exams/${examId}`),
        api.get<{ schedule: Array<ScheduleEntry & { examDate: string }> }>(
          `/api/school/exams/${examId}/schedule`,
        ),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ subjects: SubjectOption[] }>('/api/school/subjects'),
      ])
      setExam(examRes.exam)
      setRows(
        scheduleRes.schedule.map((r) => ({
          ...r,
          examDate: toInputDate(r.examDate),
        })),
      )
      setClasses(classesRes.classes)
      setSubjects(subjectsRes.subjects)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load schedule',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [examId, toast])

  useEffect(() => {
    void load()
  }, [load])

  // Distinct (class, section, subject) configs available for scheduling.
  const availableConfigs = exam?.subjectConfigs ?? []

  const classLookup = useMemo(() => {
    const map = new Map(classes.map((c) => [c.id, c]))
    for (const c of availableConfigs) {
      if (c.class && !map.has(c.class.id)) {
        map.set(c.class.id, { id: c.class.id, name: c.class.name })
      }
    }
    return map
  }, [classes, availableConfigs])
  const subjectLookup = useMemo(() => {
    const map = new Map(subjects.map((s) => [s.id, s]))
    for (const c of availableConfigs) {
      if (c.subject && !map.has(c.subject.id)) {
        map.set(c.subject.id, { id: c.subject.id, name: c.subject.name })
      }
    }
    return map
  }, [subjects, availableConfigs])

  const scheduleClassIds = useMemo(
    () => Array.from(new Set(availableConfigs.map((c) => c.classId))),
    [availableConfigs],
  )

  // Sections for a class: prefer the classes list, then fall back to the names
  // embedded in the exam's configs (covers soft-deleted classes).
  const sectionsForClass = useCallback(
    (cid: string) => {
      const fromClasses = classLookup.get(cid)?.sections ?? []
      const fromConfigs = new Map<string, { id: string; name: string }>()
      for (const c of availableConfigs) {
        if (c.classId === cid && c.section) fromConfigs.set(c.section.id, c.section)
      }
      return [...fromClasses, ...fromConfigs.values()]
    },
    [classLookup, availableConfigs],
  )

  const patternSourceId = patternSource || scheduleClassIds[0] || ''

  const patternTargets = useMemo(
    () =>
      patternTarget === '__all'
        ? scheduleClassIds.filter((c) => c !== patternSourceId)
        : patternTarget === patternSourceId
          ? []
          : [patternTarget],
    [patternTarget, patternSourceId, scheduleClassIds],
  )

  useEffect(() => {
    if (scheduleClassIds.length === 0) return
    if (!scheduleClassIds.includes(activeClassId)) setActiveClassId(scheduleClassIds[0])
  }, [scheduleClassIds, activeClassId])

  const activeClassRows = useMemo(
    () => rows.filter((r) => r.classId === activeClassId),
    [rows, activeClassId],
  )

  const classMissingCount = useMemo(() => {
    const configSubjects = availableConfigs
      .filter((c) => c.classId === activeClassId && !c.gradeOnly)
      .map((c) => c.subjectId)
    const rowSubjects = new Set(activeClassRows.map((r) => r.subjectId))
    return configSubjects.filter((s) => !rowSubjects.has(s)).length
  }, [availableConfigs, activeClassId, activeClassRows])

  // Live conflict detection based on current rows.
  const conflicts = useMemo(() => {
    const scheduleRows: ScheduleRow[] = rows
      .filter((r) => r.examDate && r.startTime && r.endTime && r.classId && r.subjectId)
      .map((r) => ({
        id: r.id,
        classId: r.classId,
        sectionId: r.sectionId,
        subjectId: r.subjectId,
        examDate: r.examDate,
        startTime: r.startTime,
        endTime: r.endTime,
        invigilatorId: r.invigilatorId,
      }))
    try {
      return detectScheduleConflicts(scheduleRows)
    } catch {
      return []
    }
  }, [rows])

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        classId: activeClassId,
        sectionId: null,
        subjectId: '',
        examDate: '',
        startTime: '09:00',
        endTime: '12:00',
        roomNumber: null,
        invigilatorId: null,
        maxMarks: 100,
        durationMinutes: null,
        instructions: null,
        _new: true,
        _dirty: true,
      },
    ])
  }

  function updateRow(idx: number, patch: Partial<ScheduleEntry>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, _dirty: true } : r)))
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function addAllSubjectsForClass(classId: string) {
    const existing = new Set(rows.filter((r) => r.classId === classId).map((r) => r.subjectId))
    const missing = availableConfigs.filter(
      (c) => c.classId === classId && !c.gradeOnly && !existing.has(c.subjectId),
    )
    if (missing.length === 0) {
      toast({
        title: 'Already covered',
        description: 'All subjects of this class are already in the schedule.',
      })
      return
    }
    setRows((prev) => [
      ...prev,
      ...missing.map((c) => ({
        classId,
        sectionId: c.sectionId,
        subjectId: c.subjectId,
        examDate: '',
        startTime: '09:00',
        endTime: '12:00',
        roomNumber: null,
        invigilatorId: null,
        maxMarks: c.totalMarks,
        durationMinutes: null,
        instructions: null,
        _new: true,
        _dirty: true,
      })),
    ])
    toast({
      title: `${missing.length} paper(s) added`,
      description: `${classLookup.get(classId)?.name ?? classId}: all non-grade-only subjects now have a row.`,
    })
  }

  function openClass(classId: string) {
    setActiveClassId(classId)
    if (!hasAnyPermission([PERMISSIONS.EXAM_MANAGE])) return
    const hasRows = rows.some((r) => r.classId === classId)
    if (!hasRows) addAllSubjectsForClass(classId)
  }

  function handleApplyPattern() {
    const source = rows.filter(
      (r) => r.classId === patternSourceId && r.examDate && r.startTime && r.endTime,
    )
    if (source.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nothing to copy',
        description: 'Set date, start and end time on the source class rows first.',
      })
      return
    }
    if (patternTargets.length === 0) return
    const sourceBySubject = new Map(source.map((r) => [r.subjectId, r]))
    let updated = 0
    let added = 0
    const next = rows.map((r) => {
      if (!patternTargets.includes(r.classId)) return r
      const s = sourceBySubject.get(r.subjectId)
      if (!s) return r
      if (r.examDate === s.examDate && r.startTime === s.startTime && r.endTime === s.endTime) {
        return r
      }
      updated += 1
      return {
        ...r,
        examDate: s.examDate,
        startTime: s.startTime,
        endTime: s.endTime,
        _dirty: true,
      }
    })
    const existing = new Set(
      next.filter((r) => patternTargets.includes(r.classId)).map((r) => `${r.classId}:${r.subjectId}`),
    )
    const toAdd: ScheduleEntry[] = []
    for (const tcid of patternTargets) {
      for (const c of availableConfigs) {
        if (c.classId !== tcid || c.gradeOnly) continue
        if (existing.has(`${tcid}:${c.subjectId}`)) continue
        const s = sourceBySubject.get(c.subjectId)
        if (!s) continue
        toAdd.push({
          classId: tcid,
          sectionId: c.sectionId,
          subjectId: c.subjectId,
          examDate: s.examDate,
          startTime: s.startTime,
          endTime: s.endTime,
          roomNumber: null,
          invigilatorId: null,
          maxMarks: c.totalMarks,
          durationMinutes: null,
          instructions: null,
          _new: true,
          _dirty: true,
        })
        added += 1
      }
    }
    setRows(toAdd.length > 0 ? [...next, ...toAdd] : next)
    toast({
      title: 'Pattern copied',
      description: `Updated ${updated} row(s)${added > 0 ? `, added ${added} new row(s)` : ''}. Review and save.`,
    })
  }

  async function handleSaveAll() {
    if (conflicts.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Resolve conflicts first',
        description: conflicts[0].message,
      })
      return
    }
    setSaving(true)
    try {
      const payload = {
        rows: rows.map((r) => ({
          id: r.id,
          classId: r.classId,
          sectionId: r.sectionId,
          subjectId: r.subjectId,
          examDate: r.examDate,
          startTime: r.startTime,
          endTime: r.endTime,
          roomNumber: r.roomNumber,
          invigilatorId: r.invigilatorId,
          maxMarks: r.maxMarks,
          durationMinutes: r.durationMinutes,
          instructions: r.instructions,
        })),
      }
      await api.post(`/api/school/exams/${examId}/schedule/bulk`, payload)
      toast({ title: 'Schedule saved' })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not save schedule',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (!exam) return null

  return (
    <div className="space-y-4">
      <GradientHero
        icon={CalIcon}
        title={`Schedule: ${exam.name}`}
        badge={`${rows.length} paper${rows.length === 1 ? '' : 's'}`}
        description={`${exam.group.paradigm.name} · ${exam.group.name}`}
        primaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'Save schedule',
                icon: Save,
                onClick: () => void handleSaveAll(),
              }
            : undefined
        }
        secondaryAction={
          hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? {
                label: 'Add row',
                icon: Plus,
                onClick: addRow,
              }
            : undefined
        }
      />

      {conflicts.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" /> {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} detected
          </div>
          <ul className="mt-1 space-y-0.5 pl-6 text-xs text-destructive/90">
            {conflicts.slice(0, 5).map((c, i) => (
              <li key={i}>{c.message}</li>
            ))}
            {conflicts.length > 5 && <li>…and {conflicts.length - 5} more.</li>}
          </ul>
        </div>
      )}

      {scheduleClassIds.length === 0 ? (
        <GradientEmptyState
          icon={CalIcon}
          title="No subjects configured"
          description="Add subjects on the configure page before scheduling."
          {...(hasAnyPermission([PERMISSIONS.EXAM_MANAGE])
            ? { actionLabel: 'Go to configure', onAction: () => void router.push(`/exams/${examId}/configure`) }
            : {})}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {scheduleClassIds.map((cid) => {
              const active = cid === activeClassId
              const count = rows.filter((r) => r.classId === cid).length
              return (
                <Button
                  key={cid}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-8 text-xs', active && 'shadow-sm')}
                  onClick={() => openClass(cid)}
                >
                  {classLookup.get(cid)?.name ?? cid}
                  <span className={cn('ml-1.5 rounded-full px-1.5 text-[10px]', active ? 'bg-white/25' : 'bg-muted')}>
                    {count}
                  </span>
                </Button>
              )
            })}
          </div>

          {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && scheduleClassIds.length > 1 && (
            <Card className="gap-0 overflow-hidden border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 py-0 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10">
              <CardContent className="p-3 sm:p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                    <Copy className="size-3.5" />
                  </span>
                  <h3 className="text-sm font-semibold">Copy schedule pattern</h3>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
                    <Select value={patternSourceId} onValueChange={setPatternSource}>
                      <SelectTrigger className="h-8 w-40 bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {scheduleClassIds.map((cid) => (
                          <SelectItem key={cid} value={cid}>{classLookup.get(cid)?.name ?? cid}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
                    <Select value={patternTarget} onValueChange={setPatternTarget}>
                      <SelectTrigger className="h-8 w-44 bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All other classes</SelectItem>
                        {scheduleClassIds
                          .filter((c) => c !== patternSourceId)
                          .map((cid) => (
                            <SelectItem key={cid} value={cid}>{classLookup.get(cid)?.name ?? cid}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => void handleApplyPattern()}
                    disabled={patternTargets.length === 0}
                  >
                    <Copy className="size-3.5" /> Apply pattern
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Copies date and times by subject name; adds missing subject rows automatically.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <div className="flex flex-wrap items-center gap-2 border-b border-sky-200/60 bg-gradient-to-r from-sky-500/10 via-transparent to-violet-500/10 px-3 py-2 dark:border-sky-500/20">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white">
            <CalIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">
              {classLookup.get(activeClassId)?.name ?? activeClassId}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {activeClassRows.length} paper{activeClassRows.length === 1 ? '' : 's'} · click a class above to switch
            </p>
          </div>
          {hasAnyPermission([PERMISSIONS.EXAM_MANAGE]) && (
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => addAllSubjectsForClass(activeClassId)}
                disabled={classMissingCount === 0}
              >
                <Plus className="size-3.5" />
                {classMissingCount > 0 ? `Add ${classMissingCount} missing` : 'All subjects added'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addRow}>
                <Plus className="size-3.5" /> Add row
              </Button>
            </div>
          )}
        </div>
        <CardContent className="space-y-2 p-3">
          {activeClassRows.length === 0 ? (
            <div className="rounded-md border border-dashed border-sky-300/60 bg-white/40 p-6 text-center dark:border-sky-500/30 dark:bg-card/40">
              <p className="text-sm font-medium">No papers for this class yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Click “Add all subjects” to create one row per subject, then set dates and times.
              </p>
            </div>
          ) : (
            rows.map((r, idx) => {
              if (r.classId !== activeClassId) return null
              const klass = classLookup.get(r.classId)
              return (
                <div
                  key={r.id ?? `new-${idx}`}
                  className="relative rounded-md border border-current/10 bg-white/70 p-2 pl-3 pr-12 shadow-sm dark:bg-card/60"
                >
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    {r._new && (
                      <Badge variant="outline" className="text-[10px]">New</Badge>
                    )}
                    {r._dirty && !r._new && (
                      <Badge variant="outline" className="text-[10px] text-amber-600">Edited</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => removeRow(idx)}
                      disabled={!hasAnyPermission([PERMISSIONS.EXAM_MANAGE])}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-3">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</Label>
                    <Select value={r.classId} onValueChange={(v) => updateRow(idx, { classId: v, sectionId: null })}>
                      <SelectTrigger className="h-8 bg-white dark:bg-input/30"><SelectValue placeholder="Class" /></SelectTrigger>
                      <SelectContent>
                        {availableConfigs
                          .map((c) => c.classId)
                          .filter((v, i, arr) => arr.indexOf(v) === i)
                          .map((cid) => (
                            <SelectItem key={cid} value={cid}>{classLookup.get(cid)?.name ?? cid}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Section</Label>
                    <Select
                      value={r.sectionId ?? '__all'}
                      onValueChange={(v) => updateRow(idx, { sectionId: v === '__all' ? null : v })}
                    >
                      <SelectTrigger className="h-8 bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All sections</SelectItem>
                        {sectionsForClass(r.classId).map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</Label>
                    <Select value={r.subjectId} onValueChange={(v) => updateRow(idx, { subjectId: v })}>
                      <SelectTrigger className="h-8 bg-white dark:bg-input/30"><SelectValue placeholder="Subject" /></SelectTrigger>
                      <SelectContent>
                        {availableConfigs
                          .filter((c) => c.classId === r.classId)
                          .map((c) => c.subjectId)
                          .filter((v, i, arr) => arr.indexOf(v) === i)
                          .map((sid) => (
                            <SelectItem key={sid} value={sid}>{subjectLookup.get(sid)?.name ?? sid}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Date</Label>
                    <Input
                      type="date"
                      className="h-8 bg-white dark:bg-input/30"
                      value={r.examDate}
                      onChange={(e) => updateRow(idx, { examDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</Label>
                    <Input
                      type="time"
                      className="h-8 bg-white dark:bg-input/30"
                      value={r.startTime}
                      onChange={(e) => updateRow(idx, { startTime: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">End</Label>
                    <Input
                      type="time"
                      className="h-8 bg-white dark:bg-input/30"
                      value={r.endTime}
                      onChange={(e) => updateRow(idx, { endTime: e.target.value })}
                    />
                  </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.push(`/exams/${examId}/admit-cards`)}
          disabled={saving}
          className="gap-1.5"
        >
          <TicketCheck className="size-4" /> Admit cards
        </Button>
        <Button variant="outline" onClick={() => router.push(`/exams/${examId}/configure`)} disabled={saving}>
          Back to configure
        </Button>
        <Button
          onClick={() => void handleSaveAll()}
          disabled={saving || conflicts.length > 0 || !hasAnyPermission([PERMISSIONS.EXAM_MANAGE])}
          className="gap-1.5"
        >
          <Save className="size-4" /> {saving ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </div>
  )
}
