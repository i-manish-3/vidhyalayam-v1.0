'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Building2, PlusCircle, Pencil, Trash2, RefreshCw, Loader2, Users, BedDouble, DoorOpen, User, Phone, VenetianMask } from 'lucide-react'

interface ApiBed {
  id: string
  bedNumber: string
  occupied?: boolean
}
interface ApiRoom {
  id: string
  roomNumber: string
  roomType: string | null
  floor: string | null
  capacity: number
  fare: number | null
  occupiedCount?: number
  beds: ApiBed[]
}
interface ApiHostel {
  id: string
  name: string
  type: string | null
  academicYear: string
  wardenName: string | null
  wardenPhone: string | null
  isActive: boolean
  rooms: ApiRoom[]
}

export function HostelPage() {
  const router = useRouter()
  const { toast } = useToast()
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const currentSchool = useAppStore((s) => s.currentSchool)
  const academicYear = viewingAcademicYear || currentSchool?.academicYear

  const [hostels, setHostels] = useState<ApiHostel[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<ApiHostel | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchHostels = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<{ hostels: ApiHostel[] }>('/api/school/hostels', academicYear ? { academicYear } : undefined)
      setHostels(res.hostels || [])
    } catch (error) {
      toast({ title: "Couldn't load hostels", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [academicYear, toast])

  useEffect(() => { fetchHostels() }, [fetchHostels])

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await api.delete(`/api/school/hostels/${deleteTarget.id}${academicYear ? `?academicYear=${academicYear}` : ''}`)
      toast({ title: 'Hostel removed', description: `${deleteTarget.name} removed from ${academicYear}.` })
      setDeleteTarget(null)
      fetchHostels()
    } catch (error) {
      toast({ title: "Couldn't delete hostel", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const totalHostels = hostels.length
  const activeHostels = hostels.filter((h) => h.isActive).length
  const totalRooms = hostels.reduce((s, h) => s + h.rooms.length, 0)

  const hostelTypeMeta = (t: string | null) => {
    if (t === 'boys') return { gradient: 'from-sky-500/15 via-blue-500/10 to-indigo-500/15', dot: 'bg-blue-500', label: 'Boys', border: 'border-sky-500/30', accent: 'text-sky-600 dark:text-sky-400', bg: 'from-sky-500/5' }
    if (t === 'girls') return { gradient: 'from-rose-500/15 via-pink-500/10 to-fuchsia-500/15', dot: 'bg-rose-500', label: 'Girls', border: 'border-rose-500/30', accent: 'text-rose-600 dark:text-rose-400', bg: 'from-rose-500/5' }
    return { gradient: 'from-violet-500/15 via-purple-500/10 to-fuchsia-500/15', dot: 'bg-violet-500', label: 'Co-Ed', border: 'border-violet-500/30', accent: 'text-violet-600 dark:text-violet-400', bg: 'from-violet-500/5' }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div aria-hidden className="absolute left-1/3 top-0 size-20 rounded-full bg-teal-300/8 blur-sm" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Building2 className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Hostels</h1>
            <p className="mt-0.5 text-xs text-white/80">Hostels, rooms, and bed occupancy for {academicYear || 'the current session'}.</p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push('/hostel/hostels/new')}
            className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <PlusCircle className="size-4" strokeWidth={2.2} />
            <span className="font-semibold">Add Hostel</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push('/hostel/annual-setup')}
            className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
          >
            <RefreshCw className="size-4" strokeWidth={2.2} />
            <span className="font-semibold">Annual Setup</span>
          </Button>
        </div>
      </div>

      {hostels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-primary/20 bg-gradient-to-br from-primary/[0.02] via-card to-cyan-500/[0.03] px-6 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-primary/[0.06] via-teal-500/[0.04] to-cyan-500/[0.06] shadow-sm">
            <Building2 className="size-8 text-primary/50" strokeWidth={1.5} />
          </span>
          <div>
            <h3 className="text-lg font-semibold">No hostels yet</h3>
            <p className="mt-1 max-w-[280px] text-sm text-muted-foreground">Create your first hostel with rooms and beds to start allocating students.</p>
          </div>
          <Button onClick={() => router.push('/hostel/hostels/new')} className="mt-1 gap-2">
            <PlusCircle className="size-4" />
            Add Hostel
          </Button>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-primary/[0.04] p-4 shadow-sm transition-all hover:shadow-md">
              <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[18px] border-primary/5" />
              <div aria-hidden className="absolute -bottom-4 -left-4 size-14 rounded-full bg-primary/[0.03]" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm shadow-primary/20">
                  <Building2 className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Hostels</p>
                  <p className="mt-0.5 text-2xl font-bold">{totalHostels}</p>
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] via-card to-emerald-500/[0.04] p-4 shadow-sm transition-all hover:shadow-md">
              <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[18px] border-emerald-500/5" />
              <div aria-hidden className="absolute -bottom-4 -left-4 size-14 rounded-full bg-emerald-500/[0.03]" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                  <Users className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Active</p>
                  <p className="mt-0.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeHostels}</p>
                </div>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.08] via-card to-sky-500/[0.04] p-4 shadow-sm transition-all hover:shadow-md">
              <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[18px] border-sky-500/5" />
              <div aria-hidden className="absolute -bottom-4 -left-4 size-14 rounded-full bg-sky-500/[0.03]" />
              <div className="relative flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/20">
                  <DoorOpen className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Rooms</p>
                  <p className="mt-0.5 text-2xl font-bold text-sky-600 dark:text-sky-400">{totalRooms}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Hostel Cards */}
          <div className="space-y-5">
            {hostels.map((hostel) => {
              const totalBeds = hostel.rooms.reduce((s, r) => s + r.beds.length, 0)
              const occupiedBeds = hostel.rooms.reduce((s, r) => s + r.beds.filter((b) => b.occupied).length, 0)
              const occPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0
              const meta = hostelTypeMeta(hostel.type)
              return (
                <Card key={hostel.id} className={cn(
                  'gap-0 overflow-hidden border py-0 shadow-sm transition-all hover:shadow-md',
                  hostel.isActive ? meta.border : 'border-rose-500/15'
                )}>
                  {/* Card Gradient Header — type-tone coded */}
                  <div className={cn(
                    'relative flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5',
                    hostel.isActive
                      ? cn('bg-gradient-to-r', meta.gradient)
                      : 'border-rose-500/15 bg-gradient-to-r from-rose-500/10 via-stone-500/10 to-rose-500/10'
                  )}>
                    <div aria-hidden className="absolute -right-4 -top-4 size-20 rounded-full border-[14px] border-white/10" />
                    <div aria-hidden className="absolute bottom-0 left-1/3 h-px w-32 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    <div className="relative flex min-w-0 flex-wrap items-center gap-2.5">
                      <span className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
                        hostel.isActive
                          ? 'bg-gradient-to-br from-primary to-teal-600 shadow-primary/20'
                          : 'bg-gradient-to-br from-rose-500 to-stone-500 shadow-rose-500/20'
                      )}>
                        <Building2 className="size-4.5" />
                      </span>
                      <span className="truncate text-sm font-semibold">{hostel.name}</span>
                      {hostel.type && (
                        <Badge variant="secondary" className={cn(
                          'gap-1.5 border text-[11px] font-medium',
                          hostelTypeMeta(hostel.type).dot === 'bg-blue-500' && 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
                          hostelTypeMeta(hostel.type).dot === 'bg-rose-500' && 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
                          hostelTypeMeta(hostel.type).dot === 'bg-violet-500' && 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
                        )}>
                          <span className={cn('size-1.5 rounded-full', hostelTypeMeta(hostel.type).dot)} />
                          {meta.label}
                        </Badge>
                      )}
                      {!hostel.isActive && (
                        <Badge variant="outline" className="border-rose-300 bg-rose-50 text-[11px] text-rose-600 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <div className="relative flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs font-medium text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/20" onClick={() => router.push(`/hostel/hostels/${hostel.id}/edit`)}>
                        <Pencil className="size-3.5" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/20" onClick={() => setDeleteTarget(hostel)}>
                        <Trash2 className="size-3.5" />Delete
                      </Button>
                    </div>
                  </div>

                  <CardContent className="space-y-3 px-4 pb-4 pt-3 sm:px-5">
                    {/* Meta row with warden, beds occupancy bar */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <User className="size-3.5 text-primary/50" />
                        {hostel.wardenName ? (
                          <>{hostel.wardenName}{hostel.wardenPhone ? <span className="text-muted-foreground/60">· {hostel.wardenPhone}</span> : ''}</>
                        ) : (
                          <span className="italic">No warden assigned</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <BedDouble className="size-3.5 text-primary/50" />
                        <span className={cn('font-semibold', occupiedBeds === totalBeds ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400')}>
                          {occupiedBeds}/{totalBeds}
                        </span> beds
                      </span>
                    </div>

                    {/* Occupancy Progress Bar */}
                    {totalBeds > 0 && (
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/5">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            occPct >= 90 ? 'bg-gradient-to-r from-rose-500 to-red-500' :
                            occPct >= 60 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                            'bg-gradient-to-r from-emerald-500 to-cyan-500'
                          )}
                          style={{ width: `${occPct}%` }}
                        />
                      </div>
                    )}

                    {hostel.rooms.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-primary/10 shadow-sm">
                        <Table>
                          <TableHeader className={cn(
                            'bg-gradient-to-r',
                            hostel.isActive ? meta.gradient : 'from-rose-500/8 via-stone-500/8 to-rose-500/8'
                          )}>
                            <TableRow>
                              <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room</TableHead>
                              <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                              <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Floor</TableHead>
                              <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Occupancy</TableHead>
                              <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fare</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {hostel.rooms.map((room, ri) => {
                              const full = (room.occupiedCount || 0) >= room.capacity
                              const occRoomPct = room.capacity > 0 ? ((room.occupiedCount || 0) / room.capacity) * 100 : 0
                              return (
                                <TableRow key={room.id} className={cn(
                                  'transition-colors',
                                  ri % 2 === 0 ? 'bg-background' : 'bg-primary/[0.015]',
                                  'hover:bg-primary/[0.04]'
                                )}>
                                  <TableCell className="py-2.5 font-medium">
                                    <span className="flex items-center gap-2">
                                      <DoorOpen className="size-3.5 text-muted-foreground/50" />
                                      {room.roomNumber}
                                    </span>
                                  </TableCell>
                                  <TableCell className="py-2.5">{room.roomType || <span className="text-muted-foreground/50 text-xs">—</span>}</TableCell>
                                  <TableCell className="py-2.5">{room.floor || <span className="text-muted-foreground/50 text-xs">—</span>}</TableCell>
                                  <TableCell className="py-2.5">
                                    <div className="flex items-center gap-2">
                                      <Badge variant={full ? 'destructive' : 'secondary'} className={cn(
                                        'text-xs shrink-0',
                                        !full && occRoomPct >= 60 && 'border-amber-500/25 bg-amber-500/[0.08] text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
                                        !full && occRoomPct < 60 && 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                      )}>
                                        {room.occupiedCount || 0}/{room.capacity}
                                      </Badge>
                                      {/* Mini progress dot */}
                                      <span className={cn(
                                        'size-1.5 rounded-full',
                                        full ? 'bg-rose-500' : occRoomPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                                      )} />
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-2.5 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                                    {room.fare != null
                                      ? `₹${Number(room.fare).toLocaleString('en-IN')}`
                                      : <span className="text-muted-foreground/50 text-xs font-normal">no fare</span>}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-primary/15 bg-gradient-to-r from-primary/[0.02] to-transparent px-4 py-3 text-xs text-muted-foreground">
                        <Building2 className="size-4 shrink-0 text-primary/30" />
                        No rooms configured yet — <Button variant="link" size="sm" className="h-auto p-0 text-xs font-medium" onClick={() => router.push(`/hostel/hostels/${hostel.id}/edit`)}>edit this hostel</Button> to add rooms.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Gradient Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="gap-0 overflow-hidden border-destructive/20 p-0 shadow-xl shadow-destructive/10">
          <div className="relative bg-[linear-gradient(135deg,var(--destructive)_0%,#dc2626_48%,#b91c1c_100%)] px-5 py-4 text-white">
            <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[15px] border-white/8" />
            <div aria-hidden className="absolute -bottom-6 right-12 size-16 rounded-full bg-rose-300/5" />
            <div aria-hidden className="absolute left-8 top-2 size-10 rounded-full bg-white/5 blur-sm" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
                <Trash2 className="size-4.5 text-white" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-white">Remove hostel from {academicYear}?</h2>
                <p className="mt-0.5 text-xs text-white/75">
                  This deactivates {deleteTarget?.name}&apos;s room fares and allocations for {academicYear}. Past sessions are unaffected.
                </p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-rose-500/[0.02] via-background to-rose-500/[0.03] px-5 py-4">
            <div className="flex items-center justify-end gap-3">
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <><Loader2 className="size-4 animate-spin" />Removing…</> : <><Trash2 className="size-4" />Remove</>}
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
