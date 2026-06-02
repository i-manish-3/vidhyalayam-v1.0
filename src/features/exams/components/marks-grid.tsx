'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import {
  Save,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'

// ---------- Types matching the GET/PUT API contracts ----------

interface ComponentDef {
  id: string
  name: string
  shortCode: string | null
  maxMarks: number
  passingMarks: number
  gradeOnly: boolean
  sequence: number
}

interface SubjectConfigDef {
  id: string
  totalMarks: number
  passingMarks: number
  graceMarksMax: number
  gradeOnly: boolean
  components: ComponentDef[]
}

interface MarksCell {
  id: string
  numericValue: number | null
  gradeValue: string | null
  status: string
  graceMarks: number
  remarks: string | null
  submittedAt: string | null
  lockedAt: string | null
  version: number
}

interface StudentRow {
  id: string
  firstName: string
  lastName: string
  rollNumber: string | null
  admissionNumber: string | null
  sectionId: string | null
  marks: Record<string, MarksCell>
}

interface GridData {
  subjectConfig: SubjectConfigDef | null
  students: StudentRow[]
}

// ---------- Component ----------

interface MarksGridProps {
  examId: string
  examStatus: string
  academicYear: string
}

// Cell-level dirty tracking so we only PUT when something actually changed.
interface DirtyEntry {
  studentId: string
  componentId: string | null
  patch: Partial<MarksCell>
}

