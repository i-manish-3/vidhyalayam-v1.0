'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Trash2,
  School as SchoolIcon,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  Search,
  Users as UsersIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const CONFIRM_PHRASE = 'DELETE-STUDENTS'
const PAGE_SIZE = 20

interface SchoolOption {
  id: string
  name: string
}

interface StudentRow {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  isActive: boolean
  class: { name: string } | null
  section: { name: string } | null
}

type Scope = 'all' | 'active' | 'disabled'

const SCOPE_OPTIONS: { value: Scope; label: string; hint: string }[] = [
  { value: 'all', label: 'All students', hint: 'Active and disabled students with any records' },
  { value: 'active', label: 'Active students only', hint: 'Students currently marked as active' },
  { value: 'disabled', label: 'Disabled students only', hint: 'Students currently marked as disabled' },
]

function scopeLabel(scope: Scope) {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label.toLowerCase() || scope
}

function fullName(s: StudentRow) {
  return [s.firstName, s.lastName].filter(Boolean).join(' ').trim() || '—'
}

export function StudentWipePage() {
  const { toast } = useToast()
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [count, setCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)

  const [students, setStudents] = useState<StudentRow[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'scope' | 'selected'>('scope')
  const [typedPhrase, setTypedPhrase] = useState('')
  const [wiping, setWiping] = useState(false)
  const [lastDeleted, setLastDeleted] = useState<number | null>(null)

  useEffect(() => {
    api.get<{ schools: SchoolOption[] }>('/api/super-admin/schools', { limit: '200' })
      .then((res) => setSchools(res.schools || []))
      .catch(() => {})
  }, [])

  const refreshCount = useCallback(async (sid: string, sc: Scope) => {
    if (!sid) {
      setCount(null)
      return
    }
    setCounting(true)
    try {
      const res = await api.get<{ count: number }>(`/api/super-admin/schools/${sid}/students?scope=${sc}`, undefined, { skipLogoutOn401: true })
      setCount(res.count ?? 0)
    } catch {
      setCount(null)
    } finally {
      setCounting(false)
    }
  }, [])

  const loadStudents = useCallback(async (sid: string, sc: Scope, query: string, pg: number) => {
    if (!sid) {
      setStudents([])
      setListTotal(0)
      return
    }
    setListLoading(true)
    try {
      const res = await api.get<{ students: StudentRow[]; total: number }>(
        `/api/super-admin/schools/${sid}/students`,
        { scope: sc, q: query, page: String(pg), pageSize: String(PAGE_SIZE) },
        { skipLogoutOn401: true }
      )
      setStudents(res.students ?? [])
      setListTotal(res.total ?? 0)
    } catch {
      setStudents([])
      setListTotal(0)
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshCount(schoolId, scope)
  }, [schoolId, scope, refreshCount])

  useEffect(() => {
    loadStudents(schoolId, scope, q, page)
  }, [schoolId, scope, q, page, loadStudents])

  const selectedSchool = schools.find((s) => s.id === schoolId)
  const selectedCount = selectedIds.size
  const pageSelectedCount = students.filter((s) => selectedIds.has(s.id)).length
  const totalPages = Math.max(1, Math.ceil(listTotal / PAGE_SIZE))

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const pageIds = students.map((s) => s.id)
      const allSelected = pageIds.length > 0 && pageIds.every((id) => next.has(id))
      if (allSelected) {
        for (const id of pageIds) next.delete(id)
      } else {
        for (const id of pageIds) next.add(id)
      }
      return next
    })
  }

  const openDialog = (mode: 'scope' | 'selected') => {
    setDialogMode(mode)
    setTypedPhrase('')
    setDialogOpen(true)
  }

  const wipe = async () => {
    if (!schoolId || typedPhrase.trim() !== CONFIRM_PHRASE) return
    setWiping(true)
    try {
      const body: { scope: Scope; confirmText: string; studentIds?: string[] } = {
        scope,
        confirmText: typedPhrase,
      }
      if (dialogMode === 'selected' && selectedCount > 0) {
        body.studentIds = [...selectedIds]
      }
      const res = await api.delete<{ deleted: number }>(`/api/super-admin/schools/${schoolId}/students`, body)
      setLastDeleted(res.deleted ?? 0)
      setDialogOpen(false)
      setTypedPhrase('')
      setSelectedIds(new Set())
      toast({
        title: 'Students deleted permanently',
        description: `${res.deleted} student${res.deleted !== 1 ? 's' : ''} were removed from the database.`,
      })
      if (listTotal - (res.deleted ?? 0) <= (page - 1) * PAGE_SIZE && page > 1) {
        setPage(page - 1)
      } else {
        loadStudents(schoolId, scope, q, page)
      }
      refreshCount(schoolId, scope)
    } catch {
      toast({
        title: 'Wipe failed',
        description: 'Could not delete students. No changes were made — verify the confirmation phrase.',
        variant: 'destructive',
      })
    } finally {
      setWiping(false)
    }
  }

  const resetSelection = () => {
    setSchoolId('')
    setScope('all')
    setCount(null)
    setLastDeleted(null)
    setStudents([])
    setListTotal(0)
    setQ('')
    setPage(1)
    setSelectedIds(new Set())
  }

  const selectedStudentsSummary = useMemo(() => {
    if (selectedCount === 0) return ''
    const selected = new Set(selectedIds)
    const shown = students.filter((s) => selected.has(s.id))
    const hidden = selectedCount - shown.length
    let text = shown.slice(0, 3).map((s) => fullName(s)).join(', ')
    if (shown.length > 3) text += `, +${shown.length - 3} more`
    if (hidden > 0) text += ` and ${hidden} more on other pages`
    return text
  }, [selectedCount, selectedIds, students])

  return (
    <div className="space-y-4">
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-red-500/30 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-4 py-3 text-white shadow-lg shadow-red-600/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-rose-200/15" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md backdrop-blur-sm">
            <Trash2 className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Student Wipe</h1>
            <p className="mt-0.5 text-xs text-white/80">
              Permanently delete a school&apos;s students from the database. This cannot be undone.
            </p>
          </div>
        </div>
        <Badge className="shrink-0 gap-1 border border-white/25 bg-white/15 text-[10px] font-semibold text-white backdrop-blur-sm">
          <ShieldCheck className="size-3" /> SUPER ADMIN ONLY
        </Badge>
      </div>

      {lastDeleted != null && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="text-emerald-900 dark:text-emerald-200">
            <strong>{lastDeleted}</strong> student{lastDeleted !== 1 ? 's' : ''} permanently deleted, including attached attendance, fee, exam, transport, hostel and library records.
          </span>
        </div>
      )}

      <Card className={cn(!schoolId && 'border-dashed')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SchoolIcon className="size-4 text-primary" /> Select target school
          </CardTitle>
          <CardDescription>Choose the school whose students you want to permanently remove.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Select a school…" /></SelectTrigger>
              <SelectContent>
                {schools.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {schoolId && (
              <Button variant="outline" size="sm" onClick={resetSelection}>Clear</Button>
            )}
          </div>

          {schoolId && (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SCOPE_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      'cursor-pointer rounded-lg border bg-card px-3 py-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5',
                      scope === o.value && 'border-primary bg-primary/10 ring-1 ring-primary/20'
                    )}
                  >
                    <input type="radio" name="scope" value={o.value} checked={scope === o.value} onChange={() => { setScope(o.value); setPage(1); setSelectedIds(new Set()) }} className="sr-only" />
                    <span className="block font-semibold text-foreground/85">{o.label}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{o.hint}</span>
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-red-300/70 bg-red-50/60 px-3 py-3 dark:border-red-500/30 dark:bg-red-500/10 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div className="text-xs text-red-900 dark:text-red-200">
                    <p className="font-semibold">
                      {counting ? 'Counting…' : count == null
                        ? 'Unable to count'
                        : `${count.toLocaleString('en-IN')} student${count !== 1 ? 's' : ''} will be deleted (${scopeLabel(scope)})`}
                    </p>
                    <p className="mt-0.5 text-[10px] text-red-700/70 dark:text-red-300/60">
                      All attached records (attendance, fees, exams, transport, hostel, parents links, admissions) will also be removed.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={counting || count == null || count === 0}
                  onClick={() => openDialog('scope')}
                  className="gap-1.5"
                >
                  <Trash2 className="size-4" /> Delete all ({scopeLabel(scope)})
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {schoolId && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersIcon className="size-4 text-primary" /> Students of {selectedSchool?.name || 'this school'}
              </CardTitle>
              <CardDescription>
                {listTotal.toLocaleString('en-IN')} student{listTotal !== 1 ? 's' : ''} match the current filter. Tick students and delete only them.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1) }}
                  placeholder="Search name or admission no…"
                  className="h-9 w-full pl-8 sm:w-64"
                />
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={selectedCount === 0 || wiping}
                onClick={() => openDialog('selected')}
                className="gap-1.5"
              >
                <Trash2 className="size-4" /> Delete selected ({selectedCount})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-red-300/70 bg-red-50/60 px-3 py-2 text-xs text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <AlertTriangle className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
                <span><strong>{selectedCount}</strong> selected — {selectedStudentsSummary}</span>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={students.length > 0 && pageSelectedCount === students.length}
                        onCheckedChange={toggleSelectPage}
                        aria-label="Select all students on this page"
                      />
                    </TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Class / Section</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto size-5 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : students.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No students found{q ? ` matching “${q}”` : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    students.map((s) => (
                      <TableRow key={s.id} className="cursor-pointer" onClick={() => toggleSelect(s.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} aria-label={`Select ${fullName(s)}`} />
                        </TableCell>
                        <TableCell className="font-medium">{fullName(s)}</TableCell>
                        <TableCell className="text-muted-foreground">{s.admissionNumber || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.class?.name ? `${s.class.name}${s.section?.name ? ` · ${s.section.name}` : ''}` : 'Not enrolled'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.isActive ? 'secondary' : 'outline'} className={cn(s.isActive ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
                            {s.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, listTotal)} of {listTotal.toLocaleString('en-IN')} — selection stays across pages.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || listLoading} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages.toLocaleString('en-IN')}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages || listLoading} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex items-start gap-2.5 px-4 py-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            This tool is restricted to Super Admin and performs a hard delete — rows are removed from the database,
            not soft-deleted. Neither the school staff nor the platform can recover them afterwards. Always export
            the school&apos;s data (<Badge variant="outline">Data Exports</Badge>) before running a wipe.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={(open) => { if (!wiping) setDialogOpen(open); if (!open) setTypedPhrase('') }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="size-4" /> Permanently delete {dialogMode === 'selected' ? 'selected students?' : 'students?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {dialogMode === 'selected' ? (
                    <>
                      You are about to <strong>permanently delete {selectedCount.toLocaleString('en-IN')} selected student{selectedCount !== 1 ? 's' : ''}</strong>
                      {selectedCount > 0 && (
                        <> — <span className="text-foreground">{selectedStudentsSummary}</span></>
                      )}
                      {' '}from <strong>{selectedSchool?.name || 'this school'}</strong>.
                    </>
                  ) : (
                    <>
                      You are about to <strong>permanently delete {count != null ? count.toLocaleString('en-IN') : ''} student{count !== 1 ? 's' : ''}</strong> from <strong>{selectedSchool?.name || 'this school'}</strong>.
                    </>
                  )}
                  {' '}Every attached record will be removed from the database. <strong className="text-red-600">This action cannot be undone.</strong>
                </p>
                <p>Type <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{CONFIRM_PHRASE}</code> to confirm:</p>
                <Input
                  value={typedPhrase}
                  onChange={(e) => setTypedPhrase(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="font-mono"
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <AlertDialogAction asChild>
              <Button
                size="sm"
                variant="destructive"
                disabled={typedPhrase.trim() !== CONFIRM_PHRASE || wiping}
                onClick={(e) => { e.preventDefault(); wipe() }}
                className="gap-1.5"
              >
                {wiping ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Yes, delete {dialogMode === 'selected' ? selectedCount : count}{' '}student{dialogMode === 'selected' ? (selectedCount !== 1 ? 's' : '') : (count !== 1 ? 's' : '')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}