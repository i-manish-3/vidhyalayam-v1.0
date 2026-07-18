'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { List, Loader2, PlusCircle, X, GraduationCap, BedDouble, Banknote, Building2, User, PhoneIcon, type LucideIcon } from 'lucide-react'

interface ApiRoom {
  id: string
  roomNumber: string
  roomType: string | null
  floor: string | null
  capacity: number
  fare: number | null
  beds: Array<{ id: string; bedNumber: string; occupied?: boolean }>
}
interface ApiHostel {
  id: string
  name: string
  type: string | null
  academicYear: string
  feeMonths: string
  wardenName: string | null
  wardenPhone: string | null
  isActive: boolean
  rooms: ApiRoom[]
}
interface RoomEdit {
  id: string
  roomNumber: string
  roomType: string
  floor: string
  capacity: string
  fare: string
  occupied: number
}
interface NewRoom {
  roomNumber: string
  roomType: string
  floor: string
  capacity: string
  fare: string
}
const HOSTEL_TYPE_OPTIONS = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'both', label: 'Both' },
]
const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseFeeMonthsStr(value: unknown): string[] {
  if (!value || typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed.map((m) => String(m).trim()).filter(Boolean)
  } catch {
    return trimmed.split(',').map((m) => m.trim()).filter(Boolean)
  }
  return []
}

function normalizeHostelType(value: string | null) {
  if (value === 'mixed') return 'both'
  return value || ''
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

function SectionCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan'
  children: React.ReactNode
}) {
  const toneConfig = {
    sky: { border: 'border-sky-200/80 dark:border-sky-800/30', bg: 'from-sky-50 via-white to-sky-50 dark:from-sky-950/20 dark:via-card dark:to-sky-950/20', gradient: 'from-sky-500 to-primary' },
    emerald: { border: 'border-emerald-200/80 dark:border-emerald-800/30', bg: 'from-emerald-50 via-white to-emerald-50 dark:from-emerald-950/20 dark:via-card dark:to-emerald-950/20', gradient: 'from-emerald-500 to-cyan-500' },
    amber: { border: 'border-amber-200/80 dark:border-amber-800/30', bg: 'from-amber-50 via-white to-amber-50 dark:from-amber-950/20 dark:via-card dark:to-amber-950/20', gradient: 'from-amber-500 to-rose-500' },
    violet: { border: 'border-violet-200/80 dark:border-violet-800/30', bg: 'from-violet-50 via-white to-violet-50 dark:from-violet-950/20 dark:via-card dark:to-violet-950/20', gradient: 'from-violet-500 to-fuchsia-500' },
    rose: { border: 'border-rose-200/80 dark:border-rose-800/30', bg: 'from-rose-50 via-white to-rose-50 dark:from-rose-950/20 dark:via-card dark:to-rose-950/20', gradient: 'from-rose-500 to-pink-500' },
    cyan: { border: 'border-cyan-200/80 dark:border-cyan-800/30', bg: 'from-cyan-50 via-white to-cyan-50 dark:from-cyan-950/20 dark:via-card dark:to-cyan-950/20', gradient: 'from-cyan-500 to-teal-500' },
  }
  const t = toneConfig[tone]
  return (
    <div className={cn('relative overflow-hidden rounded-xl border', t.border, 'bg-gradient-to-br', t.bg)}>
      <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-primary/5" />
      <div className="relative flex items-center gap-2 border-b border-primary/5 px-4 py-3">
        <span className={cn('flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm', t.gradient)}>
          <Icon className="size-3" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="relative p-4">{children}</div>
    </div>
  )
}

