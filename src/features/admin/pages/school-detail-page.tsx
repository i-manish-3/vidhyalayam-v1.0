'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, type PageName } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Pencil,
  Save,
  X,
  Loader2,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  GraduationCap,
  Users,
  Calendar,
  Shield,
  BookOpen,
  Clock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { SCHOOL_THEME_PALETTES, findSchoolThemePalette } from '@/lib/theme-palettes'

interface SchoolDetail {
  id: string
  name: string
  logo?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  contactPhone?: string
  contactEmail?: string
  website?: string
  academicYear?: string
  board?: string
  timezone?: string
  currency?: string
  subdomain: string
  status: string
  trialEndsAt?: string
  onboardingDate?: string
  primaryColor?: string
  features?: string
  favicon?: string
  createdAt: string
  updatedAt: string
  studentCount?: number
  teacherCount?: number
  admin?: {
    id: string
    name: string
    email: string
    phone?: string
    lastLoginAt?: string
    isLocked?: boolean
    lockedUntil?: string | null
    failedAttempts?: number
  }
}

interface EditFormData {
  name: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
  contactPhone: string
  contactEmail: string
  website: string
  academicYear: string
  board: string
  status: string
  primaryColor: string
  timezone: string
  currency: string
}

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'NIOS', 'Other']
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-800' },
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'trial', label: 'Trial', color: 'bg-blue-100 text-blue-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-800' },
]

