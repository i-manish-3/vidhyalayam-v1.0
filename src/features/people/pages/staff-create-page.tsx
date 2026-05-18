'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  UserPlus,
  ArrowLeft,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  GraduationCap,
  Calculator,
  Library,
  Briefcase,
  Headphones,
  Bus,
  CheckCircle2,
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
const EXCLUDED_ROLES = new Set(['School Admin', 'Teacher', 'Student', 'Parent', 'Staff'])

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
  const { toast } = useToast()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const goBack = useAppStore((s) => s.goBack)

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phone, setPhone] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState<string>('')

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
  const isFormValid = name.trim() && email.trim() && password.trim() && selectedRoleId

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
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        roleId: selectedRoleId,
      })

      toast({
        title: 'Staff Created',
        description: `"${res.name}" has been created and assigned the "${res.assignedRole?.name}" role. They now inherit all permissions from this role.`,
      })

      // Navigate to staff list
      goBack('staff')
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
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => goBack('staff')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add a new staff member and assign them a role — permissions are automatically inherited
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="size-4" />
            Staff Information
          </CardTitle>
          <CardDescription>Fill in the details below to create a new staff member</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRoles ? (
            <FormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Details */}
              <div>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary" />
                  Personal Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="staff-name" className="text-xs font-medium">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-name"
                      placeholder="Enter full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staff-email" className="text-xs font-medium">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="staff-email"
                      type="email"
                      placeholder="Enter email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staff-password" className="text-xs font-medium">
                      Password <span className="text-destructive">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="staff-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="staff-phone" className="text-xs font-medium">
                      Phone Number
                    </Label>
                    <Input
                      id="staff-phone"
                      placeholder="Enter phone number (optional)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Role Selection */}
              <div>
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-primary" />
                  Role Assignment
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">
                      Staff Permission Role <span className="text-destructive">*</span>
                    </Label>
                    <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
                      <SelectTrigger className="h-10">
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
                    <div className="rounded-lg border bg-card p-4 shadow-sm ring-1 ring-primary/10">
                      <div className="flex items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
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
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {selectedRole.description}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
                  onClick={() => goBack('staff')}
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
