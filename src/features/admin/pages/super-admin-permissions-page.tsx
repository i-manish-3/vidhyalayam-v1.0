'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Search,
  Building2,
  ShieldCheck,
  Save,
  CheckCircle2,
  XCircle,
  Lock,
  Users,
  GraduationCap,
  DollarSign,
  CalendarCheck,
  BookOpen,
  Bus,
  Library,
  Package,
  Wallet,
  Bell,
  Megaphone,
  Settings,
  ClipboardList,
  Clock,
  Sparkles,
  Layers,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Permission {
  id: string
  code: string
  name: string
  module: string
  description?: string
  action: string
}

interface SchoolInfo {
  id: string
  name: string
  city?: string
  status: string
  subdomain?: string
  _count?: { students: number }
}

interface SchoolPermissionsResponse {
  schoolId: string
  schoolName: string
  permissions: Array<{
    id: string
    permissionId: string
    code: string
    name: string
    module: string
    action: string
    grantedBy: string
    grantedAt: string
  }>
}

// ─── Module icon mapping ─────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, LucideIcon> = {
  Students: GraduationCap,
  Admissions: ClipboardList,
  Teachers: Users,
  Parents: Users,
  Attendance: CalendarCheck,
  Fees: DollarSign,
  Salary: DollarSign,
  Timetable: Clock,
  Exams: BookOpen,
  Transport: Bus,
  Library: Library,
  Inventory: Package,
  'Petty Cash': Wallet,
  Notifications: Bell,
  Announcements: Megaphone,
  Classes: GraduationCap,
  Subjects: BookOpen,
  Settings: Settings,
  'Roles & Permissions': ShieldCheck,
}

const MODULE_COLORS: Record<string, string> = {
  Students: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
  Admissions: 'text-teal-600 bg-teal-50 dark:bg-teal-950/40',
  Teachers: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40',
  Parents: 'text-pink-600 bg-pink-50 dark:bg-pink-950/40',
  Attendance: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
  Fees: 'text-green-600 bg-green-50 dark:bg-green-950/40',
  Salary: 'text-orange-600 bg-orange-50 dark:bg-orange-950/40',
  Timetable: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/40',
  Exams: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
  Transport: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40',
  Library: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40',
  Inventory: 'text-lime-600 bg-lime-50 dark:bg-lime-950/40',
  'Petty Cash': 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40',
  Notifications: 'text-red-600 bg-red-50 dark:bg-red-950/40',
  Announcements: 'text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/40',
  Classes: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
  Subjects: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40',
  Settings: 'text-gray-600 bg-gray-50 dark:bg-gray-950/40',
  'Roles & Permissions': 'text-slate-600 bg-slate-50 dark:bg-slate-950/40',
}

const MODULE_BORDER_COLORS: Record<string, string> = {
  Students: 'border-l-emerald-500',
  Admissions: 'border-l-teal-500',
  Teachers: 'border-l-violet-500',
  Parents: 'border-l-pink-500',
  Attendance: 'border-l-amber-500',
  Fees: 'border-l-green-500',
  Salary: 'border-l-orange-500',
  Timetable: 'border-l-cyan-500',
  Exams: 'border-l-blue-500',
  Transport: 'border-l-sky-500',
  Library: 'border-l-rose-500',
  Inventory: 'border-l-lime-500',
  'Petty Cash': 'border-l-yellow-500',
  Notifications: 'border-l-red-500',
  Announcements: 'border-l-fuchsia-500',
  Classes: 'border-l-indigo-500',
  Subjects: 'border-l-purple-500',
  Settings: 'border-l-gray-500',
  'Roles & Permissions': 'border-l-slate-500',
}

const MODULE_BAR_COLORS: Record<string, string> = {
  Students: 'bg-emerald-500',
  Admissions: 'bg-teal-500',
  Teachers: 'bg-violet-500',
  Parents: 'bg-pink-500',
  Attendance: 'bg-amber-500',
  Fees: 'bg-green-500',
  Salary: 'bg-orange-500',
  Timetable: 'bg-cyan-500',
  Exams: 'bg-blue-500',
  Transport: 'bg-sky-500',
  Library: 'bg-rose-500',
  Inventory: 'bg-lime-500',
  'Petty Cash': 'bg-yellow-500',
  Notifications: 'bg-red-500',
  Announcements: 'bg-fuchsia-500',
  Classes: 'bg-indigo-500',
  Subjects: 'bg-purple-500',
  Settings: 'bg-gray-500',
  'Roles & Permissions': 'bg-slate-500',
}

