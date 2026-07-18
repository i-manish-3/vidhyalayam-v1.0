'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  UserPlus,
  Shield,
  ShieldCheck,
  GraduationCap,
  Calculator,
  Library,
  Briefcase,
  Headphones,
  Bus,
  CheckCircle2,
  Upload,
  X,
  KeyRound,
  Users,
  Loader2,
  BriefcaseBusiness,
  List,
  Phone,
  Mail,
  MapPin,
  Cake,
  Hash,
  BadgeAlert,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AvailableRole {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  isActive: boolean
  permissionCount: number
  userCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Staff creation only shows staff permission roles.
// Primary identity roles are created from their own modules.
const EXCLUDED_ROLES = new Set(['School Admin', 'Teacher', 'Student', 'Parent', 'Staff', 'Transport'])

const ROLE_ICONS: Record<string, LucideIcon> = {
  'Teacher': GraduationCap,
  'Accountant': Calculator,
  'Sr. Accountant': Calculator,
  'Librarian': Library,
  'Office': Briefcase,
  'Controller': ShieldCheck,
  'Reception': Headphones,
  'Transport': Bus,
  'Security': Shield,
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-xs" />
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StaffCreatePage() {
  const router = useRouter()
  const { toast } = useToast()

  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('Male')
  const [dob, setDob] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [designation, setDesignation] = useState('')
  const [qualification, setQualification] = useState('')
  const [address, setAddress] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Data state
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // ── Fetch available roles (excluding School Admin, Student, Parent) ──
  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true)
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      // Hide primary identity roles; staff users should choose permission roles only.
      const staffRoles = (res.roles || []).filter(
        (r) => !EXCLUDED_ROLES.has(r.name)
      )
      setAvailableRoles(staffRoles)
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the roles. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingRoles(false)
    }
  }, [toast])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  useEffect(() => {
    let mounted = true
    api.get<{ employeeId: string }>('/api/school/employees/next-number', undefined, { skipLogoutOn401: true })
      .then((res) => {
        if (mounted) setEmployeeId((current) => current || res.employeeId || '')
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [])

  // ── Selected role info ──
  const selectedRole = availableRoles.find((r) => r.id === selectedRoleId)
  const RoleIcon = selectedRole ? (ROLE_ICONS[selectedRole.name] || Shield) : null

  // ── Form validation ──
  const phoneDigits = phone.replace(/\D/g, '')
  const phoneIsValid = /^[6-9]\d{9}$/.test(phoneDigits)
  const phoneError = phone.trim() && !phoneIsValid
    ? 'Phone must be 10 digits starting with 6, 7, 8 or 9'
    : ''
  const emailIsValid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const emailHasError = email.trim().length > 0 && !emailIsValid
  const isFormValid =
    firstName.trim() &&
    lastName.trim() &&
    gender &&
    phoneIsValid &&
    dob &&
    joinDate &&
    selectedRoleId &&
    emailIsValid

  // ── Photo handler ──
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        toast({ title: 'Photo Too Large', description: 'This image format cannot be compressed under 200 KB. Please upload a JPG, PNG, or WebP.', variant: 'destructive' })
        if (photoInputRef.current) photoInputRef.current.value = ''
        return
      }
      setAvatar(dataUrl)
      if (compressed) {
        toast({ title: 'Photo Compressed', description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.` })
      }
    } catch {
      toast({ title: 'Could Not Read Photo', description: 'Please try a different image.', variant: 'destructive' })
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  // ── Submit handler ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || submitting) return

    try {
      setSubmitting(true)
      const res = await api.post<{
        id: string
        employeeId?: string
        name: string
        phone: string
        assignedRole: { name: string }
      }>('/api/school/staff', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        phone: phoneDigits,
        email: email.trim() || undefined,
        dob,
        joinDate: joinDate || undefined,
        designation: designation.trim() || undefined,
        qualification: qualification.trim() || undefined,
        address: address.trim() || undefined,
        avatar,
        roleId: selectedRoleId,
      })

      toast({
        title: 'Staff Created',
        description: `${res.employeeId ? `${res.employeeId} - ` : ''}${res.name} can sign in with phone ${res.phone} and password "staff123". Password change required on first login.`,
      })

      router.push('/staff')
    } catch (err) {
      toast({
        title: 'Creation Failed',
        description: err instanceof Error ? err.message : "We couldn't create the staff member. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div aria-hidden className="absolute left-1/4 top-0 size-16 rounded-full bg-teal-300/8 blur-sm" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <UserPlus className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Create Staff</h1>
            <p className="mt-0.5 text-xs text-white/80">Create a staff profile, sign-in account, and permission role.</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/staff')}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <List className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Staff List</span>
        </Button>
      </div>

      {loadingRoles ? (
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <UserPlus className="size-4" />
              </span>
              Staff Information
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">Loading staff form details</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3 sm:px-5">
            <FormSkeleton />
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Photo Upload Banner */}
          <div className="relative overflow-hidden rounded-xl border border-sky-500/15 bg-gradient-to-br from-sky-500/[0.06] via-violet-500/[0.03] to-primary/[0.02] p-0 shadow-sm">
            <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full border-[22px] border-sky-500/5" />
            <div aria-hidden className="absolute -bottom-8 left-1/3 size-24 rounded-full bg-violet-500/5 blur-xl" />
            <div className="relative flex flex-col items-center gap-4 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.06] via-primary/[0.03] to-violet-500/[0.06] px-5 py-4 text-center sm:flex-row sm:text-left">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-full border-[3px] border-sky-500/30 bg-gradient-to-br from-sky-500/[0.10] to-violet-500/[0.10] shadow-md shadow-sky-500/10">
                {avatar ? (
                  <img src={avatar} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <UserPlus className="size-8 text-sky-400/60" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Staff Photo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG, or WebP &middot; Auto-compressed to 200 KB</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-sky-500/30 text-xs text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/20"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={submitting}
                  >
                    <Upload className="size-3.5" /> {avatar ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                  {avatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { setAvatar(null); if (photoInputRef.current) photoInputRef.current.value = '' }}
                      disabled={submitting}
                    >
                      <X className="size-3.5" /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </div>
          </div>

          {/* Personal Details */}
          <Card className="relative gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm transition-all hover:shadow-md">
            <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full border-[16px] border-sky-500/5" />
            <div aria-hidden className="absolute -bottom-6 left-12 size-20 rounded-full bg-sky-500/5 blur-lg" />
            <CardHeader className="relative border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3 sm:px-5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                  <UserPlus className="size-4" />
                </span>
                Personal Details
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground/80">Basic identity, contact, and profile photo</CardDescription>
            </CardHeader>
            <CardContent className="relative px-4 pb-4 pt-3 sm:px-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Hash className="size-3 text-sky-500/70" /> Employee ID
                  </Label>
                  <Input placeholder="Auto generated from settings" value={employeeId} className="h-10 bg-gradient-to-r from-muted/30 to-muted/10 font-mono text-xs text-muted-foreground/70" disabled />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input placeholder="Enter first name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-10 transition-all focus-visible:ring-sky-500/30" disabled={submitting} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input placeholder="Enter last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-10 transition-all focus-visible:ring-sky-500/30" disabled={submitting} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    Gender <span className="text-destructive">*</span>
                  </Label>
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger className="h-10" disabled={submitting}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-blue-500" />Male</span></SelectItem>
                      <SelectItem value="Female"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-500" />Female</span></SelectItem>
                      <SelectItem value="Other"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-500" />Other</span></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Cake className="size-3 text-sky-500/70" /> Date of Birth <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker value={dob} onChange={setDob} disableFuture showQuickActions={false} yearDropdown yearsBack={70} placeholder="Select date of birth" triggerClassName="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Phone className="size-3 text-sky-500/70" /> Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input inputMode="numeric" maxLength={10} placeholder="10-digit phone number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} aria-invalid={!!phoneError} className={cn('h-10 transition-all', phoneError && 'border-destructive ring-destructive/20')} disabled={submitting} />
                  {phoneError ? (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-destructive"><BadgeAlert className="size-3" /> {phoneError}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Login ID will be this phone number.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <Mail className="size-3 text-sky-500/70" /> Email <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input type="email" inputMode="email" placeholder="staff@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailHasError} className={cn('h-10 transition-all', emailHasError && 'border-destructive ring-destructive/20')} disabled={submitting} />
                  {emailHasError ? (
                    <p className="flex items-center gap-1 text-[11px] font-medium text-destructive"><BadgeAlert className="size-3" /> Please enter a valid email address.</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Optional. Used for notifications and recovery.</p>
                  )}
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    <MapPin className="size-3 text-sky-500/70" /> Address <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input placeholder="Residential address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-10 transition-all" disabled={submitting} />
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-card to-amber-500/[0.03] px-3.5 py-3 text-xs">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span className="text-muted-foreground">
                  Default password is <span className="rounded bg-amber-100 px-1 font-mono font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">staff123</span>. Password change is required on first login.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Job Details */}
          <Card className="relative gap-0 overflow-hidden border-amber-500/15 bg-gradient-to-br from-card via-card to-amber-500/[0.035] py-0 shadow-sm transition-all hover:shadow-md">
            <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full border-[16px] border-amber-500/5" />
            <div aria-hidden className="absolute -bottom-6 left-12 size-20 rounded-full bg-amber-500/5 blur-lg" />
            <CardHeader className="relative border-b border-amber-500/15 bg-gradient-to-r from-amber-500/[0.10] via-primary/[0.05] to-rose-500/[0.08] px-4 py-3 sm:px-5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                  <BriefcaseBusiness className="size-4" />
                </span>
                Job Details
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground/80">Joining date, designation, and qualification</CardDescription>
            </CardHeader>
            <CardContent className="relative px-4 pb-4 pt-3 sm:px-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    Join Date <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker value={joinDate} onChange={setJoinDate} disableFuture yearDropdown yearsBack={20} placeholder="Select join date" triggerClassName="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    Designation <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input placeholder="e.g., Sr. Accountant, Head Librarian" value={designation} onChange={(e) => setDesignation(e.target.value)} className="h-10 transition-all focus-visible:ring-amber-500/30" disabled={submitting} />
                  <p className="text-[11px] text-muted-foreground">Defaults to selected role if left blank.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    Qualification <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input placeholder="e.g., B.Com, M.A." value={qualification} onChange={(e) => setQualification(e.target.value)} className="h-10 transition-all focus-visible:ring-amber-500/30" disabled={submitting} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Role Assignment */}
          <Card className="relative gap-0 overflow-hidden border-emerald-500/15 bg-gradient-to-br from-card via-card to-emerald-500/[0.035] py-0 shadow-sm transition-all hover:shadow-md">
            <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full border-[16px] border-emerald-500/5" />
            <div aria-hidden className="absolute -bottom-6 left-12 size-20 rounded-full bg-emerald-500/5 blur-lg" />
            <CardHeader className="relative border-b border-emerald-500/15 bg-gradient-to-r from-emerald-500/[0.10] via-primary/[0.05] to-cyan-500/[0.08] px-4 py-3 sm:px-5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                  <ShieldCheck className="size-4" />
                </span>
                Role Assignment
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground/80">Choose the permission role for this staff member</CardDescription>
            </CardHeader>
            <CardContent className="relative px-4 pb-4 pt-3 sm:px-5">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium">
                    Staff Permission Role <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                    <SelectTrigger className="h-10" disabled={submitting}>
                      <SelectValue placeholder="Choose access for this staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => {
                        const Icon = ROLE_ICONS[role.name] || Shield
                        return (
                          <SelectItem key={role.id} value={role.id}>
                            <div className="flex items-center gap-2">
                              <Icon className="size-3.5" />
                              <span>{role.name}</span>
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRole && (
                  <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-card to-cyan-500/[0.04] p-4 shadow-sm">
                    <div aria-hidden className="absolute -right-4 -top-4 size-16 rounded-full border-[12px] border-emerald-500/5" />
                    <div className="relative flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                        {RoleIcon && <RoleIcon className="size-5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{selectedRole.name}</h4>
                          {selectedRole.isSystem && (
                            <Badge variant="secondary" className="h-5 gap-1 border-emerald-500/20 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                              <ShieldCheck className="size-3" />System
                            </Badge>
                          )}
                        </div>
                        {selectedRole.description && (
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{selectedRole.description}</p>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/15 bg-emerald-500/[0.05] px-2.5 py-1 text-emerald-700 dark:text-emerald-300">
                            <ShieldCheck className="size-3" />
                            {selectedRole.permissionCount} permissions
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/15 bg-cyan-500/[0.05] px-2.5 py-1 text-cyan-700 dark:text-cyan-300">
                            <UserPlus className="size-3" />
                            {selectedRole.userCount} staff assigned
                          </span>
                        </div>
                      </div>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                        <CheckCircle2 className="size-4" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sticky Footer */}
          <div className="sticky bottom-0 -mx-4 border-t border-primary/10 bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.04] px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-lg sm:border sm:shadow-lg sm:shadow-primary/5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                <span className="text-destructive">*</span> marked fields are required.
              </p>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!isFormValid || submitting} className="min-w-[160px] gap-2 shadow-sm">
                  {submitting ? (
                    <><Loader2 className="size-4 animate-spin" /> Creating...</>
                  ) : (
                    <><UserPlus className="size-4" /> Create Staff</>
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push('/staff')} disabled={submitting}>Cancel</Button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
