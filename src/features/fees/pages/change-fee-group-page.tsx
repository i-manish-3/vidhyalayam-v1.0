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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RefreshCw, AlertTriangle, FileCheck2 } from 'lucide-react'

interface EligibleAssignment {
  id: string
  academicYear: string
  feesGroupId: string
  feesGroupName: string | null
  classId: string | null
  sectionId: string | null
  totalAmount: number
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

function money(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN')}`
}

export function ChangeFeeGroupPage() {
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((state) => state.currentSchool?.academicYear)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignments, setAssignments] = useState<EligibleAssignment[]>([])
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [academicYear, setAcademicYear] = useState<string>(currentSchoolAcademicYear || getCurrentAcademicYear())

  const [activeAssignment, setActiveAssignment] = useState<EligibleAssignment | null>(null)
  const [newGroupId, setNewGroupId] = useState('')
  const [reason, setReason] = useState('')

  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(academicYears, currentSchoolAcademicYear),
    [academicYears, currentSchoolAcademicYear]
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [assignmentRes, yearRes] = await Promise.all([
        api.get<{ assignments: EligibleAssignment[] }>(
          '/api/school/fees/assignments/eligible-for-group-change',
          academicYear ? { academicYear } : undefined
        ),
        api.get<{ academicYears: string[] }>('/api/school/academic-years'),
      ])
      setAssignments(assignmentRes.assignments || [])
      setAcademicYears(yearRes.academicYears || [])
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
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (academicYearOptions.length > 0 && !academicYearOptions.some((year) => year.value === academicYear)) {
      setAcademicYear(academicYearOptions[0].value)
    }
  }, [academicYearOptions, academicYear])

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

  const availableGroups = useMemo(() => {
    return activeAssignment?.availableGroups || []
  }, [activeAssignment])

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
      fetchData()
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
    <div className="space-y-6">
      <PageHeader
        title="Change Fee Group"
        description="Switch a student to a different fee group. Only available when no payments have been collected against the current group."
      />

      <Alert>
        <AlertTriangle className="size-4" />
        <AlertTitle>Restricted action</AlertTitle>
        <AlertDescription>
          This cancels the existing fee demand and creates a fresh demand for the selected group. The change is recorded
          in the audit log. Only school administrators (or users explicitly granted the &quot;Change Fee Group&quot; permission) can perform this action.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-3">
        <Label htmlFor="change-fee-group-year" className="whitespace-nowrap">
          Academic Year
        </Label>
        <Select value={academicYear} onValueChange={setAcademicYear}>
          <SelectTrigger id="change-fee-group-year" className="w-64">
            <SelectValue placeholder="Select academic year" />
          </SelectTrigger>
          <SelectContent>
            {academicYearOptions.map((year) => (
              <SelectItem key={year.value} value={year.value}>
                {year.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <LoadingState />
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No Eligible Students"
          description="There are no students with an active fee assignment and zero collected payments for this academic year."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Admission #</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Current Fee Group</TableHead>
                <TableHead>Total Demand</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => {
                const studentName = assignment.student
                  ? `${assignment.student.firstName} ${assignment.student.lastName}`.trim()
                  : 'Unknown student'
                const className = [assignment.student?.className, assignment.student?.sectionName]
                  .filter(Boolean)
                  .join(' - ') || '-'
                return (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">{studentName}</TableCell>
                    <TableCell>{assignment.student?.admissionNumber || '-'}</TableCell>
                    <TableCell>{className}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{assignment.feesGroupName || '-'}</Badge>
                    </TableCell>
                    <TableCell>{money(assignment.totalAmount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDialog(assignment)}
                        disabled={assignment.availableGroups.length === 0}
                        title={
                          assignment.availableGroups.length === 0
                            ? 'No other fee group has an active structure for this class & academic year'
                            : undefined
                        }
                      >
                        <RefreshCw className="mr-2 size-4" />
                        Change Group
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!activeAssignment} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change Fee Group</DialogTitle>
          </DialogHeader>
          {activeAssignment && (
            <div className="grid gap-4 py-2">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div>
                  <span className="font-medium">Student: </span>
                  {activeAssignment.student
                    ? `${activeAssignment.student.firstName} ${activeAssignment.student.lastName}`.trim()
                    : 'Unknown student'}
                </div>
                <div>
                  <span className="font-medium">Current Group: </span>
                  {activeAssignment.feesGroupName || '-'}
                </div>
                <div>
                  <span className="font-medium">Academic Year: </span>
                  {activeAssignment.academicYear}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-fee-group">New Fee Group</Label>
                <Select value={newGroupId} onValueChange={setNewGroupId}>
                  <SelectTrigger id="new-fee-group">
                    <SelectValue placeholder="Select new fee group" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No other groups available
                      </SelectItem>
                    ) : (
                      availableGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="change-fee-group-reason">Reason (optional)</Label>
                <Textarea
                  id="change-fee-group-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why is this change being made? (recorded in audit log)"
                  rows={3}
                />
              </div>

              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  Confirming will cancel the existing fee demand and create a fresh demand for the selected group.
                </AlertDescription>
              </Alert>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={saving || !newGroupId}>
              {saving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
