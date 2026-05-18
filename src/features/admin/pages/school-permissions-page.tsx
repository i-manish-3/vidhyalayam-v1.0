'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import {
  Search,
  ShieldCheck,
  Shield,
  Save,
  Users,
  Lock,
  UserCircle,
  CheckCircle2,
  XCircle,
  Ban,
  PlusCircle,
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
  UserCog,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolUser {
  id: string
  name: string
  email?: string
  phone?: string
  role: string
  userId?: string
  firstName?: string
  lastName?: string
  fullName?: string
  employeeId?: string
  specialization?: string
}

interface UserPermissionData {
  userId: string
  userName: string
  userRole: string
  effectivePermissions: string[]
  roles: Array<{
    id: string
    name: string
    color?: string | null
    permissions: Array<{
      code: string
      name: string
      module: string
    }>
  }>
  directPermissions: Array<{
    id: string
    permissionId: string
    code: string
    name: string
    module: string
    action: string
    granted: boolean
    grantedBy: string
  }>
}

interface UserRolesData {
  userId: string
  userName: string
  userRole: string
  roles: Array<{
    id: string
    name: string
    description?: string | null
    color?: string | null
    isSystem: boolean
    permissionCount: number
    assignedBy: string
    assignedAt: string
  }>
}

interface Permission {
  id: string
  code: string
  name: string
  module: string
  action: string
  description?: string
}

