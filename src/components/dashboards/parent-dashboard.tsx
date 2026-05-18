'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { StatsCard } from '@/components/shared'
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
  IndianRupee,
  ClipboardList,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  Phone,
  Loader2,
  ShieldOff,
  AlertTriangle,
  Megaphone,
} from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

// ============================================
// Types
// ============================================

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

// ============================================
// Main Component
// ============================================

export function ParentDashboard() {
  const { user, setCurrentPage, setSelectedStudentId } = useAppStore()
  const { toast } = useToast()

  const [dashboardData, setDashboardData] = useState<ParentDashboardData | null>(null)
  const [children, setChildren] = useState<ChildInfo[]>([])
  const [loading, setLoading] = useState(true)

  // Password change state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.get<ParentDashboardData>('/api/school/dashboard', undefined, { skipLogoutOn401: true })
      setDashboardData(data)
    } catch {
      // Dashboard fetch failed
    }
  }, [])

  // Fetch children
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

  // Password change handler
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
      toast({ title: 'Passwords Don\'t Match', description: "The passwords you entered don't match. Please type the same password in both fields.", variant: 'destructive' })
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

  // View child details
  const handleViewChild = (child: ChildInfo) => {
    if (!child.isActive) {
      toast({
        title: 'Access Restricted',
        description: 'This student\'s account has been disabled by the school. Please contact the school administration.',
        variant: 'destructive',
      })
      return
    }
    setSelectedStudentId(child.id)
    setCurrentPage('student-detail')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
      </div>
    )
  }

  const activeChildren = children.filter(c => c.isActive)
  const disabledChildren = children.filter(c => !c.isActive)
  const stats = dashboardData?.stats
  const announcements = dashboardData?.announcements || []
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString('en-IN')}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parent Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome, {user?.name}!</p>
        </div>
        <Button variant="outline" onClick={() => setShowPasswordDialog(true)} className="gap-2 shrink-0">
          <Lock className="size-4" /> Change Password
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="My Children" value={stats?.totalChildren || children.length} icon={Baby} description="total linked" />
        <StatsCard title="Active" value={stats?.activeChildren || activeChildren.length} icon={GraduationCap} description="currently active" />
        <StatsCard title="Pending Fees" value={stats?.totalPendingFees ? formatCurrency(stats.totalPendingFees) : '₹0'} icon={IndianRupee} description="total outstanding" />
        <StatsCard title="Attendance" value={`${stats?.attendancePercent || 0}%`} icon={ClipboardList} description="average attendance" />
      </div>

      {/* Active Children List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Children</CardTitle>
        </CardHeader>
        <CardContent>
          {children.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Baby className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No children found linked to your account.</p>
              <p className="text-xs mt-1">Please contact the school administration.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeChildren.map((child) => (
                <div key={child.id} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary shrink-0">
                    {child.profileImage ? (
                      <img src={child.profileImage} alt={child.fullName} className="size-full rounded-full object-cover" />
                    ) : (
                      child.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{child.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {child.className && <span>{child.className}</span>}
                      {child.sectionName && <span> - {child.sectionName}</span>}
                      {child.rollNumber && <span> • Roll: {child.rollNumber}</span>}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {child.admissionNumber && (
                        <Badge variant="outline" className="font-mono text-[10px]">{child.admissionNumber}</Badge>
                      )}
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-[10px]">
                        {child.admissionStatus || 'Admitted'}
                      </Badge>
                      {child.gender && <span className="text-xs text-muted-foreground">{child.gender}</span>}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleViewChild(child)}>
                    View Details
                  </Button>
                </div>
              ))}

              {/* Disabled children section */}
              {disabledChildren.length > 0 && (
                <>
                  <Separator />
                  <div className="pt-2">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldOff className="size-4 text-destructive" />
                      <p className="text-sm font-medium text-destructive">Disabled Students</p>
                      <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                        {disabledChildren.length}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {disabledChildren.map((child) => (
                        <div key={child.id} className="flex items-center gap-4 p-4 rounded-lg border border-destructive/30 bg-destructive/5 dark:bg-destructive/5 dark:border-destructive/20 opacity-75">
                          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-lg font-bold text-destructive shrink-0">
                            {child.profileImage ? (
                              <img src={child.profileImage} alt={child.fullName} className="size-full rounded-full object-cover grayscale" />
                            ) : (
                              child.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-destructive line-through decoration-destructive/50">{child.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {child.className && <span>{child.className}</span>}
                              {child.sectionName && <span> - {child.sectionName}</span>}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5">
                              {child.admissionNumber && (
                                <Badge variant="outline" className="font-mono text-[10px] border-destructive/30 text-destructive">{child.admissionNumber}</Badge>
                              )}
                              <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10 text-[10px] gap-1">
                                <ShieldOff className="size-3" /> Disabled
                              </Badge>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Button variant="ghost" size="sm" disabled className="text-muted-foreground cursor-not-allowed">
                              View Details
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-3 rounded-md bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/10 p-3">
                      <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium text-amber-700 dark:text-amber-400">Access Restricted</p>
                        <p className="text-amber-600 dark:text-amber-500">These students have been disabled by the school. You cannot view their details, attendance, or fee information. Please contact the school administration for assistance.</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Announcements + Account Info */}
      <div className="grid gap-6 lg:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Login ID (Phone Number)</p>
                <p className="font-medium font-mono">{user?.phone || '--'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Name</p>
                <p className="font-medium">{user?.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">School</p>
                <p className="font-medium">{user?.schoolId ? 'Assigned' : '--'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Default Password</p>
                <p className="font-medium">parent123</p>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="flex items-center gap-2 rounded-md bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/10 p-3">
              <Lock className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">Change your default password</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">For security, please change your password from the default &quot;parent123&quot;</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setShowPasswordDialog(true)}>
                Change
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <VisuallyHidden>
            <DialogTitle>Change Password</DialogTitle>
          </VisuallyHidden>
          <DialogDescription className="sr-only">Change your account password</DialogDescription>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Lock className="size-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Change Password</h3>
                <p className="text-sm text-muted-foreground">Update your account password</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Current Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrentPwd ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                    onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                  >
                    {showCurrentPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>New Password</Label>
                <div className="relative">
                  <Input
                    type={showNewPwd ? 'text' : 'password'}
                    placeholder="Enter new password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                  >
                    {showNewPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
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