export function MarksGrid({ examId, examStatus }: MarksGridProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [grid, setGrid] = useState<GridData>({ subjectConfig: null, students: [] })
  const [dirty, setDirty] = useState<Map<string, DirtyEntry>>(new Map())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedCount, setSavedCount] = useState(0)

  // Filters
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [classOptions, setClassOptions] = useState<{ id: string; name: string }[]>([])
  const [sectionOptions, setSectionOptions] = useState<{ id: string; name: string }[]>([])
  const [subjectOptions, setSubjectOptions] = useState<{ id: string; name: string }[]>([])

  // Load filter options on mount
  useEffect(() => {
    void (async () => {
      const [classesRes, subjectsRes] = await Promise.all([
        api.get<{ classes: { id: string; name: string; sections?: { id: string; name: string }[] }[] }>('/api/school/classes'),
        api.get<{ subjects: { id: string; name: string; shortCode?: string | null }[] }>('/api/school/subjects'),
      ])
      setClassOptions(classesRes.classes)
      setSubjectOptions(subjectsRes.subjects)
    })()
  }, [])

  // Update section options when class selection changes
  useEffect(() => {
    const klass = classOptions.find((c) => c.id === selectedClassId) as { sections?: { id: string; name: string }[] } | undefined
    setSectionOptions(klass?.sections ?? [])
    if (selectedSectionId && !klass?.sections?.some((s) => s.id === selectedSectionId)) {
      setSelectedSectionId(null)
    }
  }, [selectedClassId, classOptions, selectedSectionId])

  // Load grid data when all filters are set
  const loadGrid = useCallback(async () => {
    if (!selectedClassId || !selectedSubjectId) return
    setLoading(true)
    setDirty(new Map())
    try {
      const res = await api.get<{ grid: GridData }>(
        `/api/school/exams/${examId}/marks-grid`,
        {
          classId: selectedClassId,
          ...(selectedSectionId ? { sectionId: selectedSectionId } : {}),
          subjectId: selectedSubjectId,
        },
      )
      setGrid(res.grid)
      setSavedCount(0)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load marks',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [examId, selectedClassId, selectedSectionId, selectedSubjectId, toast])

  useEffect(() => {
    void loadGrid()
  }, [loadGrid])

  // Auto-save debounced at 1.5s
  const scheduleSave = useCallback((key: string, entry: DirtyEntry) => {
    setDirty((prev) => {
      const next = new Map(prev)
      const existing = next.get(key)
      next.set(key, existing
        ? { ...existing, patch: { ...existing.patch, ...entry.patch } }
        : entry)
      return next
    })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushSave(), 1500)
  }, [])

  const flushSave = useCallback(async () => {
    if (saving || dirty.size === 0) return
    setSaving(true)
    const toSave = Array.from(dirty.values())
    setDirty(new Map())
    try {
      const entries = toSave.map((e) => ({
        studentId: e.studentId,
        componentId: e.componentId,
        ...e.patch,
      }))
      const res = await api.put<{ saved: number; message: string }>(
        `/api/school/exams/${examId}/marks-grid`,
        { classId: selectedClassId, sectionId: selectedSectionId, subjectId: selectedSubjectId, entries },
      )
      setSavedCount((c) => c + res.saved)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Auto-save failed',
        description: err instanceof Error ? err.message : 'Please try again — your changes were kept.',
      })
      // Re-queue the unsaved entries
      setDirty((prev) => {
        const next = new Map(prev)
        for (const e of toSave) {
          next.set(`${e.studentId}::${e.componentId ?? '__config__'}`, e)
        }
        return next
      })
    } finally {
      setSaving(false)
    }
  }, [saving, dirty, examId, selectedClassId, selectedSectionId, selectedSubjectId, toast])

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (dirty.size > 0) await flushSave()
    setSaving(true)
    try {
      const res = await api.put<{ saved: number; submitted: number; message: string }>(
        `/api/school/exams/${examId}/marks-grid`,
        {
          classId: selectedClassId,
          sectionId: selectedSectionId,
          subjectId: selectedSubjectId,
          entries: [] as { studentId: string; componentId?: string | null; status?: string }[],
          submit: true,
        },
      )
      toast({ title: 'Marks submitted', description: res.message })
      void loadGrid()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not submit',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }, [dirty, flushSave, saving, examId, selectedClassId, selectedSectionId, selectedSubjectId, toast, loadGrid])

  // Lock handler
  const handleLock = useCallback(async () => {
    try {
      const res = await api.post<{ locked: number; message: string }>(
        `/api/school/exams/${examId}/marks/lock`,
        { classId: selectedClassId, sectionId: selectedSectionId, subjectId: selectedSubjectId },
      )
      toast({ title: 'Marks locked', description: res.message })
      void loadGrid()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not lock',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [examId, selectedClassId, selectedSectionId, selectedSubjectId, toast, loadGrid])

  const handleUnlock = useCallback(async () => {
    const reason = prompt('Reason for unlocking:')
    if (reason === null) return
    try {
      const res = await api.post<{ unlocked: number; message: string }>(
        `/api/school/exams/${examId}/marks/unlock`,
        { classId: selectedClassId, sectionId: selectedSectionId, subjectId: selectedSubjectId, reason },
      )
      toast({ title: 'Marks unlocked', description: res.message })
      void loadGrid()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not unlock',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [examId, selectedClassId, selectedSectionId, selectedSubjectId, toast, loadGrid])

  const config = grid.subjectConfig
  const components = config?.components ?? []
  const hasConfigComp = components.length > 0
  const allLabels = hasConfigComp ? components : [{ id: '__config__', name: 'Marks', shortCode: 'Total' as string | null, maxMarks: config?.totalMarks ?? 0, passingMarks: config?.passingMarks ?? 33, gradeOnly: config?.gradeOnly ?? false, sequence: 0 }]

  const lockedCount = useMemo(
    () => grid.students.filter((s) => Object.values(s.marks).some((m) => m.lockedAt)).length,
    [grid.students],
  )
  const submittedCount = useMemo(
    () => grid.students.filter((s) => Object.values(s.marks).some((m) => m.submittedAt)).length,
    [grid.students],
  )
  const dirtyCount = dirty.size

  // Update cell value in local state + schedule save
  const updateCell = useCallback(
    (studentId: string, compId: string | null, patch: Partial<MarksCell>) => {
      setGrid((prev) => ({
        ...prev,
        students: prev.students.map((s) => {
          if (s.id !== studentId) return s
          const key = compId ?? '__config__'
          const current = s.marks[key]
          return {
            ...s,
            marks: {
              ...s.marks,
              [key]: { ...current, ...patch },
            },
          }
        }),
      }))
      scheduleSave(`${studentId}::${compId ?? '__config__'}`, { studentId, componentId: compId, patch })
    },
    [scheduleSave],
  )

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</span>
          <Select value={selectedClassId} onValueChange={(v) => { setSelectedClassId(v); setSelectedSectionId(null) }}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Pick class" /></SelectTrigger>
            <SelectContent>
              {classOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Section</span>
          <Select value={selectedSectionId ?? '__all'} onValueChange={(v) => setSelectedSectionId(v === '__all' ? null : v)}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All sections</SelectItem>
              {sectionOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</span>
          <Select value={selectedSubjectId} onValueChange={(v) => setSelectedSubjectId(v)}>
            <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Pick subject" /></SelectTrigger>
            <SelectContent>
              {subjectOptions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void loadGrid()}
          disabled={!selectedClassId || !selectedSubjectId}
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : 'Load'}
        </Button>
      </div>

      {!selectedClassId || !selectedSubjectId ? (
        <p className="text-sm text-muted-foreground">Select class and subject to load the marks grid.</p>
      ) : loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : !config ? (
        <p className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          No subject config found. Add this subject in the Configure page first.
        </p>
      ) : grid.students.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students found in this class/section.</p>
      ) : (
        <>
          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-muted-foreground">
              {grid.students.length} student{grid.students.length === 1 ? '' : 's'}
            </span>
            {submittedCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="size-3" /> {submittedCount} submitted
              </Badge>
            )}
            {lockedCount > 0 && (
              <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <Lock className="size-3" /> {lockedCount} locked
              </Badge>
            )}
            {dirtyCount > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <AlertCircle className="size-3" /> {dirtyCount} unsaved
              </Badge>
            )}
            {saving && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="size-3 animate-spin" /> Saving…
              </Badge>
            )}
            {savedCount > 0 && !saving && dirtyCount === 0 && (
              <span className="text-emerald-600">All changes saved.</span>
            )}
          </div>

          {/* Sticky grid */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b bg-muted/60">
                  <th className="sticky left-0 z-20 bg-muted/60 px-3 py-2 text-left text-xs font-medium">#</th>
                  <th className="sticky left-0 z-20 bg-muted/60 px-3 py-2 text-left text-xs font-medium">Student</th>
                  {allLabels.map((comp) => (
                    <th key={comp.id} className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 100 }}>
                      <div>{comp.name}</div>
                      {comp.gradeOnly && (
                        <Badge variant="secondary" className="text-[9px]">Grade</Badge>
                      )}
                      {!comp.gradeOnly && (
                        <span className="text-[10px] text-muted-foreground">≤ {comp.maxMarks}</span>
                      )}
                    </th>
                  ))}
                  {hasConfigComp && (
                    <th className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 70 }}>
                      Total
                    </th>
                  )}
                  <th className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 90 }}>
                    Status
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 60 }}>
                    Grace
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.students.map((student, idx) => {
                  const rowTotal = allLabels
                    .filter((c) => !c.gradeOnly)
                    .reduce((sum, c) => {
                      const cell = student.marks[c.id ?? '__config__']
                      if (!cell || cell.status !== 'entered') return sum
                      return sum + (cell.numericValue ?? 0)
                    }, 0)
                  const anyLocked = Object.values(student.marks).some((m) => m.lockedAt)

                  return (
                    <tr
                      key={student.id}
                      className={cn(
                        'border-b transition hover:bg-muted/30',
                        anyLocked && 'bg-slate-50/50 dark:bg-slate-900/20',
                      )}
                    >
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-xs text-muted-foreground">
                        {student.rollNumber ?? idx + 1}
                      </td>
                      <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                        <div className="max-w-[140px]">
                          <span className="truncate font-medium">
                            {student.firstName} {student.lastName}
                          </span>
                        </div>
                      </td>

                      {allLabels.map((comp) => {
                        const key = comp.id ?? '__config__'
                        const cell = student.marks[key]
                        const locked = Boolean(cell?.lockedAt)
                        const isDirty = dirty.has(`${student.id}::${comp.id ?? '__config__'}`)

                        if (comp.gradeOnly) {
                          return (
                            <td key={comp.id} className="px-1.5 py-1.5 text-center">
                              <Input
                                className="h-8 w-20 text-center text-xs"
                                placeholder="A1"
                                disabled={locked}
                                value={cell?.gradeValue ?? ''}
                                onChange={(e) =>
                                  updateCell(student.id, comp.id ?? null, { gradeValue: e.target.value || null })
                                }
                              />
                            </td>
                          )
                        }

                        return (
                          <td key={comp.id} className="px-1.5 py-1.5 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={comp.maxMarks}
                              step={0.5}
                              className={cn(
                                'h-8 w-20 text-center text-xs',
                                isDirty && 'border-amber-400',
                              )}
                              disabled={locked || cell?.status !== 'entered'}
                              value={cell?.status === 'entered' ? (cell?.numericValue ?? '') : ''}
                              onChange={(e) => {
                                const v = e.target.value
                                updateCell(student.id, comp.id ?? null, {
                                  numericValue: v === '' || v === '-' ? null : Math.min(comp.maxMarks, Math.max(0, Number(v) || 0)),
                                  status: 'entered',
                                })
                              }}
                            />
                          </td>
                        )
                      })}

                      {hasConfigComp && (
                        <td className="px-1.5 py-1.5 text-center text-xs font-medium">
                          {rowTotal}
                          {config && config.totalMarks > 0 && (
                            <span className="text-[10px] text-muted-foreground"> / {config.totalMarks}</span>
                          )}
                        </td>
                      )}

                      <td className="px-1.5 py-1.5 text-center">
                        {allLabels.length > 0 && (() => {
                          const firstKey = allLabels[0].id ?? '__config__'
                          const cell = student.marks[firstKey]
                          const locked = Boolean(cell?.lockedAt)
                          return (
                            <Select
                              value={cell?.status ?? 'entered'}
                              disabled={locked}
                              onValueChange={(v) => {
                                // Apply status change to all components for this student
                                for (const comp of allLabels) {
                                  updateCell(student.id, comp.id ?? null, {
                                    status: v,
                                    numericValue: v === 'entered' ? null : null,
                                  })
                                }
                              }}
                            >
                              <SelectTrigger className="h-8 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="entered">Present</SelectItem>
                                <SelectItem value="absent">Absent</SelectItem>
                                <SelectItem value="medical_leave">ML</SelectItem>
                                <SelectItem value="not_applicable">N/A</SelectItem>
                              </SelectContent>
                            </Select>
                          )
                        })()}
                      </td>
                      <td className="px-1.5 py-1.5 text-center">
                        {(() => {
                          const firstKey = allLabels[0]?.id ?? '__config__'
                          const cell = student.marks[firstKey]
                          return (
                            <Input
                              type="number"
                              min={0}
                              max={config?.graceMarksMax ?? 0}
                              className="h-8 w-16 text-center text-xs"
                              disabled={Boolean(cell?.lockedAt) || (config?.graceMarksMax ?? 0) === 0}
                              value={cell?.graceMarks ?? ''}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                updateCell(student.id, null, {
                                  graceMarks: Number.isNaN(v) ? 0 : Math.min(config?.graceMarksMax ?? 0, Math.max(0, v)),
                                })
                              }}
                            />
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">
              {lockedCount > 0
                ? `${lockedCount} student(s) locked.`
                : submittedCount > 0
                  ? `${submittedCount} student(s) submitted.`
                  : dirtyCount > 0
                    ? 'Unsaved changes — saving automatically in 1.5s.'
                    : 'All saved.'}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={saving || dirtyCount === 0}
                onClick={() => void flushSave()}
              >
                <Save className="size-3.5" /> Save now
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                disabled={saving || lockedCount > 0}
                onClick={() => void handleSubmit()}
              >
                <CheckCircle2 className="size-3.5" /> Submit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={saving || lockedCount === grid.students.length}
                onClick={() => void handleLock()}
              >
                <Lock className="size-3.5" /> Lock
              </Button>
              {lockedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void handleUnlock()}
                >
                  <Unlock className="size-3.5" /> Unlock
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
