'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GradientHero, LoadingState, GradientEmptyState, GradientDialogHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  FileSpreadsheet,
  Search,
  Users,
  Loader2,
  ClipboardList,
  ChevronRight,
} from 'lucide-react'

interface ExamInfo {
  id: string
  name: string
  academicYear: string
  group: { name: string; paradigm: { name: string } }
  examClasses: { classId: string; sectionIds: string | null }[]
}

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface StudentRow {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  academicEnrollments: Array<{
    rollNumber: string | null
    class: { id: string; name: string } | null
    section: { id: string; name: string } | null
  }>
}

interface ComponentRow {
  id: string
  name: string
  maxMarks: number
  passingMarks: number
  gradeOnly: boolean
  numericValue: number | null
  gradeValue: string | null
  status: string | null
}

interface SubjectRow {
  configId: string
  subjectId: string
  subjectName: string
  totalMarks: number
  passingMarks: number
  gradeOnly: boolean
  isCompulsory: boolean
  isOptional: boolean
  isAdditional: boolean
  components: ComponentRow[]
  singleEntry: {
    numericValue: number | null
    gradeValue: string | null
    status: string
    graceMarks: number
  } | null
  summary: {
    obtainedMarks: number
    totalMarks: number
    percentage: number
    grade: string | null
    status: string
    graceApplied: number
  } | null
}

interface MarksheetResponse {
  exam: { id: string; name: string; academicYear: string; status: string }
  student: {
    id: string
    firstName: string
    lastName: string | null
    rollNumber: string | null
    admissionNumber: string | null
    className: string | null
    sectionName: string | null
  }
  subjects: SubjectRow[]
  result: {
    totalMarks: number | null
    obtainedMarks: number | null
    percentage: number | null
    grade: string | null
    status: string | null
    rankInClass: number | null
    rankInSection: number | null
    computedAt: string | null
    persisted: boolean
  }
  gradeScaleConfigured: boolean
}

interface ClassMarksheetResponse {
  exam: { id: string; name: string; academicYear: string; status: string }
  classId: string
  className: string | null
  sectionId: string | null
  subjects: Array<{
    subjectId: string
    subjectName: string
    totalMarks: number
    passingMarks: number
    gradeOnly: boolean
  }>
  students: Array<{
    id: string
    firstName: string
    lastName: string | null
    rollNumber: string | null
    admissionNumber: string | null
    sectionId: string | null
    sectionName: string | null
    marks: Record<
      string,
      {
        obtainedMarks: number
        totalMarks: number
        percentage: number
        status: string
        grade: string | null
        gradeOnly: boolean
      } | null
    >
    totalMarks: number | null
    obtainedMarks: number | null
    percentage: number | null
    grade: string | null
    status: string | null
    rankInClass: number | null
    computedAt: string | null
  }>
  resultComputed: boolean
  gradeScaleConfigured: boolean
}

interface Props {
  examId: string
}

const TINTED_CARD =
  'border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10'

function statusTone(status: string | null): string {
  switch (status) {
    case 'pass':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300'
    case 'fail':
      return 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300'
    case 'absent':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
    case 'partial':
      return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300'
    case 'not_applicable':
      return 'border-muted bg-muted/40 text-muted-foreground'
    default:
      return 'border-muted bg-muted/40 text-muted-foreground'
  }
}

function statusLabel(status: string | null): string {
  switch (status) {
    case 'pass':
      return 'Pass'
    case 'fail':
      return 'Fail'
    case 'absent':
      return 'Absent'
    case 'partial':
      return 'Partial'
    case 'not_applicable':
      return 'N/A'
    default:
      return '—'
  }
}

