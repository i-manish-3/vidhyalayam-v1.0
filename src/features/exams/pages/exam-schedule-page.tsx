'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
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
import { useToast } from '@/hooks/use-toast'
import { detectScheduleConflicts, type ScheduleRow } from '@/features/exams/lib/schedule-conflict-checker'
import { Calendar as CalIcon, Plus, Save, Trash2, AlertTriangle, TicketCheck } from 'lucide-react'

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

interface TeacherOption {
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exam, setExam] = useState<ExamDetail | null>(null)
  const [rows, setRows] = useState<ScheduleEntry[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [teachers, setTeachers] = useState<TeacherOption[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [examRes, scheduleRes, classesRes, subjectsRes, teachersRes] = await Promise.all([
        api.get<{ exam: ExamDetail }>(`/api/school/exams/${examId}`),
        api.get<{ schedule: Array<ScheduleEntry & { examDate: string }> }>(
          `/api/school/exams/${examId}/schedule`,
        ),
        api.get<{ classes: ClassOption[] }>('/api/school/classes'),
        api.get<{ subjects: SubjectOption[] }>('/api/school/subjects'),
        api.get<{ teachers: TeacherOption[] }>('/api/school/teachers'),
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
      setTeachers(teachersRes.teachers)
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

  const classLookup = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const subjectLookup = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const teacherLookup = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers])

  // Distinct (class, section, subject) configs available for scheduling.
  const availableConfigs = exam?.subjectConfigs ?? []

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
        classId: '',
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
    <div className="space-y-5">
      <PageHeader
        title={`Schedule: ${exam.name}`}
        description={`${exam.group.paradigm.name} · ${exam.group.name}`}
        backAction={{ onClick: () => router.push(`/exams/${examId}/configure`) }}
        action={{
          label: 'Save schedule',
          icon: Save,
          onClick: () => void handleSaveAll(),
        }}
        secondaryAction={{
          label: 'Add row',
          icon: Plus,
          onClick: addRow,
        }}
      />

      {conflicts.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
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

      {rows.length === 0 ? (
        <EmptyState
          icon={CalIcon}
          title="No schedule yet"
          description="Add a row per paper. The conflict checker runs as you type."
          action={{ label: 'Add first row', onClick: addRow }}
        />
      ) : (
        <Card>
          <CardContent className="space-y-2 p-3">
            {rows.map((r, idx) => {
              const klass = classLookup.get(r.classId)
              return (
                <div key={r.id ?? `new-${idx}`} className="grid grid-cols-12 gap-2 rounded-md border bg-card p-2">
                  <div className="col-span-12 sm:col-span-3">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</Label>
                    <Select value={r.classId} onValueChange={(v) => updateRow(idx, { classId: v, sectionId: null })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Class" /></SelectTrigger>
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
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All sections</SelectItem>
                        {(klass?.sections ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</Label>
                    <Select value={r.subjectId} onValueChange={(v) => updateRow(idx, { subjectId: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Subject" /></SelectTrigger>
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
                      className="h-8"
                      value={r.examDate}
                      onChange={(e) => updateRow(idx, { examDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</Label>
                    <Input
                      type="time"
                      className="h-8"
                      value={r.startTime}
                      onChange={(e) => updateRow(idx, { startTime: e.target.value })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">End</Label>
                    <Input
                      type="time"
                      className="h-8"
                      value={r.endTime}
                      onChange={(e) => updateRow(idx, { endTime: e.target.value })}
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Invigilator</Label>
                    <Select
                      value={r.invigilatorId ?? '__none'}
                      onValueChange={(v) => updateRow(idx, { invigilatorId: v === '__none' ? null : v })}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Unassigned</SelectItem>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Room</Label>
                    <Input
                      className="h-8"
                      placeholder="A-101"
                      value={r.roomNumber ?? ''}
                      onChange={(e) => updateRow(idx, { roomNumber: e.target.value || null })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max marks</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8"
                      value={r.maxMarks}
                      onChange={(e) => updateRow(idx, { maxMarks: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2 flex items-end gap-1">
                    {r._new && (
                      <Badge variant="outline" className="text-[10px]">New</Badge>
                    )}
                    {r._dirty && !r._new && (
                      <Badge variant="outline" className="text-[10px] text-amber-600">Edited</Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto size-8 text-destructive"
                      onClick={() => removeRow(idx)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

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
        <Button onClick={() => void handleSaveAll()} disabled={saving || conflicts.length > 0} className="gap-1.5">
          <Save className="size-4" /> {saving ? 'Saving…' : 'Save schedule'}
        </Button>
      </div>
    </div>
  )
}
