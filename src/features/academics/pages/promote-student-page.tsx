'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePicker } from '@/components/date-picker'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  Loader2,
  TrendingUp,
  Users,
  CalendarDays,
  BookOpen,
  Banknote,
  ArrowRight,
} from 'lucide-react'

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }
interface FeesGroupOption { id: string; name: string }
interface AcademicYearOption { name: string; isActive: boolean }
interface StudentRow {
  id: string
  admissionNumber: string | null
  firstName: string
  lastName: string
  fullName?: string
  rollNumber: string | null
  isActive: boolean
  classId: string | null
  sectionId: string | null
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
  parentLinks?: Array<{ parent?: { fatherName?: string | null; phone?: string | null } | null }>
}

interface PromoteStudentListState {
  fromAcademicYear?: string
  fromClassId?: string
  fromSectionId?: string
  studentStatus?: 'active' | 'inactive' | 'all'
}

const PROMOTE_STUDENT_LIST_STATE_KEY = 'academics:promote-student:list'

const CHECKLIST = [
  { number: 1, title: 'Create a new session', description: 'Open session setup',  link: true, tone: 'normal' },
  { number: 2, title: 'Update fee structure', description: 'Prepare fee plans for the incoming session.', tone: 'normal' },
  { number: 3, title: 'Promote higher to lower', description: 'Move 10→11, then 9→10, then 8→9 and so on.', tone: 'danger' },
  { number: 4, title: 'Activate the new session', description: 'Set it as default before promoting.', tone: 'normal' },
] as const

function studentName(student: StudentRow) {
  return student.fullName || `${student.firstName} ${student.lastName}`.trim()
}

function fatherName(student: StudentRow) {
  return student.parentLinks?.find((link) => link.parent?.fatherName)?.parent?.fatherName || '-'
}