const MODULE_BAR_BG: Record<string, string> = {
  Students: 'bg-emerald-100 dark:bg-emerald-950/60',
  Admissions: 'bg-teal-100 dark:bg-teal-950/60',
  Teachers: 'bg-violet-100 dark:bg-violet-950/60',
  Parents: 'bg-pink-100 dark:bg-pink-950/60',
  Attendance: 'bg-amber-100 dark:bg-amber-950/60',
  Fees: 'bg-green-100 dark:bg-green-950/60',
  Salary: 'bg-orange-100 dark:bg-orange-950/60',
  Timetable: 'bg-cyan-100 dark:bg-cyan-950/60',
  Exams: 'bg-blue-100 dark:bg-blue-950/60',
  Transport: 'bg-sky-100 dark:bg-sky-950/60',
  Library: 'bg-rose-100 dark:bg-rose-950/60',
  Inventory: 'bg-lime-100 dark:bg-lime-950/60',
  'Petty Cash': 'bg-yellow-100 dark:bg-yellow-950/60',
  Notifications: 'bg-red-100 dark:bg-red-950/60',
  Announcements: 'bg-fuchsia-100 dark:bg-fuchsia-950/60',
  Classes: 'bg-indigo-100 dark:bg-indigo-950/60',
  Subjects: 'bg-purple-100 dark:bg-purple-950/60',
  Settings: 'bg-gray-100 dark:bg-gray-950/60',
  'Roles & Permissions': 'bg-slate-100 dark:bg-slate-950/60',
}

function ModuleIcon({ module, className }: { module: string; className?: string }) {
  const IconComponent = MODULE_ICONS[module] || Lock
  return <IconComponent className={className} />
}

function getModuleColor(module: string): string {
  return MODULE_COLORS[module] || 'text-gray-600 bg-gray-50 dark:bg-gray-950/40'
}

function getModuleBorderColor(module: string): string {
  return MODULE_BORDER_COLORS[module] || 'border-l-gray-500'
}

function getModuleBarColor(module: string): string {
  return MODULE_BAR_COLORS[module] || 'bg-gray-500'
}

function getModuleBarBg(module: string): string {
  return MODULE_BAR_BG[module] || 'bg-gray-100 dark:bg-gray-950/60'
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone = 'primary',
}: {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: 'primary' | 'emerald' | 'amber' | 'sky'
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  }[tone]

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2">
      <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground/85 tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ─── Loading Skeletons ───────────────────────────────────────────────────────

function SchoolListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

function PermissionsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── School List Item ────────────────────────────────────────────────────────

