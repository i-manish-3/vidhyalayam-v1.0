'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatsCard, LoadingState } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { ClipboardList, IndianRupee, Award, Calendar, Clock, Megaphone } from 'lucide-react'

interface StudentDashboardData {
  role: string
  studentId: string
  studentName: string
  className: string | null
  sectionName: string | null
  stats: {
    attendance: string
    pendingFees: number
    upcomingExams: number
    todayClasses: number
  }
  schedule: Array<{
    period: number
    subject: string
    teacher: string
    startTime: string
    endTime: string
  }>
  feeStatus: Array<{
    feeHead: string
    amount: number
    paid: number
    due: number
    status: string
    dueDate: string | null
  }>
}

export function StudentDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<StudentDashboardData | null>(null)
  const { setCurrentPage, user } = useAppStore()

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api.get<StudentDashboardData>('/api/school/dashboard', undefined, { skipLogoutOn401: true })
      setData(result)
    } catch {
      // Dashboard fetch failed - will show fallback
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  if (loading) return <LoadingState />

  const stats = data?.stats
  const schedule = data?.schedule || []
  const feeStatus = data?.feeStatus || []
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

  const pendingFeeItems = feeStatus.filter(f => f.status !== 'paid')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Student Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome, {data?.studentName || user?.name}!
          {data?.className && <span className="ml-2 text-xs"><Badge variant="outline">{data.className}{data.sectionName ? ` - ${data.sectionName}` : ''}</Badge></span>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Attendance" value={stats?.attendance || '0%'} icon={ClipboardList} description="this semester" />
        <StatsCard title="Pending Fees" value={stats?.pendingFees ? formatCurrency(stats.pendingFees) : '₹0'} icon={IndianRupee} description="outstanding" />
        <StatsCard title="Upcoming Exams" value={stats?.upcomingExams || 0} icon={Award} description="upcoming" />
        <StatsCard title="Today's Classes" value={stats?.todayClasses || 0} icon={Calendar} description="scheduled today" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            {schedule.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Calendar className="size-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No classes scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {schedule.map((item) => (
                  <div key={item.period} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary shrink-0">
                      P{item.period}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.startTime && item.endTime ? `${item.startTime} - ${item.endTime}` : `Period ${item.period}`}
                      </p>
                    </div>
                    {item.teacher && <Badge variant="secondary">{item.teacher}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fee Status</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingFeeItems.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-sm text-primary font-medium">All fees paid! 🎉</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingFeeItems.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{f.feeHead}</span>
                      <Badge variant={f.status === 'overdue' ? 'destructive' : 'secondary'}>
                        {formatCurrency(f.due)} Due
                      </Badge>
                    </div>
                  ))}
                  <div className="border-t pt-2">
                    <Button size="sm" className="w-full" onClick={() => setCurrentPage('fee-collections')}>
                      <IndianRupee className="size-4 mr-2" /> View Fee Details
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setCurrentPage('my-attendance')}>
                <ClipboardList className="size-4 text-[var(--button-primary,var(--primary))]" /> My Attendance
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setCurrentPage('exam-results')}>
                <Award className="size-4 text-[var(--button-primary,var(--primary))]" /> Exam Results
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => setCurrentPage('timetable')}>
                <Clock className="size-4 text-[var(--button-primary,var(--primary))]" /> View Timetable
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
