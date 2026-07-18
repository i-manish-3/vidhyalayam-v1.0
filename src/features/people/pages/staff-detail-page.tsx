'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  Shield,
  ShieldCheck,
  Users,
  Mail,
  Phone,
  GraduationCap,
  Calculator,
  Library,
  Briefcase,
  Headphones,
  Bus,
  Lock,
  LockOpen,
  CheckCircle2,
  User,
  Building2,
  type LucideIcon,
} from 'lucide-react'

interface StaffInfo {
  id: string
  userId?: string | null
  employeeId?: string | null
  name: string
  firstName?: string
  lastName?: string
  email: string
  role: string
  phone?: string | null
  isActive: boolean
  isLocked?: boolean
  lockedUntil?: string | null
  failedAttempts?: number
  gender?: string | null
  dob?: string | null
  joinDate?: string | null
  designation?: string | null
  department?: string | null
  qualification?: string | null
  address?: string | null
}

interface RolePermission {
  code: string
  name: string
  module: string
}

interface AssignedRole {
  id: string
  name: string
  color?: string | null
  permissions: RolePermission[]
}

interface UserPermissionsResponse {
  userId: string
  userName: string
  userRole: string
  effectivePermissions: string[]
  roles: AssignedRole[]
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  SCHOOL_ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  TEACHER: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  SUPER_ADMIN: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
}

const ROLE_DISPLAY_ICONS: Record<string, LucideIcon> = {
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

const MODULE_ICONS: Record<string, LucideIcon> = {
  Students: GraduationCap,
  Admissions: Users,
  Teachers: Users,
  Parents: Users,
  Attendance: CheckCircle2,
  Fees: Calculator,
  Salary: Calculator,
  Timetable: Shield,
  Exams: GraduationCap,
  Transport: Bus,
  Library: Library,
  Inventory: Briefcase,
  Notifications: Mail,
  Announcements: Headphones,
  Classes: GraduationCap,
  Subjects: GraduationCap,
  Settings: Shield,
  'Roles & Permissions': ShieldCheck,
}

const MODULE_COLORS: Record<string, string> = {
  Students: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400',
  Admissions: 'bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400',
  Teachers: 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400',
  Parents: 'bg-pink-100 dark:bg-pink-950/40 text-pink-700 dark:text-pink-400',
  Attendance: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400',
  Fees: 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400',
  Salary: 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400',
  Timetable: 'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400',
  Exams: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400',
  Transport: 'bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400',
  Library: 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400',
  Inventory: 'bg-lime-100 dark:bg-lime-950/40 text-lime-700 dark:text-lime-400',
  Notifications: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
  Announcements: 'bg-fuchsia-100 dark:bg-fuchsia-950/40 text-fuchsia-700 dark:text-fuchsia-400',
  Classes: 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400',
  Subjects: 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400',
  Settings: 'bg-gray-100 dark:bg-gray-950/40 text-gray-700 dark:text-gray-400',
  'Roles & Permissions': 'bg-slate-100 dark:bg-slate-950/40 text-slate-700 dark:text-slate-400',
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatRoleName(role: string): string {
  return role.replace(/_/g, ' ')
}

function getRoleBadgeColor(role: string): string {
  return ROLE_BADGE_COLORS[role] || 'bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400'
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-md shrink-0" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  status,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  tone: 'primary' | 'muted' | 'emerald' | 'red'
  status?: 'active' | 'locked'
}) {
  const toneMap = {
    primary: { iconBg: 'bg-primary/10', iconColor: 'text-primary', barColor: 'from-primary/60 via-primary to-primary/40' },
    muted: { iconBg: 'bg-muted', iconColor: 'text-muted-foreground', barColor: 'from-muted/60 via-muted to-muted/40' },
    emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-950/30', iconColor: 'text-emerald-600', barColor: 'from-emerald-400 via-emerald-500 to-emerald-400' },
    red: { iconBg: 'bg-red-50 dark:bg-red-950/30', iconColor: 'text-red-600', barColor: 'from-red-400 via-red-500 to-red-400' },
  }
  const t = toneMap[tone]
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/5 bg-gradient-to-br from-card via-card to-primary/[0.02] shadow-sm transition-all hover:shadow-md">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-2xl font-bold tracking-tight', status === 'locked' && 'text-red-600', status === 'active' && 'text-emerald-600')}>
              {value}
            </p>
          </div>
          <div className={cn('flex size-10 items-center justify-center rounded-xl', t.iconBg)}>
            <Icon className={cn('size-5', t.iconColor)} />
          </div>
        </div>
      </div>
      <div className={cn('absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r', t.barColor)} />
    </div>
  )
}