export function PromoteStudentPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canPromote = hasPermission(PERMISSIONS.ADMISSION_UPDATE)
  const { currentSchool } = useAppStore()
  const savedListState = useAppStore((state) => state.pageState[PROMOTE_STUDENT_LIST_STATE_KEY] as PromoteStudentListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const defaultYear = currentSchool?.academicYear || getCurrentAcademicYear()

  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [feesGroups, setFeesGroups] = useState<FeesGroupOption[]>([])
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [activeAcademicYears, setActiveAcademicYears] = useState<string[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [fromAcademicYear, setFromAcademicYear] = useState(savedListState?.fromAcademicYear ?? defaultYear)
  const [fromClassId, setFromClassId] = useState(savedListState?.fromClassId ?? '')
  const [fromSectionId, setFromSectionId] = useState(savedListState?.fromSectionId ?? 'all')
  const [studentStatus, setStudentStatus] = useState<'active' | 'inactive' | 'all'>(savedListState?.studentStatus ?? 'active')
  const [promotionType, setPromotionType] = useState<'class' | 'alumni'>('class')
  const [toAcademicYear, setToAcademicYear] = useState(defaultYear)
  const [toClassId, setToClassId] = useState('')
  const [toSectionId, setToSectionId] = useState('')
  const [feesGroupId, setFeesGroupId] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [carryForwardTransport, setCarryForwardTransport] = useState(true)
  const [transportSummary, setTransportSummary] = useState<{ eligibleCount: number; carriedCount: number; warnings: string[] } | null>(null)

  useEffect(() => {
    const fetchOptions = async () => {
      setLoadingOptions(true)
      try {
        const [classData, sectionData, yearData] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true }),
          api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
          api.get<{ academicYears: string[]; years?: AcademicYearOption[] }>('/api/school/academic-years', undefined, { skipLogoutOn401: true }),
        ])
        setClasses(classData.classes || [])
        setSections(sectionData.sections || [])
        const years = yearData.academicYears || []
        const activeYears = yearData.years?.filter((year) => year.isActive).map((year) => year.name) || years
        setAcademicYears(years)
        setActiveAcademicYears(activeYears)
        if (!years.includes(fromAcademicYear)) setFromAcademicYear(years[0] || defaultYear)
        if (!activeYears.includes(toAcademicYear)) setToAcademicYear(activeYears.find((year) => year !== fromAcademicYear) || activeYears[0] || '')
      } catch (err) {
        toast({
          title: "Couldn't Load Promotion Setup",
          description: err instanceof Error ? err.message : 'Please refresh and try again.',
          variant: 'destructive',
        })
      } finally {
        setLoadingOptions(false)
      }
    }
    fetchOptions()
  }, [])

  // Fee groups depend on the target class + academic year. Only groups with an
  // active FeesStructure for that pair are valid promotion targets.
  useEffect(() => {
    if (promotionType !== 'class' || !toClassId || !toAcademicYear) {
      setFeesGroups([])
      return
    }
    let mounted = true
    const fetchFeesGroups = async () => {
      try {
        const data = await api.get<{ groups: FeesGroupOption[] }>(
          '/api/school/fees/groups',
          { academicYear: toAcademicYear, classId: toClassId },
          { skipLogoutOn401: true }
        )
        if (!mounted) return
        const list = data?.groups || []
        setFeesGroups(list)
        if (feesGroupId && !list.some((group) => group.id === feesGroupId)) {
          setFeesGroupId('')
        }
      } catch {
        if (mounted) setFeesGroups([])
      }
    }
    fetchFeesGroups()
    return () => { mounted = false }
  }, [promotionType, toClassId, toAcademicYear, feesGroupId])

  const fromClass = classes.find((item) => item.id === fromClassId)
  const toClass = classes.find((item) => item.id === toClassId)
  const fromSection = sections.find((item) => item.id === fromSectionId)
  const fromSections = useMemo(
    () => fromClassId ? sections.filter((item) => item.classId === fromClassId) : [],
    [fromClassId, sections]
  )
  const toSections = useMemo(
    () => toClassId ? sections.filter((item) => item.classId === toClassId) : [],
    [toClassId, sections]
  )
  const selectedStudents = useMemo(
    () => students.filter((student) => selectedIds.includes(student.id)),
    [selectedIds, students]
  )
  const targetAcademicYears = useMemo(
    () => promotionType === 'class' ? activeAcademicYears.filter((year) => year !== fromAcademicYear) : activeAcademicYears,
    [activeAcademicYears, fromAcademicYear, promotionType]
  )
  const allSelected = students.length > 0 && selectedIds.length === students.length

  const rememberListState = (patch: Partial<PromoteStudentListState>) => {
    setPageState(PROMOTE_STUDENT_LIST_STATE_KEY, {
      fromAcademicYear,
      fromClassId,
      fromSectionId,
      studentStatus,
      ...patch,
    })
  }

  const handleFromAcademicYearChange = (value: string) => {
    setFromAcademicYear(value)
    rememberListState({ fromAcademicYear: value })
  }

  const handleFromClassChange = (value: string) => {
    setFromClassId(value)
    setFromSectionId('all')
    rememberListState({ fromClassId: value, fromSectionId: 'all' })
  }

  const handleFromSectionChange = (value: string) => {
    setFromSectionId(value)
    rememberListState({ fromSectionId: value })
  }

  const handleStudentStatusChange = (value: 'active' | 'inactive' | 'all') => {
    setStudentStatus(value)
    rememberListState({ studentStatus: value })
  }

  useEffect(() => {
    if (promotionType !== 'class') return
    if (toAcademicYear === fromAcademicYear || !targetAcademicYears.includes(toAcademicYear)) {
      setToAcademicYear(targetAcademicYears[0] || '')
    }
  }, [fromAcademicYear, promotionType, targetAcademicYears, toAcademicYear])

  const fetchStudents = useCallback(async () => {
    if (!fromAcademicYear || !fromClassId) {
      setStudents([])
      setSelectedIds([])
      return
    }

    setLoadingStudents(true)
    try {
      const params: Record<string, string> = {
        academicYear: fromAcademicYear,
        classId: fromClassId,
        limit: '500',
      }
      if (fromSectionId !== 'all') params.sectionId = fromSectionId
      if (studentStatus !== 'all') params.isActive = studentStatus === 'active' ? 'true' : 'false'

      const data = await api.get<{ students: StudentRow[] }>('/api/school/students', params, { skipLogoutOn401: true })
      const rows = data.students || []
      setStudents(rows)
      setSelectedIds(rows.map((student) => student.id))
    } catch (err) {
      setStudents([])
      setSelectedIds([])
      toast({
        title: "Couldn't Load Students",
        description: err instanceof Error ? err.message : 'Please check the filters and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingStudents(false)
    }
  }, [fromAcademicYear, fromClassId, fromSectionId, studentStatus, toast])

  useEffect(() => {
    fetchStudents()
  }, [fetchStudents])

  const toggleStudent = (studentId: string) => {
    setSelectedIds((current) =>
      current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId]
    )
  }

  const toggleAll = () => {
    setSelectedIds((current) => current.length === students.length ? [] : students.map((student) => student.id))
  }

  const validateBeforeConfirm = () => {
    if (!selectedIds.length) {
      toast({ title: 'No Students Selected', description: 'Please select at least one student.', variant: 'destructive' })
      return
    }
    if (promotionType === 'class' && (!toAcademicYear || !toClassId)) {
      toast({ title: 'Target Required', description: 'Please select promote-to session and class.', variant: 'destructive' })
      return
    }
    if (promotionType === 'class' && (!feesGroupId || feesGroupId === 'none')) {
      toast({ title: 'Fee Group Required', description: 'Please select a fee group for the new session.', variant: 'destructive' })
      return
    }
    if (promotionType === 'class' && toAcademicYear === fromAcademicYear) {
      toast({ title: 'Different Session Required', description: 'Promote-to session cannot be the same as the current session.', variant: 'destructive' })
      return
    }
    setConfirmOpen(true)
  }

  const submitPromotion = async () => {
    setSubmitting(true)
    setTransportSummary(null)
    try {
      const result = await api.post<{
        message?: string
        promotedCount?: number
        dueTotal?: number
        transport?: { eligibleCount: number; carriedCount: number; warnings: string[] } | null
      }>(
        '/api/school/students/promote',
        {
          studentIds: selectedIds,
          promotionType,
          fromAcademicYear,
          toAcademicYear,
          toClassId,
          toSectionId: toSectionId || null,
          feesGroupId: promotionType === 'alumni' || feesGroupId === 'none' ? null : feesGroupId,
          effectiveFrom,
          carryForwardTransport: promotionType === 'class' ? carryForwardTransport : false,
        }
      )
      toast({
        title: promotionType === 'alumni' ? 'Students Moved To Alumni' : 'Students Promoted',
        description: result.message || `${result.promotedCount || selectedIds.length} student(s) updated successfully.`,
      })
      if (result.transport && (result.transport.eligibleCount > 0 || result.transport.warnings.length > 0)) {
        setTransportSummary(result.transport)
      }
      setConfirmOpen(false)
      await fetchStudents()
    } catch (err) {
      toast({
        title: "Couldn't Promote",
        description: err instanceof Error ? err.message : 'Please review the selection and try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15">
        <div aria-hidden className="absolute -right-9 -top-14 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute -bottom-14 right-1/4 size-28 rounded-full bg-violet-300/10 blur-xl" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <TrendingUp className="size-5 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Promote Students</h1>
              <p className="mt-0.5 text-xs text-white/80">Move selected students safely into their next class, session, or alumni.</p>
            </div>
          </div>
          <Badge className="h-7 gap-1.5 border border-white/20 bg-white/15 px-2.5 text-[10px] text-white hover:bg-white/15">
            <GraduationCap className="size-3.5 text-white" /> Session transition
          </Badge>
        </div>
      </section>

      <div className="rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-3 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-sky-500/10">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Promotion Checklist</h2>
          {/* <Badge variant="outline" className="rounded-md">Lower to higher</Badge> */}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {CHECKLIST.map((item) => (
              <div key={item.number} className={item.tone === 'danger' ? 'rounded-lg border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 px-3 py-2 shadow-sm dark:border-red-500/25 dark:from-red-500/15 dark:to-rose-500/10' : 'rounded-lg border border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:to-cyan-500/10'}>
                <div className="flex items-center gap-2">
                  <span className={item.tone === 'danger' ? 'flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-[11px] font-bold text-destructive' : 'flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground'}>
                    {item.number}
                  </span>
                  <p className={item.tone === 'danger' ? 'truncate text-xs font-semibold text-destructive' : 'truncate text-xs font-semibold'} title={item.title}>{item.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => item.number === 1 ? router.push('/academics/years') : undefined}
                  className="mt-1 inline-flex max-w-full items-center gap-1 text-left text-[11px] text-muted-foreground hover:text-primary"
                >
                  {'link' in item && item.link && <ExternalLink className="size-3 shrink-0" />}
                  <span className="truncate">{item.description}</span>
                </button>
              </div>
            ))}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/50 via-card to-violet-50/50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardHeader className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/75 via-white/90 to-violet-100/65 px-4 py-2 !pb-2 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
          <div className="flex min-h-9 flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-1.5 text-sm leading-none">
              <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-violet-600 text-white"><GraduationCap className="size-3.5 text-white" /></span>
              Promotion Setup
            </CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[11px] leading-none">{fromAcademicYear || 'Current session'}</Badge>
              <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px] leading-none">{promotionType === 'alumni' ? 'Alumni promote' : 'Student promote'}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-3 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-cyan-500/10">
              <div className="mb-3 flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-xs font-bold text-white shadow-sm">1</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-none">Current Class</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Choose students from this session.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Current Session</Label>
                <Select value={fromAcademicYear} onValueChange={handleFromAcademicYearChange} disabled={loadingOptions}>
                  <SelectTrigger leadingIcon={<CalendarDays className="size-3.5 text-white" />} leadingIconClassName="from-sky-500 to-cyan-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select session" /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Class</Label>
                <Select value={fromClassId} onValueChange={handleFromClassChange} disabled={loadingOptions}>
                  <SelectTrigger leadingIcon={<GraduationCap className="size-3.5 text-white" />} leadingIconClassName="from-sky-500 to-blue-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Section</Label>
                <Select value={fromSectionId} onValueChange={handleFromSectionChange} disabled={!fromClassId || loadingOptions}>
                  <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-cyan-500 to-teal-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sections</SelectItem>
                    {fromSections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Status</Label>
                <Select value={studentStatus} onValueChange={handleStudentStatusChange}>
                  <SelectTrigger leadingIcon={<CheckCircle2 className="size-3.5 text-white" />} leadingIconClassName="from-emerald-500 to-teal-600" className="w-full bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="all">Active + Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            </div>

            <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-purple-50 p-3 shadow-sm dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/10">
              <div className="mb-3 flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white shadow-sm">2</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-none">Promote To</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Select destination session, class and fees.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Type</Label>
                <Select value={promotionType} onValueChange={(value: 'class' | 'alumni') => setPromotionType(value)}>
                  <SelectTrigger leadingIcon={<TrendingUp className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-purple-600" className="w-full bg-white dark:bg-input/30"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="class">Student Promote</SelectItem>
                    <SelectItem value="alumni">Alumni Promote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {promotionType === 'class' && (
                <>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">To Session</Label>
                    <Select value={toAcademicYear} onValueChange={setToAcademicYear}>
                      <SelectTrigger leadingIcon={<CalendarDays className="size-3.5 text-white" />} leadingIconClassName="from-violet-500 to-indigo-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select session" /></SelectTrigger>
                      <SelectContent>
                        {targetAcademicYears.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {targetAcademicYears.length === 0 && (
                      <p className="text-xs text-destructive">Create or activate another session before class promotion.</p>
                    )}
                  </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">To Class</Label>
                    <Select value={toClassId} onValueChange={(value) => { setToClassId(value); setToSectionId('') }}>
                      <SelectTrigger leadingIcon={<GraduationCap className="size-3.5 text-white" />} leadingIconClassName="from-indigo-500 to-violet-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select class" /></SelectTrigger>
                      <SelectContent>
                        {classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">To Section</Label>
                    <Select value={toSectionId || 'none'} onValueChange={(value) => setToSectionId(value === 'none' ? '' : value)} disabled={!toClassId}>
                      <SelectTrigger leadingIcon={<Users className="size-3.5 text-white" />} leadingIconClassName="from-purple-500 to-violet-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select section" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Section</SelectItem>
                        {toSections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Fees Group <span className="text-destructive">*</span></Label>
                    <Select value={feesGroupId === 'none' ? '' : feesGroupId} onValueChange={setFeesGroupId}>
                      <SelectTrigger leadingIcon={<Banknote className="size-3.5 text-white" />} leadingIconClassName="from-emerald-500 to-teal-600" className="w-full bg-white dark:bg-input/30"><SelectValue placeholder="Select fee group" /></SelectTrigger>
                      <SelectContent>
                        {feesGroups.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Effective Date</Label>
                  <DatePicker
                    value={effectiveFrom}
                    onChange={setEffectiveFrom}
                    placeholder="Select effective date"
                    triggerClassName="w-full border-amber-200 bg-white dark:border-amber-500/25 dark:bg-input/30"
                  />
                </div>
              </div>
              {promotionType === 'class' && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-2 dark:border-emerald-500/25 dark:from-emerald-500/10 dark:to-teal-500/10">
                  <Checkbox
                    id="carry-forward-transport"
                    checked={carryForwardTransport}
                    onCheckedChange={(value) => setCarryForwardTransport(value === true)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <Label htmlFor="carry-forward-transport" className="cursor-pointer text-xs font-medium">
                      Carry forward transport for students who currently use it
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Fare is taken from <strong>{toAcademicYear || 'target session'}</strong> stop fares, so price changes apply automatically. Students without an active allocation are skipped.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2 md:grid-cols-4">
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white"><CalendarDays className="size-4 text-white" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</p>
          <p className="truncate text-sm font-semibold text-sky-700 dark:text-sky-300">{fromClass?.name || '-'}{fromSection ? ` / ${fromSection.name}` : fromSectionId === 'all' ? ' / All Sections' : ''}</p>
          <p className="text-xs text-muted-foreground">{fromAcademicYear || '-'}</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-purple-50 p-2.5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white"><ArrowRight className="size-4 text-white" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</p>
          <p className="truncate text-sm font-semibold text-violet-700 dark:text-violet-300">{promotionType === 'alumni' ? 'Alumni' : toClass?.name || '-'}</p>
          <p className="text-xs text-muted-foreground">{promotionType === 'alumni' ? 'Final status' : toAcademicYear || '-'}</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-2.5 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white"><Users className="size-4 text-white" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Students</p>
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{selectedIds.length} selected</p>
          <p className="text-xs text-muted-foreground">{students.length} loaded</p></div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-2.5 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white"><Banknote className="size-4 text-white" /></span>
          <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fees</p>
          <p className="truncate text-sm font-semibold text-amber-700 dark:text-amber-300">{feesGroups.find((item) => item.id === feesGroupId)?.name || '-'}</p>
          <p className="text-xs text-muted-foreground">Old dues stay open</p></div>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden border-sky-200/80 bg-gradient-to-br from-sky-50/50 via-card to-violet-50/50 py-0 shadow-sm dark:border-sky-500/25 dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
        <CardHeader className="border-b border-sky-200/70 bg-gradient-to-r from-sky-100/75 via-white/90 to-violet-100/65 px-4 py-3 !pb-3 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 text-white"><Users className="size-4 text-white" /></span>
              Student List
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">{selectedIds.length} selected</Badge>
              <Button onClick={validateBeforeConfirm} disabled={submitting || selectedIds.length === 0 || !canPromote}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
                Promote
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!fromClassId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Select current session and class to load students.</div>
          ) : loadingStudents ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading students...
            </div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No students found for the selected filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-100/80 via-cyan-50 to-violet-100/70 dark:from-sky-500/15 dark:via-cyan-500/10 dark:to-violet-500/15">
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Admission No</TableHead>
                    <TableHead>Father Name</TableHead>
                    <TableHead>Previous Session</TableHead>
                    <TableHead>Promote Session</TableHead>
                    <TableHead>Previous Class / Section</TableHead>
                    <TableHead>New Class / Section</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => {
                    const checked = selectedIds.includes(student.id)
                    const previousClassSection = [student.class?.name || fromClass?.name, student.section?.name].filter(Boolean).join(' / ')
                    const promoteClassSection = promotionType === 'alumni'
                      ? 'Alumni'
                      : [toClass?.name, toSections.find((section) => section.id === toSectionId)?.name].filter(Boolean).join(' / ') || '-'

                    return (
                      <TableRow key={student.id} data-state={checked ? 'selected' : undefined} className={checked ? 'bg-gradient-to-r from-emerald-50/80 via-white to-cyan-50/70 hover:from-emerald-100/70 hover:to-cyan-100/60 dark:from-emerald-500/10 dark:via-card dark:to-cyan-500/10' : 'hover:bg-sky-50/50 dark:hover:bg-sky-500/5'}>
                        <TableCell>
                          <Checkbox checked={checked} onCheckedChange={() => toggleStudent(student.id)} />
                        </TableCell>
                        <TableCell className="font-medium">{studentName(student)}</TableCell>
                        <TableCell className="font-mono text-xs">{student.admissionNumber || '-'}</TableCell>
                        <TableCell>{fatherName(student)}</TableCell>
                        <TableCell>{fromAcademicYear}</TableCell>
                        <TableCell>{promotionType === 'alumni' ? 'Alumni' : toAcademicYear || '-'}</TableCell>
                        <TableCell>{previousClassSection || '-'}</TableCell>
                        <TableCell>{promoteClassSection}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {transportSummary && (transportSummary.eligibleCount > 0 || transportSummary.warnings.length > 0) && (
        <Alert className="border-amber-300/70 bg-amber-50/80 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertTitle>Transport Carry-Forward Summary</AlertTitle>
          <AlertDescription>
            <p className="mb-1.5">
              {transportSummary.carriedCount} of {transportSummary.eligibleCount} transport-using student(s) carried forward to {toAcademicYear}.
              {transportSummary.eligibleCount - transportSummary.carriedCount > 0 && (
                <> {transportSummary.eligibleCount - transportSummary.carriedCount} need manual allocation.</>
              )}
            </p>
            {transportSummary.warnings.length > 0 && (
              <ul className="ml-4 list-disc space-y-0.5 text-xs">
                {transportSummary.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl">
          <AlertDialogHeader className="relative overflow-hidden border-b border-white/15 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-5 py-4 text-left text-white">
            <div aria-hidden className="absolute -right-8 -top-12 size-32 rounded-full border-[16px] border-white/10" />
            <div className="relative flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/30 bg-amber-300/20 text-white shadow-md backdrop-blur-sm">
                <AlertTriangle className="size-5 text-white" />
              </span>
              <div>
                <AlertDialogTitle className="text-lg font-bold tracking-tight text-white">Confirm Promotion</AlertDialogTitle>
                <AlertDialogDescription className="mt-1 text-xs leading-relaxed text-white/75">
                  Review the destination and impact before updating these student records.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>

          <div className="space-y-3 bg-gradient-to-br from-primary/[0.025] via-background to-amber-500/[0.035] p-4 sm:p-5">
            <Alert variant="destructive" className="border-red-200/90 bg-gradient-to-r from-red-50 via-white to-rose-50 text-red-800 shadow-sm dark:border-red-500/30 dark:from-red-500/15 dark:via-card dark:to-rose-500/10 dark:text-red-300">
              <AlertTriangle className="text-red-600 dark:text-red-400" />
              <AlertTitle className="font-semibold">Before you submit</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                Previous-session dues remain payable. New fee demand may be created, and the current class or status changes immediately.
              </AlertDescription>
            </Alert>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-2.5 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white"><Users className="size-4 text-white" /></span>
                <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Students</p><p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{selectedStudents.length} selected</p></div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-purple-50 p-2.5 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white"><TrendingUp className="size-4 text-white" /></span>
                <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p><p className="text-sm font-bold text-violet-700 dark:text-violet-300">{promotionType === 'alumni' ? 'Alumni Promote' : 'Student Promote'}</p></div>
              </div>
              <div className="rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-2.5 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</p>
                <p className="mt-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">{fromAcademicYear} · {fromClass?.name || '-'}{fromSection ? ` / ${fromSection.name}` : fromSectionId === 'all' ? ' / All Sections' : ''}</p>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-2.5 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</p>
                <p className="mt-0.5 text-xs font-bold text-amber-700 dark:text-amber-300">{promotionType === 'alumni' ? 'Alumni' : `${toAcademicYear} · ${toClass?.name || '-'}`}</p>
              </div>
              {promotionType === 'class' && (
                <div className="rounded-lg border border-cyan-200/70 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300 sm:col-span-2">
                  <strong>Transport:</strong> {carryForwardTransport ? `Carry forward using ${toAcademicYear} fares` : 'Do not carry forward'}
                </div>
              )}
            </div>
          </div>

          <AlertDialogFooter className="border-t border-primary/10 bg-gradient-to-r from-muted/40 via-background to-primary/5 px-4 py-3 sm:px-5">
            <AlertDialogCancel className="h-9" disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-9 gap-1.5 px-4" onClick={submitPromotion} disabled={submitting || !canPromote}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Promote Selected Students
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
