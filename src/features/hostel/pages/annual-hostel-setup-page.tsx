'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { PageHeader, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, RefreshCw } from 'lucide-react'

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

  return (
    <div className="space-y-6">
      <PageHeader title="Annual Hostel Setup" description="Copy room fares forward into a new academic year, or discontinue hostels." />

      <Card>
        <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Copy from (source)</Label>
            <Select value={fromYear} onValueChange={setFromYear}>
              <SelectTrigger><SelectValue placeholder="Select source year" /></SelectTrigger>
              <SelectContent>{yearOptions.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Apply to (target)</Label>
            <Select value={toYear} onValueChange={setToYear}>
              <SelectTrigger><SelectValue placeholder="Select target year" /></SelectTrigger>
              <SelectContent>{yearOptions.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState />
      ) : fromYear && hostels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hostels found for {fromYear}.</p>
      ) : (
        hostels.map((h) => {
          const plan = plans[h.id]
          if (!plan) return null
          return (
            <Card key={h.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">{h.name}{h.type && <Badge variant="secondary">{h.type}</Badge>}</CardTitle>
                <Select value={plan.action} onValueChange={(v) => setAction(h.id, v as Action)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copy">Copy fares</SelectItem>
                    <SelectItem value="discontinue">Discontinue</SelectItem>
                    <SelectItem value="skip">Skip</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              {plan.action === 'copy' && (
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {FEE_MONTH_OPTIONS.map((m) => (
                      <button key={m} type="button" onClick={() => toggleMonth(h.id, m)}
                        className={`rounded-md border px-2.5 py-1 text-xs ${plan.feeMonths.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <Table>
                    <TableHeader><TableRow><TableHead>Room</TableHead><TableHead>Type</TableHead><TableHead>Beds</TableHead><TableHead>Fare ({toYear})</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {h.rooms.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.roomNumber}</TableCell>
                          <TableCell>{r.roomType || '—'}</TableCell>
                          <TableCell>{r.capacity}</TableCell>
                          <TableCell>
                            <Input type="number" min={0} value={plan.roomFares[r.id] ?? ''} onChange={(e) => setRoomFare(h.id, r.id, e.target.value)} className="h-8 w-28" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          )
        })
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push('/hostel/hostels')}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={submitting || !fromYear}>
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}Apply to {toYear}
        </Button>
      </div>
    </div>
  )
}
