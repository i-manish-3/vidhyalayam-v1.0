'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Pencil,
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
  Info,
  Palette as PaletteIcon,
  CalendarClock,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { findSchoolThemePalette } from '@/lib/theme-palettes'
import { validatePassword, validatePasswordMatch } from '@/lib/validators'

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

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  pending: {
    label: 'Pending',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
  },
  active: {
    label: 'Active',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  },
  trial: {
    label: 'Trial',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  },
  suspended: {
    label: 'Suspended',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
  },
}

export function SchoolDetailPage({ schoolId }: { schoolId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [school, setSchool] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [unlockingAdmin, setUnlockingAdmin] = useState(false)

  const resetPwError = validatePassword(newPassword, 6)
  const resetPwMatchError = newPassword
    ? validatePasswordMatch(newPassword, confirmPassword)
    : null

  const fetchSchool = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<SchoolDetail>(`/api/super-admin/schools/${schoolId}`)
      setSchool(res)
    } catch {
      toast({ title: "Couldn't Load School Details", description: "We couldn't load the school details. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [schoolId, toast])

  useEffect(() => { fetchSchool() }, [fetchSchool])

  const goBack = () => {
    router.push('/admin/schools')
  }

  const handleEdit = () => {
    router.push(`/admin/schools/${schoolId}/edit`)
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
    const cfg = STATUS_CONFIG[status]
    if (!cfg) return <Badge variant="outline">{status}</Badge>
    return (
      <Badge variant="outline" className={cn('gap-1.5 border font-medium', cfg.badge)}>
        <span className={cn('size-1.5 rounded-full', cfg.dot)} />
        {cfg.label}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading school details...</p>
      </div>
    )
  }

  if (!school) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground/60 mb-4">
          <Building2 className="size-8" />
        </div>
        <h3 className="text-lg font-semibold">School Not Found</h3>
        <p className="text-sm text-muted-foreground mt-1">The school you’re looking for doesn’t exist or was removed.</p>
        <Button onClick={goBack} variant="outline" className="mt-5">
          <ArrowLeft className="size-4 mr-2" /> Back to Schools
        </Button>
      </div>
    )
  }

  const locationLine = [school.city, school.state].filter(Boolean).join(', ')
  const palette = school.primaryColor ? findSchoolThemePalette(school.primaryColor) : null

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleEdit} className="gap-1.5">
            <Pencil className="size-4" />
            Edit School
          </Button>
        </div>
      </div>

      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background dark:from-primary/20 dark:via-primary/10 dark:to-background"
      >
        {/* Decorative orbs */}
        <div className="absolute -top-24 -right-16 size-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-16 size-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />

        <div className="relative p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Logo */}
            <div className="relative shrink-0">
              <div className="size-20 sm:size-24 rounded-2xl ring-4 ring-background shadow-xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary">
                {school.logo ? (
                  <img src={school.logo} alt={school.name} className="size-full object-cover" />
                ) : (
                  <GraduationCap className="size-10" />
                )}
              </div>
              <div className={cn(
                'absolute -bottom-1 -right-1 size-5 rounded-full ring-2 ring-background',
                STATUS_CONFIG[school.status]?.dot || 'bg-muted-foreground'
              )} />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-start sm:items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{school.name}</h1>
                {statusBadge(school.status)}
              </div>

              <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Globe className="size-3.5" />
                <span className="font-mono">{school.subdomain}</span>
              </div>

              {/* Meta chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {school.board && (
                  <MetaChip icon={BookOpen} label={school.board} />
                )}
                {school.academicYear && (
                  <MetaChip icon={Calendar} label={school.academicYear} />
                )}
                {locationLine && (
                  <MetaChip icon={MapPin} label={locationLine} />
                )}
                {school.contactPhone && (
                  <MetaChip icon={Phone} label={school.contactPhone} />
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          delay={0.05}
          icon={Users}
          label="Students"
          value={(school.studentCount ?? 0).toLocaleString('en-IN')}
          tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          delay={0.1}
          icon={GraduationCap}
          label="Teachers"
          value={(school.teacherCount ?? 0).toLocaleString('en-IN')}
          tint="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          delay={0.15}
          icon={Calendar}
          label="Academic Year"
          value={school.academicYear || '-'}
          tint="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          small
        />
        <StatCard
          delay={0.2}
          icon={CalendarClock}
          label="Onboarded"
          value={formatDate(school.onboardingDate)}
          tint="bg-purple-500/10 text-purple-600 dark:text-purple-400"
          small
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-11 p-1 bg-muted/60">
          <TabsTrigger value="general" className="gap-1.5 data-[state=active]:shadow-sm">
            <Info className="size-3.5" />
            <span className="hidden sm:inline">General Info</span>
            <span className="sm:hidden">General</span>
          </TabsTrigger>
          <TabsTrigger value="contact" className="gap-1.5 data-[state=active]:shadow-sm">
            <MapPin className="size-3.5" />
            <span className="hidden sm:inline">Contact &amp; Address</span>
            <span className="sm:hidden">Contact</span>
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-1.5 data-[state=active]:shadow-sm">
            <User className="size-3.5" />
            <span className="hidden sm:inline">Admin Account</span>
            <span className="sm:hidden">Admin</span>
          </TabsTrigger>
        </TabsList>

        {/* General Info Tab */}
        <TabsContent value="general" className="mt-4">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <SectionHeader
              icon={Info}
              title="School Information"
              description="Basic details and operational settings"
            />
            <CardContent className="pt-5">
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DetailItem icon={Building2} label="School Name" value={school.name} />
                  <DetailItem icon={Globe} label="Subdomain" value={<span className="font-mono">{school.subdomain}</span>} />
                  <DetailItem icon={BookOpen} label="Board" value={school.board} />
                  <DetailItem icon={Calendar} label="Academic Year" value={school.academicYear} />
                  <DetailItem icon={Shield} label="Status" value={statusBadge(school.status)} />
                  {palette ? (
                    <DetailItem
                      icon={PaletteIcon}
                      label="Color Palette"
                      value={
                        <span className="flex items-center gap-2">
                          <span className="size-3.5 rounded-full border" style={{ backgroundColor: school.primaryColor }} />
                          {palette.name}
                          <span className="text-muted-foreground text-xs">{school.primaryColor}</span>
                        </span>
                      }
                    />
                  ) : null}
                </div>

                <div className="rounded-xl border bg-muted/30 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Clock className="size-3.5" /> Timeline
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <DetailItem variant="ghost" icon={Calendar} label="Created" value={formatDateTime(school.createdAt)} />
                    <DetailItem variant="ghost" icon={Calendar} label="Last Updated" value={formatDateTime(school.updatedAt)} />
                    <DetailItem variant="ghost" icon={Calendar} label="Onboarding Date" value={formatDate(school.onboardingDate)} />
                    {school.trialEndsAt && (
                      <DetailItem variant="ghost" icon={Clock} label="Trial Ends" value={formatDate(school.trialEndsAt)} />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact & Address Tab */}
        <TabsContent value="contact" className="mt-4">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <SectionHeader
              icon={MapPin}
              title="Contact & Address"
              description="How students, parents, and partners reach this school"
            />
            <CardContent className="pt-5">
              <div className="space-y-5">
                {/* Address block */}
                <div className="rounded-xl border bg-muted/30 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> Address
                  </h4>
                  {(school.address || school.city || school.state || school.pincode) ? (
                    <p className="text-sm leading-relaxed">
                      {[school.address, school.city, school.state, school.pincode, school.country].filter(Boolean).join(', ')}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No address on file</p>
                  )}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <DetailItem variant="ghost" icon={MapPin} label="City" value={school.city} />
                    <DetailItem variant="ghost" icon={MapPin} label="State" value={school.state} />
                    <DetailItem variant="ghost" icon={MapPin} label="Pincode" value={school.pincode} />
                    <DetailItem variant="ghost" icon={MapPin} label="Country" value={school.country} />
                  </div>
                </div>

                {/* Contact block */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <ContactCard
                    icon={Phone}
                    label="Phone"
                    value={school.contactPhone}
                    href={school.contactPhone ? `tel:${school.contactPhone}` : undefined}
                    tint="from-emerald-500 to-teal-500"
                  />
                  <ContactCard
                    icon={Mail}
                    label="Email"
                    value={school.contactEmail}
                    href={school.contactEmail ? `mailto:${school.contactEmail}` : undefined}
                    tint="from-blue-500 to-indigo-500"
                  />
                  <ContactCard
                    icon={Globe}
                    label="Website"
                    value={school.website}
                    href={school.website || undefined}
                    tint="from-purple-500 to-pink-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Account Tab */}
        <TabsContent value="admin" className="mt-4">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <SectionHeader
              icon={User}
              title="School Administrator"
              description="Primary admin account with full access to this school"
            />
            <CardContent className="pt-5">
              {school.admin ? (
                <div className="space-y-5">
                  {/* Admin identity card */}
                  <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-background to-background p-5">
                    <div className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
                    <div className="relative flex items-start sm:items-center gap-4 flex-col sm:flex-row">
                      <div className="relative shrink-0">
                        <div className="size-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-lg shadow-primary/20">
                          {school.admin.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={cn(
                          'absolute -bottom-1 -right-1 size-5 rounded-full ring-2 ring-background flex items-center justify-center',
                          school.admin.isLocked ? 'bg-red-500' : 'bg-emerald-500'
                        )}>
                          {school.admin.isLocked && <Lock className="size-2.5 text-white" />}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-lg font-semibold">{school.admin.name}</p>
                          <Badge variant="secondary" className="text-xs">School Admin</Badge>
                          {school.admin.isLocked && (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <Lock className="size-2.5" />
                              Locked
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 text-sm text-muted-foreground">
                          <a href={`mailto:${school.admin.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                            <Mail className="size-3.5" /> {school.admin.email}
                          </a>
                          {school.admin.phone && (
                            <a href={`tel:${school.admin.phone}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                              <Phone className="size-3.5" /> {school.admin.phone}
                            </a>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 shrink-0 self-start sm:self-center"
                        onClick={() => {
                          setNewPassword('')
                          setConfirmPassword('')
                          setShowPassword(false)
                          setShowResetDialog(true)
                        }}
                      >
                        <KeyRound className="size-3.5" />
                        Reset Password
                      </Button>
                    </div>
                  </div>

                  {/* Lock alert */}
                  {school.admin.isLocked && school.admin.lockedUntil && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/10 dark:border-red-900/50 p-4"
                    >
                      <div className="flex size-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 shrink-0">
                        <AlertTriangle className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                          Account Temporarily Locked
                        </p>
                        <p className="text-xs text-red-700 dark:text-red-300 mt-0.5 leading-relaxed">
                          Too many failed login attempts. Auto-unlocks at{' '}
                          <strong>{formatDateTime(school.admin.lockedUntil)}</strong>
                          {school.admin.failedAttempts ? ` (${school.admin.failedAttempts} failed attempts)` : ''}. You can override and unlock now.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/50 shrink-0 self-start sm:self-center"
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
                    </motion.div>
                  )}

                  {/* Activity */}
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <Clock className="size-3.5" /> Activity
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DetailItem
                        variant="ghost"
                        icon={Clock}
                        label="Last Login"
                        value={school.admin.lastLoginAt ? formatDateTime(school.admin.lastLoginAt) : 'Never logged in'}
                      />
                      <DetailItem
                        variant="ghost"
                        icon={Shield}
                        label="Failed Attempts"
                        value={(school.admin.failedAttempts ?? 0).toString()}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground/60 mb-4">
                    <User className="size-8" />
                  </div>
                  <p className="text-sm font-medium">No admin account assigned</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">This school doesn’t have a primary admin yet. Create one to grant access.</p>
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
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="size-5" />
              </div>
              <div>
                <DialogTitle>Reset Admin Password</DialogTitle>
                <DialogDescription className="mt-0.5">
                  Set a new password for <strong>{school.admin?.name}</strong>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Mail className="size-3.5" />
              {school.admin?.email}
            </div>
            <div className="space-y-2">
              <Label>New Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className={cn('pr-10', newPassword && resetPwError && 'border-destructive focus-visible:ring-destructive/30')}
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
              {newPassword && resetPwError && (
                <p className="text-sm text-destructive">{resetPwError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Confirm Password <span className="text-destructive">*</span></Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter the new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={cn(confirmPassword && resetPwMatchError && 'border-destructive focus-visible:ring-destructive/30')}
              />
              {confirmPassword && resetPwMatchError && (
                <p className="text-sm text-destructive">{resetPwMatchError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!schoolId || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword) return
                setResettingPassword(true)
                try {
                  await api.post(`/api/super-admin/schools/${schoolId}/reset-password`, { newPassword })
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
              disabled={resettingPassword || !!resetPwError || !!resetPwMatchError}
            >
              {resettingPassword ? <><Loader2 className="size-4 animate-spin mr-2" />Resetting...</> : <><KeyRound className="size-4 mr-2" />Reset Password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Helper Components ─── */

function MetaChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border bg-background/80 backdrop-blur-sm px-3 py-1 text-xs font-medium text-muted-foreground">
      <Icon className="size-3 text-primary" />
      <span>{label}</span>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
  delay = 0,
  small = false,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  tint: string
  delay?: number
  small?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      <Card className="relative overflow-hidden border-border/70 hover:border-primary/30 hover:shadow-md transition-all duration-200 h-full">
        <CardContent className="p-4 flex items-center gap-3">
          <div className={cn('flex size-11 items-center justify-center rounded-xl shrink-0', tint)}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className={cn('font-bold tracking-tight truncate', small ? 'text-sm' : 'text-2xl')}>{value}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">{label}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3 px-6 py-4 border-b bg-muted/30">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold leading-tight">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function DetailItem({
  icon: Icon,
  label,
  value,
  variant = 'card',
}: {
  icon: React.ElementType
  label: string
  value?: React.ReactNode
  variant?: 'card' | 'ghost'
}) {
  const displayValue =
    value === null || value === undefined || value === '' ? (
      <span className="text-muted-foreground/60 italic">—</span>
    ) : (
      value
    )
  return (
    <div
      className={cn(
        'flex items-start gap-3 min-w-0',
        variant === 'card' && 'p-3 rounded-lg border bg-background hover:border-primary/30 hover:bg-muted/30 transition-colors'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-md shrink-0',
          variant === 'card' ? 'size-8 bg-primary/10 text-primary' : 'size-7 bg-muted text-muted-foreground'
        )}
      >
        <Icon className={variant === 'card' ? 'size-4' : 'size-3.5'} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <div className="text-sm mt-0.5 break-words">{displayValue}</div>
      </div>
    </div>
  )
}

function ContactCard({
  icon: Icon,
  label,
  value,
  href,
  tint,
}: {
  icon: React.ElementType
  label: string
  value?: string
  href?: string
  tint: string
}) {
  const content = (
    <div className="flex items-center gap-3">
      <div className={cn('flex size-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm shrink-0', tint)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-medium truncate mt-0.5">
          {value || <span className="text-muted-foreground/60 italic">—</span>}
        </p>
      </div>
      {href && value && <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
    </div>
  )
  if (href && value) {
    return (
      <a
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="block rounded-xl border bg-background p-3 hover:border-primary/40 hover:shadow-sm transition-all group"
      >
        {content}
      </a>
    )
  }
  return <div className="rounded-xl border bg-background p-3">{content}</div>
}
