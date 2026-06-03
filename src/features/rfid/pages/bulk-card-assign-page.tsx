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
  Filter,
  Search,
  ShieldOff,
  Sparkles,
  Users,
  CheckCircle2,
  XCircle,
  Inbox,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-6xl space-y-3 p-3 md:p-4">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CreditCard className="size-4" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-tight">
                RFID Card Assignment
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                Issue and revoke cards class-by-class. Cards are valid for one academic year.
              </p>
            </div>
          </div>
          {currentAY && (
            <Badge variant="secondary" className="self-start gap-1.5 text-xs font-semibold">
              <CalendarLite />
              {currentAY}
            </Badge>
          )}
        </div>

        {/* ── Filters + progress summary ───────────────────────────────── */}
        <Card className="overflow-hidden">
          <CardContent className="space-y-3 p-3">
            {/*
              Mobile-first grid:
                - base: 2-col, so Class + Section sit side-by-side from the start
                - lg:   4-col, Search expands to fill the remaining 2 cols
            */}
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Class
                </Label>
                <Select value={classId} onValueChange={handleClassChange} disabled={loadingInit}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={loadingInit ? 'Loading…' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Section
                </Label>
                <Select
                  value={sectionId}
                  onValueChange={handleSectionChange}
                  disabled={!classId || classHasNoSections}
                >
                  <SelectTrigger className="h-9 w-full">
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
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1 lg:col-span-2">
                <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Name, roll, or admission no."
                    className="h-9 pl-8 text-sm"
                    disabled={!rosterReady}
                  />
                </div>
              </div>
            </div>

            {rosterReady && students.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold tabular-nums leading-none">
                      {stats.assigned}
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {stats.total}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      with active card
                    </span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-primary">
                    {stats.percent}%
                  </span>
                </div>
                <Progress value={stats.percent} className="h-1.5" />
                <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <Filter className="size-3" />
                    Show:
                  </span>
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Roster ───────────────────────────────────────────────────── */}
        {!rosterReady ? (
          <Card className="overflow-hidden">
            <EmptyState
              icon={Users}
              title="Pick a class to start"
              description={
                classHasNoSections
                  ? 'This class has no sections — the roster will load now.'
                  : 'Use the class and section dropdowns above to load the student roster.'
              }
            />
          </Card>
        ) : loadingRoster ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              </Card>
            ))}
          </div>
        ) : filteredStudents.length === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState
              icon={students.length === 0 ? Inbox : Search}
              title={
                students.length === 0
                  ? 'No students enrolled'
                  : 'No matches'
              }
              description={
                students.length === 0
                  ? `No students are enrolled in ${className}${sectionName ? ' – ' + sectionName : ''} for ${currentAY}.`
                  : 'Try a different search term or filter.'
              }
            />
          </Card>
        ) : (
          <div className="space-y-2.5">
            {/* Roster context line — wraps cleanly on narrow screens */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-medium uppercase tracking-wider">
                {className}
                {sectionName ? ` · ${sectionName}` : ''}
                {' · '}
                {filteredStudents.length}{' '}
                {filteredStudents.length === 1 ? 'student' : 'students'}
              </span>
              <span>
                Showing {filteredStudents.length === 0 ? 0 : pageStart + 1}–{pageEnd}
              </span>
            </div>

            {/* Card grid */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {paginatedStudents.map((s) => {
                const card = cardsByStudent.get(s.id)
                return (
                  <StudentCard
                    key={s.id}
                    student={s}
                    card={card}
                    onAssign={() => {
                      setAssignTarget(s)
                      setAssignUid('')
                      setAssignNotes('')
                    }}
                    onRevoke={() => {
                      if (card) {
                        setRevokeTarget(card)
                        setRevokeReason('')
                      }
                    }}
                  />
                )
              })}
            </div>

            {/* Pagination footer */}
            <PaginationFooter
              page={safePage}
              pageSize={pageSize}
              totalPages={totalPages}
              total={filteredStudents.length}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}

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
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                Assign RFID Card
              </DialogTitle>
              <DialogDescription>
                {assignTarget && (
                  <span className="text-foreground">
                    Issuing card to{' '}
                    <strong>
                      {assignTarget.firstName} {assignTarget.lastName}
                    </strong>
                    {assignTarget.admissionNumber ? ` (Adm ${assignTarget.admissionNumber})` : ''}
                    {' · '}
                    valid for {currentAY}.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {assignConflict && (
                <ConflictAlert conflict={assignConflict} />
              )}
              <UidCaptureInput
                id="bulk-assign-uid"
                value={assignUid}
                onChange={handleUidChange}
                onCapture={handleUidChange}
                autoFocus
                hint="Tap a blank card on the reader, scan via NFC, or paste the UID. Nothing is written to the card."
              />
              <div className="space-y-1.5">
                <Label htmlFor="bulk-assign-notes" className="text-sm">
                  Print notes <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="bulk-assign-notes"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. yellow border, batch 2026-A"
                  maxLength={200}
                />
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setAssignTarget(null)}
                disabled={assigning}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={!assignUid || assigning}
                className="w-full gap-1.5 sm:w-auto"
              >
                <CheckCircle2 className="size-4" />
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
    </TooltipProvider>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StudentCard({
  student,
  card,
  onAssign,
  onRevoke,
}: {
  student: RosterStudent
  card: CardRow | undefined
  onAssign: () => void
  onRevoke: () => void
}) {
  const assigned = !!card
  return (
    <Card
      className={cn(
        'group overflow-hidden p-2.5 transition-colors',
        assigned
          ? 'border-emerald-200/70 hover:bg-emerald-50/40 dark:border-emerald-900/40 dark:hover:bg-emerald-950/20'
          : 'hover:bg-amber-50/30 dark:hover:bg-amber-950/10',
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
          {student.profileImage ? (
            <img
              src={student.profileImage}
              alt=""
              className="size-10 object-cover"
            />
          ) : (
            <div className="flex size-10 items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 text-xs font-semibold text-primary">
              {initials(student.firstName, student.lastName)}
            </div>
          )}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background',
              assigned ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600',
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">
            {student.firstName} {student.lastName}
          </div>
          <div className="truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
            {student.rollNumber ? `Roll ${student.rollNumber}` : '—'}
            {student.admissionNumber ? ` · Adm ${student.admissionNumber}` : ''}
          </div>
        </div>
        {card ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <ShieldOff className="size-3" />
            Revoke
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onAssign}
            className="h-7 gap-1 px-2 text-[11px]"
          >
            <Sparkles className="size-3" />
            Assign
          </Button>
        )}
      </div>

      {/* UID strip or unassigned placeholder */}
      <div className="mt-2">
        {card ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="size-3 shrink-0" />
                <code className="truncate font-mono text-[10.5px] tracking-wider">{card.uid}</code>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Assigned {new Date(card.assignedAt).toLocaleDateString()} · {card.academicYear}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-1.5 rounded-md border border-dashed bg-muted/20 px-2 py-1 text-muted-foreground">
            <XCircle className="size-3 shrink-0 opacity-60" />
            <span className="text-[10.5px]">No card assigned</span>
          </div>
        )}
      </div>
    </Card>
  )
}

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
  const canPrev = page > 1
  const canNext = page < totalPages
  return (
    <div className="flex flex-col gap-2 border-t pt-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>Rows per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-7 w-[68px] text-[11px]">
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
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
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
