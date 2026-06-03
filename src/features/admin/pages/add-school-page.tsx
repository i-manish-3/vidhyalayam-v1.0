'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Building2,
  Phone,
  Mail,
  Globe,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Palette,
  Type,
  CalendarDays,
  MapPin,
  UserCog,
  LayoutGrid,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  digitsOnly,
  validateEmail,
  validatePhone10,
  validatePincode,
  validateWebsite,
  validateHexColor,
  validatePassword,
  validatePasswordMatch,
  validateName,
  validateAcademicYear,
  validateRequired,
} from '@/lib/validators'
import {
  BOARDS,
  STATUS_OPTIONS,
  MODULE_ICONS,
  MODULE_BORDER_COLORS,
  MODULE_COLORS,
  type Permission,
} from './schools-page'

const FONTS = ['system', 'Inter', 'Roboto', 'Poppins', 'Open Sans']

type FormState = {
  name: string
  board: string
  academicYear: string
  status: string
  primaryColor: string
  dashboardFont: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
  contactPhone: string
  contactEmail: string
  website: string
  adminName: string
  adminEmail: string
  adminPhone: string
  adminPassword: string
  trialDays: string
}

const initialForm: FormState = {
  name: '',
  board: 'CBSE',
  academicYear: '2025-2026',
  status: 'trial',
  primaryColor: '#10B981',
  dashboardFont: 'system',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  contactPhone: '',
  contactEmail: '',
  website: '',
  adminName: '',
  adminEmail: '',
  adminPhone: '',
  adminPassword: '',
  trialDays: '14',
}

