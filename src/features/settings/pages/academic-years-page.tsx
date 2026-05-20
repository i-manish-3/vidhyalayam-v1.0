'use client'

import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Loader2, PauseCircle, PlusCircle, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, type AcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface AcademicYearImpactPreview {
  currentYear: string | null
  targetYear: string
  counts: {
    activeStudents: number
    admissions: number
    feeStructures: number
    feeAssignments: number
    feeInvoices: number
    attendance: number
    timetable: number
    exams: number
    transportRoutes: number
    transportAllocations: number
  }
  warnings: string[]
}

interface YearDialogState {
  open: boolean
  year: AcademicYear | null
  preview: AcademicYearImpactPreview | null
  loading: boolean
  busy: boolean
  confirmationText: string
}

const emptyDialog: YearDialogState = {
  open: false,
  year: null,
  preview: null,
  loading: false,
  busy: false,
  confirmationText: '',
}

function ImpactCounts({ preview }: { preview: AcademicYearImpactPreview }) {
  const rows: Array<[string, number]> = [
    ['Active students', preview.counts.activeStudents],
    ['Admissions', preview.counts.admissions],
    ['Fee structures', preview.counts.feeStructures],
    ['Fee assignments', preview.counts.feeAssignments],
    ['Fee invoices', preview.counts.feeInvoices],
    ['Attendance records', preview.counts.attendance],
    ['Timetable entries', preview.counts.timetable],
    ['Exams', preview.counts.exams],
    ['Transport routes', preview.counts.transportRoutes],
    ['Transport allocations', preview.counts.transportAllocations],
  ]

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
    </div>
  )
}

