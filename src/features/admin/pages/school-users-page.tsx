'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Users,
  Shield,
  ShieldCheck,
  Search,
  Mail,
  Phone,
  Lock,
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
  Info,
  X,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolUser {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  isActive: boolean
}

interface UserRole {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  permissionCount: number
  assignedBy?: string | null
  assignedAt: string
}

interface RolePermission {
  code: string
  name: string
  module: string
}

interface UserPermissionsResponse {
  userId: string
  userName: string
  userRole: string
  effectivePermissions: string[]
  roles: {
    id: string
    name: string
    color?: string | null
    permissions: RolePermission[]
  }[]
}

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

interface Permission {
  id: string
  code: string
  name: string
  module: string
  action: string
  description?: string
}

interface UserWithRoleCount extends SchoolUser {
  roleCount: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_BADGE_COLORS: Record<string, string> = {
  SCHOOL_ADMIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  TEACHER: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  STUDENT: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  PARENT: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  SUPER_ADMIN: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
}

const STAFF_CREATE_EXCLUDED_ROLES = new Set(['School Admin', 'Teacher', 'Student', 'Parent', 'Staff'])

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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getRoleBadgeColor(role: string): string {
  return ROLE_BADGE_COLORS[role] || 'bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400'
}

// ─── Loading Skeletons ───────────────────────────────────────────────────────

function UserListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function UserDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}

// ─── User List Item ──────────────────────────────────────────────────────────

