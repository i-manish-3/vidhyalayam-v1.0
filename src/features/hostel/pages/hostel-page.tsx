'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Building2, PlusCircle, Pencil, Trash2, RefreshCw } from 'lucide-react'

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

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hostels"
        description={`Hostels, rooms, and bed occupancy for ${academicYear || 'the current session'}.`}
        action={{ label: 'Add Hostel', icon: PlusCircle, onClick: () => router.push('/hostel/hostels/new') }}
        secondaryAction={{ label: 'Annual Setup', icon: RefreshCw, onClick: () => router.push('/hostel/annual-setup') }}
      />

      {hostels.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No hostels yet"
          description="Create your first hostel with rooms and beds to start allocating students."
          action={{ label: 'Add Hostel', onClick: () => router.push('/hostel/hostels/new') }}
        />
      ) : (
        <div className="space-y-4">
          {hostels.map((hostel) => {
            const totalBeds = hostel.rooms.reduce((s, r) => s + r.beds.length, 0)
            const occupiedBeds = hostel.rooms.reduce((s, r) => s + r.beds.filter((b) => b.occupied).length, 0)
            return (
              <Card key={hostel.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="size-5 text-primary" />
                      {hostel.name}
                      {hostel.type && <Badge variant="secondary">{hostel.type}</Badge>}
                      {!hostel.isActive && <Badge variant="outline">Inactive</Badge>}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {hostel.wardenName ? `Warden: ${hostel.wardenName}` : 'No warden assigned'} · {occupiedBeds}/{totalBeds} beds occupied
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/hostel/hostels/${hostel.id}/edit`)}>
                      <Pencil className="mr-1 size-4" />Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(hostel)}>
                      <Trash2 className="mr-1 size-4" />Delete
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Room</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Floor</TableHead>
                        <TableHead>Occupancy</TableHead>
                        <TableHead>Fare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hostel.rooms.map((room) => (
                        <TableRow key={room.id}>
                          <TableCell className="font-medium">{room.roomNumber}</TableCell>
                          <TableCell>{room.roomType || '—'}</TableCell>
                          <TableCell>{room.floor || '—'}</TableCell>
                          <TableCell>
                            <Badge variant={(room.occupiedCount || 0) >= room.capacity ? 'destructive' : 'secondary'}>
                              {room.occupiedCount || 0}/{room.capacity}
                            </Badge>
                          </TableCell>
                          <TableCell>{room.fare != null ? `₹${room.fare}` : <span className="text-muted-foreground">no fare</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove hostel from {academicYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deactivates {deleteTarget?.name}&apos;s room fares and allocations for {academicYear}. Past sessions are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? 'Removing…' : 'Remove'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
