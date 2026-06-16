'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { LoadingState } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Baby,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  EyeOff,
  GraduationCap,
  IndianRupee,
  Loader2,
  Lock,
  Megaphone,
  Phone,
  Receipt,
  School,
  ShieldOff,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

const SIBLING_ACCENTS = [
  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
  'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
  'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
  'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20',
]

interface ParentDashboardData {
  role: string
  parentId: string
  stats: {
    totalChildren: number
    activeChildren: number
    totalPendingFees: number
    attendancePercent: number
  }
  children: Array<{
    id: string
    studentId: string
    name: string
    admissionNumber: string | null
    className: string | null
    sectionName: string | null
    isActive: boolean
    attendancePercent: number
  }>
  announcements: Array<{
    id: string
    title: string
    priority: string
    createdAt: string
  }>
}

interface ChildInfo {
  id: string
  admissionNumber: string | null
  firstName: string
  lastName: string
  fullName: string
  rollNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  bloodGroup: string | null
  profileImage: string | null
  admissionStatus: string | null
  isActive: boolean
  className: string | null
  sectionName: string | null
  academicYear: string | null
}

function formatCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString('en-IN')}`
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function StatTile({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'amber' | 'rose'
}) {
  const toneMap = {
    sky: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/20',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl border ${toneMap[tone]}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ParentDashboard() {
  const router = useRouter()
  const { user } = useAppStore()
  const { toast } = useToast()

  const [dashboardData, setDashboardData] = useState<ParentDashboardData | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [loading, setLoading] = useState(true)

  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [focusChildIndex, setFocusChildIndex] = useState(0)

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.get<ParentDashboardData>('/api/school/dashboard', undefined, { skipLogoutOn401: true })
      setDashboardData(data)
    } catch {
      // Dashboard fetch failed. Child data still renders from the parent endpoint.
    }
  }, [])

  const fetchChildren = useCallback(async () => {
    try {
      const data = await api.get<{ children: ChildInfo[] }>('/api/parent/children', undefined, { skipLogoutOn401: true })
      setChildren(data?.children || [])
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchDashboard(), fetchChildren()])
    }
    init()
  }, [fetchDashboard, fetchChildren])

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Missing Information', description: 'Please fill in all the fields to change your password.', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'Password Too Short', description: 'Your new password must be at least 6 characters long.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords Don't Match", description: "The passwords you entered don't match. Please type the same password in both fields.", variant: 'destructive' })
      return
    }

    setChangingPassword(true)
    try {
      await api.post('/api/auth/change-password', { currentPassword, newPassword })
      toast({ title: 'Success', description: 'Password changed successfully' })
      setShowPasswordDialog(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast({ title: "Couldn't Change Password", description: err instanceof Error ? err.message : "We couldn't change your password. Please try again.", variant: 'destructive' })
    } finally {
      setChangingPassword(false)
    }
  }

  const activeChildren = useMemo(() => children.filter((child) => child.isActive), [children])
  const attendanceByStudentId = useMemo(() => {
    const map = new Map<string, number>()
    for (const child of dashboardData?.children || []) {
      map.set(child.id, child.attendancePercent)
      map.set(child.studentId, child.attendancePercent)
    }
    return map
  }, [dashboardData?.children])

  if (loading) return <LoadingState />

  const stats = dashboardData?.stats
  const announcements = dashboardData?.announcements || []
  const totalChildren = stats?.totalChildren || children.length
  const totalActiveChildren = stats?.activeChildren || activeChildren.length
  const totalPendingFees = stats?.totalPendingFees || 0
  const averageAttendance = clampPercent(stats?.attendancePercent || 0)
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'Parent'
  const focusChildren = activeChildren.length > 0 ? activeChildren : children
  const normalizedFocusIndex = focusChildren.length > 0 ? focusChildIndex % focusChildren.length : 0
  const primaryChild = focusChildren[normalizedFocusIndex]
  const primaryAttendance = primaryChild ? clampPercent(attendanceByStudentId.get(primaryChild.id) ?? averageAttendance) : 0
  const activePercent = totalChildren > 0 ? clampPercent((totalActiveChildren / totalChildren) * 100) : 0
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long' })

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.35fr_0.65fr] lg:p-7">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Sparkles className="size-3.5" />
              {today}
            </div>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Good to see you, {firstName}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Keep an eye on your children&apos;s attendance, fee status, and school updates from one calm parent workspace.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => router.push('/my-children')}>
                <UsersRound className="mr-2 size-4" />
                View Children
              </Button>
              <Button variant="outline" onClick={() => router.push('/my-children/fees')}>
                <Receipt className="mr-2 size-4" />
                Fee Details
              </Button>
              <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
                <Lock className="mr-2 size-4" />
                Change Password
              </Button>
            </div>
          </div>

          <div className="self-center rounded-2xl border bg-muted/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Child Focus</p>
              {focusChildren.length > 1 ? (
                <Badge variant="outline" className="gap-1.5">
                  <UsersRound className="size-3.5" />
                  {normalizedFocusIndex + 1}/{focusChildren.length}
                </Badge>
              ) : primaryChild?.isActive ? (
                <Badge className="gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  Active
                </Badge>
              ) : (
                primaryChild && (
                  <Badge variant="destructive" className="gap-1.5">
                    <ShieldOff className="size-3.5" />
                    Disabled
                  </Badge>
                )
              )}
            </div>
            {primaryChild ? (
              <div className={`relative mt-4 space-y-4 ${focusChildren.length > 1 ? 'px-9' : ''}`}>
                {focusChildren.length > 1 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Previous child"
                      className="absolute left-0 top-1/2 size-8 -translate-y-1/2 rounded-full bg-background/95 shadow-sm"
                      onClick={() => setFocusChildIndex((index) => (index - 1 + focusChildren.length) % focusChildren.length)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Next child"
                      className="absolute right-0 top-1/2 size-8 -translate-y-1/2 rounded-full bg-background/95 shadow-sm"
                      onClick={() => setFocusChildIndex((index) => (index + 1) % focusChildren.length)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </>
                )}
                <div className="flex items-center gap-3">
                  <div className={`flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-bold ${SIBLING_ACCENTS[normalizedFocusIndex % SIBLING_ACCENTS.length]}`}>
                    {primaryChild.profileImage ? (
                      <img src={primaryChild.profileImage} alt={primaryChild.fullName} className="size-full object-cover" />
                    ) : (
                      getInitials(primaryChild.fullName)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-bold leading-tight">{primaryChild.fullName}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {primaryChild.className || 'Class not assigned'}
                      {primaryChild.sectionName ? ` - ${primaryChild.sectionName}` : ''}
                      {primaryChild.rollNumber ? ` - Roll ${primaryChild.rollNumber}` : ''}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground">Attendance</span>
                    <span className="font-semibold">{primaryAttendance}%</span>
                  </div>
                  <Progress value={primaryAttendance} />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!primaryChild.isActive}
                  onClick={() => router.push(`/my-children/attendance?studentId=${primaryChild.id}`)}
                >
                  <CalendarCheck className="mr-2 size-4" />
                  View Attendance
                </Button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-5 text-center">
                <Baby className="mx-auto size-9 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">No children linked</p>
                <p className="mt-1 text-xs text-muted-foreground">Please contact the school office to connect your account.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile title="Linked Children" value={totalChildren} icon={Baby} description="Students connected to you" tone="sky" />
        <StatTile title="Active Students" value={totalActiveChildren} icon={GraduationCap} description={`${activePercent}% currently active`} tone="emerald" />
        <StatTile title="Pending Fees" value={formatCurrency(totalPendingFees)} icon={IndianRupee} description={totalPendingFees > 0 ? 'Outstanding balance' : 'Nothing due'} tone={totalPendingFees > 0 ? 'rose' : 'emerald'} />
        <StatTile title="Attendance" value={`${averageAttendance}%`} icon={ClipboardList} description="Average across children" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="size-5 text-primary" />
              Announcements
            </CardTitle>
            <CardDescription>Latest school updates</CardDescription>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-center">
                <Megaphone className="mx-auto size-8 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-medium">No announcements right now</p>
                <p className="mt-1 text-xs text-muted-foreground">New updates from school administration will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {announcements.slice(0, 4).map((announcement) => (
                  <div key={announcement.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <Badge variant={announcement.priority === 'urgent' ? 'destructive' : announcement.priority === 'high' ? 'default' : 'secondary'} className="text-[10px]">
                        {announcement.priority}
                      </Badge>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatShortDate(announcement.createdAt)}</span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold">{announcement.title}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>Parent login and school link</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Phone className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Login ID</p>
                  <p className="truncate font-medium">{user?.phone || '--'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="truncate font-medium">{user?.name || '--'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <School className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">School</p>
                  <p className="truncate font-medium">{user?.schoolId ? 'Assigned' : '--'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Keep your account secure</p>
                  <p className="mt-1 text-xs leading-5 text-amber-700/80 dark:text-amber-300/80">If you still use the default password, update it now.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setShowPasswordDialog(true)}>
                Change Password
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <VisuallyHidden>
            <DialogTitle>Change Password</DialogTitle>
          </VisuallyHidden>
          <DialogDescription className="sr-only">Change your account password</DialogDescription>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Lock className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Change Password</h3>
                <p className="text-sm text-muted-foreground">Update your account password</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <div className="relative">
                  <Input
                    id="current-password"
                    type={showCurrentPwd ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                    onClick={() => setShowCurrentPwd((value) => !value)}
                  >
                    {showCurrentPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPwd ? 'text' : 'password'}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                    onClick={() => setShowNewPwd((value) => !value)}
                  >
                    {showNewPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPwd ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                    onClick={() => setShowConfirmPwd((value) => !value)}
                  >
                    {showConfirmPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
