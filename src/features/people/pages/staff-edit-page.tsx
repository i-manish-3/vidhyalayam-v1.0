'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { DatePicker } from '@/components/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

export function StaffEditPage({ staffId }: { staffId: string }) {
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
  const [userId, setUserId] = useState<string | null>(null)
  const [initialRoleId, setInitialRoleId] = useState<string>('')
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notFound, setNotFound] = useState(false)

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true)
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      setAvailableRoles((res.roles || []).filter((r) => !EXCLUDED_ROLES.has(r.name)))
    } catch {
      toast({
        title: "Couldn't Load Roles",
        description: "We couldn't load the roles. Please refresh the page.",
        variant: 'destructive',
      })
    } finally {
      setLoadingRoles(false)
    }
  }, [toast])

  // ── Fetch existing staff ──
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
      toast({
        title: "Couldn't Load Staff",
        description: err instanceof Error ? err.message : "We couldn't load this staff member.",
        variant: 'destructive',
      })
    } finally {
      setLoadingStaff(false)
    }
  }, [staffId, toast])

  useEffect(() => {
    fetchRoles()
    fetchStaff()
  }, [fetchRoles, fetchStaff])

  const selectedRole = availableRoles.find((r) => r.id === selectedRoleId)
  const RoleIcon = selectedRole ? ROLE_ICONS[selectedRole.name] || Shield : null

  // ── Validation ──
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
        toast({
          title: 'Photo Too Large',
          description: 'This image format cannot be compressed under 200 KB. Please upload a JPG, PNG, or WebP.',
          variant: 'destructive',
        })
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

  // ── Submit ──
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
        if (!userId) {
          throw new Error("This staff member has no linked user account — role cannot be changed.")
        }
        await api.put(`/api/school/users/${userId}/roles`, {
          roleIds: [selectedRoleId],
        })
      }

      toast({
        title: 'Staff Updated',
        description: `${firstName.trim()} ${lastName.trim()}'s details have been saved.`,
      })
      router.push('/staff')
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : "We couldn't update the staff member. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──
  if (notFound) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">Edit Staff</h1>
          <Button type="button" variant="outline" size="sm" onClick={() => router.push('/staff')} className="gap-2">
            <Users className="size-4" />
            Staff List
          </Button>
        </div>
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">Staff Not Found</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">The staff member you are trying to edit does not exist.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Edit Staff</h1>
          <p className="text-xs text-muted-foreground">
            Update this staff member&apos;s personal and contact details.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => router.push('/staff')} className="gap-2">
          <Users className="size-4" />
          Staff List
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Pencil className="size-4" />
            Staff Information
          </CardTitle>
          <CardDescription className="text-xs">Make changes and save to update this staff member</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRoles || loadingStaff ? (
            <FormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary" />
                  Personal Details
                </h3>

                <div className="mb-3 flex items-center gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <UserPlus className="size-6" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()}>
                        <Upload className="size-4" />
                        {avatar ? 'Change Photo' : 'Upload Photo'}
                      </Button>
                      {avatar && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAvatar(null)}>
                          <X className="size-4" />
                          Remove
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">JPG/PNG/WebP — auto-compressed to 200 KB.</p>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-employee-id" className="text-xs font-medium">Employee ID</Label>
                    <Input
                      id="staff-employee-id"
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
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-last-name" className="text-xs font-medium">
                      Last Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-last-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-gender" className="text-xs font-medium">
                      Gender <span className="text-destructive">*</span>
                    </Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger id="staff-gender" className="h-9">
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
                    <Label htmlFor="staff-phone" className="text-xs font-medium">
                      Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-phone"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`h-9 ${phoneError ? 'border-destructive focus-visible:ring-destructive/20' : ''}`}
                      aria-invalid={!!phoneError}
                    />
                    {phoneError && <p className="text-[11px] text-destructive">{phoneError}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-email" className="text-xs font-medium">
                      Email <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="staff-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={emailHasError}
                      className={`h-9 ${emailHasError ? 'border-destructive focus-visible:ring-destructive/20' : ''}`}
                    />
                    {emailHasError && (
                      <p className="text-[11px] text-destructive">Please enter a valid email address.</p>
                    )}
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
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-qualification" className="text-xs font-medium">
                      Qualification <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="staff-qualification"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="staff-address" className="text-xs font-medium">
                      Address <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="staff-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary" />
                  Role Assignment
                </h3>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Staff Permission Role <span className="text-destructive">*</span>
                    </Label>
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
                    <div className="rounded-lg border bg-card p-3 shadow-sm ring-1 ring-primary/10">
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
                            {selectedRoleId !== initialRoleId && (
                              <Badge variant="outline" className="h-5 px-2 text-[10px] border-amber-400 text-amber-700 dark:text-amber-400">
                                Changed
                              </Badge>
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
              </div>

              <Separator />

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!isFormValid || submitting} className="gap-2 min-w-[140px]">
                  {submitting ? (
                    <>
                      <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Pencil className="size-4" />
                      Save Changes
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
        </CardContent>
      </Card>
    </div>
  )
}