export function MarksheetPage({ examId }: Props) {
  const { toast } = useToast()

  const [loadingOptions, setLoadingOptions] = useState(true)
  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [activeTab, setActiveTab] = useState<'class' | 'student'>('class')

  // Shared filters
  const [classId, setClassId] = useState('all')
  const [sectionId, setSectionId] = useState('all')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // Class marksheet state
  const [classSheet, setClassSheet] = useState<ClassMarksheetResponse | null>(null)
  const [loadingClass, setLoadingClass] = useState(false)

  // Student list state
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  // Student marksheet dialog state
  const [dialogStudent, setDialogStudent] = useState<StudentRow | null>(null)
  const [sheet, setSheet] = useState<MarksheetResponse | null>(null)
  const [loadingSheet, setLoadingSheet] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    Promise.all([
      api.get<{ exam: ExamInfo }>(`/api/school/exams/${examId}`),
      api.get<{ classes: ClassOption[] }>('/api/school/classes'),
    ])
      .then(([examRes, classesRes]) => {
        if (cancelled) return
        setExam(examRes.exam)
        setClasses(classesRes.classes || [])
      })
      .catch((err) => {
        if (cancelled) return
        toast({
          variant: 'destructive',
          title: 'Could not load exam',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [examId, toast])

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const examClassIds = useMemo(() => new Set(exam?.examClasses.map((c) => c.classId) ?? []), [exam])
  const scopedClasses = useMemo(
    () => (examClassIds.size > 0 ? classes.filter((c) => examClassIds.has(c.id)) : classes),
    [classes, examClassIds],
  )
  const sectionOptions = useMemo(
    () => (classId !== 'all' ? scopedClasses.find((c) => c.id === classId)?.sections ?? [] : []),
    [classId, scopedClasses],
  )

  const resetSelection = useCallback(() => {
    setDialogStudent(null)
    setSheet(null)
    setClassSheet(null)
  }, [])

  const fetchClassMarksheet = useCallback(async () => {
    if (classId === 'all') {
      setClassSheet(null)
      return
    }
    setLoadingClass(true)
    try {
      const params: Record<string, string> = { classId }
      if (sectionId !== 'all') params.sectionId = sectionId
      if (searchDebounced) params.search = searchDebounced
      const res = await api.get<ClassMarksheetResponse>(
        `/api/school/exams/${examId}/marksheet-class`,
        params,
      )
      setClassSheet(res)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load class marksheet',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoadingClass(false)
    }
  }, [examId, classId, sectionId, searchDebounced, toast])

  useEffect(() => {
    if (loadingOptions) return
    const t = setTimeout(() => void fetchClassMarksheet(), 250)
    return () => clearTimeout(t)
  }, [fetchClassMarksheet, loadingOptions])

  const fetchStudents = useCallback(async () => {
    setLoadingStudents(true)
    try {
      const params: Record<string, string> = {}
      if (classId !== 'all') params.classId = classId
      if (sectionId !== 'all') params.sectionId = sectionId
      if (searchDebounced) params.search = searchDebounced
      const res = await api.get<{ students: StudentRow[] }>(
        `/api/school/exams/${examId}/admit-cards/students`,
        params,
      )
      setStudents(res.students)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load students',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoadingStudents(false)
    }
  }, [examId, classId, sectionId, searchDebounced, toast])

  useEffect(() => {
    if (loadingOptions) return
    void fetchStudents()
  }, [fetchStudents, loadingOptions])

  const openStudent = useCallback(
    async (student: StudentRow) => {
      setDialogStudent(student)
      setLoadingSheet(true)
      setSheet(null)
      try {
        const res = await api.get<MarksheetResponse>(
          `/api/school/exams/${examId}/marksheet`,
          { studentId: student.id },
        )
        setSheet(res)
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not load marksheet',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        setLoadingSheet(false)
      }
    },
    [examId, toast],
  )

  // Class matrix row click → open the student's detailed marksheet dialog.
  const openStudentFromClass = useCallback(
    (studentId: string) => {
      const student = students.find((s) => s.id === studentId)
      if (student) {
        void openStudent(student)
      }
    },
    [students, openStudent],
  )

  if (loadingOptions) return <LoadingState />
  if (!exam) return null

  return (
    <div className="space-y-4">
      <GradientHero
        icon={FileSpreadsheet}
        title={`Marksheet: ${exam.name}`}
        badge={exam.academicYear}
        description={`${exam.group.paradigm.name} · ${exam.group.name} — class-wise matrix or per-student detail`}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'class' | 'student')}>
        <TabsList>
          <TabsTrigger value="class">
            <ClipboardList className="mr-2 size-4" /> Class marksheet
          </TabsTrigger>
          <TabsTrigger value="student">
            <Users className="mr-2 size-4" /> Student marksheet
          </TabsTrigger>
        </TabsList>

        {/* ---------- Class-wise matrix ---------- */}
        <TabsContent value="class" className="mt-4 space-y-4">
          <Card className={TINTED_CARD}>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</Label>
                <Select
                  value={classId}
                  onValueChange={(v) => {
                    setClassId(v)
                    setSectionId('all')
                    resetSelection()
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Select a class</SelectItem>
                    {scopedClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Section</Label>
                <Select
                  value={sectionId}
                  onValueChange={(v) => {
                    setSectionId(v)
                    resetSelection()
                  }}
                  disabled={classId === 'all'}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {sectionOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, roll no, admission no"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {classId === 'all' ? (
            <GradientEmptyState
              icon={ClipboardList}
              title="Pick a class"
              description="Select a class above to see every student with all subjects as columns."
            />
          ) : loadingClass ? (
            <Card className={TINTED_CARD}>
              <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading class marksheet…
              </CardContent>
            </Card>
          ) : !classSheet || classSheet.students.length === 0 ? (
            <GradientEmptyState
              icon={Users}
              title="No students found"
              description="No students match the selected class, section, or search."
            />
          ) : (
            <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200/60 px-4 py-2.5 dark:border-sky-500/20">
                <div className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-sky-600 dark:text-sky-400" />
                  <h3 className="text-sm font-semibold">
                    {classSheet.className}
                    {classSheet.sectionId
                      ? ` · ${classSheet.students[0]?.sectionName ?? 'Section'}`
                      : ''}
                  </h3>
                  <Badge variant="outline" className="text-[10px]">
                    {classSheet.students.length} student{classSheet.students.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {classSheet.subjects.length} subject{classSheet.subjects.length === 1 ? '' : 's'} · click a row
                  for the student detail
                </p>
              </div>

              <div className="themed-scrollbar overflow-x-auto">
                <Table className="min-w-max border-collapse">
                  <TableHeader>
                    <TableRow className="bg-sky-500/10 dark:bg-sky-500/15">
                      <TableHead className="sticky left-0 z-10 min-w-[52px] bg-sky-50 text-center dark:bg-sky-950">Roll</TableHead>
                      <TableHead className="sticky left-[52px] z-10 min-w-[160px] bg-sky-50 dark:bg-sky-950">Student</TableHead>
                      {classSheet.sectionId === null && (
                        <TableHead className="min-w-[70px]">Section</TableHead>
                      )}
                      {classSheet.subjects.map((s) => (
                        <TableHead key={s.subjectId} className="min-w-[76px] text-center">
                          <span className="block whitespace-nowrap">{s.subjectName}</span>
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {s.gradeOnly ? 'Grade' : `/${s.totalMarks}`}
                          </span>
                        </TableHead>
                      ))}
                      <TableHead className="min-w-[80px] text-center">Total</TableHead>
                      <TableHead className="min-w-[64px] text-center">%</TableHead>
                      <TableHead className="min-w-[64px] text-center">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classSheet.students.map((stu, rowIdx) => {
                      const cell = (subjectId: string) => {
                        const m = stu.marks[subjectId]
                        if (!m) return <span className="text-muted-foreground">—</span>
                        if (m.status === 'not_applicable') return <span className="text-muted-foreground">—</span>
                        if (m.status === 'absent') return <span className="font-medium text-red-600 dark:text-red-400">A</span>
                        if (m.status === 'medical_leave') return <span className="font-medium text-amber-600 dark:text-amber-400">ML</span>
                        if (m.gradeOnly) return <span className="font-medium">{m.grade ?? '—'}</span>
                        const failed = m.status === 'fail'
                        return (
                          <span className={cn(failed && 'font-semibold text-red-600 dark:text-red-400')}>
                            {m.obtainedMarks}
                          </span>
                        )
                      }
                      return (
                        <TableRow
                          key={stu.id}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-muted/40',
                            rowIdx % 2 === 1 && 'bg-muted/15',
                          )}
                          onClick={() => openStudentFromClass(stu.id)}
                        >
                          <TableCell className="sticky left-0 z-10 bg-background/95 text-center font-mono text-xs backdrop-blur">
                            {stu.rollNumber ?? '—'}
                          </TableCell>
                          <TableCell className="sticky left-[52px] z-10 bg-background/95 backdrop-blur">
                            <span className="block truncate font-medium">
                              {stu.firstName} {stu.lastName}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              {stu.admissionNumber ?? ''}
                            </span>
                          </TableCell>
                          {classSheet.sectionId === null && (
                            <TableCell className="text-center text-xs">{stu.sectionName ?? '—'}</TableCell>
                          )}
                          {classSheet.subjects.map((s) => (
                            <TableCell key={s.subjectId} className="text-center">{cell(s.subjectId)}</TableCell>
                          ))}
                          <TableCell className="text-center font-semibold">
                            {stu.obtainedMarks != null ? `${stu.obtainedMarks}/${stu.totalMarks}` : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            {stu.percentage != null ? `${Math.round(stu.percentage * 100) / 100}%` : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              {stu.status && (
                                <Badge className={cn('whitespace-nowrap text-[10px]', statusTone(stu.status))}>
                                  {statusLabel(stu.status)}
                                </Badge>
                              )}
                              {stu.rankInClass != null && (
                                <span className="text-[10px] text-muted-foreground">#{stu.rankInClass}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sky-200/60 px-4 py-2 text-[10px] text-muted-foreground dark:border-sky-500/20">
                <span>A = Absent</span>
                <span>ML = Medical leave</span>
                <span>— = Not applicable</span>
                <span className="text-red-600 dark:text-red-400">red = below passing marks</span>
                {classSheet.resultComputed && (
                  <span>Results computed — ranks shown</span>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ---------- Per-student detail ---------- */}
        <TabsContent value="student" className="mt-4 space-y-4">
          <Card className={TINTED_CARD}>
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Class</Label>
                <Select
                  value={classId}
                  onValueChange={(v) => {
                    setClassId(v)
                    setSectionId('all')
                    resetSelection()
                  }}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {scopedClasses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Section</Label>
                <Select
                  value={sectionId}
                  onValueChange={(v) => {
                    setSectionId(v)
                    resetSelection()
                  }}
                  disabled={classId === 'all'}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All sections" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {sectionOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Name, admission no, roll no"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {loadingStudents ? (
            <Card className={TINTED_CARD}><CardContent className="p-8 text-center text-sm text-muted-foreground">Loading students…</CardContent></Card>
          ) : students.length === 0 ? (
            <GradientEmptyState
              icon={Users}
              title="No matching students"
              description="Adjust the class, section, or search filters."
            />
          ) : (
            <Card className={TINTED_CARD}>
              <ScrollArea className="h-[min(320px,calc(100vh-380px))]">
                <ul className="divide-y">
                  {students.map((s) => {
                    const selected = dialogStudent?.id === s.id
                    const enrollment = s.academicEnrollments[0]
                    const cls = enrollment?.class?.name || s.class?.name || '—'
                    const sec = enrollment?.section?.name || s.section?.name || '—'
                    const rollNo = enrollment?.rollNumber || s.rollNumber || '—'
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-muted/40',
                          selected ? 'bg-primary/5' : '',
                        )}
                        onClick={() => void openStudent(s)}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs">
                          {s.profileImage ? (
                            <img src={s.profileImage} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="font-medium uppercase">{s.firstName?.[0] || '?'}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {s.firstName} {s.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.admissionNumber || '—'} · Class {cls}-{sec} · Roll {rollNo}
                          </p>
                        </div>
                        {selected && <Badge variant="outline" className="text-[10px]">Viewing</Badge>}
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <StudentMarksheetDialog
        open={Boolean(dialogStudent)}
        student={dialogStudent}
        loading={loadingSheet}
        sheet={sheet}
        onClose={() => {
          if (loadingSheet) return
          setDialogStudent(null)
          setSheet(null)
        }}
      />
    </div>
  )
}

interface StudentMarksheetDialogProps {
  open: boolean
  student: StudentRow | null
  loading: boolean
  sheet: MarksheetResponse | null
  onClose: () => void
}

function StudentMarksheetDialog({ open, student, loading, sheet, onClose }: StudentMarksheetDialogProps) {
  const result = sheet?.result
  const studentInfo = sheet?.student ?? null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !loading && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-sky-500/20 bg-card p-0 shadow-2xl shadow-sky-500/15 sm:max-w-4xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
        <GradientDialogHeader
          icon={FileSpreadsheet}
          title={studentInfo ? `${studentInfo.firstName} ${studentInfo.lastName ?? ''}` : 'Marksheet'}
          description={
            studentInfo
              ? `Class ${studentInfo.className ?? '—'}${studentInfo.sectionName ? `-${studentInfo.sectionName}` : ''}${studentInfo.rollNumber ? ` · Roll ${studentInfo.rollNumber}` : ''}${studentInfo.admissionNumber ? ` · Adm No ${studentInfo.admissionNumber}` : ''}`
              : 'Loading student details…'
          }
        />

        <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.04] via-background to-violet-500/[0.055] p-4 sm:p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading marksheet…
            </div>
          ) : !sheet ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Could not load this marksheet.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {result?.status && (
                  <Badge className={cn('capitalize', statusTone(result.status))}>{statusLabel(result.status)}</Badge>
                )}
                {result?.percentage !== null && result?.percentage !== undefined && (
                  <Badge variant="outline">{result.percentage}%</Badge>
                )}
                {result?.grade && <Badge variant="outline">Grade {result.grade}</Badge>}
                {result?.rankInClass != null && <Badge variant="outline">Class rank #{result.rankInClass}</Badge>}
                {result?.rankInSection != null && <Badge variant="outline">Section rank #{result.rankInSection}</Badge>}
                {result?.totalMarks != null && (
                  <Badge variant="outline">
                    Total <span className="font-semibold">{result.obtainedMarks} / {result.totalMarks}</span>
                  </Badge>
                )}
              </div>

              <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                <div className="themed-scrollbar overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-sky-500/10 dark:bg-sky-500/15">
                        <TableHead className="min-w-[140px]">Subject</TableHead>
                        {sheet.subjects[0]?.components.map((c) => (
                          <TableHead key={c.id} className="min-w-[110px] text-right">
                            {c.name}
                            <span className="ml-1 font-normal text-muted-foreground">/{c.maxMarks}</span>
                          </TableHead>
                        ))}
                        {sheet.subjects.some((s) => s.components.length === 0) && (
                          <TableHead className="min-w-[110px] text-right">
                            Marks
                            <span className="ml-1 font-normal text-muted-foreground">/{sheet.subjects[0]?.totalMarks}</span>
                          </TableHead>
                        )}
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">Grade</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sheet.subjects.map((subj) => {
                        const compCell = (component: ComponentRow) => {
                          if (component.status === 'absent') return <span className="font-medium text-red-600 dark:text-red-400">A</span>
                          if (component.status === 'medical_leave') return <span className="font-medium text-amber-600 dark:text-amber-400">ML</span>
                          if (component.status === 'not_applicable') return <span className="text-muted-foreground">—</span>
                          if (component.gradeOnly) return <span className="font-medium">{component.gradeValue ?? '—'}</span>
                          return (
                            <span className={cn(component.numericValue != null && component.numericValue < component.passingMarks && component.passingMarks > 0 && 'text-red-600 dark:text-red-400')}>
                              {component.numericValue ?? '—'}
                            </span>
                          )
                        }
                        return (
                          <TableRow key={subj.configId} className="transition-colors hover:bg-muted/30">
                            <TableCell>
                              <p className="font-medium">{subj.subjectName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {subj.gradeOnly ? 'Grade-only' : `Pass ${subj.passingMarks}`}
                                {subj.isOptional ? ' · Optional' : ''}
                                {subj.isAdditional ? ' · Additional' : ''}
                              </p>
                            </TableCell>
                            {subj.components.map((c) => (
                              <TableCell key={c.id} className="text-right">{compCell(c)}</TableCell>
                            ))}
                            {subj.components.length === 0 && (
                              <TableCell className="text-right">
                                {subj.singleEntry?.status === 'absent'
                                  ? <span className="font-medium text-red-600 dark:text-red-400">A</span>
                                  : subj.singleEntry?.status === 'medical_leave'
                                    ? <span className="font-medium text-amber-600 dark:text-amber-400">ML</span>
                                    : subj.singleEntry?.status === 'not_applicable'
                                      ? <span className="text-muted-foreground">—</span>
                                      : subj.gradeOnly
                                        ? <span className="font-medium">{subj.singleEntry?.gradeValue ?? '—'}</span>
                                        : <span>{subj.singleEntry?.numericValue ?? '—'}</span>}
                              </TableCell>
                            )}
                            <TableCell className="text-right font-semibold">
                              {subj.summary?.status === 'not_applicable'
                                ? '—'
                                : `${subj.summary?.obtainedMarks ?? '—'} / ${subj.summary?.totalMarks ?? subj.totalMarks}`}
                              {subj.summary?.graceApplied != null && subj.summary.graceApplied > 0 && (
                                <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                  +{subj.summary.graceApplied} grace
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {subj.summary?.status === 'not_applicable'
                                ? '—'
                                : `${Math.round((subj.summary?.percentage ?? 0) * 100) / 100}%`}
                            </TableCell>
                            <TableCell className="text-right">{subj.summary?.grade ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              {subj.summary && (
                                <Badge className={cn('capitalize', statusTone(subj.summary.status))}>
                                  {statusLabel(subj.summary.status)}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sky-200/60 pt-2 text-[10px] text-muted-foreground dark:border-sky-500/20">
                  <span>A = Absent</span>
                  <span>ML = Medical leave</span>
                  <span>— = Not applicable</span>
                  {!sheet.gradeScaleConfigured && (
                    <span className="text-amber-600 dark:text-amber-400">
                      Grade scale not configured — grades may be incomplete.
                    </span>
                  )}
                  {result?.computedAt && (
                    <span>Result computed {new Date(result.computedAt).toLocaleString()}</span>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
          <Button size="sm" className="h-8 px-4 text-xs" onClick={onClose} disabled={loading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}