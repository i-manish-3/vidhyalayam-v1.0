'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
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
import { cn } from '@/lib/utils'
import {
  Pencil,
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
  Users,
  UserPlus,
  User,
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  Building2,
  type LucideIcon,
} from 'lucide-react'

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

interface StaffDetailResponse {
  id: string
  userId?: string | null
  employeeId?: string | null
  firstName: string
  lastName: string
  name: string
  email?: string | null
  phone?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  joinDate?: string | null
  designation?: string | null
  department?: string | null
  qualification?: string | null
  address?: string | null
  profileImage?: string | null
  isActive: boolean
  assignedRoles?: { id: string; name: string; color?: string | null }[]
}

const EXCLUDED_ROLES = new Set(['School Admin', 'Teacher', 'Student', 'Parent', 'Staff', 'Transport'])

const ROLE_ICONS: Record<string, LucideIcon> = {
  Teacher: GraduationCap,
  Accountant: Calculator,
  'Sr. Accountant': Calculator,
  Librarian: Library,
  Office: Briefcase,
  Controller: ShieldCheck,
  Reception: Headphones,
  Transport: Bus,
  Security: Shield,
}

function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
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

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  children,
  step,
}: {
  title: string
  subtitle?: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'rose' | 'cyan' | 'fuchsia'
  children: React.ReactNode
  step?: number
}) {
  const toneConfig = {
    sky: { border: 'border-sky-200/80 dark:border-sky-800/30', bg: 'from-sky-50 via-white to-sky-50 dark:from-sky-950/20 dark:via-card dark:to-sky-950/20', gradient: 'from-sky-500 to-primary', ring: 'ring-sky-500/20' },
    emerald: { border: 'border-emerald-200/80 dark:border-emerald-800/30', bg: 'from-emerald-50 via-white to-emerald-50 dark:from-emerald-950/20 dark:via-card dark:to-emerald-950/20', gradient: 'from-emerald-500 to-cyan-500', ring: 'ring-emerald-500/20' },
    amber: { border: 'border-amber-200/80 dark:border-amber-800/30', bg: 'from-amber-50 via-white to-amber-50 dark:from-amber-950/20 dark:via-card dark:to-amber-950/20', gradient: 'from-amber-500 to-rose-500', ring: 'ring-amber-500/20' },
    violet: { border: 'border-violet-200/80 dark:border-violet-800/30', bg: 'from-violet-50 via-white to-violet-50 dark:from-violet-950/20 dark:via-card dark:to-violet-950/20', gradient: 'from-violet-500 to-fuchsia-500', ring: 'ring-violet-500/20' },
    rose: { border: 'border-rose-200/80 dark:border-rose-800/30', bg: 'from-rose-50 via-white to-rose-50 dark:from-rose-950/20 dark:via-card dark:to-rose-950/20', gradient: 'from-rose-500 to-pink-500', ring: 'ring-rose-500/20' },
    cyan: { border: 'border-cyan-200/80 dark:border-cyan-800/30', bg: 'from-cyan-50 via-white to-cyan-50 dark:from-cyan-950/20 dark:via-card dark:to-cyan-950/20', gradient: 'from-cyan-500 to-teal-500', ring: 'ring-cyan-500/20' },
    fuchsia: { border: 'border-fuchsia-200/80 dark:border-fuchsia-800/30', bg: 'from-fuchsia-50 via-white to-fuchsia-50 dark:from-fuchsia-950/20 dark:via-card dark:to-fuchsia-950/20', gradient: 'from-fuchsia-500 to-pink-500', ring: 'ring-fuchsia-500/20' },
  }
  const t = toneConfig[tone]
  return (
    <div className={cn('relative overflow-hidden rounded-xl border', t.border, 'bg-gradient-to-br', t.bg)}>
      <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-primary/5" />
      {step && (
        <div aria-hidden className={cn('absolute -left-4 -bottom-4 size-20 rounded-full opacity-[0.04]', t.gradient.replace('from-', 'bg-').split(' ')[0])} />
      )}
      <div className="relative flex items-center gap-2 border-b border-primary/5 px-4 py-3">
        {step && (
          <span className={cn('flex size-5 items-center justify-center rounded-md bg-gradient-to-br text-[10px] font-bold text-white shadow-sm', t.gradient)}>
            {step}
          </span>
        )}
        <span className={cn('flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm', t.gradient)}>
          <Icon className="size-3" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="relative p-4">{children}</div>
    </div>
  )
}

