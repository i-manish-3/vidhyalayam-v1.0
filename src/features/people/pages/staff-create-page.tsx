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

const ROLE_COLORS: Record<string, string> = {
  'Teacher': 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  'Accountant': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  'Sr. Accountant': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  'Librarian': 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  'Office': 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  'Controller': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400',
  'Reception': 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  'Transport': 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  'Security': 'bg-slate-100 text-slate-700 dark:bg-slate-950/40 dark:text-slate-400',
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
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
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

  // ── Selected role info ──
  const selectedRole = availableRoles.find((r) => r.id === selectedRoleId)
  const RoleIcon = selectedRole ? (ROLE_ICONS[selectedRole.name] || Shield) : null

  // ── Form validation ──
  const phoneDigits = phone.replace(/\D/g, '')
  const phoneError = phone.trim() && phoneDigits.length !== 10
    ? 'Phone number must be exactly 10 digits.'
    : ''
  const isFormValid = name.trim() && phoneDigits.length === 10 && dob && selectedRoleId

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
        name: string
        assignedRole: { name: string }
      }>('/api/school/users', {
        name: name.trim(),
        phone: phoneDigits,
        email: email.trim() || undefined,
        dob,
        avatar,
        roleId: selectedRoleId,
      })

      toast({
        title: 'Staff Created',
        description: `"${res.name}" can now sign in using phone ${phoneDigits} and the default password "staff123". They will be asked to change it on first login.`,
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
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Create Staff</h1>
          <p className="text-xs text-muted-foreground">
            Add a new staff member and assign them a role — permissions are automatically inherited
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="size-4" />
            Staff Information
          </CardTitle>
          <CardDescription className="text-xs">Fill in the details below to create a new staff member</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRoles ? (
            <FormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Personal Details */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary" />
                  Personal Details
                </h3>

                {/* Photo */}
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => photoInputRef.current?.click()}
                      >
                        <Upload className="size-4" />
                        {avatar ? 'Change Photo' : 'Upload Photo'}
                      </Button>
                      {avatar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAvatar(null)}
                        >
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
                    <Label htmlFor="staff-name" className="text-xs font-medium">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-name"
                      placeholder="Enter full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-phone" className="text-xs font-medium">
                      Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-phone"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="10-digit phone number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`h-9 ${phoneError ? 'border-destructive focus-visible:ring-destructive/20' : ''}`}
                      aria-invalid={!!phoneError}
                    />
                    {phoneError && (
                      <p className="text-[11px] text-destructive">{phoneError}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-email" className="text-xs font-medium">
                      Email <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="staff-email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-dob" className="text-xs font-medium">
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
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                  <KeyRound className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    The staff member will sign in with their phone number and the default password <span className="font-mono font-semibold">staff123</span>. They&apos;ll be prompted to change the password on first login.
                  </span>
                </div>
              </div>

              <Separator />

              {/* Role Selection */}
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
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
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
                  </div>

                  {/* Selected Role Preview */}
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
                              <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                                System
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

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={!isFormValid || submitting}
                  className="gap-2 min-w-[140px]"
                >
                  {submitting ? (
                    <>
                      <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
        </CardContent>
      </Card>
    </div>
  )
}