export function AddSchoolPage() {
  const { toast } = useToast()
  const router = useRouter()

  const [form, setForm] = useState<FormState>(initialForm)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const [permissionModules, setPermissionModules] = useState<Record<string, Permission[]>>({})
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(true)

  useEffect(() => {
    setLoadingPermissions(true)
    api
      .get<{ modules: Record<string, Permission[]> }>('/api/super-admin/permissions')
      .then((res) => {
        const modules = res.modules || {}
        setPermissionModules(modules)
        const allIds = Object.values(modules).flatMap((perms) => perms.map((p) => p.id))
        setSelectedPermissionIds(allIds)
      })
      .catch(() => {
        toast({
          title: "Couldn't Load Permissions",
          description: "We couldn't load the permissions catalog. Please refresh the page.",
          variant: 'destructive',
        })
      })
      .finally(() => setLoadingPermissions(false))
  }, [toast])

  const errors = {
    name: validateRequired(form.name, 'School name'),
    academicYear: validateAcademicYear(form.academicYear, true),
    primaryColor: validateHexColor(form.primaryColor, true),
    pincode: validatePincode(form.pincode, false),
    contactPhone: validatePhone10(form.contactPhone, false),
    contactEmail: validateEmail(form.contactEmail, false),
    website: validateWebsite(form.website, false),
    adminName: validateName(form.adminName, 'Admin name'),
    adminEmail: validateEmail(form.adminEmail, true),
    adminPhone: validatePhone10(form.adminPhone, false),
    adminPassword: validatePassword(form.adminPassword, 6),
    confirmPassword: validatePasswordMatch(form.adminPassword, confirmPassword),
    trialDays:
      form.status === 'trial'
        ? (() => {
            const n = Number(form.trialDays)
            if (!form.trialDays.trim()) return 'Please enter trial duration in days.'
            if (!Number.isFinite(n) || n < 1 || n > 365 || !Number.isInteger(n)) {
              return 'Trial duration must be a whole number between 1 and 365.'
            }
            return null
          })()
        : null,
  }

  const showErr = (err: string | null, value: string): string | null => {
    if (!err) return null
    return value || submitAttempted ? err : null
  }

  const isValid = Object.values(errors).every((e) => e === null)

  const moduleEntries = Object.entries(permissionModules)
  const modulesSelected = moduleEntries.filter(([, perms]) =>
    perms.some((p) => selectedPermissionIds.includes(p.id))
  ).length

  const handleSelectAllModules = () => {
    const allIds = Object.values(permissionModules).flatMap((perms) => perms.map((p) => p.id))
    setSelectedPermissionIds(allIds)
  }

  const handleDeselectAllModules = () => setSelectedPermissionIds([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitAttempted(true)
    if (!isValid || submitting) {
      if (!isValid) {
        toast({
          title: 'Fix the highlighted errors',
          description: 'Please review the form — some fields are invalid or missing.',
          variant: 'destructive',
        })
      }
      return
    }
    try {
      setSubmitting(true)
      await api.post('/api/super-admin/schools', {
        ...form,
        trialDays: form.status === 'trial' ? Number(form.trialDays) : undefined,
        permissionIds: selectedPermissionIds,
      })
      toast({ title: 'School Created', description: `${form.name} has been created successfully.` })
      router.push('/admin/schools')
    } catch (err) {
      toast({
        title: "Couldn't Create School",
        description: err instanceof Error ? err.message : "We couldn't create the school. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-tight">Add School</h1>
            <p className="text-xs text-muted-foreground leading-tight">
              Create a new school tenant with admin & module permissions
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => router.push('/admin/schools')}
        >
          <Eye className="size-4" />
          <span className="hidden sm:inline">View Schools</span>
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* ---------- School Identity ---------- */}
            <section className="rounded-lg border bg-muted/30 p-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <Building2 className="size-3.5" />
                </div>
                School Identity
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="space-y-1.5">
                  <Label>
                    School Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="e.g., Delhi Public School"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className={cn('h-9', showErr(errors.name, form.name) && 'border-destructive focus-visible:ring-destructive/30')}
                  />
                  {showErr(errors.name, form.name) && (
                    <p className="text-xs text-destructive">{errors.name}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Board <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.board} onValueChange={(v) => setForm((f) => ({ ...f, board: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOARDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* ---------- Academic Settings ---------- */}
            <section className="rounded-lg border bg-muted/30 p-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="size-6 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <CalendarDays className="size-3.5" />
                </div>
                Academic Settings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label>
                    Academic Year <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="2025-2026"
                    value={form.academicYear}
                    onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))}
                    maxLength={9}
                    className={cn('h-9', showErr(errors.academicYear, form.academicYear) && 'border-destructive focus-visible:ring-destructive/30')}
                  />
                  {showErr(errors.academicYear, form.academicYear) && (
                    <p className="text-xs text-destructive">{errors.academicYear}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Initial Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter((s) => s.value !== 'suspended').map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {form.status === 'trial' && (
                <div className="mt-2.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label>
                      Trial Duration (days) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      placeholder="14"
                      value={form.trialDays}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          trialDays: e.target.value.replace(/[^0-9]/g, '').slice(0, 3),
                        }))
                      }
                      className={cn(
                        'h-9',
                        showErr(errors.trialDays, form.trialDays) &&
                          'border-destructive focus-visible:ring-destructive/30'
                      )}
                    />
                    {showErr(errors.trialDays, form.trialDays) ? (
                      <p className="text-xs text-destructive">{errors.trialDays}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        You can convert the school to Active any time before the trial ends.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ---------- Branding ---------- */}
            <section className="rounded-lg border bg-muted/30 p-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="size-6 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Palette className="size-3.5" />
                </div>
                Branding
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Palette className="size-3.5" />
                    Primary Color
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(form.primaryColor) ? form.primaryColor : '#10B981'}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, primaryColor: e.target.value.toUpperCase() }))
                      }
                      className="h-9 w-12 rounded-md border border-input bg-background cursor-pointer"
                    />
                    <Input
                      value={form.primaryColor}
                      onChange={(e) => {
                        const v = e.target.value.toUpperCase()
                        if (/^#[0-9A-F]{0,6}$/.test(v) || v === '') {
                          setForm((f) => ({ ...f, primaryColor: v }))
                        }
                      }}
                      maxLength={7}
                      placeholder="#10B981"
                      className={cn('h-9 font-mono', showErr(errors.primaryColor, form.primaryColor) && 'border-destructive focus-visible:ring-destructive/30')}
                    />
                  </div>
                  {showErr(errors.primaryColor, form.primaryColor) && (
                    <p className="text-xs text-destructive">{errors.primaryColor}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Type className="size-3.5" />
                    Dashboard Font
                  </Label>
                  <Select
                    value={form.dashboardFont}
                    onValueChange={(v) => setForm((f) => ({ ...f, dashboardFont: v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONTS.map((font) => (
                        <SelectItem key={font} value={font}>
                          {font === 'system' ? 'System Default' : font}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* ---------- Contact & Address ---------- */}
            <section className="rounded-lg border bg-muted/30 p-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="size-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <MapPin className="size-3.5" />
                </div>
                Contact & Address
              </h3>
              <div className="space-y-2.5">
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input
                    placeholder="Street address"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <Input
                      placeholder="City"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>State</Label>
                    <Input
                      placeholder="State"
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pincode</Label>
                    <Input
                      placeholder="110001"
                      value={form.pincode}
                      onChange={(e) => setForm((f) => ({ ...f, pincode: digitsOnly(e.target.value).slice(0, 6) }))}
                      inputMode="numeric"
                      maxLength={6}
                      className={cn('h-9', showErr(errors.pincode, form.pincode) && 'border-destructive focus-visible:ring-destructive/30')}
                    />
                    {showErr(errors.pincode, form.pincode) && (
                      <p className="text-xs text-destructive">{errors.pincode}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Country</Label>
                    <Input
                      placeholder="India"
                      value={form.country}
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact Phone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="9876543210"
                        inputMode="numeric"
                        maxLength={10}
                        className={cn('pl-9 h-9', showErr(errors.contactPhone, form.contactPhone) && 'border-destructive focus-visible:ring-destructive/30')}
                        value={form.contactPhone}
                        onChange={(e) => setForm((f) => ({ ...f, contactPhone: digitsOnly(e.target.value).slice(0, 10) }))}
                      />
                    </div>
                    {showErr(errors.contactPhone, form.contactPhone) && (
                      <p className="text-xs text-destructive">{errors.contactPhone}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        placeholder="info@school.com"
                        className={cn('pl-9 h-9', showErr(errors.contactEmail, form.contactEmail) && 'border-destructive focus-visible:ring-destructive/30')}
                        value={form.contactEmail}
                        onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                      />
                    </div>
                    {showErr(errors.contactEmail, form.contactEmail) && (
                      <p className="text-xs text-destructive">{errors.contactEmail}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Website</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="https://www.school.com"
                      className={cn('pl-9 h-9', showErr(errors.website, form.website) && 'border-destructive focus-visible:ring-destructive/30')}
                      value={form.website}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    />
                  </div>
                  {showErr(errors.website, form.website) && (
                    <p className="text-xs text-destructive">{errors.website}</p>
                  )}
                </div>
              </div>
            </section>

            {/* ---------- Administrator Account ---------- */}
            <section className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/10 p-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-foreground">
                <div className="size-6 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <UserCog className="size-3.5" />
                </div>
                Administrator Account
              </h3>
              <div className="flex items-start gap-2 rounded-md border border-amber-300/60 dark:border-amber-800/60 bg-amber-100/60 dark:bg-amber-900/20 px-2.5 py-1.5 mb-2.5">
                <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs leading-snug text-amber-900 dark:text-amber-200">
                  <span className="font-semibold">Caution:</span> This account will be the primary
                  administrator with full access to manage every aspect of the school after login.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <div className="space-y-1.5">
                  <Label>
                    Admin Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Full Name"
                    value={form.adminName}
                    onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                    className={cn('h-9', showErr(errors.adminName, form.adminName) && 'border-destructive focus-visible:ring-destructive/30')}
                  />
                  {showErr(errors.adminName, form.adminName) && (
                    <p className="text-xs text-destructive">{errors.adminName}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Admin Email <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="admin@school.com"
                      className={cn('pl-9 h-9', showErr(errors.adminEmail, form.adminEmail) && 'border-destructive focus-visible:ring-destructive/30')}
                      value={form.adminEmail}
                      onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                    />
                  </div>
                  {showErr(errors.adminEmail, form.adminEmail) && (
                    <p className="text-xs text-destructive">{errors.adminEmail}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Admin Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="9876543210"
                      inputMode="numeric"
                      maxLength={10}
                      className={cn('pl-9 h-9', showErr(errors.adminPhone, form.adminPhone) && 'border-destructive focus-visible:ring-destructive/30')}
                      value={form.adminPhone}
                      onChange={(e) => setForm((f) => ({ ...f, adminPhone: digitsOnly(e.target.value).slice(0, 10) }))}
                    />
                  </div>
                  {showErr(errors.adminPhone, form.adminPhone) && (
                    <p className="text-xs text-destructive">{errors.adminPhone}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Password <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 6 characters"
                      value={form.adminPassword}
                      onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                      className={cn('h-9 pr-10', showErr(errors.adminPassword, form.adminPassword) && 'border-destructive focus-visible:ring-destructive/30')}
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
                  {showErr(errors.adminPassword, form.adminPassword) && (
                    <p className="text-xs text-destructive">{errors.adminPassword}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Confirm Password <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Re-enter the password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={cn('h-9 pr-10', showErr(errors.confirmPassword, confirmPassword) && 'border-destructive focus-visible:ring-destructive/30')}
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
                  {showErr(errors.confirmPassword, confirmPassword) && (
                    <p className="text-xs text-destructive">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>
            </section>

            {/* ---------- Module Permissions ---------- */}
            <section className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                  <div className="size-6 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <LayoutGrid className="size-3.5" />
                  </div>
                  Module Permissions
                </h3>
                {!loadingPermissions && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={handleSelectAllModules}
                    >
                      <CheckCircle2 className="size-3 mr-1" />
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={handleDeselectAllModules}
                    >
                      <XCircle className="size-3 mr-1" />
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {loadingPermissions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">
                      {modulesSelected}/{moduleEntries.length}
                    </span>{' '}
                    modules · {selectedPermissionIds.length} permissions enabled. Tweak later from
                    the Permissions page.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
                    {moduleEntries.map(([moduleName, permissions]) => {
                      const IconComponent = MODULE_ICONS[moduleName] || ShieldCheck
                      const borderColor = MODULE_BORDER_COLORS[moduleName] || 'border-l-gray-500'
                      const colorClass =
                        MODULE_COLORS[moduleName] || 'text-gray-600 bg-gray-50 dark:bg-gray-950/40'
                      const modulePermIds = permissions.map((p) => p.id)
                      const isModuleEnabled = modulePermIds.some((id) =>
                        selectedPermissionIds.includes(id)
                      )

                      const toggle = () => {
                        if (isModuleEnabled) {
                          setSelectedPermissionIds((prev) =>
                            prev.filter((id) => !modulePermIds.includes(id))
                          )
                        } else {
                          setSelectedPermissionIds((prev) => [
                            ...new Set([...prev, ...modulePermIds]),
                          ])
                        }
                      }

                      return (
                        <button
                          type="button"
                          key={moduleName}
                          onClick={toggle}
                          className={cn(
                            'group relative flex items-center gap-2 rounded-md border border-l-[3px] bg-card px-2.5 py-2 text-left transition-all hover:shadow-sm hover:border-foreground/20',
                            borderColor,
                            isModuleEnabled
                              ? 'ring-1 ring-primary/30 bg-primary/[0.03]'
                              : 'opacity-70 hover:opacity-100'
                          )}
                        >
                          <div
                            className={cn(
                              'size-7 rounded-md flex items-center justify-center shrink-0',
                              colorClass
                            )}
                          >
                            <IconComponent className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold leading-tight truncate">
                              {moduleName}
                            </p>
                            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                              {permissions.length} permissions
                            </p>
                          </div>
                          <div
                            className={cn(
                              'size-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors',
                              isModuleEnabled
                                ? 'bg-primary border-primary'
                                : 'border-muted-foreground/30 group-hover:border-muted-foreground/60'
                            )}
                          >
                            {isModuleEnabled && (
                              <CheckCircle2 className="size-3 text-primary-foreground" strokeWidth={3} />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </section>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/admin/schools')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!isValid || submitting}
                className="gap-2 min-w-[140px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Building2 className="size-3.5" />
                    Create School
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
