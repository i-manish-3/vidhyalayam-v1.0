'use client'

import { useState } from 'react'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, Loader2, PlusCircle, X } from 'lucide-react'

interface RoomDraft {
  roomNumber: string
  roomType: string
  floor: string
  capacity: string
  fare: string
}

const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  const [address, setAddress] = useState('')
  const [feeMonths, setFeeMonths] = useState<string[]>([])
  const [rooms, setRooms] = useState<RoomDraft[]>([])
  const [draft, setDraft] = useState<RoomDraft>({ roomNumber: '', roomType: '', floor: '', capacity: '1', fare: '' })
  const [submitting, setSubmitting] = useState(false)

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
        address: address.trim() || null,
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
      <PageHeader title="Add Hostel" description={`Create a hostel with rooms and beds for ${academicYear}.`} />

      <Card>
        <CardHeader><CardTitle>Hostel Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Hostel Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Boys Hostel A" />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="boys / girls / mixed" />
          </div>
          <div className="space-y-2">
            <Label>Warden Name</Label>
            <Input value={wardenName} onChange={(e) => setWardenName(e.target.value)} placeholder="Warden name" />
          </div>
          <div className="space-y-2">
            <Label>Warden Phone</Label>
            <Input value={wardenPhone} onChange={(e) => setWardenPhone(e.target.value)} placeholder="Phone" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Hostel address" />
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
