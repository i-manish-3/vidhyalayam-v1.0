'use client'

import { useState, useEffect, useCallback } from 'react'
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
  CheckCircle2,
  XCircle,
  CalendarDays,
  MapPin,
  LayoutGrid,
  ShieldCheck,
  Save,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  digitsOnly,
  validateEmail,
  validatePhone10,
  validatePincode,
  validateWebsite,
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

type FormState = {
  name: string
  board: string
  academicYear: string
  status: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
  contactPhone: string
  contactEmail: string
  website: string
  trialDays: string
}

const emptyForm: FormState = {
  name: '', board: 'CBSE', academicYear: '2025-2026', status: 'active',
  address: '', city: '', state: '', pincode: '', country: 'India',
  contactPhone: '', contactEmail: '', website: '', trialDays: '14',
}

interface SchoolDetail {
  id: string
  name: string
  board?: string
  academicYear?: string
  status?: string
  trialEndsAt?: string | null
  address?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  contactPhone?: string
  contactEmail?: string
  website?: string
}

interface AssignedPermission {
  permissionId: string
}

export function EditSchoolPage({ schoolId }: { schoolId: string }) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [schoolName, setSchoolName] = useState('')
  const [originalStatus, setOriginalStatus] = useState('')

  const [permissionModules, setPermissionModules] = useState<Record<string, Permission[]>>({})
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(true)

  /* ── Load school + catalog + assigned permissions ── */
  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadingPermissions(true)
    try {
      const [school, catalog, assigned] = await Promise.all([
        api.get<SchoolDetail>(`/api/super-admin/schools/${schoolId}`),
        api.get<{ modules: Record<string, Permission[]> }>(`/api/super-admin/permissions`),
        api.get<{ permissions: AssignedPermission[] }>(`/api/super-admin/schools/${schoolId}/permissions`),
      ])

      setSchoolName(school.name)
      setOriginalStatus(school.status || 'active')

      // Derive trial days remaining from trialEndsAt (if any)
      let trialDays = '14'
      if (school.trialEndsAt) {
        const diffMs = new Date(school.trialEndsAt).getTime() - Date.now()
        const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)))
        trialDays = String(days)
      }

      setForm({
        name: school.name || '',
        board: school.board || 'CBSE',
        academicYear: school.academicYear || '2025-2026',
        status: school.status || 'active',
        address: school.address || '',
        city: school.city || '',
        state: school.state || '',
        pincode: school.pincode || '',
        country: school.country || 'India',
        contactPhone: school.contactPhone || '',
        contactEmail: school.contactEmail || '',
        website: school.website || '',
        trialDays,
      })

      setPermissionModules(catalog.modules || {})
      setSelectedPermissionIds(assigned.permissions.map((p) => p.permissionId))
    } catch (err) {
      toast({
        title: "Couldn't Load School",
        description: err instanceof Error ? err.message : "We couldn't load the school details. Please try again.",
        variant: 'destructive',
      })
      router.push('/admin/schools')
    } finally {
      setLoading(false)
      setLoadingPermissions(false)
    }
  }, [schoolId, toast, router])

  useEffect(() => { loadData() }, [loadData])

  /* ── Validation ── */
  const errors = {
    name: validateRequired(form.name, 'School name'),
    academicYear: validateAcademicYear(form.academicYear, true),
    pincode: validatePincode(form.pincode, false),
    contactPhone: validatePhone10(form.contactPhone, false),
    contactEmail: validateEmail(form.contactEmail, false),
    website: validateWebsite(form.website, false),
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

  /* ── Permissions helpers ── */
  const moduleEntries = Object.entries(permissionModules)
  const modulesSelected = moduleEntries.filter(([, perms]) =>
    perms.some((p) => selectedPermissionIds.includes(p.id))
  ).length

  const handleSelectAllModules = () => {
    const allIds = Object.values(permissionModules).flatMap((perms) => perms.map((p) => p.id))
    setSelectedPermissionIds(allIds)
  }
  const handleDeselectAllModules = () => setSelectedPermissionIds([])

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schoolId) return
    setSubmitAttempted(true)
    if (!isValid || submitting) {
      if (!isValid) {
        toast({
          title: 'Fix the highlighted errors',
          description: 'Please review the form — some fields are invalid.',
          variant: 'destructive',
        })
      }
      return
    }
    try {
      setSubmitting(true)
      const patchPayload: Record<string, unknown> = {
        name: form.name,
        board: form.board,
        academicYear: form.academicYear,
        status: form.status,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        country: form.country,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        website: form.website,
      }
      // Send trialDays only when (re-)entering trial; backend recomputes trialEndsAt.
      if (form.status === 'trial' && (originalStatus !== 'trial' || form.trialDays)) {
        patchPayload.trialDays = Number(form.trialDays)
      }

      await Promise.all([
        api.patch(`/api/super-admin/schools/${schoolId}`, patchPayload),
        api.put(`/api/super-admin/schools/${schoolId}/permissions`, {
          permissionIds: selectedPermissionIds,
        }),
      ])

      toast({ title: 'School Updated', description: `${form.name} has been updated successfully.` })
      router.push(`/admin/schools/${schoolId}`)
    } catch (err) {
      toast({
        title: "Couldn't Update School",
        description: err instanceof Error ? err.message : "We couldn't update the school. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Render ── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading school details...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-tight truncate">Edit School</h1>
            <p className="text-xs text-muted-foreground leading-tight truncate">
              Updating <span className="font-medium text-foreground">{schoolName}</span>
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={() => router.push(`/admin/schools/${schoolId}`)}
        >
          <Eye className="size-4" />
          <span className="hidden sm:inline">View Details</span>
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
                  <Label>Board</Label>
                  <Select value={form.board} onValueChange={(v) => setForm((f) => ({ ...f, board: v }))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOARDS.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
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
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
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
                        showErr(errors.trialDays, form.trialDays) && 'border-destructive focus-visible:ring-destructive/30'
                      )}
                    />
                    {showErr(errors.trialDays, form.trialDays) ? (
                      <p className="text-xs text-destructive">{errors.trialDays}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {originalStatus === 'trial'
                          ? 'Updating this resets the trial end date from today.'
                          : 'Trial end date will start from today.'}
                      </p>
                    )}
                  </div>
                </div>
              )}
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
                    modules · {selectedPermissionIds.length} permissions enabled. Saving replaces the full permission set.
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

            {/* ---------- Actions ---------- */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/schools/${schoolId}`)}
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
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="size-3.5" />
                    Save Changes
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
