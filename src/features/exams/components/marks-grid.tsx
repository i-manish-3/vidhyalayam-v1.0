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
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import {
  Save,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Users,
  BookOpen,
  Layers3,
  ShieldCheck,
  CircleDot,
} from 'lucide-react'

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

interface MarksGridProps {
  examId: string
  examStatus: string
  academicYear: string
}

interface DirtyEntry {
  studentId: string
  componentId: string | null
  patch: Partial<MarksCell>
}

export function MarksGrid({ examId, examStatus }: MarksGridProps) {
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [grid, setGrid] = useState<GridData>({ subjectConfig: null, students: [] })
  const [dirty, setDirty] = useState<Map<string, DirtyEntry>>(new Map())
  const dirtyRef = useRef<Map<string, DirtyEntry>>(new Map())
  const savingRef = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savedCount, setSavedCount] = useState(0)

  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [classOptions, setClassOptions] = useState<{ id: string; name: string }[]>([])
  const [sectionOptions, setSectionOptions] = useState<{ id: string; name: string }[]>([])
  const [subjectOptions, setSubjectOptions] = useState<{ id: string; name: string }[]>([])

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

  useEffect(() => {
    const klass = classOptions.find((c) => c.id === selectedClassId) as { sections?: { id: string; name: string }[] } | undefined
    setSectionOptions(klass?.sections ?? [])
    if (selectedSectionId && !klass?.sections?.some((s) => s.id === selectedSectionId)) {
      setSelectedSectionId(null)
    }
  }, [selectedClassId, classOptions, selectedSectionId])

  const loadGrid = useCallback(async () => {
    if (!selectedClassId || !selectedSubjectId) return
    setLoading(true)
    dirtyRef.current = new Map()
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

  const flushSave = useCallback(async () => {
    if (savingRef.current || dirtyRef.current.size === 0) return
    savingRef.current = true
    setSaving(true)
    const toSave = Array.from(dirtyRef.current.values())
    dirtyRef.current = new Map()
    setDirty(new Map())
    try {
      const entries = toSave.map((entry) => ({
        studentId: entry.studentId,
        componentId: entry.componentId,
        ...entry.patch,
      }))
      const res = await api.put<{ saved: number; message: string }>(
        `/api/school/exams/${examId}/marks-grid`,
        { classId: selectedClassId, sectionId: selectedSectionId, subjectId: selectedSubjectId, entries },
      )
      setSavedCount((count) => count + res.saved)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Auto-save failed',
        description: err instanceof Error ? err.message : 'Please try again - your changes were kept.',
      })
      setDirty((prev) => {
        const next = new Map(prev)
        for (const entry of toSave) {
          next.set(`${entry.studentId}::${entry.componentId ?? '__config__'}`, entry)
        }
        dirtyRef.current = next
        return next
      })
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [examId, selectedClassId, selectedSectionId, selectedSubjectId, toast])

  const scheduleSave = useCallback((key: string, entry: DirtyEntry) => {
    const next = new Map(dirtyRef.current)
    const existing = next.get(key)
    next.set(key, existing ? { ...existing, patch: { ...existing.patch, ...entry.patch } } : entry)
    dirtyRef.current = next
    setDirty(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushSave(), 1500)
  }, [flushSave])

  const config = grid.subjectConfig
  const components = config?.components ?? []
  const hasConfigComp = components.length > 0
  const allLabels = hasConfigComp
    ? components
    : [{
        id: '__config__',
        name: 'Marks',
        shortCode: 'Total' as string | null,
        maxMarks: config?.totalMarks ?? 0,
        passingMarks: config?.passingMarks ?? 33,
        gradeOnly: config?.gradeOnly ?? false,
        sequence: 0,
      }]

  const buildAllEntries = useCallback(() => {
    if (!config) return []
    return grid.students.flatMap((student) =>
      allLabels.map((label) => {
        const cell = student.marks[label.id]
        return {
          studentId: student.id,
          componentId: label.id === '__config__' ? null : label.id,
          numericValue: cell?.numericValue ?? null,
          gradeValue: cell?.gradeValue ?? null,
          status: cell?.status ?? 'entered',
          graceMarks: cell?.graceMarks ?? 0,
          remarks: cell?.remarks ?? null,
        }
      }),
    )
  }, [allLabels, config, grid.students])

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
          entries: buildAllEntries(),
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
  }, [dirty, flushSave, examId, selectedClassId, selectedSectionId, selectedSubjectId, toast, loadGrid, buildAllEntries])

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

  const lockedCount = useMemo(
    () => grid.students.filter((student) => Object.values(student.marks).some((mark) => mark.lockedAt)).length,
    [grid.students],
  )
  const submittedCount = useMemo(
    () => grid.students.filter((student) => Object.values(student.marks).some((mark) => mark.submittedAt)).length,
    [grid.students],
  )
  const submittedEntries = useMemo(
    () => grid.students.reduce(
      (sum, student) => sum + Object.values(student.marks).filter((mark) => mark.submittedAt).length,
      0,
    ),
    [grid.students],
  )
  const dirtyCount = dirty.size
  const selectedClassName = classOptions.find((item) => item.id === selectedClassId)?.name
  const selectedSectionName = selectedSectionId
    ? sectionOptions.find((item) => item.id === selectedSectionId)?.name
    : selectedClassId
      ? 'All sections'
      : ''
  const selectedSubjectName = subjectOptions.find((item) => item.id === selectedSubjectId)?.name
  const totalEntries = grid.students.length * allLabels.length
  const completionPercent = totalEntries > 0 ? Math.round((submittedEntries / totalEntries) * 100) : 0
  const published = examStatus === 'result_published'
  const canEnterMarks = hasAnyPermission([
    PERMISSIONS.EXAM_MARKS,
    'exam:marks:enter',
    'exam:marks:submit',
  ])
  const canManageExam = hasAnyPermission([
    PERMISSIONS.EXAM_MANAGE,
    'exam:configure',
    'exam:marks:lock',
    'exam:marks:unlock',
  ])
  const canEditCells = canEnterMarks && !published

  const updateCell = useCallback(
    (studentId: string, compId: string | null, patch: Partial<MarksCell>) => {
      setGrid((prev) => ({
        ...prev,
        students: prev.students.map((student) => {
          if (student.id !== studentId) return student
          const key = compId ?? '__config__'
          const current = student.marks[key]
          return {
            ...student,
            marks: {
              ...student.marks,
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
      <div className="rounded-md border bg-background">
        <div className="grid gap-3 border-b p-3 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
              <Users className="size-3" /> Class
            </span>
            <Select value={selectedClassId} onValueChange={(value) => { setSelectedClassId(value); setSelectedSectionId(null) }}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Pick class" /></SelectTrigger>
              <SelectContent>
                {classOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
              <Layers3 className="size-3" /> Section
            </span>
            <Select value={selectedSectionId ?? '__all'} onValueChange={(value) => setSelectedSectionId(value === '__all' ? null : value)}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All sections</SelectItem>
                {sectionOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-muted-foreground">
              <BookOpen className="size-3" /> Subject
            </span>
            <Select value={selectedSubjectId} onValueChange={(value) => setSelectedSubjectId(value)}>
              <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Pick subject" /></SelectTrigger>
              <SelectContent>
                {subjectOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              className="h-10 w-full gap-1.5 lg:w-auto"
              onClick={() => void loadGrid()}
              disabled={!selectedClassId || !selectedSubjectId || loading}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Load
            </Button>
          </div>
        </div>

        {(selectedClassName || selectedSubjectName) && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
            {selectedClassName && <Badge variant="secondary">{selectedClassName}</Badge>}
            {selectedSectionName && <Badge variant="outline">{selectedSectionName}</Badge>}
            {selectedSubjectName && <Badge variant="secondary">{selectedSubjectName}</Badge>}
          </div>
        )}
      </div>

      {!selectedClassId || !selectedSubjectId ? (
        <div className="flex min-h-[28vh] items-center justify-center rounded-md border border-dashed bg-muted/20 p-6 text-center">
          <div className="space-y-2">
            <BookOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Select class and subject</p>
            <p className="text-xs text-muted-foreground">Marks grid will appear here.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex min-h-[30vh] items-center justify-center rounded-md border bg-muted/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Loading marks
          </div>
        </div>
      ) : !config ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          No subject config found for this selection.
        </div>
      ) : grid.students.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No students found in this class/section.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Students</span>
                <Users className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xl font-semibold">{grid.students.length}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Submitted</span>
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <p className="mt-1 text-xl font-semibold">{submittedCount}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Locked</span>
                <Lock className="size-4 text-amber-600" />
              </div>
              <p className="mt-1 text-xl font-semibold">{lockedCount}</p>
            </div>
            <div className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Progress</span>
                <CircleDot className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completionPercent}%` }} />
                </div>
                <span className="w-9 text-right text-xs font-medium">{completionPercent}%</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
            {dirtyCount > 0 ? (
              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                <AlertCircle className="size-3" /> {dirtyCount} unsaved
              </Badge>
            ) : savedCount > 0 ? (
              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                <CheckCircle2 className="size-3" /> Saved
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="size-3" /> Ready
              </Badge>
            )}
            {saving && (
              <Badge variant="outline" className="gap-1">
                <Loader2 className="size-3 animate-spin" /> Saving
              </Badge>
            )}
            <span className="text-muted-foreground">
              {allLabels.length} component{allLabels.length === 1 ? '' : 's'} / {config.totalMarks} marks
            </span>
            {published && (
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                Published
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto rounded-md border bg-background">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="sticky top-0 z-10 border-b bg-muted/70">
                  <th className="sticky left-0 z-20 w-14 bg-muted/70 px-3 py-2 text-left text-xs font-medium">#</th>
                  <th className="sticky left-14 z-20 min-w-[190px] bg-muted/70 px-3 py-2 text-left text-xs font-medium">Student</th>
                  {allLabels.map((component) => (
                    <th key={component.id} className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 100 }}>
                      <div className="truncate">{component.shortCode || component.name}</div>
                      {component.gradeOnly ? (
                        <Badge variant="secondary" className="text-[9px]">Grade</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">max {component.maxMarks}</span>
                      )}
                    </th>
                  ))}
                  {hasConfigComp && (
                    <th className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 80 }}>
                      Total
                    </th>
                  )}
                  <th className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 110 }}>
                    Status
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium" style={{ minWidth: 74 }}>
                    Grace
                  </th>
                </tr>
              </thead>
              <tbody>
                {grid.students.map((student, index) => {
                  const rowTotal = allLabels
                    .filter((component) => !component.gradeOnly)
                    .reduce((sum, component) => {
                      const cell = student.marks[component.id]
                      if (!cell || cell.status !== 'entered') return sum
                      return sum + (cell.numericValue ?? 0)
                    }, 0)
                  const anyLocked = Object.values(student.marks).some((mark) => mark.lockedAt)

                  return (
                    <tr
                      key={student.id}
                      className={cn(
                        'border-b transition odd:bg-muted/10 hover:bg-muted/40',
                        anyLocked && 'bg-amber-50/50 dark:bg-amber-950/10',
                      )}
                    >
                      <td className="sticky left-0 z-10 w-14 bg-background px-3 py-2 text-xs text-muted-foreground">
                        {student.rollNumber ?? index + 1}
                      </td>
                      <td className="sticky left-14 z-10 bg-background px-3 py-2">
                        <div className="max-w-[170px]">
                          <span className="block truncate font-medium">
                            {student.firstName} {student.lastName}
                          </span>
                          {student.admissionNumber && (
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {student.admissionNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      {allLabels.map((component) => {
                        const cell = student.marks[component.id]
                        const locked = Boolean(cell?.lockedAt) || !canEditCells
                        const isDirty = dirty.has(`${student.id}::${component.id}`)

                        if (component.gradeOnly) {
                          return (
                            <td key={component.id} className="px-1.5 py-1.5 text-center">
                              <Input
                                className="mx-auto h-9 w-20 text-center text-xs"
                                placeholder="A1"
                                disabled={locked}
                                value={cell?.gradeValue ?? ''}
                                onChange={(event) =>
                                  updateCell(student.id, component.id === '__config__' ? null : component.id, {
                                    gradeValue: event.target.value || null,
                                  })
                                }
                              />
                            </td>
                          )
                        }

                        return (
                          <td key={component.id} className="px-1.5 py-1.5 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={component.maxMarks}
                              step={0.5}
                              className={cn(
                                'mx-auto h-9 w-20 text-center text-xs',
                                isDirty && 'border-amber-400',
                              )}
                              disabled={locked || cell?.status !== 'entered'}
                              value={cell?.status === 'entered' ? (cell?.numericValue ?? '') : ''}
                              onChange={(event) => {
                                const value = event.target.value
                                updateCell(student.id, component.id === '__config__' ? null : component.id, {
                                  numericValue: value === '' || value === '-'
                                    ? null
                                    : Math.min(component.maxMarks, Math.max(0, Number(value) || 0)),
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
                          {config.totalMarks > 0 && (
                            <span className="text-[10px] text-muted-foreground"> / {config.totalMarks}</span>
                          )}
                        </td>
                      )}

                      <td className="px-1.5 py-1.5 text-center">
                        {allLabels.length > 0 && (() => {
                          const firstKey = allLabels[0].id
                          const cell = student.marks[firstKey]
                          const locked = Boolean(cell?.lockedAt) || !canEditCells
                          return (
                            <Select
                              value={cell?.status ?? 'entered'}
                              disabled={locked}
                              onValueChange={(value) => {
                                for (const component of allLabels) {
                                  updateCell(student.id, component.id === '__config__' ? null : component.id, {
                                    status: value,
                                    numericValue: null,
                                  })
                                }
                              }}
                            >
                              <SelectTrigger className="mx-auto h-9 w-28 text-xs">
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
                              max={config.graceMarksMax}
                              className="mx-auto h-9 w-16 text-center text-xs"
                              disabled={!canEditCells || Boolean(cell?.lockedAt) || config.graceMarksMax === 0}
                              value={cell?.graceMarks ?? ''}
                              onChange={(event) => {
                                const value = Number(event.target.value)
                                updateCell(student.id, firstKey === '__config__' ? null : firstKey, {
                                  graceMarks: Number.isNaN(value)
                                    ? 0
                                    : Math.min(config.graceMarksMax, Math.max(0, value)),
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

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
            <div className="text-xs text-muted-foreground">
              {!canEnterMarks
                ? 'You can view marks for this scope.'
                : published
                  ? 'Results are published.'
                  : lockedCount > 0
                  ? `${lockedCount} student(s) locked.`
                  : submittedCount > 0
                    ? `${submittedCount} student(s) submitted.`
                    : dirtyCount > 0
                      ? 'Unsaved changes save automatically.'
                      : 'All saved.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {canEnterMarks && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={saving || dirtyCount === 0 || published}
                    onClick={() => void flushSave()}
                  >
                    <Save className="size-3.5" /> Save
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    disabled={saving || lockedCount > 0 || published}
                    onClick={() => void handleSubmit()}
                  >
                    <CheckCircle2 className="size-3.5" /> Submit
                  </Button>
                </>
              )}
              {canManageExam && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={saving || lockedCount === grid.students.length || published}
                  onClick={() => void handleLock()}
                >
                  <Lock className="size-3.5" /> Lock
                </Button>
              )}
              {canManageExam && lockedCount > 0 && !published && (
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