function SchoolListItem({
  school,
  isSelected,
  onClick,
}: {
  school: SchoolInfo
  isSelected: boolean
  onClick: () => void
}) {
  const normalizedStatus = school.status.toLowerCase()
  const statusColor = normalizedStatus === 'active'
    ? 'bg-emerald-500'
    : normalizedStatus === 'pending' || normalizedStatus === 'trial'
    ? 'bg-amber-500'
    : 'bg-red-500'

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-150 ${
        isSelected
          ? 'border-primary/40 bg-primary/10 shadow-sm'
          : 'border-border/50 bg-background hover:border-primary/20 hover:bg-primary/[0.03]'
      }`}
    >
      <div className={`size-9 rounded-md flex items-center justify-center shrink-0 ${
        isSelected ? 'bg-primary/20' : 'bg-muted'
      }`}>
        <Building2 className={`size-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
          {school.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`size-1.5 rounded-full ${statusColor}`} />
          <span className="text-[11px] capitalize text-muted-foreground">{school.status}</span>
          {school.city && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground">{school.city}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Module Permissions Card (Grid-based, always visible) ────────────────────

function ModulePermissionsCard({
  moduleName,
  permissions,
  grantedIds,
  onToggle,
}: {
  moduleName: string
  permissions: Permission[]
  grantedIds: Set<string>
  onToggle: (id: string) => void
}) {
  const colorClass = useMemo(() => getModuleColor(moduleName), [moduleName])
  const borderColorClass = useMemo(() => getModuleBorderColor(moduleName), [moduleName])
  const barColorClass = useMemo(() => getModuleBarColor(moduleName), [moduleName])
  const barBgClass = useMemo(() => getModuleBarBg(moduleName), [moduleName])

  const grantedCount = permissions.filter((p) => grantedIds.has(p.id)).length
  const totalCount = permissions.length
  const allGranted = grantedCount === totalCount
  const noneGranted = grantedCount === 0
  const progressPercent = totalCount > 0 ? (grantedCount / totalCount) * 100 : 0

  const handleSelectAll = () => {
    for (const p of permissions) {
      if (!grantedIds.has(p.id)) onToggle(p.id)
    }
  }

  const handleDeselectAll = () => {
    for (const p of permissions) {
      if (grantedIds.has(p.id)) onToggle(p.id)
    }
  }

  return (
    <Card className={`overflow-hidden border-l-4 ${borderColorClass} bg-card/95 transition-all hover:-translate-y-0.5 hover:shadow-md`}>
      <CardHeader className="px-4 pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}>
              <ModuleIcon module={moduleName} className="size-3.5" />
            </div>
            <CardTitle className="text-sm font-semibold truncate">{moduleName}</CardTitle>
          </div>
          <Badge
            variant={allGranted ? 'default' : noneGranted ? 'secondary' : 'outline'}
            className="text-[10px] px-2 shrink-0"
          >
            {allGranted ? 'All' : noneGranted ? 'None' : `${grantedCount}/${totalCount}`}
          </Badge>
        </div>
        {/* Mini progress bar */}
        <div className={`h-1.5 rounded-full mt-2 ${barBgClass}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {grantedCount} of {totalCount} granted
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="space-y-0.5">
          {permissions.map((perm) => {
            const isGranted = grantedIds.has(perm.id)
            return (
              <div
                key={perm.id}
                className={`flex items-center justify-between py-1 px-2 rounded-md transition-colors ${
                  isGranted ? 'bg-primary/5 text-foreground' : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className={`text-xs truncate ${isGranted ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {perm.name}
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none shrink-0">
                    {perm.action}
                  </Badge>
                </div>
                <Switch
                  checked={isGranted}
                  onCheckedChange={() => onToggle(perm.id)}
                  className="shrink-0 ml-2 scale-90"
                />
              </div>
            )
          })}
        </div>
        <Separator className="my-2" />
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 flex-1"
            onClick={handleSelectAll}
            disabled={allGranted}
          >
            <CheckCircle2 className="size-2.5 mr-0.5" />
            All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 flex-1"
            onClick={handleDeselectAll}
            disabled={noneGranted}
          >
            <XCircle className="size-2.5 mr-0.5" />
            None
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminPermissionsPage() {
  const { toast } = useToast()
  const user = useAppStore((s) => s.user)

  // Data state
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [allPermissions, setAllPermissions] = useState<Record<string, Permission[]>>({})
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set())
  const [originalGrantedIds, setOriginalGrantedIds] = useState<Set<string>>(new Set())

  // UI state
  const [schoolSearch, setSchoolSearch] = useState('')
  const [loadingSchools, setLoadingSchools] = useState(true)
  const [loadingPermissions, setLoadingPermissions] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Fetch schools ──
  const fetchSchools = useCallback(async () => {
    try {
      setLoadingSchools(true)
      const res = await api.get<{ schools: SchoolInfo[] }>('/api/super-admin/schools')
      setSchools(res.schools || [])
    } catch {
      toast({ title: "Couldn't Load Schools", description: "We couldn't load the schools. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingSchools(false)
    }
  }, [toast])

  // ── Fetch all permissions catalog ──
  const fetchAllPermissions = useCallback(async () => {
    try {
      const res = await api.get<{ modules: Record<string, Permission[]> }>('/api/super-admin/permissions')
      setAllPermissions(res.modules || {})
    } catch {
      toast({ title: "Couldn't Load Permissions", description: "We couldn't load the permissions catalog. Please refresh the page.", variant: 'destructive' })
    }
  }, [toast])

  // ── Fetch school permissions ──
  const fetchSchoolPermissions = useCallback(async (schoolId: string) => {
    try {
      setLoadingPermissions(true)
      const res = await api.get<SchoolPermissionsResponse>(
        `/api/super-admin/schools/${schoolId}/permissions`
      )
      const ids = new Set(res.permissions.map((p) => p.permissionId))
      setGrantedIds(ids)
      setOriginalGrantedIds(new Set(ids))
    } catch {
      toast({ title: "Couldn't Load Permissions", description: "We couldn't load the school permissions. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingPermissions(false)
    }
  }, [toast])

  // ── Initial load ──
  useEffect(() => {
    fetchSchools()
    fetchAllPermissions()
  }, [fetchSchools, fetchAllPermissions])

  // ── Load school permissions when selected ──
  useEffect(() => {
    if (selectedSchoolId) {
      fetchSchoolPermissions(selectedSchoolId)
    } else {
      setGrantedIds(new Set())
      setOriginalGrantedIds(new Set())
      setLoadingPermissions(false)
    }
  }, [selectedSchoolId, fetchSchoolPermissions])

  // ── Toggle a single permission ──
  const handleToggle = useCallback((permissionId: string) => {
    setGrantedIds((prev) => {
      const next = new Set(prev)
      if (next.has(permissionId)) {
        next.delete(permissionId)
      } else {
        next.add(permissionId)
      }
      return next
    })
  }, [])

  // ── Save changes ──
  const handleSave = useCallback(async () => {
    if (!selectedSchoolId || !user?.id) return

    try {
      setSaving(true)
      await api.put(`/api/super-admin/schools/${selectedSchoolId}/permissions`, {
        permissionIds: Array.from(grantedIds),
        grantedBy: user.id,
      })
      setOriginalGrantedIds(new Set(grantedIds))
      toast({ title: 'Permissions Saved', description: 'School permissions updated successfully.' })
    } catch (err) {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : "We couldn't save the permissions. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [selectedSchoolId, user?.id, grantedIds, toast])

  // ── Derived state ──
  const filteredSchools = useMemo(() => {
    if (!schoolSearch.trim()) return schools
    const q = schoolSearch.toLowerCase()
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.subdomain?.toLowerCase().includes(q)
    )
  }, [schools, schoolSearch])

  const totalPermissionCount = useMemo(
    () => Object.values(allPermissions).reduce((sum, perms) => sum + perms.length, 0),
    [allPermissions]
  )

  const grantedCount = grantedIds.size
  const hasChanges = useMemo(() => {
    if (grantedIds.size !== originalGrantedIds.size) return true
    for (const id of grantedIds) {
      if (!originalGrantedIds.has(id)) return true
    }
    return false
  }, [grantedIds, originalGrantedIds])

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId),
    [schools, selectedSchoolId]
  )

  const moduleNames = useMemo(
    () => Object.keys(allPermissions).sort(),
    [allPermissions]
  )

  // ── Render ──
  const grantedPercent = totalPermissionCount > 0
    ? Math.round((grantedCount / totalPermissionCount) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary" className="w-fit gap-2 bg-primary/10 text-primary hover:bg-primary/10">
                <Sparkles className="size-3.5" />
                Super Admin Control
              </Badge>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground/90">School Access Matrix</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Decide which platform modules every school can use before roles distribute access inside the school.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[520px]">
              <SummaryTile label="Schools" value={schools.length} icon={Building2} />
              <SummaryTile label="Modules" value={moduleNames.length} icon={Layers} tone="sky" />
              <SummaryTile label="Permission Types" value={totalPermissionCount} icon={ShieldCheck} tone="emerald" />
              <SummaryTile label="Selected Grant" value={`${grantedPercent}%`} icon={CheckCircle2} tone="amber" />
            </div>
          </div>
        </div>
      </section>
      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel: School List */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="h-full overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="size-4" />
                Schools
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {schools.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Select a school to manage its enabled modules.
              </CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search schools..."
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingSchools ? (
                <SchoolListSkeleton />
              ) : filteredSchools.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Building2 className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {schoolSearch ? 'No schools match your search' : 'No schools found'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px]">
                  <div className="space-y-1 px-3 pb-3">
                    {filteredSchools.map((school) => (
                      <SchoolListItem
                        key={school.id}
                        school={school}
                        isSelected={selectedSchoolId === school.id}
                        onClick={() => setSelectedSchoolId(school.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Permission Management */}
        <div className="lg:col-span-8 xl:col-span-9">
          {!selectedSchoolId ? (
            <Card className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <ShieldCheck className="size-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">Select a School</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Choose a school from the list to view and manage its module permissions
              </p>
            </Card>
          ) : loadingPermissions ? (
            <PermissionsSkeleton />
          ) : (
            <div className="space-y-4">
              {/* Summary bar */}
              <Card className="overflow-hidden rounded-xl shadow-sm">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="size-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-foreground/90">{selectedSchool?.name}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {grantedCount} of {totalPermissionCount} permissions granted
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{
                              width: totalPermissionCount
                                ? `${(grantedCount / totalPermissionCount) * 100}%`
                                : '0%',
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                          {grantedPercent}%
                        </span>
                      </div>
                      <Button
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                        className="gap-2 shrink-0"
                      >
                        <Save className="size-4" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Unsaved changes indicator */}
              {hasChanges && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Unsaved changes — click &quot;Save Changes&quot; to apply
                  </span>
                </div>
              )}

              {/* Module cards - Grid layout */}
              <ScrollArea className="h-[calc(100vh-420px)] min-h-[300px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-1 pb-2">
                  {moduleNames.map((moduleName) => (
                    <ModulePermissionsCard
                      key={moduleName}
                      moduleName={moduleName}
                      permissions={allPermissions[moduleName]}
                      grantedIds={grantedIds}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