export function StaffDetailPage({ staffId }: { staffId: string }) {
  const router = useRouter()
  const { toast } = useToast()

  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null)
  const [permissionsData, setPermissionsData] = useState<UserPermissionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('permissions')
  const [unlocking, setUnlocking] = useState(false)

  const fetchStaffDetail = useCallback(async () => {
    try {
      setLoading(true)
      const staffRes = await api.get<{
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
        isActive: boolean
      }>(`/api/school/staff/${staffId}`)

      const mapped: StaffInfo = {
        id: staffRes.id,
        userId: staffRes.userId,
        employeeId: staffRes.employeeId,
        firstName: staffRes.firstName,
        lastName: staffRes.lastName,
        name: staffRes.name,
        email: staffRes.email || '',
        role: 'STAFF',
        phone: staffRes.phone,
        isActive: staffRes.isActive,
        gender: staffRes.gender,
        dob: staffRes.dateOfBirth,
        joinDate: staffRes.joinDate,
        designation: staffRes.designation,
        department: staffRes.department,
        qualification: staffRes.qualification,
        address: staffRes.address,
      }
      setStaffInfo(mapped)

      if (mapped.userId) {
        const permRes = await api.get<UserPermissionsResponse>(`/api/school/users/${mapped.userId}/permissions`)
        setPermissionsData(permRes)
      }
    } catch {
      toast({ title: "Couldn't Load Staff Details", description: "We couldn't load the staff details. Please try again.", variant: 'destructive' })
    } finally { setLoading(false) }
  }, [staffId, toast])

  useEffect(() => { fetchStaffDetail() }, [fetchStaffDetail])

  const permissionsByModule = useMemo(() => {
    if (!permissionsData?.roles) return {} as Record<string, RolePermission[]>
    const grouped: Record<string, RolePermission[]> = {}
    for (const role of permissionsData.roles) {
      for (const perm of role.permissions) {
        if (!grouped[perm.module]) grouped[perm.module] = []
        if (!grouped[perm.module].some((p) => p.code === perm.code)) {
          grouped[perm.module].push(perm)
        }
      }
    }
    return grouped
  }, [permissionsData])

  const sortedModules = useMemo(() => Object.keys(permissionsByModule).sort(), [permissionsByModule])

  const totalPermissions = useMemo(
    () => Object.values(permissionsByModule).reduce((sum, perms) => sum + perms.length, 0),
    [permissionsByModule]
  )

  const assignedRoleNames = useMemo(
    () => permissionsData?.roles.map((r) => r.name) || [],
    [permissionsData]
  )

  const handleBack = useCallback(() => { router.push('/staff') }, [router])

  const handleUnlock = useCallback(async () => {
    if (!staffInfo?.id) return
    try {
      setUnlocking(true)
      await api.post(`/api/school/users/${staffInfo.userId}/unlock`, {})
      await fetchStaffDetail()
      toast({ title: 'Account Unlocked', description: `${staffInfo.name} can now log in immediately.` })
    } catch (err) {
      toast({ title: "Couldn't Unlock Account", description: err instanceof Error ? err.message : "We couldn't unlock this account. Please try again.", variant: 'destructive' })
    } finally { setUnlocking(false) }
  }, [staffInfo?.id, staffInfo?.name, fetchStaffDetail, toast])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
          <div className="relative flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Users className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Staff Details</h1>
              <p className="mt-1 text-sm text-white/75">View staff member information and inherited permissions</p>
            </div>
          </div>
        </div>
        <DetailSkeleton />
      </div>
    )
  }

  if (!staffInfo) {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
          <div className="relative flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Users className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Staff Details</h1>
              <p className="mt-1 text-sm text-white/75">View staff member information and inherited permissions</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.02] via-card to-cyan-500/[0.02] py-20 text-center shadow-sm">
          <Users className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">Staff Not Found</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">The staff member you are looking for does not exist.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-6 py-6 text-white shadow-lg">
        <div aria-hidden className="absolute -right-10 -top-10 size-36 rounded-full border-[20px] border-cyan-200/15" />
        <div aria-hidden className="absolute -bottom-8 right-16 size-20 rounded-full bg-cyan-300/8" />
        <div aria-hidden className="absolute left-12 top-4 size-16 rounded-full bg-white/5 blur-md" />
        <div aria-hidden className="absolute bottom-0 left-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
              <Users className="size-6 text-white" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Staff Details</h1>
              <p className="mt-1 text-sm text-white/75">View staff member information and inherited permissions</p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
            onClick={handleBack}
            className="gap-2"
          >
            <Users className="size-4" />
            Staff List
          </Button>
        </div>
      </div>

      {/* Staff Profile Card */}
      <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] via-card to-cyan-500/[0.03] shadow-sm">
        <div aria-hidden className="absolute -right-6 -top-6 size-20 rounded-full border-[12px] border-primary/5" />
        <div className="relative px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="size-14 shrink-0 border-2 border-primary/15 shadow-md">
                <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 text-lg font-bold text-white">
                  {getInitials(staffInfo.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {staffInfo.name}
                  {staffInfo.isLocked && (
                    <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 dark:border-red-700 dark:text-red-400 gap-1">
                      <Lock className="size-3" />
                      Locked
                    </Badge>
                  )}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="secondary" className={cn('text-[10px] px-2 h-5', getRoleBadgeColor(staffInfo.role))}>
                    {formatRoleName(staffInfo.role)}
                  </Badge>
                  {assignedRoleNames.map((roleName) => {
                    const Icon = ROLE_DISPLAY_ICONS[roleName] || Shield
                    return (
                      <Badge key={roleName} variant="outline" className="text-[10px] px-2 h-5 gap-1">
                        <Icon className="size-3" />
                        {roleName}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-primary/60" />
                <span>{staffInfo.email}</span>
              </span>
              {staffInfo.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-primary/60" />
                  <span>{staffInfo.phone}</span>
                </span>
              )}
            </div>
          </div>

          {staffInfo.isLocked && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-gradient-to-br from-red-50 via-white to-red-50 px-4 py-3 dark:border-red-800 dark:from-red-950/30 dark:via-card dark:to-red-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <Lock className="size-4 shrink-0 text-red-600 dark:text-red-400" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">
                    Account temporarily locked after {staffInfo.failedAttempts ?? 5}+ failed login attempts
                  </p>
                  {staffInfo.lockedUntil && (
                    <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
                      Auto-unlocks at {new Date(staffInfo.lockedUntil).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleUnlock}
                disabled={unlocking}
                className="gap-1.5 shrink-0 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                <LockOpen className="size-3.5" />
                {unlocking ? 'Unlocking...' : 'Unlock Now'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Permissions" value={totalPermissions} icon={Shield} tone="primary" />
        <StatCard label="Modules" value={sortedModules.length} icon={ShieldCheck} tone="muted" />
        <StatCard label="Roles" value={permissionsData?.roles.length || 0} icon={Users} tone="muted" />
        <StatCard
          label="Status"
          value={staffInfo.isLocked ? 'Locked' : 'Active'}
          icon={staffInfo.isLocked ? Lock : CheckCircle2}
          tone={staffInfo.isLocked ? 'red' : 'emerald'}
          status={staffInfo.isLocked ? 'locked' : 'active'}
        />
      </div>

      {/* Inheritance Info Banner */}
      <div className="flex items-center gap-2.5 rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 via-white to-blue-50 px-4 py-2.5 dark:border-blue-800/30 dark:from-blue-950/20 dark:via-card dark:to-blue-950/20">
        <ShieldCheck className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
          Permissions are inherited from roles — modify role permissions in Roles &amp; Permissions to update this staff member&apos;s access.
        </span>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/[0.03] via-muted to-cyan-500/[0.03] p-1">
          <TabsTrigger value="permissions" className="gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ShieldCheck className="size-3.5" />
            By Module
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-1.5 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Users className="size-3.5" />
            By Role
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions" className="mt-4">
          {sortedModules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.02] via-card to-cyan-500/[0.02] py-12 text-center shadow-sm">
              <Lock className="size-10 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-semibold text-muted-foreground">No Permissions Assigned</h3>
              <p className="text-xs text-muted-foreground/70 mt-1">This staff member has not been assigned any roles with permissions.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedModules.map((moduleName) => {
                const perms = permissionsByModule[moduleName]
                const Icon = MODULE_ICONS[moduleName] || Shield
                const colorClass = MODULE_COLORS[moduleName] || 'bg-muted text-muted-foreground'
                return (
                  <div key={moduleName} className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.02] shadow-sm transition-all hover:shadow-md">
                    <div className="border-b border-primary/5 px-4 pt-3 pb-2">
                      <div className="flex items-center gap-2">
                        <div className={cn('size-7 rounded-md flex items-center justify-center shrink-0', colorClass)}>
                          <Icon className="size-3.5" />
                        </div>
                        <h3 className="text-sm font-semibold truncate">{moduleName}</h3>
                        <Badge variant="secondary" className="text-[10px] ml-auto shrink-0 bg-primary/5 text-primary">
                          {perms.length}
                        </Badge>
                      </div>
                    </div>
                    <div className="px-4 pb-3 pt-2">
                      <div className="space-y-0.5">
                        {perms.map((perm) => (
                          <div key={perm.code} className="flex items-center justify-between rounded-md bg-emerald-500/[0.06] px-2 py-1.5">
                            <span className="text-xs text-foreground truncate">{perm.name}</span>
                            <CheckCircle2 className="size-3.5 shrink-0 ml-2 text-emerald-500" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          {!permissionsData?.roles || permissionsData.roles.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.02] via-card to-cyan-500/[0.02] py-12 text-center shadow-sm">
              <Shield className="size-10 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-semibold text-muted-foreground">No Roles Assigned</h3>
              <p className="text-xs text-muted-foreground/70 mt-1">This staff member has not been assigned any roles.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {permissionsData.roles.map((role) => {
                const Icon = ROLE_DISPLAY_ICONS[role.name] || Shield
                const permsByModule: Record<string, RolePermission[]> = {}
                for (const perm of role.permissions) {
                  if (!permsByModule[perm.module]) permsByModule[perm.module] = []
                  permsByModule[perm.module].push(perm)
                }
                const moduleNames = Object.keys(permsByModule).sort()

                return (
                  <div key={role.id} className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.02] shadow-sm transition-all hover:shadow-md">
                    <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-primary/5" />
                    <div className="relative border-b border-primary/5 px-4 pt-4 pb-2">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'size-10 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/10 to-teal-500/10 text-primary',
                        )}
                          style={role.color ? { backgroundColor: `${role.color}20` } : undefined}
                        >
                          <Icon className="size-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold">{role.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ShieldCheck className="size-3" />
                              {role.permissions.length} permissions
                            </span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ShieldCheck className="size-3" />
                              {moduleNames.length} modules
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 pb-3 pt-2">
                      <div className="space-y-2">
                        {moduleNames.map((modName) => {
                          const modPerms = permsByModule[modName]
                          const ModIcon = MODULE_ICONS[modName] || Shield
                          return (
                            <div key={modName} className="rounded-lg border border-primary/5 bg-gradient-to-br from-primary/[0.02] via-card to-cyan-500/[0.02] p-2.5">
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={cn('size-5 rounded flex items-center justify-center', MODULE_COLORS[modName] || 'bg-muted')}>
                                  <ModIcon className="size-3" />
                                </div>
                                <span className="text-xs font-medium">{modName}</span>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 ml-auto bg-primary/5 text-primary">
                                  {modPerms.length}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {modPerms.map((perm) => (
                                  <Badge key={perm.code} variant="outline" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                                    <CheckCircle2 className="size-2.5 text-emerald-500" />
                                    {perm.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
