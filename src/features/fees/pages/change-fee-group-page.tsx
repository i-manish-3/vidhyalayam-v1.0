'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileCheck2,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react'

interface EligibleAssignment {
  id: string
  academicYear: string
  feesGroupId: string
  feesGroupName: string | null
  classId: string | null
  sectionId: string | null
  totalAmount: number
  billingMode: 'full_year' | 'pro_rated'
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
    className: string | null
    sectionName: string | null
  } | null
  availableGroups: { id: string; name: string }[]
}

interface ClassOption {
  id: string
  name: string
}

interface FeeGroupOption {
  id: string
  name: string
}

interface UnassignedStudent {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  classId: string | null
  sectionId: string | null
  className: string | null
  sectionName: string | null
}

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`
}

function groupLabel(name: string) {
  return name === '_DEFAULT' ? 'Default' : name
}

function studentName(assignment: EligibleAssignment) {
  return assignment.student
    ? `${assignment.student.firstName} ${assignment.student.lastName}`.trim()
    : 'Unknown student'
}

function classLabel(assignment: EligibleAssignment) {
  return [assignment.student?.className, assignment.student?.sectionName].filter(Boolean).join(' - ') || '-'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'S'
}

export function ChangeFeeGroupPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((state) => state.currentSchool?.academicYear)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignments, setAssignments] = useState<EligibleAssignment[]>([])
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [academicYear, setAcademicYear] = useState<string>(currentSchoolAcademicYear || getCurrentAcademicYear())
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'change' | 'full-year' | 'assign'>('change')

  const [activeAssignment, setActiveAssignment] = useState<EligibleAssignment | null>(null)
  const [newGroupId, setNewGroupId] = useState('')
  const [reason, setReason] = useState('')

  const [fullYearTarget, setFullYearTarget] = useState<EligibleAssignment | null>(null)
  const [fullYearReason, setFullYearReason] = useState('')
  const [billingFullYear, setBillingFullYear] = useState(false)

  // ─── Assign Fee Group tab ─────────────────────────────────────────────────
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [assignClassId, setAssignClassId] = useState('')
  const [assignGroups, setAssignGroups] = useState<FeeGroupOption[]>([])
  const [assignGroupId, setAssignGroupId] = useState('')
  const [unassignedStudents, setUnassignedStudents] = useState<UnassignedStudent[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [assignFullYear, setAssignFullYear] = useState(false)
  const [loadingUnassigned, setLoadingUnassigned] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false)

  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(academicYears, currentSchoolAcademicYear),
    [academicYears, currentSchoolAcademicYear],
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [assignmentRes, yearRes, classRes] = await Promise.all([
        api.get<{ assignments: EligibleAssignment[] }>(
          '/api/school/fees/assignments/eligible-for-group-change',
          academicYear ? { academicYear } : undefined,
        ),
        api.get<{ academicYears: string[] }>('/api/school/academic-years'),
        api.get<{ classes: ClassOption[] }>('/api/school/classes').catch(() => ({ classes: [] })),
      ])
      setAssignments(assignmentRes.assignments || [])
      setAcademicYears(yearRes.academicYears || [])
      setClasses(classRes.classes || [])
    } catch (err) {
      toast({
        title: "Couldn't Load Eligible Students",
        description: err instanceof Error ? err.message : 'Please refresh and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (academicYearOptions.length > 0 && !academicYearOptions.some((year) => year.value === academicYear)) {
      setAcademicYear(academicYearOptions[0].value)
    }
  }, [academicYearOptions, academicYear])

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return assignments
    return assignments.filter((assignment) => {
      const haystack = [
        studentName(assignment),
        assignment.student?.admissionNumber,
        assignment.student?.className,
        assignment.student?.sectionName,
        assignment.feesGroupName,
        assignment.academicYear,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [assignments, search])

  const stats = useMemo(() => {
    const totalDemand = assignments.reduce((sum, assignment) => sum + assignment.totalAmount, 0)
    return {
      eligible: assignments.length,
      canChange: assignments.filter((assignment) => assignment.availableGroups.length > 0).length,
      proRated: assignments.filter((assignment) => assignment.billingMode === 'pro_rated').length,
      totalDemand,
    }
  }, [assignments])

  // Full Year tab is independent of the Change tab's search box, so derive it
  // straight from all loaded assignments rather than the filtered list.
  const fullYearAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.billingMode === 'pro_rated'),
    [assignments],
  )

  const availableGroups = useMemo(() => activeAssignment?.availableGroups || [], [activeAssignment])
  const selectedGroupName = availableGroups.find((group) => group.id === newGroupId)?.name || ''

  // ─── Assign Fee Group tab data ────────────────────────────────────────────
  const fetchAssignData = useCallback(async () => {
    if (!assignClassId || !academicYear) {
      setUnassignedStudents([])
      setAssignGroups([])
      setSelectedStudentIds(new Set())
      return
    }
    setLoadingUnassigned(true)
    try {
      const [studentRes, groupRes] = await Promise.all([
        api.get<{ students: UnassignedStudent[] }>('/api/school/fees/assignments/unassigned', {
          academicYear,
          classId: assignClassId,
        }),
        api.get<{ groups: FeeGroupOption[] }>('/api/school/fees/groups', {
          academicYear,
          classId: assignClassId,
        }),
      ])
      const students = studentRes.students || []
      setUnassignedStudents(students)
      // Default to all students selected — assigning the whole class is the norm.
      setSelectedStudentIds(new Set(students.map((student) => student.id)))
      const groups = groupRes.groups || []
      setAssignGroups(groups)
      setAssignGroupId((current) => (groups.some((group) => group.id === current) ? current : ''))
    } catch (err) {
      toast({
        title: "Couldn't Load Unassigned Students",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
      setUnassignedStudents([])
      setAssignGroups([])
      setSelectedStudentIds(new Set())
    } finally {
      setLoadingUnassigned(false)
    }
  }, [assignClassId, academicYear, toast])

  useEffect(() => {
    void fetchAssignData()
  }, [fetchAssignData])

  const allStudentsSelected =
    unassignedStudents.length > 0 && selectedStudentIds.size === unassignedStudents.length

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((current) => {
      const next = new Set(current)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
      }
      return next
    })
  }

  const toggleAllStudents = () => {
    setSelectedStudentIds((current) =>
      current.size === unassignedStudents.length ? new Set() : new Set(unassignedStudents.map((student) => student.id)),
    )
  }

  const selectedGroupNameForAssign = groupLabel(
    assignGroups.find((group) => group.id === assignGroupId)?.name || '',
  )

  const handleBulkAssign = async () => {
    if (!assignClassId || !assignGroupId || selectedStudentIds.size === 0) return
    try {
      setAssigning(true)
      const res = await api.post<{ message: string; assigned: unknown[]; skipped: unknown[]; failed: unknown[] }>(
        '/api/school/fees/assignments/bulk-assign',
        {
          academicYear,
          classId: assignClassId,
          feesGroupId: assignGroupId,
          studentIds: Array.from(selectedStudentIds),
          chargeFullYear: assignFullYear,
        },
      )
      toast({
        title: 'Fee Group Assigned',
        description: res.message,
        variant: res.failed?.length ? 'destructive' : 'default',
      })
      setAssignConfirmOpen(false)
      void fetchAssignData()
      // Refresh the Change Fee Group list too — newly assigned students now show there.
      void fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Assign Fee Group",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setAssigning(false)
    }
  }

  const openDialog = (assignment: EligibleAssignment) => {
    setActiveAssignment(assignment)
    setNewGroupId('')
    setReason('')
  }

  const closeDialog = () => {
    if (saving) return
    setActiveAssignment(null)
    setNewGroupId('')
    setReason('')
  }

  const openFullYearDialog = (assignment: EligibleAssignment) => {
    setFullYearTarget(assignment)
    setFullYearReason('')
  }

  const closeFullYearDialog = () => {
    if (billingFullYear) return
    setFullYearTarget(null)
    setFullYearReason('')
  }

  const handleConfirmFullYear = async () => {
    if (!fullYearTarget) return
    try {
      setBillingFullYear(true)
      await api.patch(`/api/school/fees/assignments/${fullYearTarget.id}/charge-full-year`, {
        reason: fullYearReason || undefined,
      })
      toast({
        title: 'Billed for Full Year',
        description: 'The fee demand was recomputed to cover the full academic year.',
      })
      setFullYearTarget(null)
      setFullYearReason('')
      void fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Bill Full Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBillingFullYear(false)
    }
  }

  const handleConfirm = async () => {
    if (!activeAssignment || !newGroupId) {
      toast({
        title: 'Select a New Group',
        description: 'Please pick a different fee group before confirming.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSaving(true)
      await api.patch(`/api/school/fees/assignments/${activeAssignment.id}/change-group`, {
        newFeesGroupId: newGroupId,
        reason: reason || undefined,
      })
      toast({
        title: 'Fee Group Changed',
        description: 'The old fee demand was cancelled and a fresh demand was created.',
      })
      setActiveAssignment(null)
      setNewGroupId('')
      setReason('')
      void fetchData()
    } catch (err) {
      toast({
        title: "Couldn't Change Fee Group",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Change Fee Group"
        description="Move an unpaid student to another fee group. Switch tabs to bill a pro-rated student for the full academic year instead."
        extraActions={
          <Select value={academicYear} onValueChange={setAcademicYear}>
            <SelectTrigger id="change-fee-group-year" className="h-9 w-[180px]">
              <SelectValue placeholder="Academic year" />
            </SelectTrigger>
            <SelectContent>
              {academicYearOptions.map((year) => (
                <SelectItem key={year.value} value={year.value}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        secondaryAction={{
          label: loading ? 'Refreshing...' : 'Refresh',
          icon: RefreshCw,
          iconClassName: loading ? 'animate-spin' : undefined,
          onClick: () => void fetchData(),
          disabled: loading,
        }}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'change' | 'full-year' | 'assign')} className="gap-4">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 p-1 sm:w-auto sm:grid-cols-3">
          <TabsTrigger value="change" className="gap-1.5">
            <RefreshCw className="size-3.5" />
            Change Fee Group
          </TabsTrigger>
          <TabsTrigger value="full-year" className="gap-1.5">
            <CalendarRange className="size-3.5" />
            Full Year Fee
          </TabsTrigger>
          <TabsTrigger value="assign" className="gap-1.5">
            <UserPlus className="size-3.5" />
            Assign Fee Group
          </TabsTrigger>
        </TabsList>

        <TabsContent value="change">
          <div className="space-y-4">
            <Alert className="border-amber-500/25 bg-amber-50/70 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <ShieldAlert className="size-4" />
              <AlertTitle>Only unpaid assignments are shown</AlertTitle>
              <AlertDescription>
                Change Fee Group replaces the student&apos;s fee group. It can be done only before any payment is
                collected, and every change is recorded in the audit log.
              </AlertDescription>
            </Alert>

            <div className="grid gap-3 md:grid-cols-4">
              <SummaryTile label="Eligible" value={stats.eligible} icon={<Users className="size-4" />} />
              <SummaryTile label="Can Change" value={stats.canChange} icon={<RefreshCw className="size-4" />} />
              <SummaryTile label="Pro-rated" value={stats.proRated} icon={<CalendarRange className="size-4" />} />
              <SummaryTile label="Demand" value={money(stats.totalDemand)} icon={<WalletCards className="size-4" />} />
            </div>

            <div className="overflow-hidden rounded-md border bg-background shadow-sm">
              <div className="border-b bg-muted/30 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Eligible Students</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {filteredAssignments.length} of {assignments.length} students shown
                    </p>
                  </div>
                  <div className="relative lg:w-[360px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search student, admission no, class, or group"
                      className="h-9 pl-9"
                    />
                  </div>
                </div>
              </div>
              {loading ? (
                <LoadingState />
              ) : assignments.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={FileCheck2}
                    title="No Eligible Students"
                    description="There are no students with an active fee assignment and zero collected payments for this academic year."
                  />
                </div>
              ) : filteredAssignments.length === 0 ? (
                <div className="flex min-h-[220px] items-center justify-center p-6 text-center">
                  <div>
                    <Search className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <p className="text-sm font-medium">No matching students</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Try another name, admission number, class, or fee group.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableHead className="min-w-[240px] px-4 py-2.5">Student</TableHead>
                        <TableHead className="px-4 py-2.5">Class</TableHead>
                        <TableHead className="px-4 py-2.5">Current Group</TableHead>
                        <TableHead className="px-4 py-2.5">Billing</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">Demand</TableHead>
                        <TableHead className="px-4 py-2.5 text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssignments.map((assignment) => {
                        const name = studentName(assignment)
                        const canChange = assignment.availableGroups.length > 0

                        return (
                          <TableRow key={assignment.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                            {initials(name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {assignment.student?.admissionNumber || 'No admission no'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{classLabel(assignment)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{assignment.feesGroupName || '-'}</Badge>
                      </TableCell>
                      <TableCell>
                        {assignment.billingMode === 'full_year' ? (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">
                            Full Year
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                            Pro-rated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(assignment.totalAmount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant={canChange ? 'default' : 'outline'}
                            onClick={() => openDialog(assignment)}
                            disabled={!canChange}
                            className="gap-1.5"
                          >
                            <RefreshCw className="size-3.5" />
                            Change
                          </Button>
                        </div>
                        {!canChange && (
                          <p className="mt-1 text-right text-[11px] text-muted-foreground">No alternate structure</p>
                        )}
                      </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="full-year">
        <div className="overflow-hidden rounded-md border bg-background shadow-sm">
          <div className="border-b bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Assign Full Year Fees</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use this only when a student was billed from admission month, but should be charged for the full academic year.
                </p>
              </div>
              <Badge variant="outline" className="gap-1.5">
                <CalendarRange className="size-3" />
                {fullYearAssignments.length} pro-rated
              </Badge>
            </div>
          </div>

          {loading ? (
            <LoadingState />
          ) : fullYearAssignments.length === 0 ? (
            <div className="flex min-h-[140px] items-center justify-center p-6 text-center">
              <div>
                <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600" />
                <p className="text-sm font-medium">No pro-rated students in this view</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Full-year fee assignment is shown here only for unpaid pro-rated demands.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                  <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="min-w-[240px] px-4 py-2.5">Student</TableHead>
                    <TableHead className="px-4 py-2.5">Class</TableHead>
                    <TableHead className="px-4 py-2.5">Fee Group</TableHead>
                    <TableHead className="px-4 py-2.5 text-right">Current Demand</TableHead>
                    <TableHead className="px-4 py-2.5 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fullYearAssignments.map((assignment) => {
                    const name = studentName(assignment)

                    return (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                              {initials(name)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {assignment.student?.admissionNumber || 'No admission no'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{classLabel(assignment)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{assignment.feesGroupName || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{money(assignment.totalAmount)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openFullYearDialog(assignment)}
                            className="gap-1.5"
                          >
                            <CalendarRange className="size-3.5" />
                            Assign Full Year
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        </TabsContent>

        <TabsContent value="assign">
          <div className="space-y-4">
            <Alert className="border-primary/20 bg-primary/5">
              <UserPlus className="size-4" />
              <AlertTitle>Assign a fee group to students without a fee demand</AlertTitle>
              <AlertDescription>
                Pick a class to see students (e.g. bulk-imported admissions) who don&apos;t yet have a fee demand for{' '}
                {academicYear || 'this year'}. Choose a fee group and assign it — a fresh demand is created for each
                selected student.
              </AlertDescription>
            </Alert>

            <div className="overflow-hidden rounded-md border bg-background shadow-sm">
              <div className="grid gap-3 border-b bg-muted/30 p-3 md:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1">
                  <Label htmlFor="assign-class" className="text-xs text-muted-foreground">
                    Class
                  </Label>
                  <Select value={assignClassId} onValueChange={setAssignClassId}>
                      <SelectTrigger id="assign-class" className="h-9">
                      <SelectValue placeholder="Select a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="assign-group" className="text-xs text-muted-foreground">
                    Fee Group
                  </Label>
                  <Select value={assignGroupId} onValueChange={setAssignGroupId} disabled={!assignClassId}>
                      <SelectTrigger id="assign-group" className="h-9">
                      <SelectValue placeholder={assignClassId ? 'Select a fee group' : 'Pick a class first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {assignGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {groupLabel(group.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => void fetchAssignData()}
                    disabled={!assignClassId || loadingUnassigned}
                    className="h-9 gap-2"
                  >
                    <RefreshCw className={`size-4 ${loadingUnassigned ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {!assignClassId ? (
                <div className="flex min-h-[200px] items-center justify-center p-6 text-center">
                  <div>
                    <GraduationCap className="mx-auto mb-3 size-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Select a class to begin</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      We&apos;ll list students in that class who still need a fee group for {academicYear || 'the year'}.
                    </p>
                  </div>
                </div>
              ) : loadingUnassigned ? (
                <LoadingState />
              ) : assignClassId && assignGroups.length === 0 ? (
                <div className="p-6">
                  <Alert className="border-amber-500/25 bg-amber-50/70 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>No fee structure for this class</AlertTitle>
                    <AlertDescription>
                      There&apos;s no active fee structure for this class in {academicYear}. Create a fee structure first,
                      then assign a group here.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : unassignedStudents.length === 0 ? (
                <div className="flex min-h-[200px] items-center justify-center p-6 text-center">
                  <div>
                    <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-600" />
                    <p className="text-sm font-medium">Every student already has a fee group</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      No students in this class are missing a fee demand for {academicYear}.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableHead className="w-12 px-4 py-2.5">
                            <Checkbox
                              checked={allStudentsSelected}
                              onCheckedChange={toggleAllStudents}
                              aria-label="Select all students"
                            />
                          </TableHead>
                          <TableHead className="min-w-[240px] px-4 py-2.5">Student</TableHead>
                          <TableHead className="px-4 py-2.5">Class</TableHead>
                          <TableHead className="px-4 py-2.5">Roll No</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unassignedStudents.map((student) => {
                          const name = `${student.firstName} ${student.lastName}`.trim()
                          const checked = selectedStudentIds.has(student.id)
                          return (
                            <TableRow
                              key={student.id}
                              data-state={checked ? 'selected' : undefined}
                              className="cursor-pointer"
                              onClick={() => toggleStudent(student.id)}
                            >
                              <TableCell onClick={(event) => event.stopPropagation()}>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleStudent(student.id)}
                                  aria-label={`Select ${name}`}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                                    {initials(name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{name}</p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {student.admissionNumber || 'No admission no'}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {[student.className, student.sectionName].filter(Boolean).join(' - ') || '-'}
                              </TableCell>
                              <TableCell>{student.rollNumber || '-'}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
                    <div className="flex items-center gap-3">
                      <Switch id="assign-full-year" checked={assignFullYear} onCheckedChange={setAssignFullYear} />
                      <Label htmlFor="assign-full-year" className="text-sm">
                        Bill full academic year
                        <span className="ml-1 text-xs text-muted-foreground">
                          (skip pro-rating by admission month)
                        </span>
                      </Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {selectedStudentIds.size} of {unassignedStudents.length} selected
                      </span>
                      <Button
                        onClick={() => setAssignConfirmOpen(true)}
                        disabled={!assignGroupId || selectedStudentIds.size === 0}
                        className="gap-2"
                      >
                        <UserPlus className="size-4" />
                        Assign Fee Group
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={assignConfirmOpen} onOpenChange={(open) => !assigning && setAssignConfirmOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Fee Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm">
              Assign{' '}
              <span className="font-semibold">{selectedGroupNameForAssign || 'the selected fee group'}</span> to{' '}
              <span className="font-semibold">{selectedStudentIds.size}</span> student
              {selectedStudentIds.size === 1 ? '' : 's'} for {academicYear}?
            </p>
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                A fresh fee demand will be created for each selected student
                {assignFullYear ? ' for the full academic year' : ', pro-rated from their admission month'}. Students who
                already have a demand are skipped automatically.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignConfirmOpen(false)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleBulkAssign} disabled={assigning} className="gap-2">
              {assigning ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirm Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!activeAssignment} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Change Fee Group</DialogTitle>
          </DialogHeader>
          {activeAssignment && (
            <div className="space-y-4 py-2">
              <AssignmentSummary assignment={activeAssignment} />

              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="mt-1 font-medium">{activeAssignment.feesGroupName || '-'}</p>
                </div>
                <div>
                  <Label htmlFor="new-fee-group" className="text-xs text-muted-foreground">
                    To
                  </Label>
                  <Select value={newGroupId} onValueChange={setNewGroupId}>
                    <SelectTrigger id="new-fee-group" className="mt-1">
                      <SelectValue placeholder="Select new group" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="change-fee-group-reason">Reason (optional)</Label>
                <Textarea
                  id="change-fee-group-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Example: wrong group selected during admission"
                  rows={3}
                />
              </div>

              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Confirming will cancel the current demand and create a new demand
                  {selectedGroupName ? ` for ${selectedGroupName}` : ''}. This can be done only before any payment is collected.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={saving || !newGroupId} className="gap-2">
              {saving ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fullYearTarget} onOpenChange={(open) => !open && closeFullYearDialog()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign Full Year Fees</DialogTitle>
          </DialogHeader>
          {fullYearTarget && (
            <div className="space-y-4 py-2">
              <AssignmentSummary assignment={fullYearTarget} />

              <div className="space-y-2">
                <Label htmlFor="full-year-reason">Reason (optional)</Label>
                <Textarea
                  id="full-year-reason"
                  value={fullYearReason}
                  onChange={(event) => setFullYearReason(event.target.value)}
                  placeholder="Example: student should be charged for the complete session"
                  rows={3}
                />
              </div>

              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  This keeps the same fee group and rebuilds the demand for the full academic year, including skipped months. It is available only before payment is collected.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeFullYearDialog} disabled={billingFullYear}>
              Cancel
            </Button>
            <Button onClick={handleConfirmFullYear} disabled={billingFullYear} className="gap-2">
              {billingFullYear ? (
                <CalendarRange className="size-4 animate-spin" />
              ) : (
                <CalendarRange className="size-4" />
              )}
              Assign Full Year
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryTile({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-background p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="rounded-md bg-muted/50 p-1 text-primary">{icon}</span>
      </div>
      <p className="mt-1 truncate text-lg font-semibold">{value}</p>
    </div>
  )
}

function AssignmentSummary({ assignment }: { assignment: EligibleAssignment }) {
  const name = studentName(assignment)

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold shadow-sm">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{assignment.student?.admissionNumber || 'No admission no'}</span>
            <span>{classLabel(assignment)}</span>
            <span>{assignment.academicYear}</span>
            <span>{money(assignment.totalAmount)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
