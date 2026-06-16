'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
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
      <PageHeader
        title="Add Hostel"
        description={`Create a hostel with rooms and beds for ${academicYear}.`}
        secondaryAction={{ label: 'Hostel List', icon: List, onClick: () => router.push('/hostel/hostels') }}
      />

      <Card>
        <CardHeader><CardTitle>Hostel Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Hostel Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boys Hostel A" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select hostel type" />
              </SelectTrigger>
              <SelectContent>
                {HOSTEL_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Warden</Label>
            <Select value={selectedWardenId || 'none'} onValueChange={handleWardenSelect} disabled={staffLoading}>
              <SelectTrigger>
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
            <Label>Warden Phone</Label>
            <Input value={wardenPhone} readOnly placeholder="Selected staff phone" className="bg-muted/50" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fee Months</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={feeMonths.length === FEE_MONTH_OPTIONS.length} onCheckedChange={(c) => setAllFeeMonths(!!c)} />
            Select all months
          </label>
          <div className="flex flex-wrap gap-2">
            {FEE_MONTH_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleFeeMonth(m)}
                className={`rounded-md border px-3 py-1 text-sm ${feeMonths.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rooms &amp; Beds</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Input placeholder="Room no *" value={draft.roomNumber} onChange={(e) => setDraft({ ...draft, roomNumber: e.target.value })} />
            <Input placeholder="Type" value={draft.roomType} onChange={(e) => setDraft({ ...draft, roomType: e.target.value })} />
            <Input placeholder="Floor" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} />
            <Input placeholder="Beds *" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
            <Input placeholder="Fare *" type="number" min={0} value={draft.fare} onChange={(e) => setDraft({ ...draft, fare: e.target.value })} />
            <Button type="button" variant="outline" onClick={addRoom}><PlusCircle className="mr-1 size-4" />Add</Button>
          </div>

          {rooms.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Beds</TableHead>
                  <TableHead>Fare</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((r, i) => (
                  <TableRow key={`${r.roomNumber}-${i}`}>
                    <TableCell className="font-medium">{r.roomNumber}</TableCell>
                    <TableCell>{r.roomType || '—'}</TableCell>
                    <TableCell>{r.floor || '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{r.capacity}</Badge></TableCell>
                    <TableCell>₹{r.fare}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeRoom(i)}><X className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/hostel/hostels')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Create Hostel
        </Button>
      </div>
    </div>
  )
}
