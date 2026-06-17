'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
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
    <div className="space-y-3">
      <PageHeader
        title="Create Staff"
        description="Create a staff profile, sign-in account, and permission role."
        secondaryAction={{
          label: 'Staff List',
          icon: Users,
          onClick: () => router.push('/staff'),
          disabled: submitting,
        }}
      />

      {loadingRoles ? (
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/20 px-4 py-2.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserPlus className="size-4" />
              Staff Information
            </CardTitle>
            <CardDescription className="text-xs">Loading staff form details</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <FormSkeleton />
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-4 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserPlus className="size-4" />
                Personal Details
              </CardTitle>
              <CardDescription className="text-xs">Basic identity, contact, and profile photo</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted">
                    {avatar ? (
                      <img src={avatar} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <UserPlus className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={submitting}
                      >
                        <Upload className="size-3.5" />
                        {avatar ? 'Change Photo' : 'Upload Photo'}
                      </Button>
                      {avatar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setAvatar(null)
                            if (photoInputRef.current) photoInputRef.current.value = ''
                          }}
                          disabled={submitting}
                        >
                          <X className="size-3.5" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">JPG, PNG, or WebP. Auto-compressed to 200 KB.</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-employee-id" className="text-xs font-medium">Employee ID</Label>
                    <Input
                      id="staff-employee-id"
                      placeholder="Auto generated from settings"
                      value={employeeId}
                      className="h-9 bg-muted/40 font-mono text-muted-foreground"
                      disabled
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-first-name" className="text-xs font-medium">
                      First Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-first-name"
                      placeholder="Enter first name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-9"
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-last-name" className="text-xs font-medium">
                      Last Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-last-name"
                      placeholder="Enter last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-9"
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-gender" className="text-xs font-medium">
                      Gender <span className="text-destructive">*</span>
                    </Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger id="staff-gender" className="h-9" disabled={submitting}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Date of Birth <span className="text-destructive">*</span>
                    </Label>
                    <DatePicker
                      value={dob}
                      onChange={setDob}
                      disableFuture
                      showQuickActions={false}
                      yearDropdown
                      yearsBack={70}
                      placeholder="Select date of birth"
                      triggerClassName="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-phone" className="text-xs font-medium">
                      Phone <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-phone"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`h-9 ${phoneError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`}
                      aria-invalid={!!phoneError}
                      disabled={submitting}
                    />
                    {phoneError ? (
                      <p className="text-[11px] font-medium text-destructive">{phoneError}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Login ID will be this phone number.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-email" className="text-xs font-medium">
                      Email <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="staff-email"
                      type="email"
                      inputMode="email"
                      placeholder="staff@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={emailHasError}
                      className={`h-9 ${emailHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`}
                      disabled={submitting}
                    />
                    {emailHasError ? (
                      <p className="text-[11px] font-medium text-destructive">Please enter a valid email address.</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Optional. Used for notifications and recovery.</p>
                    )}
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="staff-address" className="text-xs font-medium">
                      Address <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="staff-address"
                      placeholder="Residential address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="h-9"
                      disabled={submitting}
                    />
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                  <KeyRound className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Default password is <span className="font-mono font-semibold">staff123</span>. Password change is required on first login.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-4 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BriefcaseBusiness className="size-4" />
                Job Details
              </CardTitle>
              <CardDescription className="text-xs">Joining date, designation, and qualification</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Join Date <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker
                    value={joinDate}
                    onChange={setJoinDate}
                    disableFuture
                    yearDropdown
                    yearsBack={20}
                    placeholder="Select join date"
                    triggerClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-designation" className="text-xs font-medium">
                    Designation <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="staff-designation"
                    placeholder="e.g., Sr. Accountant, Head Librarian"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="h-9"
                    disabled={submitting}
                  />
                  <p className="text-[11px] text-muted-foreground">Defaults to selected role if left blank.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-qualification" className="text-xs font-medium">
                    Qualification <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="staff-qualification"
                    placeholder="e.g., B.Com, M.A."
                    value={qualification}
                    onChange={(e) => setQualification(e.target.value)}
                    className="h-9"
                    disabled={submitting}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="border-b bg-muted/20 px-4 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4" />
                Role Assignment
              </CardTitle>
              <CardDescription className="text-xs">Choose the permission role for this staff member</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Staff Permission Role <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                    <SelectTrigger className="h-9" disabled={submitting}>
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
                  <div className="rounded-lg border bg-background p-3 shadow-sm ring-1 ring-primary/10">
                    <div className="flex items-start gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {RoleIcon && <RoleIcon className="size-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{selectedRole.name}</h4>
                          {selectedRole.isSystem && (
                            <Badge variant="secondary" className="h-5 px-2 text-[10px]">System</Badge>
                          )}
                        </div>
                        {selectedRole.description && (
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {selectedRole.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                            <ShieldCheck className="size-3" />
                            {selectedRole.permissionCount} permissions
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                            <UserPlus className="size-3" />
                            {selectedRole.userCount} staff assigned
                          </span>
                        </div>
                      </div>
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <CheckCircle2 className="size-4" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center">
            <Button
              type="submit"
              disabled={!isFormValid || submitting}
              className="gap-2 sm:min-w-[140px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  Create Staff
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/staff')}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
