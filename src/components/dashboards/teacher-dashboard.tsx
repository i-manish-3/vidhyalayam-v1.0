'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatsCard, LoadingState, EmptyState } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { BookOpen, Calendar, GraduationCap, IndianRupee, Clock, ClipboardList, Megaphone } from 'lucide-react'

interface TeacherDashboardData {
  role: string
  teacherId: string
  teacherName: string
  stats: {
    myClasses: number
    todayPeriods: number
    totalStudents: number
    netSalary: number
  }
  schedule: Array<{
    period: number
    subject: string
    class: string
    section: string
    className: string
    room: string
    startTime: string
    endTime: string
  }>
  salary: {
    basic: number
    hra: number
    da: number
    gross: number
    deductions: number
    net: number
  } | null
  announcements: Array<{
    id: string
    title: string
    priority: string
    createdAt: string
  }>
}

export function TeacherDashboard() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<TeacherDashboardData | null>(null)
  const router = useRouter()
  const { user } = useAppStore()

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await api.get<TeacherDashboardData>('/api/school/dashboard', undefined, { skipLogoutOn401: true })
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

  const today = new Date()
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const stats = data?.stats
  const schedule = data?.schedule || []
  const salary = data?.salary
  const announcements = data?.announcements || []

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Teacher Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {data?.teacherName || user?.name}! {dateStr}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="My Classes" value={stats?.myClasses || 0} icon={BookOpen} description="Assigned classes" />
        <StatsCard title="Today's Periods" value={stats?.todayPeriods || 0} icon={Calendar} description={dayName} />
        <StatsCard title="Total Students" value={stats?.totalStudents || 0} icon={GraduationCap} description="across all classes" />
        <StatsCard
          title="Monthly Salary"
          value={salary ? formatCurrency(salary.net) : '--'}
          icon={IndianRupee}
          description="Net pay"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Today&apos;s Schedule — {dayName}</CardTitle>
            <CardDescription>Your timetable for today</CardDescription>
          </CardHeader>
          <CardContent>
            {schedule.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No Classes Today"
                description="You don't have any classes scheduled for today. Enjoy your free day!"
              />
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
                    <div className="text-right">
                      <Badge variant="secondary">{item.className}</Badge>
                      {item.room && <p className="text-xs text-muted-foreground mt-1">Room {item.room}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => router.push('/attendance/mark')}>
                <ClipboardList className="size-4 text-[var(--button-primary,var(--primary))]" /> Mark Attendance
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => router.push('/exams')}>
                <BookOpen className="size-4 text-[var(--button-primary,var(--primary))]" /> Enter Exam Marks
              </Button>
              <Button variant="outline" className="w-full justify-start gap-3 h-11" onClick={() => router.push('/academics/timetable')}>
                <Clock className="size-4 text-[var(--button-primary,var(--primary))]" /> View Timetable
              </Button>
            </CardContent>
          </Card>

          {salary ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Salary Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Basic</span>
                    <span className="font-medium">{formatCurrency(salary.basic)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">HRA + DA</span>
                    <span className="font-medium">{formatCurrency(salary.hra + salary.da)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deductions</span>
                    <span className="font-medium text-destructive">-{formatCurrency(salary.deductions)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                    <span>Net Pay</span>
                    <span>{formatCurrency(salary.net)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Salary Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No salary structure assigned yet. Contact your school administrator.</p>
              </CardContent>
            </Card>
          )}

          {announcements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Megaphone className="size-4" /> Announcements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {announcements.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                      <Badge variant={a.priority === 'urgent' ? 'destructive' : a.priority === 'high' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                        {a.priority}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{a.title}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