export function StaffEditPage({ staffId }: { staffId: string }) {
  const router = useRouter()
  const { toast } = useToast()

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

  const [userId, setUserId] = useState<string | null>(null)
  const [initialRoleId, setInitialRoleId] = useState<string>('')
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true)
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      setAvailableRoles((res.roles || []).filter((r) => !EXCLUDED_ROLES.has(r.name)))
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the roles. Please refresh the page.", variant: 'destructive' })
    } finally { setLoadingRoles(false) }
  }, [toast])

  const fetchStaff = useCallback(async () => {
    try {
      setLoadingStaff(true)
      const res = await api.get<StaffDetailResponse>(`/api/school/staff/${staffId}`)
      setUserId(res.userId ?? null)
      setFirstName(res.firstName ?? '')
      setLastName(res.lastName ?? '')
      setEmployeeId(res.employeeId ?? '')
      setPhone(res.phone ?? '')
      setEmail(res.email && !res.email.endsWith('@staff.local') ? res.email : '')
      setGender(res.gender || 'Male')
      setDob(toDateInputValue(res.dateOfBirth))
      setJoinDate(toDateInputValue(res.joinDate))
      setDesignation(res.designation ?? '')
      setQualification(res.qualification ?? '')
      setAddress(res.address ?? '')
      setAvatar(res.profileImage ?? null)
      const roleId = res.assignedRoles?.[0]?.id ?? ''
      setSelectedRoleId(roleId)
      setInitialRoleId(roleId)
    } catch (err) {
      setNotFound(true)
      toast({ title: "Couldn't Load Staff", description: err instanceof Error ? err.message : "We couldn't load this staff member.", variant: 'destructive' })
    } finally { setLoadingStaff(false) }
  }, [staffId, toast])

  useEffect(() => { fetchRoles(); fetchStaff() }, [fetchRoles, fetchStaff])

  const selectedRole = availableRoles.find((r) => r.id === selectedRoleId)
  const RoleIcon = selectedRole ? ROLE_ICONS[selectedRole.name] || Shield : null

  const phoneDigits = phone.replace(/\D/g, '')
  const phoneIsValid = /^[6-9]\d{9}$/.test(phoneDigits)
  const phoneError = phone.trim() && !phoneIsValid ? 'Phone must be 10 digits starting with 6, 7, 8 or 9' : ''
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
      if (compressed) toast({ title: 'Photo Compressed', description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.` })
    } catch {
      toast({ title: 'Could Not Read Photo', description: 'Please try a different image.', variant: 'destructive' })
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid || submitting) return
    try {
      setSubmitting(true)
      await api.patch(`/api/school/staff/${staffId}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        phone: phoneDigits,
        email: email.trim() || undefined,
        dateOfBirth: dob,
        joinDate: joinDate || undefined,
        designation: designation.trim() || null,
        qualification: qualification.trim() || null,
        address: address.trim() || null,
        profileImage: avatar,
      })
      if (selectedRoleId !== initialRoleId) {
        if (!userId) throw new Error("This staff member has no linked user account — role cannot be changed.")
        await api.put(`/api/school/users/${userId}/roles`, { roleIds: [selectedRoleId] })
      }
      toast({ title: 'Staff Updated', description: `${firstName.trim()} ${lastName.trim()}'s details have been saved.` })
      router.push('/staff')
    } catch (err) {
      toast({ title: 'Update Failed', description: err instanceof Error ? err.message : "We couldn't update the staff member. Please try again.", variant: 'destructive' })
    } finally { setSubmitting(false) }
  }

  // ── Not Found ──
  if (notFound) {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
          <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
          <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
          <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
          <div className="relative flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Users className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Edit Staff</h1>
              <p className="mt-1 text-sm text-white/75">Update this staff member&apos;s personal and contact details.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.02] via-card to-cyan-500/[0.02] py-20 text-center shadow-sm">
          <Users className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">Staff Not Found</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">The staff member you are trying to edit does not exist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Gradient Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
        <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
        <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
        <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
        <div aria-hidden className="absolute bottom-0 left-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Pencil className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Edit Staff</h1>
              <p className="mt-1 text-sm text-white/75">Update this staff member&apos;s personal and contact details.</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            onClick={() => router.push('/staff')}
            className="gap-2"
          >
            <Users className="size-4" />
            Staff List
          </Button>
        </div>
      </div>

      {/* Full-bleed Photo Banner */}
      <div className="relative -mx-4 -mt-1 overflow-hidden md:mx-0 md:rounded-xl">
        <div className="relative flex h-28 items-center justify-center bg-gradient-to-r from-sky-500/10 via-primary/5 to-violet-500/10 md:h-32">
          <div aria-hidden className="absolute -left-8 -top-8 size-24 rounded-full border-[12px] border-sky-500/10" />
          <div aria-hidden className="absolute -right-4 -bottom-4 size-20 rounded-full border-[10px] border-violet-500/10" />
          <div className="relative flex flex-col items-center gap-1">
            <div className="relative">
              <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border-2 border-white/60 bg-gradient-to-br from-primary/10 to-teal-500/10 shadow-lg ring-4 ring-white/40">
                {avatar ? (
                  <img src={avatar} alt="" className="size-full object-cover" />
                ) : (
                  <UserPlus className="size-7 text-primary/40" />
                )}
              </div>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-white bg-primary text-white shadow-md transition-transform hover:scale-110"
              >
                <Upload className="size-3" />
              </button>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">
              {avatar ? 'Change photo' : 'Upload photo'}
            </p>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>
        </div>
      </div>

      {loadingRoles || loadingStaff ? (
        <FormSkeleton />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Personal Details */}
          <SectionCard title="Personal Details" subtitle="Identity, contact and basic info" icon={User} tone="sky" step={1}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Employee ID</Label>
                <Input value={employeeId} className="h-9 bg-muted/40 font-mono text-muted-foreground" disabled />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">First Name <span className="text-destructive">*</span></Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Last Name <span className="text-destructive">*</span></Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Gender <span className="text-destructive">*</span></Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Phone Number <span className="text-destructive">*</span></Label>
                <Input
                  inputMode="numeric" maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className={cn('h-9', phoneError ? 'border-destructive focus-visible:ring-destructive/20' : '')}
                  aria-invalid={!!phoneError}
                />
                {phoneError && <p className="text-[11px] text-destructive">{phoneError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={emailHasError}
                  className={cn('h-9', emailHasError ? 'border-destructive focus-visible:ring-destructive/20' : '')}
                />
                {emailHasError && <p className="text-[11px] text-destructive">Please enter a valid email address.</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Date of Birth <span className="text-destructive">*</span></Label>
                <DatePicker value={dob} onChange={setDob} disableFuture showQuickActions={false} yearDropdown yearsBack={70} placeholder="Select date of birth" triggerClassName="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Join Date <span className="text-destructive">*</span></Label>
                <DatePicker value={joinDate} onChange={setJoinDate} disableFuture yearDropdown yearsBack={20} placeholder="Select join date" triggerClassName="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Designation <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Qualification <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={qualification} onChange={(e) => setQualification(e.target.value)} className="h-9" />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs font-medium">Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9" />
              </div>
            </div>
          </SectionCard>

          {/* Role Assignment */}
          <SectionCard title="Role Assignment" subtitle="Define access permissions" icon={ShieldCheck} tone="amber" step={2}>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Staff Permission Role <span className="text-destructive">*</span></Label>
                <Select value={selectedRoleId} onValueChange={setSelectedRoleId} disabled={!userId}>
                  <SelectTrigger className="h-9">
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
                {!userId && (
                  <p className="text-[11px] text-muted-foreground">
                    Role cannot be changed — this staff record has no linked sign-in account.
                  </p>
                )}
              </div>

              {selectedRole && (
                <div className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-3 shadow-sm dark:border-amber-800/30 dark:from-amber-950/20 dark:via-card dark:to-amber-950/20">
                  <div aria-hidden className="absolute -right-4 -top-4 size-12 rounded-full border-[8px] border-amber-500/5" />
                  <div className="relative flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                      {RoleIcon && <RoleIcon className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{selectedRole.name}</h4>
                        {selectedRole.isSystem && (
                          <Badge variant="secondary" className="h-5 px-2 text-[10px]">System</Badge>
                        )}
                        {selectedRoleId !== initialRoleId && (
                          <Badge variant="outline" className="h-5 px-2 text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">
                            Changed
                          </Badge>
                        )}
                      </div>
                      {selectedRole.description && (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{selectedRole.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                          <ShieldCheck className="size-3" />
                          {selectedRole.permissionCount} permissions
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-300">
                          <UserPlus className="size-3" />
                          {selectedRole.userCount} staff assigned
                        </span>
                      </div>
                    </div>
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                      <CheckCircle2 className="size-4" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Sticky Footer */}
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-primary/10 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-6 py-3">
              <Button type="button" variant="outline" size="sm" onClick={() => router.push('/staff')} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isFormValid || submitting} size="sm" className="gap-2 min-w-[140px]">
                {submitting ? (
                  <><div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Saving...</>
                ) : (
                  <><Pencil className="size-4" /> Save Changes</>
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  )
}