export function AcademicYearsPage() {
  const { toast } = useToast()
  const { currentSchool, setCurrentSchool, user, goBack } = useAppStore()
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [deletedAcademicYears, setDeletedAcademicYears] = useState<AcademicYear[]>([])
  const [yearName, setYearName] = useState(getCurrentAcademicYear())
  const [yearStartDate, setYearStartDate] = useState('')
  const [yearEndDate, setYearEndDate] = useState('')
  const [loadingYears, setLoadingYears] = useState(true)
  const [savingYear, setSavingYear] = useState(false)
  const [switchDialog, setSwitchDialog] = useState<YearDialogState>(emptyDialog)
  const [deleteDialog, setDeleteDialog] = useState<YearDialogState>(emptyDialog)
  const [restoreDialog, setRestoreDialog] = useState<YearDialogState>(emptyDialog)
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean
    year: AcademicYear | null
    targetActive: boolean
    busy: boolean
  }>({
    open: false,
    year: null,
    targetActive: false,
    busy: false,
  })

  const currentAcademicYear = academicYears.find((year) => year.isCurrent)

  const fetchAcademicYears = async () => {
    try {
      setLoadingYears(true)
      const res = await api.get<{ years: AcademicYear[]; deletedYears?: AcademicYear[] }>('/api/school/academic-years', { includeDeleted: 'true' })
      setAcademicYears(res.years || [])
      setDeletedAcademicYears(res.deletedYears || [])
    } catch (err) {
      toast({
        title: "Couldn't Load Academic Years",
        description: err instanceof Error ? err.message : 'Please refresh and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingYears(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'SCHOOL_ADMIN') {
      fetchAcademicYears()
    }
  }, [user?.role])

  const formatDate = (value: string | null) => {
    if (!value) return '-'
    return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const createAcademicYear = async () => {
    const name = yearName.trim()
    if (!/^\d{4}-\d{4}$/.test(name)) {
      toast({
        title: 'Invalid Academic Year',
        description: 'Use format like 2026-2027.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSavingYear(true)
      await api.post('/api/school/academic-years', {
        name,
        startDate: yearStartDate || null,
        endDate: yearEndDate || null,
      })
      toast({ title: 'Academic Year Created', description: `${name} is now available. Review it before making it current.` })
      setYearName('')
      setYearStartDate('')
      setYearEndDate('')
      fetchAcademicYears()
    } catch (err) {
      toast({
        title: "Couldn't Create Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingYear(false)
    }
  }

  const updateAcademicYear = async (year: AcademicYear, data: Partial<Pick<AcademicYear, 'isActive'>>) => {
    try {
      await api.patch(`/api/school/academic-years/${year.id}`, data)
      toast({
        title: data.isActive === false ? 'Academic Year Deactivated' : data.isActive === true ? 'Academic Year Reactivated' : 'Academic Year Updated',
        description: data.isActive === false
          ? `${year.name} is still available for history, but hidden from normal new-record year choices.`
          : data.isActive === true
            ? `${year.name} is available again for normal year choices.`
            : `${year.name} has been updated.`,
      })
      fetchAcademicYears()
    } catch (err) {
      toast({
        title: "Couldn't Update Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
      throw err
    }
  }

  const openStatusDialog = (year: AcademicYear, targetActive: boolean) => {
    setStatusDialog({
      open: true,
      year,
      targetActive,
      busy: false,
    })
  }

  const closeStatusDialog = () => {
    if (statusDialog.busy) return
    setStatusDialog({
      open: false,
      year: null,
      targetActive: false,
      busy: false,
    })
  }

  const confirmStatusChange = async () => {
    if (!statusDialog.year) return
    try {
      setStatusDialog((current) => ({ ...current, busy: true }))
      await updateAcademicYear(statusDialog.year, { isActive: statusDialog.targetActive })
      setStatusDialog({
        open: false,
        year: null,
        targetActive: false,
        busy: false,
      })
    } catch {
      setStatusDialog((current) => ({ ...current, busy: false }))
    }
  }

  const loadPreview = async (
    year: AcademicYear,
    setDialog: Dispatch<SetStateAction<YearDialogState>>,
    includeDeleted = false
  ) => {
    setDialog({ open: true, year, preview: null, loading: true, busy: false, confirmationText: '' })
    try {
      const res = await api.get<{ preview: AcademicYearImpactPreview }>(
        `/api/school/academic-years/${year.id}`,
        includeDeleted ? { includeDeleted: 'true' } : undefined
      )
      setDialog((current) => ({ ...current, preview: res.preview, loading: false }))
    } catch (err) {
      setDialog((current) => ({ ...current, loading: false }))
      toast({
        title: "Couldn't Load Year Review",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const closeDialog = (dialog: YearDialogState, setDialog: Dispatch<SetStateAction<YearDialogState>>) => {
    if (dialog.busy) return
    setDialog(emptyDialog)
  }

  const confirmSwitch = async () => {
    const year = switchDialog.year
    if (!year || switchDialog.confirmationText !== year.name) return

    try {
      setSwitchDialog((current) => ({ ...current, busy: true }))
      await api.patch(`/api/school/academic-years/${year.id}`, {
        isCurrent: true,
        confirmAcademicYearSwitch: true,
        acknowledgedImpact: true,
        confirmationText: year.name,
      })
      if (currentSchool) {
        setCurrentSchool({ ...currentSchool, academicYear: year.name })
      }
      toast({ title: 'Current Year Updated', description: `${year.name} is now the current academic year.` })
      setSwitchDialog(emptyDialog)
      fetchAcademicYears()
    } catch (err) {
      setSwitchDialog((current) => ({ ...current, busy: false }))
      toast({
        title: "Couldn't Switch Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const confirmDelete = async () => {
    const year = deleteDialog.year
    if (!year || deleteDialog.confirmationText !== year.name) return

    try {
      setDeleteDialog((current) => ({ ...current, busy: true }))
      await api.delete(`/api/school/academic-years/${year.id}`, {
        confirmAcademicYearDelete: true,
        acknowledgedImpact: true,
        confirmationText: year.name,
      })
      toast({ title: 'Academic Year Removed', description: `${year.name} has been removed from active setup.` })
      setDeleteDialog(emptyDialog)
      fetchAcademicYears()
    } catch (err) {
      setDeleteDialog((current) => ({ ...current, busy: false }))
      toast({
        title: "Couldn't Remove Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  const confirmRestore = async () => {
    const year = restoreDialog.year
    if (!year || restoreDialog.confirmationText !== year.name) return

    try {
      setRestoreDialog((current) => ({ ...current, busy: true }))
      await api.patch(`/api/school/academic-years/${year.id}`, {
        restoreAcademicYear: true,
        confirmAcademicYearRestore: true,
        acknowledgedImpact: true,
        confirmationText: year.name,
      })
      toast({ title: 'Academic Year Restored', description: `${year.name} is active again. It was not made current automatically.` })
      setRestoreDialog(emptyDialog)
      fetchAcademicYears()
    } catch (err) {
      setRestoreDialog((current) => ({ ...current, busy: false }))
      toast({
        title: "Couldn't Restore Academic Year",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  if (user?.role !== 'SCHOOL_ADMIN') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="mb-3 size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold">Academic year setup is available for school admins.</h2>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button type="button" variant="outline" size="icon" className="mt-0.5 size-9 shrink-0" onClick={() => goBack('dashboard')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Academic Years</h1>
            <p className="text-sm text-muted-foreground">Manage current, inactive, deleted, and restored academic sessions with impact review.</p>
          </div>
        </div>
        {currentAcademicYear && (
          <Badge className="self-start" variant="secondary">Current: {currentAcademicYear.name}</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            Year Setup
          </CardTitle>
          <CardDescription>
            Academic years drive admissions, fees, attendance, timetable, transport, exams, and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid items-end gap-3 md:grid-cols-[200px_200px_200px_180px]">
            <div className="space-y-2">
              <Label htmlFor="academic-year-name">Academic Year</Label>
              <Input id="academic-year-name" value={yearName} onChange={(event) => setYearName(event.target.value)} placeholder="2026-2027" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="academic-year-start">Start Date</Label>
              <Input id="academic-year-start" type="date" value={yearStartDate} onChange={(event) => setYearStartDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="academic-year-end">End Date</Label>
              <Input id="academic-year-end" type="date" value={yearEndDate} onChange={(event) => setYearEndDate(event.target.value)} />
            </div>
            <Button type="button" className="h-10 gap-2" onClick={createAcademicYear} disabled={savingYear}>
              {savingYear ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
              Add Year
            </Button>
          </div>

          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Current year changes require review</AlertTitle>
            <AlertDescription>
              Changing the current academic year changes the default year used across the app. If the next year is not prepared, fees, attendance, timetable, exams, transport, admissions, and reports may look empty or mismatched.
            </AlertDescription>
          </Alert>

          <Alert>
            <CalendarDays className="size-4" />
            <AlertTitle>Use inactive for past years</AlertTitle>
            <AlertDescription>
              Past years should usually be marked inactive instead of deleted. Inactive years stay visible here for history and report access, but they are removed from normal new-record dropdowns so users do not accidentally add fresh admissions, fees, timetable, or transport data to an old session.
            </AlertDescription>
          </Alert>

          <div className="overflow-hidden rounded-lg border">
            <div className="grid grid-cols-[1fr_150px_150px_130px_240px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
              <span>Year</span>
              <span>Start</span>
              <span>End</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {loadingYears ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading academic years...
              </div>
            ) : academicYears.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No academic years found. Add the first year to start using year-wise setup.
              </div>
            ) : (
              academicYears.map((year) => (
                <div key={year.id} className="grid grid-cols-[1fr_150px_150px_130px_240px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-medium">{year.name}</span>
                    {year.isCurrent && <Badge>Current</Badge>}
                  </div>
                  <span className="text-muted-foreground">{formatDate(year.startDate)}</span>
                  <span className="text-muted-foreground">{formatDate(year.endDate)}</span>
                  <Badge variant={year.isActive ? 'secondary' : 'outline'}>{year.isActive ? 'Active' : 'Inactive'}</Badge>
                  <div className="flex justify-end gap-1.5">
                    {!year.isCurrent && (
                      <Button type="button" variant="outline" size="sm" onClick={() => loadPreview(year, setSwitchDialog)}>
                        Set Current
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" disabled={year.isCurrent} onClick={() => openStatusDialog(year, !year.isActive)}>
                      {year.isActive ? <PauseCircle className="size-4 text-amber-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
                      {year.isActive ? 'Deactivate' : 'Reactivate'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      disabled={year.isCurrent}
                      onClick={() => loadPreview(year, setDeleteDialog)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {deletedAcademicYears.length > 0 && (
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Deleted Academic Years</h3>
                <p className="text-xs text-muted-foreground">Restore a deleted year to make it available again. Restoring does not make it current.</p>
              </div>
              <div className="overflow-hidden rounded-lg border border-dashed">
                <div className="grid grid-cols-[1fr_150px_150px_130px_240px] gap-3 border-b bg-muted/30 px-4 py-3 text-xs font-medium uppercase text-muted-foreground">
                  <span>Year</span>
                  <span>Start</span>
                  <span>End</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {deletedAcademicYears.map((year) => (
                  <div key={year.id} className="grid grid-cols-[1fr_150px_150px_130px_240px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0">
                    <span className="font-medium">{year.name}</span>
                    <span className="text-muted-foreground">{formatDate(year.startDate)}</span>
                    <span className="text-muted-foreground">{formatDate(year.endDate)}</span>
                    <Badge variant="outline">Deleted</Badge>
                    <div className="flex justify-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => loadPreview(year, setRestoreDialog, true)}>
                        <RotateCcw className="size-4" />
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <YearActionDialog
        state={switchDialog}
        setState={setSwitchDialog}
        title="Review academic year switch"
        description="Switching current year changes the default year used by admissions, fees, attendance, timetable, transport, exams, and reports."
        actionLabel="Switch Current Year"
        actionIcon="switch"
        onCancel={() => closeDialog(switchDialog, setSwitchDialog)}
        onConfirm={confirmSwitch}
      />

      <Dialog open={statusDialog.open} onOpenChange={(open) => { if (!open) closeStatusDialog() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {statusDialog.targetActive ? (
                <CheckCircle2 className="size-5 text-emerald-600" />
              ) : (
                <PauseCircle className="size-5 text-amber-600" />
              )}
              {statusDialog.targetActive ? 'Reactivate academic year?' : 'Deactivate academic year?'}
            </DialogTitle>
            <DialogDescription>
              {statusDialog.targetActive
                ? `${statusDialog.year?.name || 'This year'} will be available again in normal year selections for new records.`
                : `${statusDialog.year?.name || 'This year'} will remain visible for history and reports, but it will be removed from normal new-record dropdowns.`}
            </DialogDescription>
          </DialogHeader>

          <Alert>
            {statusDialog.targetActive ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
            <AlertTitle>{statusDialog.year?.name || 'Academic year'}</AlertTitle>
            <AlertDescription>
              {statusDialog.targetActive
                ? 'Use reactivate only when users should be allowed to create new admissions, fees, timetable, transport, or other year-wise records for this session.'
                : 'This is usually the safest option for past years because existing records stay accessible while fresh data entry is discouraged.'}
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeStatusDialog} disabled={statusDialog.busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={statusDialog.targetActive ? 'default' : 'outline'}
              onClick={confirmStatusChange}
              disabled={statusDialog.busy}
            >
              {statusDialog.busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : statusDialog.targetActive ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <PauseCircle className="size-4" />
              )}
              {statusDialog.targetActive ? 'Reactivate Year' : 'Deactivate Year'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <YearActionDialog
        state={deleteDialog}
        setState={setDeleteDialog}
        title="Review academic year delete"
        description="Removing an academic year hides it from active setup and dropdowns. Existing records are not erased, but they can become harder to reach from normal year filters."
        danger
        actionLabel="Delete Academic Year"
        actionIcon="delete"
        onCancel={() => closeDialog(deleteDialog, setDeleteDialog)}
        onConfirm={confirmDelete}
      />

      <YearActionDialog
        state={restoreDialog}
        setState={setRestoreDialog}
        title="Review academic year restore"
        description="Restoring makes the academic year active again so it can appear in normal setup and year filters. It will not become the current year automatically."
        actionLabel="Restore Academic Year"
        actionIcon="restore"
        onCancel={() => closeDialog(restoreDialog, setRestoreDialog)}
        onConfirm={confirmRestore}
      />
    </div>
  )
}

function YearActionDialog({
  state,
  setState,
  title,
  description,
  danger = false,
  actionLabel,
  actionIcon,
  onCancel,
  onConfirm,
}: {
  state: YearDialogState
  setState: Dispatch<SetStateAction<YearDialogState>>
  title: string
  description: string
  danger?: boolean
  actionLabel: string
  actionIcon: 'switch' | 'delete' | 'restore'
  onCancel: () => void
  onConfirm: () => void
}) {
  const Icon = actionIcon === 'delete' ? Trash2 : actionIcon === 'restore' ? RotateCcw : ShieldCheck

  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {danger ? <AlertTriangle className="size-5 text-destructive" /> : <Icon className="size-5 text-primary" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {state.loading ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading year impact...
            </div>
          ) : state.preview && state.year ? (
            <div className="space-y-4">
              {actionIcon === 'switch' && (
                <>
                  <Alert variant="destructive">
                    <AlertTriangle className="size-4" />
                    <AlertTitle>Switching academic year can change what users see immediately</AlertTitle>
                    <AlertDescription>
                      After switching, screens that use the current year will load {state.year.name}. If records for that year are missing, users may see no fee dues, missing timetable entries, no attendance history, no transport allocation, or incomplete reports. Old data is not deleted, but normal filters will point to the new year.
                    </AlertDescription>
                  </Alert>
                  <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Current year</p>
                      <p className="mt-1 text-lg font-semibold">{state.preview.currentYear || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">Switching to</p>
                      <p className="mt-1 text-lg font-semibold">{state.preview.targetYear}</p>
                    </div>
                  </div>
                  {state.preview.warnings.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>Setup gaps found for {state.preview.targetYear}</AlertTitle>
                      <AlertDescription>{state.preview.warnings.join(' ')}</AlertDescription>
                    </Alert>
                  )}
                </>
              )}

              {actionIcon === 'delete' && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Deleting an academic year can hide linked records from normal screens</AlertTitle>
                  <AlertDescription>
                    This is a soft delete, so admissions, fees, attendance, timetable, exams, and transport data are not erased. But the year will disappear from active setup and dropdowns, which can make old records harder to find and can confuse reports that depend on active academic years. Prefer marking it inactive unless you are intentionally archiving the year.
                  </AlertDescription>
                </Alert>
              )}

              {actionIcon === 'restore' && (
                <Alert>
                  <ShieldCheck className="size-4" />
                  <AlertTitle>Restore only brings the year back to active setup</AlertTitle>
                  <AlertDescription>
                    Use the guarded Set Current action separately if this should become the school's current academic year.
                  </AlertDescription>
                </Alert>
              )}

              <ImpactCounts preview={state.preview} />

              <div className="space-y-2">
                <Label htmlFor={`academic-year-${actionIcon}-confirmation`}>
                  Type {state.year.name} to confirm
                </Label>
                <Input
                  id={`academic-year-${actionIcon}-confirmation`}
                  value={state.confirmationText}
                  onChange={(event) => setState((current) => ({ ...current, confirmationText: event.target.value }))}
                  placeholder={state.year.name}
                />
              </div>
            </div>
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Review unavailable</AlertTitle>
              <AlertDescription>Close this dialog and try again.</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={state.busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={!state.year || state.loading || state.busy || state.confirmationText !== state.year.name}
          >
            {state.busy ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