interface RoleOption {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  permissionCount: number
  userCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Permission Status ───────────────────────────────────────────────────────

type PermStatus = 'role-inherited' | 'direct-grant' | 'denied' | 'none'

// ─── Loading Skeletons ───────────────────────────────────────────────────────

function UserSelectorSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
          <Skeleton className="size-9 rounded-full" />
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
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
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

// ─── User List Item ──────────────────────────────────────────────────────────

function UserListItem({
  userItem,
  isSelected,
  onClick,
}: {
  userItem: SchoolUser
  isSelected: boolean
  onClick: () => void
}) {
  const initials = (userItem.fullName || userItem.name)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-150 ${
        isSelected
          ? 'bg-primary/10 border border-primary/20 shadow-sm'
          : 'hover:bg-muted/60 border border-transparent'
      }`}
    >
      <div
        className={`size-9 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
          isSelected
            ? 'bg-primary/20 text-primary'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
          {userItem.fullName || userItem.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none">
            {userItem.role}
          </Badge>
          {userItem.employeeId && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground">{userItem.employeeId}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Module Permission Card (Grid-based, always visible) ────────────────────

function UserModulePermissionsCard({
  moduleName,
  permissions,
  rolePermCodes,
  grants,
  denies,
  onGrant,
  onDeny,
  onClear,
}: {
  moduleName: string
  permissions: Permission[]
  rolePermCodes: Set<string>
  grants: Set<string>
  denies: Set<string>
  onGrant: (code: string) => void
  onDeny: (code: string) => void
  onClear: (code: string) => void
}) {
  const colorClass = useMemo(() => getModuleColor(moduleName), [moduleName])
  const borderColorClass = useMemo(() => getModuleBorderColor(moduleName), [moduleName])
  const barColorClass = useMemo(() => getModuleBarColor(moduleName), [moduleName])
  const barBgClass = useMemo(() => getModuleBarBg(moduleName), [moduleName])

  const getStatus = (code: string): PermStatus => {
    if (denies.has(code)) return 'denied'
    if (grants.has(code)) return 'direct-grant'
    if (rolePermCodes.has(code)) return 'role-inherited'
    return 'none'
  }

  const grantedCount = permissions.filter((p) => {
    const status = getStatus(p.code)
    return status === 'role-inherited' || status === 'direct-grant'
  }).length
  const totalCount = permissions.length
  const allGranted = grantedCount === totalCount
  const noneGranted = grantedCount === 0
  const progressPercent = totalCount > 0 ? (grantedCount / totalCount) * 100 : 0

  const handleGrantAll = () => {
    for (const p of permissions) {
      if (denies.has(p.code)) onClear(p.code)
      if (!rolePermCodes.has(p.code) && !grants.has(p.code)) onGrant(p.code)
    }
  }

  const handleDenyAll = () => {
    for (const p of permissions) {
      if (grants.has(p.code)) onClear(p.code)
      if (!denies.has(p.code)) onDeny(p.code)
    }
  }

  const handleClearAll = () => {
    for (const p of permissions) {
      if (grants.has(p.code) || denies.has(p.code)) onClear(p.code)
    }
  }

  return (
    <Card className={`overflow-hidden border-l-4 ${borderColorClass} transition-shadow hover:shadow-md`}>
      <CardHeader className="pb-2 pt-4 px-4">
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
        <p className="text-[11px] text-muted-foreground mt-1">
          {grantedCount} of {totalCount} effective
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="space-y-0.5">
          {permissions.map((perm) => {
            const status = getStatus(perm.code)
            return (
              <div
                key={perm.id}
                className={`flex items-center justify-between py-1 px-2 rounded-md transition-colors ${
                  status === 'denied'
                    ? 'bg-red-50/60 dark:bg-red-950/20'
                    : status === 'direct-grant'
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                    : status === 'role-inherited'
                    ? 'bg-blue-50/30 dark:bg-blue-950/10'
                    : 'hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`text-xs truncate ${
                      status === 'denied'
                        ? 'text-red-700 dark:text-red-400 line-through'
                        : status === 'direct-grant'
                        ? 'text-foreground font-medium'
                        : status === 'role-inherited'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {perm.name}
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none shrink-0">
                    {perm.action}
                  </Badge>
                </div>
                {/* Tri-state control buttons */}
                <div className="flex items-center gap-0.5 ml-2 shrink-0">
                  {status === 'none' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-5 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        onClick={() => onGrant(perm.code)}
                        title="Grant permission"
                      >
                        <PlusCircle className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-5 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        onClick={() => onDeny(perm.code)}
                        title="Deny permission"
                      >
                        <Ban className="size-3" />
                      </Button>
                    </>
                  )}
                  {status === 'direct-grant' && (
                    <>
                      <Badge className="text-[8px] px-1 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100">
                        ✓
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-5 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        onClick={() => onDeny(perm.code)}
                        title="Deny permission"
                      >
                        <Ban className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-5 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        onClick={() => onClear(perm.code)}
                        title="Clear override"
                      >
                        <XCircle className="size-3" />
                      </Button>
                    </>
                  )}
                  {status === 'denied' && (
                    <>
                      <Badge className="text-[8px] px-1 py-0 h-4 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-100">
                        ✗
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-5 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        onClick={() => onClear(perm.code)}
                        title="Clear override"
                      >
                        <XCircle className="size-3" />
                      </Button>
                    </>
                  )}
                  {status === 'role-inherited' && (
                    <>
                      <Badge className="text-[8px] px-1 py-0 h-4 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-default">
                        Role
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-5 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        onClick={() => onDeny(perm.code)}
                        title="Override: deny this role permission"
                      >
                        <Ban className="size-3" />
                      </Button>
                    </>
                  )}
                </div>
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
            onClick={handleGrantAll}
            disabled={allGranted}
          >
            <PlusCircle className="size-2.5 mr-0.5" />
            Grant
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 flex-1"
            onClick={handleDenyAll}
            disabled={noneGranted}
          >
            <Ban className="size-2.5 mr-0.5" />
            Deny
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 flex-1"
            onClick={handleClearAll}
          >
            <RotateCcw className="size-2.5 mr-0.5" />
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SchoolPermissionsPage() {
  const { toast } = useToast()
  const currentUser = useAppStore((s) => s.user)

  // User list state
  const [users, setUsers] = useState<SchoolUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)

  // Selected user state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // User permissions data
  const [permData, setPermData] = useState<UserPermissionData | null>(null)
  const [userRolesData, setUserRolesData] = useState<UserRolesData | null>(null)
  const [loadingPerms, setLoadingPerms] = useState(false)

  // School permissions catalog
  const [schoolPermissions, setSchoolPermissions] = useState<Record<string, Permission[]>>({})

  // Available roles for assignment
  const [availableRoles, setAvailableRoles] = useState<RoleOption[]>([])

  // Edit state: grants and denies (permission CODES)
  const [grants, setGrants] = useState<Set<string>>(new Set())
  const [denies, setDenies] = useState<Set<string>>(new Set())
  const [originalGrants, setOriginalGrants] = useState<Set<string>>(new Set())
  const [originalDenies, setOriginalDenies] = useState<Set<string>>(new Set())

  // Role assignment state
  const [assignedRoleIds, setAssignedRoleIds] = useState<Set<string>>(new Set())
  const [originalRoleIds, setOriginalRoleIds] = useState<Set<string>>(new Set())

  const [saving, setSaving] = useState(false)

  // ── Fetch users ──
  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const res = await api.get<{ teachers: SchoolUser[] }>('/api/school/teachers?limit=100')
      const teacherUsers = (res.teachers || []).map((t: SchoolUser) => ({
        id: t.userId || t.id,
        name: t.fullName || `${t.firstName || ''} ${t.lastName || ''}`.trim(),
        email: t.email,
        phone: t.phone,
        role: 'TEACHER',
        employeeId: t.employeeId,
        specialization: t.specialization,
        userId: t.userId,
        fullName: t.fullName,
      }))
      setUsers(teacherUsers.filter((u: SchoolUser) => u.userId))
    } catch {
      toast({ title: "Couldn't Load Users", description: "We couldn't load the users list. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingUsers(false)
    }
  }, [toast])

  // ── Fetch school permissions ──
  const fetchSchoolPermissions = useCallback(async () => {
    try {
      const res = await api.get<{ modules: Record<string, Permission[]> }>('/api/school/permissions')
      setSchoolPermissions(res.modules || {})
    } catch {
      toast({ title: "Couldn't Load Permissions", description: "We couldn't load the permissions list. Please refresh the page.", variant: 'destructive' })
    }
  }, [toast])

  // ── Fetch available roles ──
  const fetchAvailableRoles = useCallback(async () => {
    try {
      const res = await api.get<{ roles: RoleOption[] }>('/api/school/roles')
      setAvailableRoles(res.roles || [])
    } catch {
      // Non-critical, just skip
    }
  }, [])

  // ── Initial load ──
  useEffect(() => {
    fetchUsers()
    fetchSchoolPermissions()
    fetchAvailableRoles()
  }, [fetchUsers, fetchSchoolPermissions, fetchAvailableRoles])

  // ── Fetch user permissions when selected ──
  useEffect(() => {
    if (!selectedUserId) {
      setPermData(null)
      setUserRolesData(null)
      setGrants(new Set())
      setDenies(new Set())
      setOriginalGrants(new Set())
      setOriginalDenies(new Set())
      setAssignedRoleIds(new Set())
      setOriginalRoleIds(new Set())
      setLoadingPerms(false)
      return
    }

    const loadUserData = async () => {
      try {
        setLoadingPerms(true)
        const [permRes, rolesRes] = await Promise.all([
          api.get<UserPermissionData>(`/api/school/users/${selectedUserId}/permissions`),
          api.get<UserRolesData>(`/api/school/users/${selectedUserId}/roles`),
        ])

        setPermData(permRes)
        setUserRolesData(rolesRes)

        // Set direct permissions state
        const directGrants = new Set(
          permRes.directPermissions.filter((dp) => dp.granted).map((dp) => dp.code)
        )
        const directDenies = new Set(
          permRes.directPermissions.filter((dp) => !dp.granted).map((dp) => dp.code)
        )
        setGrants(directGrants)
        setDenies(directDenies)
        setOriginalGrants(new Set(directGrants))
        setOriginalDenies(new Set(directDenies))

        // Set role assignments
        const roleIds = new Set(rolesRes.roles.map((r) => r.id))
        setAssignedRoleIds(roleIds)
        setOriginalRoleIds(new Set(roleIds))
      } catch {
        toast({ title: "Couldn't Load Permissions", description: "We couldn't load the user's permissions. Please try again.", variant: 'destructive' })
      } finally {
        setLoadingPerms(false)
      }
    }

    loadUserData()
  }, [selectedUserId, toast])

  // ── Permission overrides ──
  const handleGrant = useCallback((code: string) => {
    setGrants((prev) => new Set(prev).add(code))
    setDenies((prev) => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
  }, [])

  const handleDeny = useCallback((code: string) => {
    setDenies((prev) => new Set(prev).add(code))
    setGrants((prev) => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
  }, [])

  const handleClear = useCallback((code: string) => {
    setGrants((prev) => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
    setDenies((prev) => {
      const next = new Set(prev)
      next.delete(code)
      return next
    })
  }, [])

  // ── Role assignment toggle ──
  const handleToggleRole = useCallback((roleId: string) => {
    setAssignedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId)
      } else {
        next.add(roleId)
      }
      return next
    })
  }, [])

  // ── Save all changes ──
  const handleSave = useCallback(async () => {
    if (!selectedUserId || !currentUser?.id) return

    try {
      setSaving(true)

      // Save permission changes
      const permHasChanges =
        grants.size !== originalGrants.size ||
        denies.size !== originalDenies.size ||
        Array.from(grants).some((c) => !originalGrants.has(c)) ||
        Array.from(denies).some((c) => !originalDenies.has(c))

      const roleHasChanges =
        assignedRoleIds.size !== originalRoleIds.size ||
        Array.from(assignedRoleIds).some((id) => !originalRoleIds.has(id))

      const promises: Promise<unknown>[] = []

      if (permHasChanges) {
        promises.push(
          api.put(`/api/school/users/${selectedUserId}/permissions`, {
            grants: Array.from(grants),
            denies: Array.from(denies),
          })
        )
      }

      if (roleHasChanges) {
        promises.push(
          api.put(`/api/school/users/${selectedUserId}/roles`, {
            roleIds: Array.from(assignedRoleIds),
            assignedBy: currentUser.id,
          })
        )
      }

      await Promise.all(promises)

      // Refresh data
      const [permRes, rolesRes] = await Promise.all([
        api.get<UserPermissionData>(`/api/school/users/${selectedUserId}/permissions`),
        api.get<UserRolesData>(`/api/school/users/${selectedUserId}/roles`),
      ])

      setPermData(permRes)
      setUserRolesData(rolesRes)

      const directGrants = new Set(
        permRes.directPermissions.filter((dp) => dp.granted).map((dp) => dp.code)
      )
      const directDenies = new Set(
        permRes.directPermissions.filter((dp) => !dp.granted).map((dp) => dp.code)
      )
      setGrants(directGrants)
      setDenies(directDenies)
      setOriginalGrants(new Set(directGrants))
      setOriginalDenies(new Set(directDenies))

      const roleIds = new Set(rolesRes.roles.map((r) => r.id))
      setAssignedRoleIds(roleIds)
      setOriginalRoleIds(new Set(roleIds))

      toast({ title: 'Permissions Saved', description: 'User permissions updated successfully.' })
    } catch (err) {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [selectedUserId, currentUser?.id, grants, denies, originalGrants, originalDenies, assignedRoleIds, originalRoleIds, toast])

  // ── Derived state ──
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users
    const q = userSearch.toLowerCase()
    return users.filter(
      (u) =>
        (u.fullName || u.name).toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.employeeId?.toLowerCase().includes(q)
    )
  }, [users, userSearch])

  const moduleNames = useMemo(
    () => Object.keys(schoolPermissions).sort(),
    [schoolPermissions]
  )

  // Build a set of permission codes inherited from roles
  const rolePermCodes = useMemo(() => {
    if (!permData) return new Set<string>()
    const codes = new Set<string>()
    for (const role of permData.roles) {
      for (const perm of role.permissions) {
        codes.add(perm.code)
      }
    }
    return codes
  }, [permData])

  const permHasChanges = useMemo(() => {
    if (grants.size !== originalGrants.size || denies.size !== originalDenies.size) return true
    for (const c of grants) if (!originalGrants.has(c)) return true
    for (const c of denies) if (!originalDenies.has(c)) return true
    return false
  }, [grants, denies, originalGrants, originalDenies])

  const roleHasChanges = useMemo(() => {
    if (assignedRoleIds.size !== originalRoleIds.size) return true
    for (const id of assignedRoleIds) if (!originalRoleIds.has(id)) return true
    return false
  }, [assignedRoleIds, originalRoleIds])

  const hasChanges = permHasChanges || roleHasChanges

  const selectedUser = useMemo(
    () => users.find((u) => u.userId === selectedUserId || u.id === selectedUserId),
    [users, selectedUserId]
  )

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assign permissions and roles directly to users
          </p>
        </div>
        {selectedUserId && (
          <Button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="gap-2 shrink-0"
          >
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel: User List */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <UserCircle className="size-4" />
                Users
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {users.length}
                </Badge>
              </CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUsers ? (
                <UserSelectorSkeleton />
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Users className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {userSearch ? 'No users match your search' : 'No users found'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px]">
                  <div className="space-y-1 px-3 pb-3">
                    {filteredUsers.map((u) => (
                      <UserListItem
                        key={u.userId || u.id}
                        userItem={u}
                        isSelected={selectedUserId === (u.userId || u.id)}
                        onClick={() => setSelectedUserId(u.userId || u.id)}
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
          {!selectedUserId ? (
            <Card className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <UserCog className="size-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">Select a User</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Choose a user from the list to view and manage their permissions and roles
              </p>
            </Card>
          ) : loadingPerms ? (
            <PermissionsSkeleton />
          ) : permData ? (
            <div className="space-y-4">
              {/* User info card */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserCircle className="size-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold">{permData.userName}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {permData.userRole}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {permData.effectivePermissions.length} effective permissions
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                      className="gap-2 shrink-0"
                      size="sm"
                    >
                      <Save className="size-4" />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>

                  {/* Unsaved changes indicator */}
                  {hasChanges && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mt-3">
                      <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Unsaved changes — click &quot;Save Changes&quot; to apply
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Legend */}
              <div className="flex items-center gap-4 flex-wrap px-1">
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-blue-500" />
                  <span className="text-xs text-muted-foreground">From Role</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-muted-foreground">Directly Granted</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-red-500" />
                  <span className="text-xs text-muted-foreground">Denied (overrides role)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-muted-foreground/30" />
                  <span className="text-xs text-muted-foreground">Not Assigned</span>
                </div>
              </div>

              {/* Role assignments */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="size-4" />
                    Assigned Roles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {availableRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No roles available</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableRoles.map((role) => {
                        const isAssigned = assignedRoleIds.has(role.id)
                        return (
                          <button
                            key={role.id}
                            onClick={() => handleToggleRole(role.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                              isAssigned
                                ? 'bg-primary/10 border-primary/20 text-primary shadow-sm'
                                : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
                            }`}
                          >
                            <ShieldCheck
                              className="size-3"
                              style={role.color ? { color: role.color } : undefined}
                            />
                            {role.name}
                            {isAssigned && <CheckCircle2 className="size-3" />}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Show inherited permissions from roles */}
                  {permData.roles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        Inherited permissions from roles:
                      </p>
                      {permData.roles.map((role) => (
                        <div key={role.id} className="flex items-start gap-2">
                          <Badge
                            className="text-[10px] px-1.5 py-0.5 shrink-0 mt-0.5"
                            style={role.color ? { backgroundColor: `${role.color}20`, color: role.color, borderColor: `${role.color}40` } : undefined}
                            variant="outline"
                          >
                            {role.name}
                          </Badge>
                          <p className="text-xs text-muted-foreground">
                            {role.permissions.length} permissions
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Direct permissions summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ShieldCheck className="size-4" />
                    Direct Permission Overrides
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {grants.size === 0 && denies.size === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No direct permission overrides. All permissions come from assigned roles.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {grants.size > 0 && (
                        <div>
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                            <PlusCircle className="size-3" />
                            Granted ({grants.size})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(grants).map((code) => (
                              <Badge
                                key={code}
                                className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                              >
                                {code}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {denies.size > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1.5 flex items-center gap-1">
                            <Ban className="size-3" />
                            Denied ({denies.size})
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {Array.from(denies).map((code) => (
                              <Badge
                                key={code}
                                className="text-[10px] bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                              >
                                <span className="line-through">{code}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Module permissions - Grid layout */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground px-1">
                  Module Permissions
                </Label>
              </div>
              <ScrollArea className="h-[calc(100vh-640px)] min-h-[200px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-1 pb-2">
                  {moduleNames.map((moduleName) => (
                    <UserModulePermissionsCard
                      key={moduleName}
                      moduleName={moduleName}
                      permissions={schoolPermissions[moduleName]}
                      rolePermCodes={rolePermCodes}
                      grants={grants}
                      denies={denies}
                      onGrant={handleGrant}
                      onDeny={handleDeny}
                      onClear={handleClear}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
