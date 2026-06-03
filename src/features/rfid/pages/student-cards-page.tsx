'use client'

/**
 * Student RFID cards management page.
 *
 * - Shows the active card for current AY (if any) with a Revoke action.
 * - Shows full year-by-year card history.
 * - Issue-new-card form using <UidCaptureInput>.
 *
 * All data writes go through /api/school/rfid/cards (POST) and
 * /api/school/rfid/cards/[id]/revoke (PATCH). The API enforces
 * `rfid:cards:manage`; this page is read-mostly when the user only has
 * `rfid:cards:read`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CreditCard, History, ShieldOff, Sparkles, UserCircle2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { UidCaptureInput } from '@/features/rfid/components/uid-capture-input'

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

interface CardRow {
  id: string
  uid: string
  academicYear: string
  isActive: boolean
  assignedAt: string
  assignedBy: string | null
  revokedAt: string | null
  revokedBy: string | null
  revokeReason: string | null
  printNotes: string | null
  student: {
    id: string
    firstName: string
    lastName: string
    admissionNumber: string | null
    rollNumber: string | null
    profileImage: string | null
  }
  assigner: { id: string; name: string } | null
  revoker: { id: string; name: string } | null
}

interface StudentSummary {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  rollNumber: string | null
  profileImage: string | null
}

interface Props {
  studentId: string
}

export function StudentRfidCardsPage({ studentId }: Props) {
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState<StudentSummary | null>(null)
  const [currentAY, setCurrentAY] = useState<string>('')
  const [cards, setCards] = useState<CardRow[]>([])

  // assign form state
  const [newUid, setNewUid] = useState('')
  const [printNotes, setPrintNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [assignConflict, setAssignConflict] = useState<CardConflict | null>(null)

  // revoke modal state
  const [revokeTarget, setRevokeTarget] = useState<CardRow | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/school/rfid/cards?studentId=${encodeURIComponent(studentId)}&allYears=1&includeRevoked=1`,
        { credentials: 'include' },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.message || 'Could not load cards.')
        return
      }
      const data: { academicYear: string; cards: CardRow[] } = await res.json()
      setCurrentAY(data.academicYear)
      setCards(data.cards)

      // Take student summary off the first card if present; otherwise fetch.
      if (data.cards[0]?.student) {
        setStudent(data.cards[0].student)
      } else {
        const sres = await fetch(`/api/school/students/${studentId}`, { credentials: 'include' })
        if (sres.ok) {
          const sj = await sres.json()
          const s = sj?.data ?? sj
          setStudent({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            admissionNumber: s.admissionNumber ?? null,
            rollNumber: s.rollNumber ?? null,
            profileImage: s.profileImage ?? null,
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const m = new Map<string, CardRow[]>()
    for (const c of cards) {
      const list = m.get(c.academicYear) ?? []
      list.push(c)
      m.set(c.academicYear, list)
    }
    // Newest year first
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [cards])

  const currentYearCards = grouped.find(([year]) => year === currentAY)?.[1] ?? []
  const activeInCurrentYear = currentYearCards.filter((c) => c.isActive)

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!newUid || submitting) return
    setSubmitting(true)
    setAssignConflict(null)
    try {
      const res = await fetch('/api/school/rfid/cards', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          studentId,
          uid: newUid,
          academicYear: currentAY,
          printNotes: printNotes || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Surface 409 (duplicate UID) as a prominent inline alert above the form
        // rather than a tiny toast that's easy to miss when issuing cards in bulk.
        if (res.status === 409 && j.code === 'card_already_assigned' && j.conflict) {
          setAssignConflict(j.conflict as CardConflict)
          return
        }
        toast.error(j.message || 'Could not assign card.')
        return
      }
      toast.success(j.message || 'Card assigned.')
      setNewUid('')
      setPrintNotes('')
      setAssignConflict(null)
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  function handleUidChange(uid: string) {
    setNewUid(uid)
    setAssignConflict(null)
  }

  async function handleRevoke() {
    if (!revokeTarget || revoking) return
    if (revokeReason.trim().length < 3) {
      toast.error('Please add a reason (at least 3 characters).')
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
      await load()
    } finally {
      setRevoking(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  const fullName = student ? `${student.firstName} ${student.lastName}` : 'Student'

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      {/* Student header */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center overflow-hidden rounded-full bg-muted">
              {student?.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={student.profileImage} alt={fullName} className="size-12 object-cover" />
              ) : (
                <UserCircle2 className="size-7 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{fullName}</h2>
              <p className="text-xs text-muted-foreground">
                {student?.admissionNumber ? `Adm: ${student.admissionNumber}` : 'No admission number'}
                {student?.rollNumber ? ` · Roll: ${student.rollNumber}` : ''}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            Current AY: {currentAY || '—'}
          </Badge>
        </CardContent>
      </Card>

      {/* Issue new card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Issue new card for {currentAY}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAssign} className="space-y-3">
            {assignConflict && <ConflictAlert conflict={assignConflict} />}
            <UidCaptureInput
              id="new-uid"
              value={newUid}
              onChange={handleUidChange}
              onCapture={handleUidChange}
              autoFocus
              hint="Tap a fresh blank card on the reader, or paste the UID for manual entry. This card will be valid only for the current academic year."
            />
            <div className="space-y-1.5">
              <Label htmlFor="print-notes" className="text-sm">
                Print notes (optional)
              </Label>
              <Input
                id="print-notes"
                value={printNotes}
                onChange={(e) => setPrintNotes(e.target.value)}
                placeholder="e.g. yellow border, batch 2026-A"
                maxLength={200}
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={!newUid || submitting}>
                {submitting ? 'Assigning…' : 'Assign card'}
              </Button>
              {activeInCurrentYear.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  This student already has {activeInCurrentYear.length} active{' '}
                  {activeInCurrentYear.length === 1 ? 'card' : 'cards'} this year.
                  The new one will be added as a spare; revoke the old one if it's lost.
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Cards across years */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4 text-primary" />
            Card history
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No cards yet. Issue the first card above.
            </p>
          )}
          {grouped.map(([year, list]) => (
            <div key={year} className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{year}</h3>
                {year === currentAY && (
                  <Badge variant="secondary" className="text-[10px]">
                    Current
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {list.map((c) => (
                  <CardRowItem
                    key={c.id}
                    card={c}
                    onRevoke={() => {
                      setRevokeTarget(c)
                      setRevokeReason('')
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this card?</DialogTitle>
            <DialogDescription>
              Tapping this card will stop marking attendance immediately. The
              record is kept for audit. Issue a replacement card from the form
              above.
            </DialogDescription>
          </DialogHeader>
          {revokeTarget && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="font-mono text-xs">{revokeTarget.uid}</div>
                <div className="text-xs text-muted-foreground">
                  Issued {new Date(revokeTarget.assignedAt).toLocaleDateString()} for{' '}
                  {revokeTarget.academicYear}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="revoke-reason" className="text-sm">
                  Reason
                </Label>
                <Textarea
                  id="revoke-reason"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="Lost, damaged, replaced…"
                  rows={3}
                  maxLength={500}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking || revokeReason.trim().length < 3}
              className="gap-1.5"
            >
              <ShieldOff className="size-3.5" />
              {revoking ? 'Revoking…' : 'Revoke card'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CardRowItem({ card, onRevoke }: { card: CardRow; onRevoke: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          className={
            'flex size-9 items-center justify-center rounded-md ' +
            (card.isActive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')
          }
        >
          <CreditCard className="size-4" />
        </div>
        <div>
          <div className="font-mono text-sm tracking-wider">{card.uid}</div>
          <div className="text-[11px] text-muted-foreground">
            {card.isActive
              ? `Active · issued ${new Date(card.assignedAt).toLocaleDateString()}`
              : `Revoked ${card.revokedAt ? new Date(card.revokedAt).toLocaleDateString() : ''}${card.revokeReason ? ` · ${card.revokeReason}` : ''}`}
            {card.printNotes ? ` · ${card.printNotes}` : ''}
          </div>
        </div>
      </div>
      {card.isActive && (
        <Button variant="outline" size="sm" onClick={onRevoke} className="gap-1.5">
          <ShieldOff className="size-3.5" />
          Revoke
        </Button>
      )}
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
