'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader, StatsCard, EmptyState, LoadingState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { ChevronLeft, ChevronRight, CalendarCheck, CalendarX, Percent, CalendarDays } from 'lucide-react'

interface ChildOption {
  id: string
  fullName: string
  isActive: boolean
}

interface AttendanceRecord {
  date: string
  status: string
  remarks: string | null
}

interface StudentAttendance {
  studentId: string
  studentName: string
  records: AttendanceRecord[]
  summary: { total: number; present: number; absent: number; leave: number; late: number; halfDay: number; percentage: number }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  present: { label: 'Present', className: 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10' },
  absent: { label: 'Absent', className: 'bg-red-500/10 text-red-600 hover:bg-red-500/10' },
  leave: { label: 'Leave', className: 'bg-sky-500/10 text-sky-600 hover:bg-sky-500/10' },
  late: { label: 'Late', className: 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/10' },
  half_day: { label: 'Half Day', className: 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/10' },
}

export function ParentAttendancePage() {
  const searchParams = useSearchParams()
  const queryStudentId = searchParams.get('studentId')
  const { toast } = useToast()

  const now = new Date()
  const [children, setChildren] = useState<ChildOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [attendance, setAttendance] = useState<StudentAttendance | null>(null)
  const [loadingChildren, setLoadingChildren] = useState(true)
  const [loadingData, setLoadingData] = useState(false)

  // Load the child list (active only — disabled students have no portal access).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get<{ children: ChildOption[] }>('/api/parent/children')
        if (cancelled) return
        const active = (res?.children || []).filter((c) => c.isActive)
        setChildren(active)
        const valid = queryStudentId && active.some((c) => c.id === queryStudentId)
        setSelectedId(valid ? queryStudentId! : active[0]?.id || '')
      } catch {
        if (!cancelled) {
          toast({ title: "Couldn't load your children", variant: 'destructive' })
        }
      } finally {
        if (!cancelled) setLoadingChildren(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [queryStudentId, toast])

  const fetchAttendance = useCallback(async () => {
    if (!selectedId) return
    setLoadingData(true)
    try {
      const res = await api.get<{ attendance: StudentAttendance[] }>('/api/parent/attendance', {
        studentId: selectedId,
        month: String(month),
        year: String(year),
      })
      setAttendance(res?.attendance?.[0] || null)
    } catch {
      toast({ title: "Couldn't load attendance", variant: 'destructive' })
      setAttendance(null)
    } finally {
      setLoadingData(false)
    }
  }, [selectedId, month, year, toast])

  useEffect(() => {
    void fetchAttendance()
  }, [fetchAttendance])

  const goPrevMonth = () => {
    setMonth((m) => (m === 1 ? 12 : m - 1))
    if (month === 1) setYear((y) => y - 1)
  }
  const goNextMonth = () => {
    setMonth((m) => (m === 12 ? 1 : m + 1))
    if (month === 12) setYear((y) => y + 1)
  }
  // Don't allow navigating into the future.
  const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)

  if (loadingChildren) return <LoadingState />

  if (children.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance" description="Attendance for your children" />
        <EmptyState
          icon={CalendarDays}
          title="No active children"
          description="No active students are linked to your account. Please contact the school administration."
        />
      </div>
    )
  }

  const s = attendance?.summary

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Monthly attendance for your children" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {children.length > 1 ? (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="Select a child" />
            </SelectTrigger>
            <SelectContent>
              {children.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="font-medium">{children[0]?.fullName}</p>
        )}

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-8" onClick={goPrevMonth} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium">
            {MONTHS[month - 1]} {year}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={goNextMonth}
            disabled={isCurrentOrFuture}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Attendance" value={`${s?.percentage || 0}%`} icon={Percent} description="this month" />
        <StatsCard title="Present" value={s?.present || 0} icon={CalendarCheck} description="days present" />
        <StatsCard title="Absent" value={s?.absent || 0} icon={CalendarX} description="days absent" />
        <StatsCard title="Teaching Days" value={s?.total || 0} icon={CalendarDays} description="in this month" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Records</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="flex justify-center py-10">
              <div className="size-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
            </div>
          ) : !attendance || attendance.records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No attendance marked for {MONTHS[month - 1]} {year}.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {attendance.records.map((r) => {
                const badge = STATUS_BADGE[r.status] || { label: r.status, className: 'bg-muted text-muted-foreground' }
                return (
                  <li key={r.date} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                      </span>
                      {r.remarks && <span className="text-xs text-muted-foreground">{r.remarks}</span>}
                    </div>
                    <Badge className={`${badge.className} text-[10px]`}>{badge.label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
