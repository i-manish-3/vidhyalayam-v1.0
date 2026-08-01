'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, List, Loader2, PlusCircle, X } from 'lucide-react'

interface RoomDraft {
  roomNumber: string
  roomType: string
  floor: string
  capacity: string
  fare: string
}

interface StaffOption {
  id: string
  name: string
  phone?: string | null
  designation?: string | null
  department?: string | null
  isActive?: boolean
  assignedRoles?: Array<{ id: string; name: string; color?: string | null }>
}

const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HOSTEL_TYPE_OPTIONS = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'both', label: 'Both' },
]

export function AddHostelPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.HOSTEL_CREATE)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [wardenName, setWardenName] = useState('')
  const [wardenPhone, setWardenPhone] = useState('')
  const [selectedWardenId, setSelectedWardenId] = useState('')
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [feeMonths, setFeeMonths] = useState<string[]>([])
  const [rooms, setRooms] = useState<RoomDraft[]>([])
  const [draft, setDraft] = useState<RoomDraft>({ roomNumber: '', roomType: '', floor: '', capacity: '1', fare: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    const loadStaff = async () => {
      try {
        setStaffLoading(true)
        const data = await api.get<{ staff: StaffOption[] }>('/api/school/staff', undefined, { skipLogoutOn401: true })
        if (!mounted) return
        setStaffOptions(data.staff || [])
      } catch {
        if (mounted) setStaffOptions([])
      } finally {
        if (mounted) setStaffLoading(false)
      }
    }
    loadStaff()
    return () => {
      mounted = false
    }
  }, [])

  const hostelStaffOptions = useMemo(
    () => staffOptions.filter((staff) =>
      staff.isActive !== false &&
      (staff.assignedRoles || []).some((role) => role.name.toLowerCase().includes('hostel'))
    ),
    [staffOptions]
  )

  const handleWardenSelect = (staffId: string) => {
    if (staffId === 'none') {
      setSelectedWardenId('')
      setWardenName('')
      setWardenPhone('')
      return
    }
    const staff = hostelStaffOptions.find((item) => item.id === staffId)
    setSelectedWardenId(staffId)
    setWardenName(staff?.name || '')
    setWardenPhone(staff?.phone || '')
  }

  const toggleFeeMonth = (month: string) =>
    setFeeMonths((c) => (c.includes(month) ? c.filter((m) => m !== month) : [...c, month]))
  const setAllFeeMonths = (checked: boolean) => setFeeMonths(checked ? [...FEE_MONTH_OPTIONS] : [])

  const addRoom = () => {
    const roomNumber = draft.roomNumber.trim()
    const capacity = Number(draft.capacity)
    const fare = Number(draft.fare)
    if (!roomNumber) {
      toast({ title: 'Room number required', variant: 'destructive' })
      return
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      toast({ title: 'Invalid capacity', description: 'Capacity must be a whole number ≥ 1.', variant: 'destructive' })
      return
    }
    if (!Number.isFinite(fare) || fare < 0) {
      toast({ title: 'Invalid fare', variant: 'destructive' })
      return
    }
    if (rooms.some((r) => r.roomNumber.toLowerCase() === roomNumber.toLowerCase())) {
      toast({ title: 'Duplicate room', description: `"${roomNumber}" already added.`, variant: 'destructive' })
      return
    }
    setRooms((c) => [...c, { ...draft, roomNumber }])
    setDraft({ roomNumber: '', roomType: '', floor: '', capacity: '1', fare: '' })
  }

  const removeRoom = (i: number) => setRooms((c) => c.filter((_, idx) => idx !== i))

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Hostel name required', variant: 'destructive' })
      return
    }
    if (feeMonths.length === 0) {
      toast({ title: 'Select at least one fee month', variant: 'destructive' })
      return
    }
    if (rooms.length === 0) {
      toast({ title: 'Add at least one room', variant: 'destructive' })
      return
    }
    try {
      setSubmitting(true)
      await api.post('/api/school/hostels', {
        name: name.trim(),
        type: type.trim() || null,
        academicYear,
        feeMonths,
        wardenName: wardenName.trim() || null,
        wardenPhone: wardenPhone.trim() || null,
        rooms: rooms.map((r) => ({
          roomNumber: r.roomNumber,
          roomType: r.roomType.trim() || null,
          floor: r.floor.trim() || null,
          capacity: Number(r.capacity),
          fare: Number(r.fare),
        })),
      })
      toast({ title: 'Hostel created', description: `${name} added for ${academicYear}.` })
      router.push('/hostel/hostels')
    } catch (error) {
      toast({ title: "Couldn't create hostel", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Building2 className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Add Hostel</h1>
            <p className="mt-0.5 text-xs text-white/80">Create a hostel with rooms and beds for {academicYear}.</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/hostel/hostels')}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <List className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Hostel List</span>
        </Button>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-5">
        {/* Hostel Details */}
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <Building2 className="size-4" />
              </span>
              Hostel Details
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3 sm:px-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Hostel Name <span className="text-destructive">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boys Hostel A" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-10 gap-2">
                    {type ? (
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          'size-2 rounded-full',
                          type === 'boys' && 'bg-blue-500',
                          type === 'girls' && 'bg-rose-500',
                          type === 'co-ed' && 'bg-violet-500'
                        )} />
                        {HOSTEL_TYPE_OPTIONS.find(o => o.value === type)?.label}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select hostel type</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {HOSTEL_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="gap-2">
                        <span className="flex items-center gap-2">
                          <span className={cn(
                            'size-2 rounded-full',
                            option.value === 'boys' && 'bg-blue-500',
                            option.value === 'girls' && 'bg-rose-500',
                            option.value === 'co-ed' && 'bg-violet-500'
                          )} />
                          {option.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Warden</Label>
                <Select value={selectedWardenId || 'none'} onValueChange={handleWardenSelect} disabled={staffLoading}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={staffLoading ? 'Loading hostel staff...' : 'Select hostel staff'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No warden</SelectItem>
                    {hostelStaffOptions.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.name}{staff.phone ? ` - ${staff.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!staffLoading && hostelStaffOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active staff with Hostel role found.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Warden Phone</Label>
                <Input value={wardenPhone} readOnly placeholder="Auto-filled from selected staff" className="h-10 bg-muted/40" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fee Months */}
        <Card className="gap-0 overflow-hidden border-emerald-500/15 bg-gradient-to-br from-card via-card to-emerald-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.10] via-primary/[0.05] to-cyan-500/[0.08] px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                <Building2 className="size-4" />
              </span>
              Fee Months
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-3 sm:px-5">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Checkbox checked={feeMonths.length === FEE_MONTH_OPTIONS.length} onCheckedChange={(c) => setAllFeeMonths(!!c)} />
              Select all months
            </label>
            <div className="flex flex-wrap gap-2">
              {FEE_MONTH_OPTIONS.map((m) => {
                const checked = feeMonths.includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleFeeMonth(m)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition',
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
          </CardContent>
        </Card>

        {/* Rooms & Beds */}
        <Card className="gap-0 overflow-hidden border-amber-500/15 bg-gradient-to-br from-card via-card to-amber-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-amber-500/15 bg-gradient-to-r from-amber-500/[0.10] via-primary/[0.05] to-rose-500/[0.08] px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                <Building2 className="size-4" />
              </span>
              Rooms &amp; Beds
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 pb-4 pt-3 sm:px-5">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <Input placeholder="Room no *" value={draft.roomNumber} onChange={(e) => setDraft({ ...draft, roomNumber: e.target.value })} className="h-9 text-sm" />
                <Input placeholder="Type" value={draft.roomType} onChange={(e) => setDraft({ ...draft, roomType: e.target.value })} className="h-9 text-sm" />
                <Input placeholder="Floor" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} className="h-9 text-sm" />
                <Input placeholder="Beds *" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} className="h-9 text-sm" />
                <Input placeholder="Fare *" type="number" min={0} value={draft.fare} onChange={(e) => setDraft({ ...draft, fare: e.target.value })} className="h-9 text-sm" />
                <Button type="button" variant="outline" onClick={addRoom} disabled={!draft.roomNumber.trim() || !draft.fare} className="h-9 gap-1 text-xs">
                  <PlusCircle className="size-3.5" />Add
                </Button>
              </div>
            </div>

            {rooms.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-amber-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-amber-500/[0.08] via-primary/[0.04] to-rose-500/[0.07]">
                    <TableRow>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Floor</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beds</TableHead>
                      <TableHead className="py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fare</TableHead>
                      <TableHead className="w-12 py-2.5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms.map((r, i) => (
                      <TableRow key={`${r.roomNumber}-${i}`} className="transition-colors hover:bg-amber-500/[0.04]">
                        <TableCell className="py-2.5 font-medium">{r.roomNumber}</TableCell>
                        <TableCell className="py-2.5">{r.roomType || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        <TableCell className="py-2.5">{r.floor || <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                        <TableCell className="py-2.5"><Badge variant="secondary" className="border-amber-500/25 bg-amber-500/[0.08]">{r.capacity}</Badge></TableCell>
                        <TableCell className="py-2.5 tabular-nums font-semibold text-emerald-600">₹{Number(r.fare).toLocaleString('en-IN')}</TableCell>
                        <TableCell className="py-2.5">
                          <Button type="button" variant="ghost" size="icon" className="size-7 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={() => removeRoom(i)}>
                            <X className="size-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="sticky bottom-0 -mx-4 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] via-background to-cyan-500/[0.03] px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Hostel name, at least one fee month, and one room are required.
            </p>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={submitting || !name.trim() || feeMonths.length === 0 || rooms.length === 0 || !canCreate} className="min-w-[150px] gap-2">
                {submitting ? <><Loader2 className="size-4 animate-spin" /> Creating...</> : <><Building2 className="size-4" /> Create Hostel</>}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/hostel/hostels')} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