function UserListItemCard({
  user,
  isSelected,
  onClick,
}: {
  user: UserWithRoleCount
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-150 ${
        isSelected
          ? 'bg-primary/10 border border-primary/20 shadow-sm'
          : 'hover:bg-muted/60 border border-transparent'
      }`}
    >
      <Avatar className={`size-9 shrink-0 ${isSelected ? 'ring-2 ring-primary/30' : ''}`}>
        <AvatarFallback
          className={`text-[10px] font-medium ${
            isSelected
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {getInitials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : ''}`}>
          {user.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge
            variant="secondary"
            className={`text-[9px] px-1.5 py-0 h-4 leading-none ${getRoleBadgeColor(user.role)}`}
          >
            {user.role.replace('_', ' ')}
          </Badge>
          {user.roleCount > 0 && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="size-3" />
                {user.roleCount}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Read-Only Module Permissions Card ───────────────────────────────────────

function ReadOnlyModuleCard({
  moduleName,
  permissions,
}: {
  moduleName: string
  permissions: RolePermission[]
}) {
  const colorClass = useMemo(() => getModuleColor(moduleName), [moduleName])
  const borderColorClass = useMemo(() => getModuleBorderColor(moduleName), [moduleName])
  const barColorClass = useMemo(() => getModuleBarColor(moduleName), [moduleName])
  const barBgClass = useMemo(() => getModuleBarBg(moduleName), [moduleName])
  const totalCount = permissions.length

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
          <Badge variant="default" className="text-[10px] px-2 shrink-0 bg-emerald-600">
            {totalCount}
          </Badge>
        </div>
        <div className={`h-1.5 rounded-full mt-2 ${barBgClass}`}>
          <div
            className={`h-full rounded-full ${barColorClass}`}
            style={{ width: '100%' }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {totalCount} permission{totalCount !== 1 ? 's' : ''} inherited
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="space-y-0.5">
          {permissions.map((perm) => (
            <div
              key={perm.code}
              className="flex items-center justify-between py-1 px-2 rounded-md bg-emerald-50/60 dark:bg-emerald-950/20"
            >
              <span className="text-xs text-foreground truncate">{perm.name}</span>
              <Badge
                variant="outline"
                className="text-[9px] px-1 py-0 h-3.5 leading-none shrink-0 border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"
              >
                granted
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SchoolUsersPage() {
  const { toast } = useToast()
  const user = useAppStore((s) => s.user)

  // Data state
  const [users, setUsers] = useState<UserWithRoleCount[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // User detail state
  const [userRoles, setUserRoles] = useState<UserRole[]>([])
  const [userPermissions, setUserPermissions] = useState<UserPermissionsResponse | null>(null)

  // UI state
  const [userSearch, setUserSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Manage Roles dialog state
  const [showManageRolesDialog, setShowManageRolesDialog] = useState(false)
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set())
  const [originalRoleIds, setOriginalRoleIds] = useState<Set<string>>(new Set())
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [savingRoles, setSavingRoles] = useState(false)

  // Create User dialog state
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false)
  const [createUserRoles, setCreateUserRoles] = useState<AvailableRole[]>([])
  const [createUserForm, setCreateUserForm] = useState({ name: '', email: '', phone: '', password: '', roleId: '' })
  const [loadingCreateRoles, setLoadingCreateRoles] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)

  // ── Fetch users with role counts ──
  // Strategy: Fetch users list + all roles with their assigned users, 
  // then compute role counts client-side (much fewer API calls than per-user)
  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const res = await api.get<{ users: SchoolUser[] }>('/api/school/users?limit=100')
      const rawUsers = res.users || []

      // Show users immediately with 0 role counts
      const usersWithCounts: UserWithRoleCount[] = rawUsers.map((u) => ({
        ...u,
        roleCount: 0,
      }))
      setUsers(usersWithCounts)

      // Fetch all roles and their assigned users to compute role counts
      try {
        const rolesRes = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
        const roles = rolesRes.roles || []

        // Fetch each role's detail (includes assigned users) in parallel
        const roleDetailPromises = roles.map(async (role) => {
          try {
            const detail = await api.get<{ users: { id: string }[] }>(`/api/school/roles/${role.id}`)
            return { roleId: role.id, userIds: (detail.users || []).map((u) => u.id) }
          } catch {
            return { roleId: role.id, userIds: [] as string[] }
          }
        })

        const roleDetails = await Promise.all(roleDetailPromises)

        // Build userId -> roleCount map
        const userRoleCountMap: Record<string, number> = {}
        for (const rd of roleDetails) {
          for (const uid of rd.userIds) {
            userRoleCountMap[uid] = (userRoleCountMap[uid] || 0) + 1
          }
        }

        // Update users with role counts
        setUsers((prev) =>
          prev.map((u) => ({
            ...u,
            roleCount: userRoleCountMap[u.id] || 0,
          }))
        )
      } catch {
        // Role count fetching failed — users are still shown with 0 counts
      }
    } catch {
      toast({ title: "Couldn't Load Users", description: "We couldn't load the users. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingUsers(false)
    }
  }, [toast])

  // ── Fetch user detail (roles + permissions) ──
  const fetchUserDetail = useCallback(async (userId: string) => {
    try {
      setLoadingDetail(true)
      const [rolesRes, permsRes] = await Promise.all([
        api.get<{ roles: UserRole[] }>(`/api/school/users/${userId}/roles`),
        api.get<UserPermissionsResponse>(`/api/school/users/${userId}/permissions`),
      ])
      setUserRoles(rolesRes.roles || [])
      setUserPermissions(permsRes)
    } catch {
      toast({ title: "Couldn't Load User Details", description: "We couldn't load the user details. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingDetail(false)
    }
  }, [toast])

  // ── Initial load ──
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // ── Load user detail when selected ──
  useEffect(() => {
    if (selectedUserId) {
      fetchUserDetail(selectedUserId)
    } else {
      setUserRoles([])
      setUserPermissions(null)
      setLoadingDetail(false)
    }
  }, [selectedUserId, fetchUserDetail])

  // ── Open Create User dialog ──
  const handleOpenCreateUser = useCallback(async () => {
    setShowCreateUserDialog(true)
    setCreateUserForm({ name: '', email: '', phone: '', password: '', roleId: '' })
    setLoadingCreateRoles(true)
    try {
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      setCreateUserRoles((res.roles || []).filter((role) => !STAFF_CREATE_EXCLUDED_ROLES.has(role.name)))
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the available roles. Please try again.", variant: 'destructive' })
    } finally {
      setLoadingCreateRoles(false)
    }
  }, [toast])

  // ── Create User ──
  const handleCreateUser = useCallback(async () => {
    if (!createUserForm.name || !createUserForm.email || !createUserForm.password || !createUserForm.roleId) {
      toast({ title: 'Missing Information', description: 'Please fill in all required fields.', variant: 'destructive' })
      return
    }
    try {
      setCreatingUser(true)
      const res = await api.post<{
        id: string
        name: string
        email: string
        phone: string | null
        role: string
        isActive: boolean
        assignedRole: { id: string; name: string; description: string | null; color: string | null }
        message: string
      }>('/api/school/users', {
        name: createUserForm.name,
        email: createUserForm.email,
        password: createUserForm.password,
        phone: createUserForm.phone || undefined,
        roleId: createUserForm.roleId,
      })
      setShowCreateUserDialog(false)
      await fetchUsers()
      toast({
        title: 'User Created',
        description: `${res.name} has been created and assigned the ${res.assignedRole?.name || 'selected'} role. Permissions are automatically inherited.`,
      })
    } catch (err) {
      toast({
        title: "Couldn't Create User",
        description: err instanceof Error ? err.message : "We couldn't create the user. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setCreatingUser(false)
    }
  }, [createUserForm, fetchUsers, toast])

  // ── Open Manage Roles dialog ──
  const handleOpenManageRoles = useCallback(async () => {
    if (!selectedUserId) return
    setShowManageRolesDialog(true)
    setLoadingRoles(true)

    // Set current role assignments
    const currentRoleIds = new Set(userRoles.map((r) => r.id))
    setSelectedRoleIds(currentRoleIds)
    setOriginalRoleIds(currentRoleIds)

    try {
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      setAvailableRoles(res.roles || [])
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the available roles. Please try again.", variant: 'destructive' })
    } finally {
      setLoadingRoles(false)
    }
  }, [selectedUserId, userRoles, toast])

  // ── Toggle role in dialog ──
  const handleToggleRole = useCallback((roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId)
      } else {
        next.add(roleId)
      }
      return next
    })
  }, [])

  // ── Save role assignments ──
  const handleSaveRoles = useCallback(async () => {
    if (!selectedUserId || !user?.id) return
    try {
      setSavingRoles(true)
      await api.put(`/api/school/users/${selectedUserId}/roles`, {
        roleIds: Array.from(selectedRoleIds),
        assignedBy: user.id,
      })
      setShowManageRolesDialog(false)
      // Refresh user detail and user list
      await fetchUserDetail(selectedUserId)
      await fetchUsers()
      toast({
        title: 'Roles Updated',
        description: 'Role assignments have been updated. Permissions are automatically inherited from assigned roles.',
      })
    } catch (err) {
      toast({
        title: "Couldn't Update Roles",
        description: err instanceof Error ? err.message : "We couldn't update the role assignments. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSavingRoles(false)
    }
  }, [selectedUserId, user?.id, selectedRoleIds, fetchUserDetail, fetchUsers, toast])

  // ── Derived state ──
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users
    const q = userSearch.toLowerCase()
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    )
  }, [users, userSearch])

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  // Group effective permissions by module
  const permissionsByModule = useMemo(() => {
    if (!userPermissions) return {} as Record<string, RolePermission[]>
    const grouped: Record<string, RolePermission[]> = {}

    // Collect all permissions from roles
    for (const role of userPermissions.roles) {
      for (const perm of role.permissions) {
        if (!grouped[perm.module]) grouped[perm.module] = []
        // Avoid duplicates
        if (!grouped[perm.module].some((p) => p.code === perm.code)) {
          grouped[perm.module].push(perm)
        }
      }
    }

    return grouped
  }, [userPermissions])

  const totalInheritedPermissions = useMemo(
    () => Object.values(permissionsByModule).reduce((sum, perms) => sum + perms.length, 0),
    [permissionsByModule]
  )

  const totalModules = useMemo(
    () => Object.keys(permissionsByModule).length,
    [permissionsByModule]
  )

  // Role changes summary for dialog
  const rolesToAdd = useMemo(() => {
    const add: AvailableRole[] = []
    for (const id of selectedRoleIds) {
      if (!originalRoleIds.has(id)) {
        const role = availableRoles.find((r) => r.id === id)
        if (role) add.push(role)
      }
    }
    return add
  }, [selectedRoleIds, originalRoleIds, availableRoles])

  const rolesToRemove = useMemo(() => {
    const remove: AvailableRole[] = []
    for (const id of originalRoleIds) {
      if (!selectedRoleIds.has(id)) {
        const role = availableRoles.find((r) => r.id === id)
        if (role) remove.push(role)
      }
    }
    return remove
  }, [originalRoleIds, selectedRoleIds, availableRoles])

  const hasRoleChanges = selectedRoleIds.size !== originalRoleIds.size ||
    Array.from(selectedRoleIds).some((id) => !originalRoleIds.has(id))

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">School Users</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View users and manage their role assignments — permissions are inherited exclusively through roles
          </p>
        </div>
        <Button onClick={handleOpenCreateUser} className="gap-2 shrink-0">
          <UserPlus className="size-4" />
          Create User
        </Button>
      </div>

      {/* Inheritance banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Permissions are inherited exclusively from roles — there is no direct user permission assignment
        </span>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel: User List */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="size-4" />
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
                <UserListSkeleton />
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Users className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {userSearch ? 'No users match your search' : 'No users found'}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-380px)] min-h-[300px]">
                  <div className="space-y-1 px-3 pb-3">
                    {filteredUsers.map((u) => (
                      <UserListItemCard
                        key={u.id}
                        user={u}
                        isSelected={selectedUserId === u.id}
                        onClick={() => setSelectedUserId(u.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: User Detail */}
        <div className="lg:col-span-8 xl:col-span-9">
          {!selectedUserId ? (
            <Card className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="size-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">Select a User</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Choose a user to view their assigned roles and inherited permissions. Permissions are inherited exclusively through roles.
              </p>
            </Card>
          ) : loadingDetail ? (
            <UserDetailSkeleton />
          ) : (
            <div className="space-y-4">
              {/* User Info Card */}
              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-12">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {selectedUser ? getInitials(selectedUser.name) : '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h2 className="text-base font-semibold">
                          {selectedUser?.name || 'Unknown User'}
                        </h2>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="size-3" />
                            {selectedUser?.email}
                          </span>
                          {selectedUser?.phone && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="size-3" />
                              {selectedUser.phone}
                            </span>
                          )}
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 h-4 leading-none ${getRoleBadgeColor(selectedUser?.role || '')}`}
                          >
                            {selectedUser?.role?.replace('_', ' ') || 'Unknown'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={handleOpenManageRoles}
                      className="gap-2 shrink-0"
                      size="sm"
                    >
                      <ShieldCheck className="size-4" />
                      Manage Roles
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Assigned Roles Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="size-4" />
                    Assigned Roles
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {userRoles.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {userRoles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Shield className="size-6 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No roles assigned yet
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Assign roles to grant permissions to this user
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 gap-1.5"
                        onClick={handleOpenManageRoles}
                      >
                        <ShieldCheck className="size-3.5" />
                        Assign Roles
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Total inherited permissions badge */}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Inherits {totalInheritedPermissions} permission{totalInheritedPermissions !== 1 ? 's' : ''} across {totalModules} module{totalModules !== 1 ? 's' : ''} from {userRoles.length} role{userRoles.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {userRoles.map((role) => (
                          <div
                            key={role.id}
                            className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                          >
                            <div
                              className="size-8 rounded-md flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${role.color || '#6b7280'}20` }}
                            >
                              <ShieldCheck
                                className="size-4"
                                style={{ color: role.color || '#6b7280' }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{role.name}</p>
                              {role.description && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {role.description}
                                </p>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                              {role.permissionCount} perm{role.permissionCount !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Inherited Permissions Section */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Lock className="size-4" />
                    <CardTitle className="text-sm font-semibold">
                      Inherited Permissions
                    </CardTitle>
                    <Badge variant="default" className="text-[10px] px-2 ml-auto bg-emerald-600">
                      {totalInheritedPermissions} total
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mt-1">
                    <Info className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      These permissions are automatically inherited from the assigned roles above. They cannot be edited directly.
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {totalInheritedPermissions === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Lock className="size-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No permissions inherited
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Assign roles to this user to grant permissions
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(permissionsByModule)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([moduleName, perms]) => (
                          <ReadOnlyModuleCard
                            key={moduleName}
                            moduleName={moduleName}
                            permissions={perms}
                          />
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateUserDialog} onOpenChange={setShowCreateUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5" />
              Create User
            </DialogTitle>
            <DialogDescription>
              Create a new user and assign them to a role. They will automatically inherit all permissions from that role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name <span className="text-destructive">*</span></Label>
              <Input
                id="create-name"
                placeholder="Enter full name"
                value={createUserForm.name}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email <span className="text-destructive">*</span></Label>
              <Input
                id="create-email"
                type="email"
                placeholder="Enter email address"
                value={createUserForm.email}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-phone">Phone</Label>
              <Input
                id="create-phone"
                placeholder="Enter phone number (optional)"
                value={createUserForm.phone}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password <span className="text-destructive">*</span></Label>
              <Input
                id="create-password"
                type="password"
                placeholder="Enter password"
                value={createUserForm.password}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Staff Permission Role <span className="text-destructive">*</span></Label>
              {loadingCreateRoles ? (
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50">
                  <Skeleton className="h-4 w-24" />
                </div>
              ) : (
                <Select
                  value={createUserForm.roleId}
                  onValueChange={(value) => setCreateUserForm((prev) => ({ ...prev, roleId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select staff access..." />
                  </SelectTrigger>
                  <SelectContent>
                    {createUserRoles.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No staff permission roles available
                      </div>
                    ) : (
                      createUserRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: role.color || '#6b7280' }}
                            />
                            <span>{role.name}</span>
                            {role.description && (
                              <span className="text-muted-foreground text-xs">— {role.description}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              {createUserForm.roleId && (() => {
                const selectedRole = createUserRoles.find((r) => r.id === createUserForm.roleId)
                if (!selectedRole) return null
                return (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                    <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      Will inherit {selectedRole.permissionCount} permission{selectedRole.permissionCount !== 1 ? 's' : ''} from the {selectedRole.name} role
                    </span>
                  </div>
                )
              })()}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCreateUserDialog(false)}
              disabled={creatingUser}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={creatingUser || !createUserForm.name || !createUserForm.email || !createUserForm.password || !createUserForm.roleId}
              className="gap-2"
            >
              <UserPlus className="size-4" />
              {creatingUser ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Roles Dialog */}
      <Dialog open={showManageRolesDialog} onOpenChange={setShowManageRolesDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Manage Roles — {selectedUser?.name}
            </DialogTitle>
            <DialogDescription>
              Assign or remove roles to control what permissions this user inherits.
              Permissions are granted exclusively through roles.
            </DialogDescription>
          </DialogHeader>

          {loadingRoles ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg">
                  <Skeleton className="size-8 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="size-5 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
                <div className="space-y-2 py-2">
                  {availableRoles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Shield className="size-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No roles available in this school
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Create roles first in the Roles & Permissions page
                      </p>
                    </div>
                  ) : (
                    availableRoles.map((role) => {
                      const isSelected = selectedRoleIds.has(role.id)
                      const wasSelected = originalRoleIds.has(role.id)
                      const isBeingAdded = isSelected && !wasSelected
                      const isBeingRemoved = !isSelected && wasSelected

                      return (
                        <div
                          key={role.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                            isBeingAdded
                              ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/30'
                              : isBeingRemoved
                                ? 'border-red-300 bg-red-50/60 dark:border-red-700 dark:bg-red-950/30 opacity-60'
                                : isSelected
                                  ? 'border-primary/30 bg-primary/5'
                                  : 'hover:bg-muted/40'
                          }`}
                        >
                          <div
                            className="size-8 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${role.color || '#6b7280'}20` }}
                          >
                            <ShieldCheck
                              className="size-4"
                              style={{ color: role.color || '#6b7280' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{role.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {role.description && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {role.description}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none shrink-0">
                                {role.permissionCount} perm{role.permissionCount !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </div>
                          <Switch
                            checked={isSelected}
                            onCheckedChange={() => handleToggleRole(role.id)}
                            className="shrink-0"
                          />
                        </div>
                      )
                    })
                  )}
                </div>
              </ScrollArea>

              {/* Changes Summary */}
              {hasRoleChanges && (
                <div className="space-y-2 border-t pt-3 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Changes Summary
                  </p>
                  {rolesToAdd.length > 0 && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                      <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          Adding {rolesToAdd.length} role{rolesToAdd.length !== 1 ? 's' : ''}: {rolesToAdd.map((r) => r.name).join(', ')}
                        </p>
                        <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">
                          Will add {rolesToAdd.reduce((sum, r) => sum + r.permissionCount, 0)} permission{rolesToAdd.reduce((sum, r) => sum + r.permissionCount, 0) !== 1 ? 's' : ''} (some may overlap with existing roles)
                        </p>
                      </div>
                    </div>
                  )}
                  {rolesToRemove.length > 0 && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                      <X className="size-3.5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-red-700 dark:text-red-400">
                          Removing {rolesToRemove.length} role{rolesToRemove.length !== 1 ? 's' : ''}: {rolesToRemove.map((r) => r.name).join(', ')}
                        </p>
                        <p className="text-[11px] text-red-600/70 dark:text-red-400/70 mt-0.5">
                          Will remove {rolesToRemove.reduce((sum, r) => sum + r.permissionCount, 0)} permission{rolesToRemove.reduce((sum, r) => sum + r.permissionCount, 0) !== 1 ? 's' : ''} (permissions from other roles will be kept)
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <Info className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      Permissions come exclusively from roles — the user&apos;s effective permissions will update automatically
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowManageRolesDialog(false)}
              disabled={savingRoles}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRoles}
              disabled={!hasRoleChanges || savingRoles}
              className="gap-2"
            >
              <ShieldCheck className="size-4" />
              {savingRoles ? 'Saving...' : 'Save Role Assignments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
