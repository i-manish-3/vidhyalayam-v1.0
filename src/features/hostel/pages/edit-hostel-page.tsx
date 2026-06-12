'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { PageHeader, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, PlusCircle, X } from 'lucide-react'

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

  const addNewRoom = () => {
    const roomNumber = draft.roomNumber.trim()
    if (!roomNumber) { toast({ title: 'Room number required', variant: 'destructive' }); return }
    setNewRooms((c) => [...c, { ...draft, roomNumber }])
    setDraft({ roomNumber: '', roomType: '', floor: '', capacity: '1', fare: '' })
  }

  const handleSubmit = async () => {
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
    <div className="space-y-6">
      <PageHeader title="Edit Hostel" description={`Update hostel details and room fares for ${academicYear}.`} />

      <Card>
        <CardHeader><CardTitle>Hostel Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
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
            {!selectedWardenId && wardenName && (
              <p className="text-xs text-muted-foreground">Saved warden: {wardenName}{wardenPhone ? ` - ${wardenPhone}` : ''}</p>
            )}
          </div>
          <div className="space-y-2"><Label>Warden Phone</Label><Input value={wardenPhone} readOnly className="bg-muted/50" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rooms (fares for {academicYear})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Beds</TableHead>
                <TableHead>Fare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.roomNumber}{r.occupied > 0 && <Badge variant="secondary" className="ml-2">{r.occupied} occupied</Badge>}</TableCell>
                  <TableCell><Input value={r.roomType} onChange={(e) => updateRoom(i, 'roomType', e.target.value)} className="h-8" /></TableCell>
                  <TableCell><Input value={r.floor} onChange={(e) => updateRoom(i, 'floor', e.target.value)} className="h-8 w-20" /></TableCell>
                  <TableCell><Input type="number" min={r.occupied || 1} value={r.capacity} onChange={(e) => updateRoom(i, 'capacity', e.target.value)} className="h-8 w-20" /></TableCell>
                  <TableCell><Input type="number" min={0} value={r.fare} onChange={(e) => updateRoom(i, 'fare', e.target.value)} className="h-8 w-28" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Add New Rooms</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <Input placeholder="Room no *" value={draft.roomNumber} onChange={(e) => setDraft({ ...draft, roomNumber: e.target.value })} />
            <Input placeholder="Type" value={draft.roomType} onChange={(e) => setDraft({ ...draft, roomType: e.target.value })} />
            <Input placeholder="Floor" value={draft.floor} onChange={(e) => setDraft({ ...draft, floor: e.target.value })} />
            <Input placeholder="Beds *" type="number" min={1} value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} />
            <Input placeholder="Fare *" type="number" min={0} value={draft.fare} onChange={(e) => setDraft({ ...draft, fare: e.target.value })} />
            <Button type="button" variant="outline" onClick={addNewRoom}><PlusCircle className="mr-1 size-4" />Add</Button>
          </div>
          {newRooms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {newRooms.map((r, i) => (
                <Badge key={`${r.roomNumber}-${i}`} variant="secondary" className="gap-1">
                  {r.roomNumber} ({r.capacity} beds, ₹{r.fare || 0})
                  <button onClick={() => setNewRooms((c) => c.filter((_, idx) => idx !== i))}><X className="size-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/hostel/hostels')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting}>{submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Save Changes</Button>
      </div>
    </div>
  )
}