export function EditHostelPage() {
  const router = useRouter()
  const params = useParams()
  const id = String(params.id || '')
  const { toast } = useToast()
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const currentSchool = useAppStore((s) => s.currentSchool)
  const academicYear = viewingAcademicYear || currentSchool?.academicYear

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [wardenName, setWardenName] = useState('')
  const [wardenPhone, setWardenPhone] = useState('')
  const [selectedWardenId, setSelectedWardenId] = useState('')
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [staffLoading, setStaffLoading] = useState(true)
  const [rooms, setRooms] = useState<RoomEdit[]>([])
  const [newRooms, setNewRooms] = useState<NewRoom[]>([])
  const [draft, setDraft] = useState<NewRoom>({ roomNumber: '', roomType: '', floor: '', capacity: '1', fare: '' })
  const [feeMonths, setFeeMonths] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get<{ hostel: ApiHostel }>(`/api/school/hostels/${id}`, academicYear ? { academicYear } : undefined)
      const h = res.hostel
      setName(h.name)
      setType(normalizeHostelType(h.type))
      setWardenName(h.wardenName || '')
      setWardenPhone(h.wardenPhone || '')
      setSelectedWardenId('')
      setFeeMonths(parseFeeMonthsStr(h.feeMonths))
      setRooms(h.rooms.map((r) => ({
        id: r.id,
        roomNumber: r.roomNumber,
        roomType: r.roomType || '',
        floor: r.floor || '',
        capacity: String(r.capacity),
        fare: r.fare != null ? String(r.fare) : '',
        occupied: r.beds.filter((b) => b.occupied).length,
      })))
    } catch (error) {
      toast({ title: "Couldn't load hostel", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [id, academicYear, toast])

  useEffect(() => { if (id) load() }, [id, load])

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
    return () => { mounted = false }
  }, [])

  const hostelStaffOptions = useMemo(
    () => staffOptions.filter((staff) =>
      staff.isActive !== false &&
      (staff.assignedRoles || []).some((role) => role.name.toLowerCase().includes('hostel'))
    ),
    [staffOptions]
  )

  useEffect(() => {
    if (selectedWardenId || hostelStaffOptions.length === 0) return
    if (!wardenName && !wardenPhone) return
    const match = hostelStaffOptions.find((staff) =>
      (!!wardenPhone && staff.phone === wardenPhone) ||
      staff.name.toLowerCase() === wardenName.toLowerCase()
    )
    if (match) setSelectedWardenId(match.id)
  }, [hostelStaffOptions, selectedWardenId, wardenName, wardenPhone])

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

  const updateRoom = (i: number, field: keyof RoomEdit, value: string) =>
    setRooms((c) => c.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))

  const toggleFeeMonth = (month: string) =>
    setFeeMonths((c) => (c.includes(month) ? c.filter((m) => m !== month) : [...c, month]))
  const setAllFeeMonths = (checked: boolean) => setFeeMonths(checked ? [...FEE_MONTH_OPTIONS] : [])

  const addNewRoom = () => {
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
    const lowered = roomNumber.toLowerCase()
    if (
      rooms.some((r) => r.roomNumber.toLowerCase() === lowered) ||
      newRooms.some((r) => r.roomNumber.toLowerCase() === lowered)
    ) {
      toast({ title: 'Duplicate room', description: `"${roomNumber}" already exists.`, variant: 'destructive' })
      return
    }
    setNewRooms((c) => [...c, { ...draft, roomNumber }])
    setDraft({ roomNumber: '', roomType: '', floor: '', capacity: '1', fare: '' })
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: 'Hostel name required', variant: 'destructive' })
      return
    }
    if (feeMonths.length === 0) {
      toast({ title: 'Select at least one fee month', variant: 'destructive' })
      return
    }
    try {
      setSubmitting(true)
      const roomsPayload = [
        ...rooms.map((r) => ({
          id: r.id,
          roomType: r.roomType.trim() || null,
          floor: r.floor.trim() || null,
          capacity: Number(r.capacity),
          fare: r.fare === '' ? undefined : Number(r.fare),
        })),
        ...newRooms.map((r) => ({
          roomNumber: r.roomNumber,
          roomType: r.roomType.trim() || null,
          floor: r.floor.trim() || null,
          capacity: Number(r.capacity),
          fare: r.fare === '' ? 0 : Number(r.fare),
        })),
      ]
      await api.patch(`/api/school/hostels/${id}`, {
        academicYear,
        name: name.trim(),
        type: type.trim() || null,
        feeMonths,
        wardenName: wardenName.trim() || null,
        wardenPhone: wardenPhone.trim() || null,
        rooms: roomsPayload,
      })
      toast({ title: 'Hostel updated' })
      router.push('/hostel/hostels')
    } catch (error) {
      toast({ title: "Couldn't update hostel", description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6 pb-24">
      {/* Gradient Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
        <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
        <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
        <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
        <div aria-hidden className="absolute bottom-0 left-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Building2 className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Edit Hostel</h1>
              <p className="mt-1 text-sm text-white/75">Update hostel details and room fares for {academicYear}.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            onClick={() => router.push('/hostel/hostels')}
            className="gap-2"
          >
            <List className="size-4" />
            Hostel List
          </Button>
        </div>
      </div>

      {/* Hostel Details */}
      <SectionCard title="Hostel Details" icon={Building2} tone="sky">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select hostel type" />
              </SelectTrigger>
              <SelectContent>
                {HOSTEL_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'size-2 rounded-full',
                        option.value === 'boys' ? 'bg-blue-500' : option.value === 'girls' ? 'bg-rose-500' : 'bg-violet-500'
                      )} />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Warden</Label>
            <Select value={selectedWardenId || 'none'} onValueChange={handleWardenSelect} disabled={staffLoading}>
              <SelectTrigger className="h-9">
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
            {!selectedWardenId && wardenName && (
              <p className="text-xs text-muted-foreground">Saved warden: {wardenName}{wardenPhone ? ` - ${wardenPhone}` : ''}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Warden Phone</Label>
            <Input value={wardenPhone} readOnly className="h-9 bg-muted/50" />
          </div>
        </div>
      </SectionCard>

      {/* Fee Months */}
      <SectionCard title="Fee Months" icon={Banknote} tone="emerald">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={feeMonths.length === FEE_MONTH_OPTIONS.length}
              onCheckedChange={(c) => setAllFeeMonths(!!c)}
              className="border-emerald-500/30 data-[state=checked]:bg-emerald-600"
            />
            Select all months
          </label>
          <div className="flex flex-wrap gap-2">
            {FEE_MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleFeeMonth(m)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                  feeMonths.includes(m)
                    ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 text-emerald-700 shadow-sm dark:text-emerald-300'
                    : 'border-border text-muted-foreground hover:border-emerald-500/20 hover:bg-emerald-500/5'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Rooms */}
      <SectionCard title={`Rooms (fares for ${academicYear})`} icon={BedDouble} tone="amber">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-amber-200/60 text-left text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                <th className="pb-2 pr-4">Room</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Floor</th>
                <th className="pb-2 pr-4">Beds</th>
                <th className="pb-2 pr-4">Fare</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r, i) => (
                <tr key={r.id} className={cn(
                  'border-b border-amber-200/30 text-sm transition-colors',
                  i % 2 === 0 ? 'bg-amber-500/[0.02]' : ''
                )}>
                  <td className="py-2 pr-4">
                    <span className="font-medium">{r.roomNumber}</span>
                    {r.occupied > 0 && (
                      <Badge variant="secondary" className="ml-2 text-[9px] px-1.5 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-300">{r.occupied} occ</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4"><Input value={r.roomType} onChange={(e) => updateRoom(i, 'roomType', e.target.value)} className="h-8" /></td>
                  <td className="py-2 pr-4"><Input value={r.floor} onChange={(e) => updateRoom(i, 'floor', e.target.value)} className="h-8 w-20" /></td>
                  <td className="py-2 pr-4"><Input type="number" min={r.occupied || 1} value={r.capacity} onChange={(e) => updateRoom(i, 'capacity', e.target.value)} className="h-8 w-20" /></td>
                  <td className="py-2 pr-4"><Input type="number" min={0} value={r.fare} onChange={(e) => updateRoom(i, 'fare', e.target.value)} className="h-8 w-28" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Add New Rooms */}
      <SectionCard title="Add New Rooms" icon={PlusCircle} tone="violet">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Input placeholder="Room no *" value={draft.roomNumber} onChange={(e) => setDraft({ ...draft, roomNumber: e.target.value })} className="h-9" />
            <Input placeholder="Type" value={draft.roomType} onChange={(e) => setDraft({ ...draft, roomType: e.target.value })} className="h-9" />
            <Input placeholder="Floor" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} className="h-9" />
            <Input placeholder="Beds *" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} className="h-9" />
            <Input placeholder="Fare *" type="number" min={0} value={draft.fare} onChange={(e) => setDraft({ ...draft, fare: e.target.value })} className="h-9" />
            <Button type="button" variant="outline" onClick={addNewRoom} className="h-9 gap-1.5">
              <PlusCircle className="size-4" />Add
            </Button>
          </div>
          {newRooms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {newRooms.map((r, i) => (
                <Badge key={`${r.roomNumber}-${i}`} variant="secondary" className="gap-1.5 px-2.5 py-1 text-[11px]">
                  <Building2 className="size-3" />
                  {r.roomNumber} ({r.capacity} beds, ₹{r.fare || 0})
                  <button onClick={() => setNewRooms((c) => c.filter((_, idx) => idx !== i))} className="ml-0.5 text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Sticky Footer */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-primary/10 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/hostel/hostels')}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
