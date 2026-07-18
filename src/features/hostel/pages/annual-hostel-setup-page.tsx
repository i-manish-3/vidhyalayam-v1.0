'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { LoadingState } from '@/components/shared'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, RefreshCw, Building2, ChevronRight, CalendarDays, DoorOpen, BedDouble, Copy, SkipForward, Ban, CheckCircle2 } from 'lucide-react'

interface ApiRoom { id: string; roomNumber: string; roomType: string | null; capacity: number; fare: number | null }
interface ApiHostel { id: string; name: string; type: string | null; feeMonths: string; rooms: ApiRoom[] }

type Action = 'copy' | 'discontinue' | 'skip'
interface HostelPlan {
  action: Action
  feeMonths: string[]
  roomFares: Record<string, string> // roomId -> fare input
}

const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseFeeMonths(value: string): string[] {
  try { const p = JSON.parse(value); return Array.isArray(p) ? p : [] } catch { return [] }
}

export function AnnualHostelSetupPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const current = currentSchool?.academicYear || getCurrentAcademicYear()

  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState(current)
  const [hostels, setHostels] = useState<ApiHostel[]>([])
  const [plans, setPlans] = useState<Record<string, HostelPlan>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const yearOptions = toAcademicYearOptions(academicYears, current)

  useEffect(() => {
    api.get<{ academicYears: string[] }>('/api/school/academic-years')
      .then((res) => setAcademicYears(res.academicYears || []))
      .catch(() => setAcademicYears([]))
  }, [])

  const loadSource = useCallback(async (year: string) => {
    if (!year) return
    try {
      setLoading(true)
      const res = await api.get<{ hostels: ApiHostel[] }>('/api/school/hostels', { academicYear: year })
      setHostels(res.hostels || [])
      const initial: Record<string, HostelPlan> = {}
      for (const h of res.hostels || []) {
        initial[h.id] = {
          action: 'copy',
          feeMonths: parseFeeMonths(h.feeMonths),
          roomFares: Object.fromEntries(h.rooms.map((r) => [r.id, r.fare != null ? String(r.fare) : ''])),
        }
      }
      setPlans(initial)
    } catch (error) {
      toast({ title: "Couldn't load source hostels", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { if (fromYear) loadSource(fromYear) }, [fromYear, loadSource])

  const setAction = (hostelId: string, action: Action) =>
    setPlans((p) => ({ ...p, [hostelId]: { ...p[hostelId], action } }))
  const setRoomFare = (hostelId: string, roomId: string, value: string) =>
    setPlans((p) => ({ ...p, [hostelId]: { ...p[hostelId], roomFares: { ...p[hostelId].roomFares, [roomId]: value } } }))
  const toggleMonth = (hostelId: string, month: string) =>
    setPlans((p) => {
      const cur = p[hostelId]
      const months = cur.feeMonths.includes(month) ? cur.feeMonths.filter((m) => m !== month) : [...cur.feeMonths, month]
      return { ...p, [hostelId]: { ...cur, feeMonths: months } }
    })

  const handleSubmit = async () => {
    if (!fromYear || !toYear) { toast({ title: 'Choose both source and target years', variant: 'destructive' }); return }
    if (fromYear === toYear) { toast({ title: 'Source and target must differ', variant: 'destructive' }); return }

    const payloadHostels = hostels
      .map((h) => {
        const plan = plans[h.id]
        if (!plan || plan.action === 'skip') return null
        if (plan.action === 'discontinue') return { mode: 'discontinue', hostelId: h.id }
        const rooms = h.rooms
          .map((r) => ({ roomId: r.id, roomNumber: r.roomNumber, roomType: r.roomType, capacity: r.capacity, fare: Number(plan.roomFares[r.id] ?? '') }))
          .filter((r) => Number.isFinite(r.fare) && r.fare >= 0)
        if (rooms.length === 0 || plan.feeMonths.length === 0) return null
        return { mode: 'copy', hostelId: h.id, rooms, feeMonths: plan.feeMonths }
      })
      .filter(Boolean)

    if (payloadHostels.length === 0) { toast({ title: 'Nothing to apply', description: 'Select at least one hostel to copy or discontinue.', variant: 'destructive' }); return }

    try {
      setSubmitting(true)
      const res = await api.post<{ message: string }>('/api/school/hostels/annual-setup', {
        fromAcademicYear: fromYear,
        toAcademicYear: toYear,
        hostels: payloadHostels,
      })
      toast({ title: 'Annual setup complete', description: res.message })
      router.push('/hostel/hostels')
    } catch (error) {
      toast({ title: "Couldn't run annual setup", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const hostelTypeMeta = (t: string | null) => {
    if (t === 'boys') return { dot: 'bg-blue-500', label: 'Boys', border: 'border-sky-500/30', gradient: 'from-sky-500/12 via-blue-500/8 to-indigo-500/12' }
    if (t === 'girls') return { dot: 'bg-rose-500', label: 'Girls', border: 'border-rose-500/30', gradient: 'from-rose-500/12 via-pink-500/8 to-fuchsia-500/12' }
    return { dot: 'bg-violet-500', label: 'Co-Ed', border: 'border-violet-500/30', gradient: 'from-violet-500/12 via-purple-500/8 to-fuchsia-500/12' }
  }

  const actionIcon = (a: Action) => {
    if (a === 'copy') return <Copy className="size-3.5" />
    if (a === 'discontinue') return <Ban className="size-3.5" />
    return <SkipForward className="size-3.5" />
  }

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div aria-hidden className="absolute left-1/4 top-0 size-16 rounded-full bg-teal-300/8 blur-sm" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <RefreshCw className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Annual Hostel Setup</h1>
            <p className="mt-0.5 text-xs text-white/80">Copy room fares forward into a new academic year, or discontinue hostels.</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/hostel/hostels')}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <Building2 className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Hostel List</span>
        </Button>
      </div>

      {/* Sessions Card */}
      <Card className="gap-0 overflow-hidden border-emerald-500/15 bg-gradient-to-br from-card via-card to-emerald-500/[0.03] py-0 shadow-sm">
        <CardHeader className="border-b border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.10] via-primary/[0.05] to-cyan-500/[0.08] px-4 py-3 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
              <CalendarDays className="size-4" />
            </span>
            Sessions
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3 sm:px-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] via-card to-emerald-500/[0.02] p-3">
              <Label className="text-xs font-medium text-muted-foreground">Copy from (source)</Label>
              <Select value={fromYear} onValueChange={setFromYear}>
                <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="Select source year" /></SelectTrigger>
                <SelectContent>{yearOptions.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.04] via-card to-emerald-500/[0.02] p-3">
              <Label className="text-xs font-medium text-muted-foreground">Apply to (target)</Label>
              <Select value={toYear} onValueChange={setToYear}>
                <SelectTrigger className="mt-1.5 h-10"><SelectValue placeholder="Select target year" /></SelectTrigger>
                <SelectContent>{yearOptions.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : fromYear && hostels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.02] via-card to-cyan-500/[0.03] px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border-2 border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] to-cyan-500/[0.06] shadow-sm">
            <Building2 className="size-7 text-emerald-500/50" strokeWidth={1.5} />
          </span>
          <div>
            <h3 className="text-base font-semibold">No hostels found</h3>
            <p className="mt-1 text-sm text-muted-foreground">{fromYear} has no hostels to copy from.</p>
          </div>
        </div>
      ) : (
        hostels.map((h) => {
          const plan = plans[h.id]
          if (!plan) return null
          const meta = hostelTypeMeta(h.type)
          return (
            <Card key={h.id} className={cn(
              'gap-0 overflow-hidden border py-0 shadow-sm transition-all hover:shadow-md',
              plan.action === 'discontinue' ? 'border-rose-500/20' :
              plan.action === 'skip' ? 'border-muted/40' :
              meta.border
            )}>
              {/* Card Header — tone-coded */}
              <div className={cn(
                'relative flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5',
                plan.action === 'discontinue' ? 'border-rose-500/15 bg-gradient-to-r from-rose-500/10 via-pink-500/8 to-rose-500/10' :
                plan.action === 'skip' ? 'border-muted/20 bg-gradient-to-r from-muted/10 via-stone-500/8 to-muted/10' :
                cn('bg-gradient-to-r', meta.gradient)
              )}>
                <div aria-hidden className="absolute -right-4 -top-4 size-20 rounded-full border-[14px] border-white/10" />
                <div aria-hidden className="absolute bottom-0 left-1/3 h-px w-32 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <div className="relative flex min-w-0 flex-wrap items-center gap-2.5">
                  <span className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
                    plan.action === 'discontinue' ? 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/20' :
                    plan.action === 'skip' ? 'bg-gradient-to-br from-stone-500 to-muted-foreground shadow-stone-500/20' :
                    'bg-gradient-to-br from-primary to-teal-600 shadow-primary/20'
                  )}>
                    <Building2 className="size-4.5" />
                  </span>
                  <span className="truncate text-sm font-semibold">{h.name}</span>
                  {h.type && (
                    <Badge variant="secondary" className={cn(
                      'gap-1.5 border text-[11px] font-medium',
                      meta.dot === 'bg-blue-500' && 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300',
                      meta.dot === 'bg-rose-500' && 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
                      meta.dot === 'bg-violet-500' && 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300',
                    )}>
                      <span className={cn('size-1.5 rounded-full', meta.dot)} />
                      {meta.label}
                    </Badge>
                  )}
                </div>
                <Select value={plan.action} onValueChange={(v) => setAction(h.id, v as Action)}>
                  <SelectTrigger className={cn(
                    'h-8 w-36 gap-1.5 text-xs font-medium',
                    plan.action === 'copy' && 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
                    plan.action === 'discontinue' && 'border-rose-500/30 text-rose-700 dark:text-rose-300',
                    plan.action === 'skip' && 'border-muted text-muted-foreground',
                  )}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copy" className="gap-2">
                      <span className="flex items-center gap-2"><Copy className="size-3.5 text-emerald-500" />Copy fares</span>
                    </SelectItem>
                    <SelectItem value="discontinue" className="gap-2">
                      <span className="flex items-center gap-2"><Ban className="size-3.5 text-rose-500" />Discontinue</span>
                    </SelectItem>
                    <SelectItem value="skip" className="gap-2">
                      <span className="flex items-center gap-2"><SkipForward className="size-3.5 text-muted-foreground" />Skip</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {plan.action === 'copy' && (
                <CardContent className="space-y-4 px-4 pb-4 pt-3 sm:px-5">
                  {/* Fee Months */}
                  <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.04] via-card to-cyan-500/[0.02] p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Fee Months</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FEE_MONTH_OPTIONS.map((m) => {
                        const checked = plan.feeMonths.includes(m)
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => toggleMonth(h.id, m)}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
                              checked
                                ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.15] via-card to-cyan-500/[0.08] text-emerald-700 shadow-sm dark:text-emerald-300'
                                : 'border-input bg-background text-muted-foreground hover:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
                            )}
                          >
                            {m}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Rooms Table */}
                  <div className="overflow-hidden rounded-xl border border-primary/10 shadow-sm">
                    <Table>
                      <TableHeader className={cn('bg-gradient-to-r', meta.gradient)}>
                        <TableRow>
                          <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room</TableHead>
                          <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                          <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beds</TableHead>
                          <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fare ({toYear})</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {h.rooms.map((r, ri) => (
                          <TableRow key={r.id} className={cn('transition-colors', ri % 2 === 0 ? 'bg-background' : 'bg-primary/[0.015]', 'hover:bg-primary/[0.04]')}>
                            <TableCell className="py-2.5 font-medium">
                              <span className="flex items-center gap-2">
                                <DoorOpen className="size-3.5 text-muted-foreground/50" />
                                {r.roomNumber}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5">{r.roomType || <span className="text-muted-foreground/50 text-xs">—</span>}</TableCell>
                            <TableCell className="py-2.5"><Badge variant="secondary" className="border-emerald-500/25 bg-emerald-500/[0.08] text-[11px]">{r.capacity}</Badge></TableCell>
                            <TableCell className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground/60">₹</span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={plan.roomFares[r.id] ?? ''}
                                  onChange={(e) => setRoomFare(h.id, r.id, e.target.value)}
                                  className="h-8 w-24 text-xs tabular-nums"
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}

              {plan.action === 'discontinue' && (
                <CardContent className="px-4 pb-4 pt-3 sm:px-5">
                  <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.04] to-pink-500/[0.03] px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10">
                      <Ban className="size-4 text-rose-500" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Will be discontinued</p>
                      <p className="text-xs text-muted-foreground">This hostel will be deactivated for {toYear}. Past sessions are unaffected.</p>
                    </div>
                  </div>
                </CardContent>
              )}

              {plan.action === 'skip' && (
                <CardContent className="px-4 pb-4 pt-3 sm:px-5">
                  <div className="flex items-center gap-3 rounded-xl border border-muted/30 bg-gradient-to-br from-muted/[0.04] to-muted/[0.02] px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/20">
                      <SkipForward className="size-4 text-muted-foreground/60" />
                    </span>
                    <p className="text-sm text-muted-foreground">Skipped — no changes will be applied for this hostel.</p>
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })
      )}

      {/* Sticky Footer */}
      {hostels.length > 0 && (
        <div className="sticky bottom-0 -mx-4 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] via-background to-cyan-500/[0.03] px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5 text-emerald-500" />{hostels.filter((h) => plans[h.id]?.action === 'copy').length} copy</span>
              <span className="flex items-center gap-1"><Ban className="size-3.5 text-rose-500" />{hostels.filter((h) => plans[h.id]?.action === 'discontinue').length} discontinue</span>
              <span className="flex items-center gap-1"><SkipForward className="size-3.5 text-muted-foreground" />{hostels.filter((h) => plans[h.id]?.action === 'skip').length} skip</span>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => router.push('/hostel/hostels')} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting || !fromYear} className="min-w-[160px] gap-2">
                {submitting ? <><Loader2 className="size-4 animate-spin" /> Applying…</> : <><RefreshCw className="size-4" /> Apply to {toYear}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
