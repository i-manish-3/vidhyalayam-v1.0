'use client'

/**
 * Bulk RFID card assignment — class + section roster view.
 *
 * Pick class+section → see every enrolled student → assigned ones show their
 * UID with a Revoke button, unassigned ones show an Assign button that opens
 * an inline UID-capture modal. Cards are year-scoped (current AY).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CreditCard,
  Search,
  ShieldOff,
  Sparkles,
  Users,
  UserCheck,
  CheckCircle2,
  XCircle,
  Inbox,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { UidCaptureInput } from '@/features/rfid/components/uid-capture-input'

interface ClassOption {
  id: string
  name: string
  sections?: { id: string; name: string }[]
}

interface SectionOption {
  id: string
  name: string
  classId: string
}

interface RosterStudent {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
}

interface CardRow {
  id: string
  uid: string
  academicYear: string
  isActive: boolean
  assignedAt: string
  student: {
    id: string
    firstName: string
    lastName: string
  }
}

type Filter = 'all' | 'assigned' | 'unassigned'

interface BulkCardAssignListState {
  classId: string
  sectionId: string
  search: string
  filter: Filter
  page: number
  pageSize: number
}

const BULK_CARD_ASSIGN_LIST_STATE_KEY = 'rfid:bulk-card-assign:list'

interface CardConflict {
  isActive: boolean
  sameStudent: boolean
  assignedAt: string
  revokedAt: string | null
  academicYear: string
  owner: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
    className: string | null
    sectionName: string | null
  } | null
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

function compareRollNumbers(a: RosterStudent, b: RosterStudent): number {
  const ar = a.rollNumber ? Number(a.rollNumber) : NaN
  const br = b.rollNumber ? Number(b.rollNumber) : NaN
  if (!Number.isNaN(ar) && !Number.isNaN(br)) return ar - br
  return (a.rollNumber || '').localeCompare(b.rollNumber || '')
}

export function BulkCardAssignPage() {
  const savedListState = useAppStore((state) => state.pageState[BULK_CARD_ASSIGN_LIST_STATE_KEY] as BulkCardAssignListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [classId, setClassId] = useState(savedListState?.classId ?? '')
  const [sectionId, setSectionId] = useState(savedListState?.sectionId ?? '')

  const [students, setStudents] = useState<RosterStudent[]>([])
  const [cardsByStudent, setCardsByStudent] = useState<Map<string, CardRow>>(
    new Map(),
  )
  const [currentAY, setCurrentAY] = useState('')

  const [loadingInit, setLoadingInit] = useState(true)
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [filter, setFilter] = useState<Filter>(savedListState?.filter ?? 'all')
  const [showFilters, setShowFilters] = useState(true)

  // pagination
  const [page, setPage] = useState(savedListState?.page ?? 1)
  const [pageSize, setPageSize] = useState(savedListState?.pageSize ?? 24)

  // assign modal
  const [assignTarget, setAssignTarget] = useState<RosterStudent | null>(null)
  const [assignUid, setAssignUid] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignConflict, setAssignConflict] = useState<CardConflict | null>(null)

  const rememberListState = useCallback((patch: Partial<BulkCardAssignListState>) => {
    setPageState(BULK_CARD_ASSIGN_LIST_STATE_KEY, {
      classId,
      sectionId,
      search,
      filter,
      page,
      pageSize,
      ...patch,
    })
  }, [classId, filter, page, pageSize, search, sectionId, setPageState])

  // revoke modal
  const [revokeTarget, setRevokeTarget] = useState<CardRow | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revoking, setRevoking] = useState(false)

  // ── Load classes + sections + AY on mount ────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const [clsRes, secRes, cardsRes] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes'),
          api.get<{ sections: SectionOption[] }>('/api/school/sections'),
          api.get<{ academicYear: string }>('/api/school/rfid/cards', {}),
        ])
        setClasses(clsRes.classes || [])
        setSections(secRes.sections || [])
        setCurrentAY(cardsRes.academicYear)
      } catch {
        toast.error('Failed to load classes.')
      } finally {
        setLoadingInit(false)
      }
    }
    void init()
  }, [])

  const sectionsForClass = useMemo(
    () => sections.filter((s) => s.classId === classId),
    [sections, classId],
  )
  const classHasNoSections = classId !== '' && sectionsForClass.length === 0

  useEffect(() => {
    setSectionId('')
  }, [classId])

  // ── Load roster + cards when class+section ready ─────────────────────────
  const loadRoster = useCallback(async () => {
    if (!classId) {
      setStudents([])
      setCardsByStudent(new Map())
      return
    }
    if (!classHasNoSections && !sectionId) return

    setLoadingRoster(true)
    try {
      const studentParams: Record<string, string> = { classId, limit: '500' }
      if (sectionId) studentParams.sectionId = sectionId

      const [studentsRes, cardsRes] = await Promise.all([
        api.get<{ students: RosterStudent[] }>('/api/school/students', studentParams),
        api.get<{ academicYear: string; cards: CardRow[] }>(
          '/api/school/rfid/cards',
          {},
        ),
      ])

      const studentList = (studentsRes.students || []).sort(compareRollNumbers)
      setStudents(studentList)
      setCurrentAY(cardsRes.academicYear)

      const m = new Map<string, CardRow>()
      for (const c of cardsRes.cards) {
        if (!m.has(c.student.id)) m.set(c.student.id, c)
      }
      setCardsByStudent(m)
    } catch {
      toast.error('Failed to load roster.')
    } finally {
      setLoadingRoster(false)
    }
  }, [classId, sectionId, classHasNoSections])

  useEffect(() => {
    void loadRoster()
  }, [loadRoster])

  // ── Derived state ────────────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (q) {
        const name = `${s.firstName} ${s.lastName}`.toLowerCase()
        const adm = (s.admissionNumber || '').toLowerCase()
        const roll = (s.rollNumber || '').toLowerCase()
        if (!name.includes(q) && !adm.includes(q) && !roll.includes(q)) return false
      }
      const hasCard = cardsByStudent.has(s.id)
      if (filter === 'assigned' && !hasCard) return false
      if (filter === 'unassigned' && hasCard) return false
      return true
    })
  }, [students, cardsByStudent, search, filter])

  const stats = useMemo(() => {
    const total = students.length
    const assigned = students.filter((s) => cardsByStudent.has(s.id)).length
    const unassigned = total - assigned
    const percent = total > 0 ? Math.round((assigned / total) * 100) : 0
    return { total, assigned, unassigned, percent }
  }, [students, cardsByStudent])

  const className = useMemo(
    () => classes.find((c) => c.id === classId)?.name ?? '',
    [classes, classId],
  )
  const sectionName = useMemo(
    () => sections.find((s) => s.id === sectionId)?.name ?? '',
    [sections, sectionId],
  )

  // ── Pagination derived state ─────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = Math.min(pageStart + pageSize, filteredStudents.length)
  const paginatedStudents = useMemo(
    () => filteredStudents.slice(pageStart, pageEnd),
    [filteredStudents, pageStart, pageEnd],
  )

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId('')
    setPage(1)
    rememberListState({ classId: value, sectionId: '', page: 1 })
  }

  const handleSectionChange = (value: string) => {
    setSectionId(value)
    setPage(1)
    rememberListState({ sectionId: value, page: 1 })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
    rememberListState({ search: value, page: 1 })
  }

  const handleFilterChange = (value: Filter) => {
    setFilter(value)
    setPage(1)
    rememberListState({ filter: value, page: 1 })
  }

  const handlePageChange = (value: number) => {
    setPage(value)
    rememberListState({ page: value })
  }

  const handlePageSizeChange = (value: number) => {
    setPageSize(value)
    setPage(1)
    rememberListState({ pageSize: value, page: 1 })
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function handleAssign() {
    if (!assignTarget || !assignUid || assigning) return
    setAssigning(true)
    setAssignConflict(null)
    try {
      const res = await fetch('/api/school/rfid/cards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          studentId: assignTarget.id,
          uid: assignUid,
          academicYear: currentAY,
          printNotes: assignNotes || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface a 409 conflict (duplicate UID) as a prominent inline alert
        // inside the dialog rather than a small toast. Keeps the dialog open
        // so the admin can change the UID and retry.
        if (res.status === 409 && j.code === 'card_already_assigned' && j.conflict) {
          setAssignConflict(j.conflict as CardConflict)
          return
        }
        toast.error(j.message || 'Could not assign card.')
        return
      }
      toast.success(`Card assigned to ${assignTarget.firstName} ${assignTarget.lastName}`)
      setAssignTarget(null)
      setAssignUid('')
      setAssignNotes('')
      setAssignConflict(null)
      await loadRoster()
    } finally {
      setAssigning(false)
    }
  }

  // Clear the conflict warning whenever the UID changes so the admin can
  // retry with a different card without the stale warning hanging around.
  const handleUidChange = useCallback((uid: string) => {
    setAssignUid(uid)
    setAssignConflict(null)
  }, [])

  async function handleRevoke() {
    if (!revokeTarget || revoking) return
    if (revokeReason.trim().length < 3) {
      toast.error('Please add a short reason (at least 3 characters).')
      return
    }
    setRevoking(true)
    try {
      const res = await fetch(
        `/api/school/rfid/cards/${encodeURIComponent(revokeTarget.id)}/revoke`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: revokeReason }),
        },
      )
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.message || 'Could not revoke card.')
        return
      }
      toast.success('Card revoked.')
      setRevokeTarget(null)
      setRevokeReason('')
      await loadRoster()
    } finally {
      setRevoking(false)
    }
  }

  const rosterReady = classId && (classHasNoSections || sectionId)

  return (
    <div className="space-y-4">
      {/* ── Gradient header banner ──────────────────────────────────── */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
          <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
          <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
          <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
          <div className="relative flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
              <CreditCard className="size-5.5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">RFID Card Assignment</h1>
                {currentAY && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                    <CalendarLite />
                    {currentAY}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-white/80">Issue and revoke cards class-by-class. Cards are valid for one academic year.</p>
            </div>
          </div>
        </div>

        {/* ── Roster (students-page style) ────────────────────────────── */}
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                  <Users className="size-4" />
                </span>
                Student Roster
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search name, roll, adm no..."
                    className="h-9 w-full bg-background/90 pl-9 pr-8 text-sm shadow-sm sm:w-56"
                    disabled={!rosterReady}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <XCircle className="size-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters((v) => !v)}
                  className="h-9 gap-1 bg-white shadow-sm dark:bg-input/20"
                >
                  <ChevronDown className={`size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                  Class & Section
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Collapsible filter row */}
            {showFilters && (
              <div className="grid grid-cols-2 gap-2 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Class</Label>
                  <Select value={classId} onValueChange={handleClassChange} disabled={loadingInit}>
                    <SelectTrigger className="h-8 w-full text-xs"><SelectValue placeholder={loadingInit ? 'Loading…' : 'Select'} /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Section</Label>
                  <Select
                    value={sectionId}
                    onValueChange={handleSectionChange}
                    disabled={!classId || classHasNoSections}
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue
                        placeholder={
                          !classId
                            ? 'Pick class'
                            : classHasNoSections
                              ? 'No sections'
                              : 'Select'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {sectionsForClass.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-2 flex flex-col justify-end gap-1.5">
                  {rosterReady && students.length > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      <FilterPill active={filter === 'all'} onClick={() => handleFilterChange('all')}>
                        All <CountChip>{stats.total}</CountChip>
                      </FilterPill>
                      <FilterPill
                        active={filter === 'assigned'}
                        onClick={() => handleFilterChange('assigned')}
                        tone="success"
                      >
                        Assigned <CountChip>{stats.assigned}</CountChip>
                      </FilterPill>
                      <FilterPill
                        active={filter === 'unassigned'}
                        onClick={() => handleFilterChange('unassigned')}
                        tone="warn"
                      >
                        Unassigned <CountChip>{stats.unassigned}</CountChip>
                      </FilterPill>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Progress summary */}
            {rosterReady && students.length > 0 && (
              <div className="flex items-center gap-3 border-b border-sky-500/10 bg-sky-500/[0.02] px-4 py-2.5">
                <span className="shrink-0 text-xs font-medium text-muted-foreground">
                  <strong className="text-sm font-bold tabular-nums text-foreground">{stats.assigned}</strong>
                  <span className="text-muted-foreground"> / {stats.total} with card</span>
                </span>
                <Progress value={stats.percent} className="h-1.5 flex-1" />
                <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">{stats.percent}%</span>
              </div>
            )}

            {/* Roster body */}
            {!rosterReady ? (
              <div className="py-8">
                <EmptyState
                  icon={Users}
                  title="Pick a class to start"
                  description={
                    classHasNoSections
                      ? 'This class has no sections — the roster will load now.'
                      : 'Use the class and section dropdowns above to load the student roster.'
                  }
                />
              </div>
            ) : loadingRoster ? (
              <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                    <TableRow>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roll</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adm No.</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Card</TableHead>
                      <TableHead className="w-36 py-2.5"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell className="py-2.5"><div className="flex items-center gap-2.5"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-3.5 w-36" /></div></TableCell>
                        <TableCell className="py-2.5"><Skeleton className="h-3.5 w-10" /></TableCell>
                        <TableCell className="py-2.5"><Skeleton className="h-3.5 w-16" /></TableCell>
                        <TableCell className="py-2.5"><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell className="py-2.5"><Skeleton className="h-7 w-full" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={students.length === 0 ? Inbox : Search}
                  title={students.length === 0 ? 'No students enrolled' : 'No matches'}
                  description={
                    students.length === 0
                      ? `No students are enrolled in ${className}${sectionName ? ' – ' + sectionName : ''} for ${currentAY}.`
                      : 'Try a different search term or filter.'
                  }
                />
              </div>
            ) : (
              <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                    <TableRow>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Roll</TableHead>
                      <TableHead className="hidden py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Adm No.</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Card</TableHead>
                      <TableHead className="w-32 py-2.5"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedStudents.map((s) => {
                      const card = cardsByStudent.get(s.id)
                      return (
                        <TableRow key={s.id} className="transition-colors hover:bg-sky-500/[0.04]">
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-muted">
                                {s.profileImage ? (
                                  <img src={s.profileImage} alt="" className="size-8 object-cover" />
                                ) : (
                                  <div className="flex size-8 items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-[11px] font-semibold text-primary">
                                    {initials(s.firstName, s.lastName)}
                                  </div>
                                )}
                                <span className={cn('absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background', card ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600')} />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{s.firstName} {s.lastName}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {className}{sectionName ? ` · ${sectionName}` : ''}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-2.5 text-sm font-mono text-muted-foreground">{s.rollNumber || '—'}</TableCell>
                          <TableCell className="hidden py-2.5 text-sm font-mono text-muted-foreground md:table-cell">{s.admissionNumber || '—'}</TableCell>
                          <TableCell className="py-2.5">
                            {card ? (
                              <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 className="size-3 shrink-0" />
                                <code className="truncate font-mono text-[10.5px] tracking-wider">{card.uid}</code>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-amber-400/40 bg-amber-500/[0.04] px-2 py-1 text-amber-700 dark:text-amber-300">
                                <XCircle className="size-3 shrink-0" />
                                <span className="text-[10.5px]">Not assigned</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-2.5">
                            {card ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setRevokeTarget(card); setRevokeReason('') }}
                                className="h-8 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <ShieldOff className="size-3" />
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => { setAssignTarget(s); setAssignUid(''); setAssignNotes('') }}
                                className="h-8 gap-1 bg-gradient-to-r from-primary to-teal-600 px-2.5 text-[11px] text-white shadow-sm hover:from-primary/90 hover:to-teal-600/90"
                              >
                                <Sparkles className="size-3" />
                                Assign
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination footer */}
            {rosterReady && filteredStudents.length > 0 && (
              <PaginationFooter
                page={safePage}
                pageSize={pageSize}
                totalPages={totalPages}
                total={filteredStudents.length}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </CardContent>
        </Card>

        {/* ── Assign modal ─────────────────────────────────────────────── */}
        <Dialog
          open={!!assignTarget}
          onOpenChange={(open) => {
            if (!open) {
              setAssignTarget(null)
              setAssignUid('')
              setAssignNotes('')
              setAssignConflict(null)
            }
          }}
        >
          <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-emerald-500/20 bg-card p-0 shadow-2xl shadow-emerald-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
            <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#059669_0%,#0d9488_55%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
              <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
              <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
              <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                  <CreditCard className="size-5 text-white" />
                </span>
                <div>
                  <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-normal text-white">
                    <Sparkles className="size-4 text-emerald-200" />
                    Assign RFID Card
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-xs text-white/75">
                    {assignTarget && (
                      <>
                        Issuing a card to <strong className="font-semibold text-white/90">{assignTarget.firstName} {assignTarget.lastName}</strong>
                        {assignTarget.admissionNumber ? ` (Adm ${assignTarget.admissionNumber})` : ''}
                        {' · '}valid for {currentAY}.
                      </>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-emerald-500/[0.04] via-background to-sky-500/[0.055] p-4 sm:p-5">
              {assignTarget && (
                <section className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-sky-500/10">
                  <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-emerald-200/35 blur-xl dark:bg-emerald-500/15" />
                  <div className="relative flex items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-sm">
                      {initials(assignTarget.firstName, assignTarget.lastName)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{assignTarget.firstName} {assignTarget.lastName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[assignTarget.rollNumber ? `Roll ${assignTarget.rollNumber}` : null, assignTarget.admissionNumber ? `Adm ${assignTarget.admissionNumber}` : null].filter(Boolean).join(' · ') || 'No roll or admission on file'}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-auto shrink-0 gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <CalendarLite />
                      {currentAY}
                    </Badge>
                  </div>
                </section>
              )}

              {assignConflict && (
                <ConflictAlert conflict={assignConflict} />
              )}

              <section className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.03] via-background to-primary/[0.02] p-4 shadow-sm">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-primary/10 blur-xl dark:bg-primary/15" />
                <div className="relative space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm"><CreditCard className="size-4 text-white" /></span>
                    <div><h3 className="text-sm font-semibold">Capture card UID</h3><p className="text-[10px] text-muted-foreground">Nothing is written to the card — the UID is read only</p></div>
                  </div>
                  <UidCaptureInput
                    id="bulk-assign-uid"
                    value={assignUid}
                    onChange={handleUidChange}
                    onCapture={handleUidChange}
                    autoFocus
                  />
                </div>
              </section>

              <section className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-amber-200/35 blur-xl dark:bg-amber-500/15" />
                <div className="relative space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm"><Sparkles className="size-4 text-white" /></span>
                    <div><h3 className="text-sm font-semibold">Print notes</h3><p className="text-[10px] text-muted-foreground">Optional — printed on the ID card, if customised</p></div>
                  </div>
                  <Input
                    id="bulk-assign-notes"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                    placeholder="e.g. yellow border, batch 2026-A"
                    maxLength={200}
                    className="bg-white shadow-sm dark:bg-input/30"
                  />
                </div>
              </section>
            </div>

            <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-4 text-xs"
                onClick={() => setAssignTarget(null)}
                disabled={assigning}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs"
                onClick={handleAssign}
                disabled={!assignUid || assigning}
              >
                <CheckCircle2 className="size-3.5" />
                {assigning ? 'Assigning…' : 'Assign card'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Revoke modal ─────────────────────────────────────────────── */}
        <Dialog
          open={!!revokeTarget}
          onOpenChange={(open) => {
            if (!open) setRevokeTarget(null)
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldOff className="size-5 text-destructive" />
                Revoke RFID Card
              </DialogTitle>
              <DialogDescription>
                Tapping this card will stop marking attendance immediately. The record is kept for audit. Issue a replacement card from this page after revoking.
              </DialogDescription>
            </DialogHeader>
            {revokeTarget && (
              <div className="space-y-3">
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="font-semibold">
                    {revokeTarget.student.firstName} {revokeTarget.student.lastName}
                  </div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-3.5 text-muted-foreground" />
                    <code className="font-mono text-xs">{revokeTarget.uid}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Issued {new Date(revokeTarget.assignedAt).toLocaleDateString()} · valid for{' '}
                    {revokeTarget.academicYear}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-revoke-reason" className="text-sm">
                    Reason <span className="text-xs text-muted-foreground">(required)</span>
                  </Label>
                  <Textarea
                    id="bulk-revoke-reason"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Lost, damaged, replaced, transferred…"
                    rows={3}
                    maxLength={500}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setRevokeTarget(null)}
                disabled={revoking}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRevoke}
                disabled={revoking || revokeReason.trim().length < 3}
                className="w-full gap-1.5 sm:w-auto"
              >
                <ShieldOff className="size-4" />
                {revoking ? 'Revoking…' : 'Revoke card'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96] as const

function PaginationFooter({
  page,
  pageSize,
  totalPages,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
  onPageSizeChange: (n: number) => void
}) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = []
    if (page <= 3) {
      pages.push(1, 2, 3, 4, 'ellipsis-end', totalPages)
    } else if (page >= totalPages - 2) {
      pages.push(1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
    } else {
      pages.push(1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages)
    }
    return pages
  }
  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-sky-500/15 bg-gradient-to-r from-sky-500/[0.04] via-transparent to-violet-500/[0.04] px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[72px] bg-white text-xs shadow-sm dark:bg-input/20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)} className="text-xs">
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-1 tabular-nums">
          Showing {from} to {to} of {total} students
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8 bg-white shadow-sm dark:bg-input/20"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageNumbers.map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">
                …
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8 bg-white shadow-sm dark:bg-input/20"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  tone = 'neutral',
  children,
}: {
  active: boolean
  onClick: () => void
  tone?: 'neutral' | 'success' | 'warn'
  children: React.ReactNode
}) {
  const activeClasses =
    tone === 'success'
      ? 'bg-emerald-600 text-white hover:bg-emerald-600/90'
      : tone === 'warn'
        ? 'bg-amber-500 text-white hover:bg-amber-500/90'
        : 'bg-primary text-primary-foreground hover:bg-primary/90'
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition',
        active
          ? activeClasses
          : 'border bg-background text-muted-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

function CountChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-black/10 px-1.5 text-[10px] font-bold tabular-nums dark:bg-white/10">
      {children}
    </span>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mx-auto max-w-xs text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function ConflictAlert({ conflict }: { conflict: CardConflict }) {
  const owner = conflict.owner
  const ownerName = owner ? `${owner.firstName} ${owner.lastName}` : 'another student'
  const klass = owner?.className
    ? `${owner.className}${owner.sectionName ? ` · ${owner.sectionName}` : ''}`
    : null
  const issuedDate = new Date(conflict.assignedAt).toLocaleDateString()

  return (
    <Alert variant="destructive" className="border-destructive/40">
      <AlertTriangle className="size-4" />
      <AlertTitle className="font-semibold">
        {conflict.sameStudent
          ? conflict.isActive
            ? 'This student already has this card'
            : 'This card was revoked for this student'
          : conflict.isActive
            ? 'This card is already assigned'
            : 'This card was previously revoked'}
      </AlertTitle>
      <AlertDescription className="text-destructive/90">
        <div className="space-y-1.5">
          {!conflict.sameStudent && owner && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <div className="font-semibold text-destructive">
                {ownerName}
                {owner.admissionNumber ? (
                  <span className="font-normal opacity-80"> · Adm {owner.admissionNumber}</span>
                ) : null}
              </div>
              {klass && (
                <div className="text-destructive/80">{klass}</div>
              )}
            </div>
          )}
          <div className="text-xs">
            {conflict.isActive
              ? `Active card issued ${issuedDate} for ${conflict.academicYear}. `
              : `Was active ${issuedDate}${conflict.revokedAt ? ` until ${new Date(conflict.revokedAt).toLocaleDateString()}` : ''}, then revoked. `}
            {conflict.sameStudent
              ? conflict.isActive
                ? 'No action needed — this card is already linked to this student.'
                : 'Use a fresh blank card; revoked cards cannot be re-assigned.'
              : conflict.isActive
                ? 'Either revoke the existing card first (from the owner\'s row), or tap a different blank card.'
                : 'Use a fresh blank card; revoked cards cannot be re-issued.'}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}

function CalendarLite() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}