export function SchoolDetailPage() {
  const { toast } = useToast()
  const { selectedSchoolId, setCurrentPage } = useAppStore()
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditFormData>({
    name: '', address: '', city: '', state: '', pincode: '', country: 'India',
    contactPhone: '', contactEmail: '', website: '', academicYear: '2025-2026',
    board: 'CBSE', status: 'active', primaryColor: '', timezone: 'Asia/Kolkata', currency: 'INR',
  })
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [unlockingAdmin, setUnlockingAdmin] = useState(false)

  const fetchSchool = useCallback(async () => {
    if (!selectedSchoolId) return
    setLoading(true)
    try {
      const res = await api.get<SchoolDetail>(`/api/super-admin/schools/${selectedSchoolId}`)
      setSchool(res)
      setEditForm({
        name: res.name || '',
        address: res.address || '',
        city: res.city || '',
        state: res.state || '',
        pincode: res.pincode || '',
        country: res.country || 'India',
        contactPhone: res.contactPhone || '',
        contactEmail: res.contactEmail || '',
        website: res.website || '',
        academicYear: res.academicYear || '2025-2026',
        board: res.board || 'CBSE',
        status: res.status || 'active',
        primaryColor: res.primaryColor || '',
        timezone: res.timezone || 'Asia/Kolkata',
        currency: res.currency || 'INR',
      })
    } catch {
      toast({ title: "Couldn't Load School Details", description: "We couldn't load the school details. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [selectedSchoolId, toast])

  useEffect(() => { fetchSchool() }, [fetchSchool])

  const handleSave = async () => {
    if (!selectedSchoolId) return
    setSaving(true)
    try {
      await api.patch(`/api/super-admin/schools/${selectedSchoolId}`, editForm)
      toast({ title: 'Success', description: 'School details updated successfully.' })
      setEditing(false)
      fetchSchool()
    } catch (err) {
      toast({ title: "Couldn't Update School", description: err instanceof Error ? err.message : "We couldn't update the school. Please try again.", variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const goBack = () => {
    setCurrentPage('schools' as PageName)
  }

  const handleUnlockAdmin = async () => {
    if (!school?.admin?.id) return
    setUnlockingAdmin(true)
    try {
      await api.post(`/api/super-admin/users/${school.admin.id}/unlock`, {})
      toast({
        title: 'Account Unlocked',
        description: `${school.admin.name} can now log in immediately.`,
      })
      fetchSchool()
    } catch (err) {
      toast({
        title: "Couldn't Unlock Account",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setUnlockingAdmin(false)
    }
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const statusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find(o => o.value === status)
    if (!option) return <Badge>{status}</Badge>
    return <Badge className={cn(option.color, 'hover:opacity-90')}>{option.label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!school) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Building2 className="size-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold">School Not Found</h3>
        <Button onClick={goBack} variant="outline" className="mt-4">Go Back to Schools</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              {school.logo ? (
                <img src={school.logo} alt={school.name} className="size-12 rounded-xl object-cover" />
              ) : (
                <GraduationCap className="size-6" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{school.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm text-muted-foreground">{school.subdomain}</span>
                {statusBadge(school.status)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                <X className="size-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-2" />
              Edit School
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{school.studentCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 shrink-0">
              <BookOpen className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{school.teacherCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Teachers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
              <Calendar className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold">{school.academicYear || '-'}</p>
              <p className="text-xs text-muted-foreground">Academic Year</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700 shrink-0">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-sm font-bold">{formatDate(school.onboardingDate)}</p>
              <p className="text-xs text-muted-foreground">Onboarded</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General Info</TabsTrigger>
          <TabsTrigger value="contact">Contact & Address</TabsTrigger>
          <TabsTrigger value="admin">Admin Account</TabsTrigger>
        </TabsList>

        {/* General Info Tab */}
        <TabsContent value="general" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>School Information</CardTitle>
              <CardDescription>Basic details about the school</CardDescription>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>School Name</Label>
                      <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Subdomain</Label>
                      <Input value={school.subdomain} disabled className="bg-muted" />
                      <p className="text-xs text-muted-foreground">Subdomain cannot be changed after creation</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Board</Label>
                      <Select value={editForm.board} onValueChange={v => setEditForm(f => ({ ...f, board: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BOARDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Academic Year</Label>
                      <Input value={editForm.academicYear} onChange={e => setEditForm(f => ({ ...f, academicYear: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Color Palette</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {SCHOOL_THEME_PALETTES.map((palette) => {
                          const isSelected = (editForm.primaryColor || '').toLowerCase() === palette.primary.toLowerCase()
                          return (
                            <button
                              key={palette.id}
                              type="button"
                              onClick={() => setEditForm(f => ({ ...f, primaryColor: palette.primary }))}
                              className={cn(
                                'flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-xs font-medium transition-colors hover:border-primary',
                                isSelected && 'border-primary ring-2 ring-primary/20'
                              )}
                            >
                              <span className="size-4 rounded-full border" style={{ backgroundColor: palette.primary }} />
                              <span>{palette.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Input value={editForm.timezone} onChange={e => setEditForm(f => ({ ...f, timezone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Input value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <DetailRow icon={Building2} label="School Name" value={school.name} />
                  <DetailRow icon={Globe} label="Subdomain" value={school.subdomain} />
                  <DetailRow icon={BookOpen} label="Board" value={school.board} />
                  <DetailRow icon={Calendar} label="Academic Year" value={school.academicYear} />
                  <DetailRow icon={Shield} label="Status" value={statusBadge(school.status)} />
                  {school.primaryColor && (
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="size-4 rounded shrink-0" style={{ backgroundColor: school.primaryColor }} />
                      <span className="text-sm text-muted-foreground w-36 shrink-0">Color Palette</span>
                      <span className="text-sm">{findSchoolThemePalette(school.primaryColor).name} ({school.primaryColor})</span>
                    </div>
                  )}
                  <DetailRow icon={Clock} label="Timezone" value={school.timezone} />
                  <Separator />
                  <DetailRow icon={Calendar} label="Created" value={formatDateTime(school.createdAt)} />
                  <DetailRow icon={Calendar} label="Last Updated" value={formatDateTime(school.updatedAt)} />
                  <DetailRow icon={Calendar} label="Onboarding Date" value={formatDate(school.onboardingDate)} />
                  {school.trialEndsAt && (
                    <DetailRow icon={Clock} label="Trial Ends" value={formatDate(school.trialEndsAt)} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact & Address Tab */}
        <TabsContent value="contact" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact & Address</CardTitle>
              <CardDescription>School contact information and address</CardDescription>
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Pincode</Label>
                      <Input value={editForm.pincode} onChange={e => setEditForm(f => ({ ...f, pincode: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Country</Label>
                      <Input value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Contact Phone</Label>
                      <Input value={editForm.contactPhone} onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Email</Label>
                      <Input type="email" value={editForm.contactEmail} onChange={e => setEditForm(f => ({ ...f, contactEmail: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Website</Label>
                    <Input value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <DetailRow icon={MapPin} label="Address" value={school.address} />
                  <DetailRow icon={MapPin} label="City" value={school.city} />
                  <DetailRow icon={MapPin} label="State" value={school.state} />
                  <DetailRow icon={MapPin} label="Pincode" value={school.pincode} />
                  <DetailRow icon={MapPin} label="Country" value={school.country} />
                  <Separator />
                  <DetailRow icon={Phone} label="Contact Phone" value={school.contactPhone} />
                  <DetailRow icon={Mail} label="Contact Email" value={school.contactEmail} />
                  <DetailRow icon={Globe} label="Website" value={school.website} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Account Tab */}
        <TabsContent value="admin" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>School Administrator</CardTitle>
              <CardDescription>Primary admin account for this school</CardDescription>
            </CardHeader>
            <CardContent>
              {school.admin ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <User className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold">{school.admin.name}</p>
                      <p className="text-sm text-muted-foreground">{school.admin.email}</p>
                      {school.admin.phone && (
                        <p className="text-sm text-muted-foreground">{school.admin.phone}</p>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {school.admin.isLocked && (
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="size-3" />
                          Locked
                        </Badge>
                      )}
                      <Badge>School Admin</Badge>
                    </div>
                  </div>
                  {school.admin.isLocked && school.admin.lockedUntil && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                      <AlertTriangle className="size-5 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-900">
                          Account Temporarily Locked
                        </p>
                        <p className="text-xs text-red-700 mt-0.5">
                          This admin entered the wrong password too many times. Auto-unlocks at{' '}
                          <strong>{formatDateTime(school.admin.lockedUntil)}</strong>
                          {school.admin.failedAttempts ? ` (${school.admin.failedAttempts} failed attempts)` : ''}.
                          You can override and unlock immediately.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800 shrink-0"
                        onClick={handleUnlockAdmin}
                        disabled={unlockingAdmin}
                      >
                        {unlockingAdmin ? (
                          <Loader2 className="size-3.5 animate-spin mr-1.5" />
                        ) : (
                          <LockOpen className="size-3.5 mr-1.5" />
                        )}
                        Unlock Now
                      </Button>
                    </div>
                  )}
                  <DetailRow icon={Clock} label="Last Login" value={formatDateTime(school.admin.lastLoginAt)} />
                  <div className="pt-3">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setNewPassword('')
                        setConfirmPassword('')
                        setShowPassword(false)
                        setShowResetDialog(true)
                      }}
                    >
                      <KeyRound className="size-4" />
                      Reset Password
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <User className="size-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No admin account assigned to this school</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reset Password Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Admin Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{school.admin?.name}</strong> ({school.admin?.email}). The admin will need to use this new password to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password *</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter the new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match.</p>
            )}
            {newPassword && newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-sm text-destructive">Password must be at least 6 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!selectedSchoolId || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword) return
                setResettingPassword(true)
                try {
                  await api.post(`/api/super-admin/schools/${selectedSchoolId}/reset-password`, { newPassword })
                  toast({ title: 'Password Reset', description: `Password for ${school.admin?.name} has been reset successfully.` })
                  setShowResetDialog(false)
                  setNewPassword('')
                  setConfirmPassword('')
                } catch (err) {
                  toast({ title: "Couldn't Reset Password", description: err instanceof Error ? err.message : "We couldn't reset the password. Please try again.", variant: 'destructive' })
                } finally {
                  setResettingPassword(false)
                }
              }}
              disabled={resettingPassword || !newPassword || newPassword.length < 6 || !confirmPassword || newPassword !== confirmPassword}
            >
              {resettingPassword ? <><Loader2 className="size-4 animate-spin mr-2" />Resetting...</> : <><KeyRound className="size-4 mr-2" />Reset Password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: React.ReactNode }) {
  const displayValue = value === null || value === undefined || value === '' ? '-' : value
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-sm">{displayValue}</span>
    </div>
  )
}
