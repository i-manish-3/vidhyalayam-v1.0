'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Shield,
  ShieldCheck,
  Search,
  Save,
  Trash2,
  Users,
  Lock,
  Pencil,
  CheckCircle2,
  XCircle,
  UserPlus,
  X,
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
  Mail,
  ChevronDown,
  ChevronRight,
  Eye,
  Info,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoleListItem {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  isActive: boolean
  permissionCount: number
  userCount: number
  createdAt: string
  updatedAt: string
}

interface RoleUser {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  assignedAt: string
}

interface RoleDetail {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  isActive: boolean
  userCount: number
  createdAt: string
  updatedAt: string
  permissions: Permission[]
  users: RoleUser[]
}

interface Permission {
  id: string
  code: string
  name: string
  module: string
  action: string
  description?: string
}

interface SchoolUser {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  isActive: boolean
}

interface SchoolRolesListState {
  roleSearch?: string
}

const SCHOOL_ROLES_LIST_STATE_KEY = 'admin:school-roles:list'

const PRIMARY_ROLE_COMPATIBILITY: Record<string, string[]> = {
  'School Admin': ['SCHOOL_ADMIN'],
  Teacher: ['TEACHER'],
  Student: ['STUDENT'],
  Parent: ['PARENT'],
  Staff: ['STAFF'],
}

const STAFF_PERMISSION_ROLES = new Set([
  'Transport',
  'Accountant',
  'Sr. Accountant',
  'Librarian',
  'Office',
  'Controller',
  'Reception',
  'Security',
])

function getCompatibleUserRolesForRoleName(roleName?: string | null) {
  if (!roleName) return []
  if (PRIMARY_ROLE_COMPATIBILITY[roleName]) return PRIMARY_ROLE_COMPATIBILITY[roleName]
  if (STAFF_PERMISSION_ROLES.has(roleName)) return ['STAFF']
  return ['STAFF']
}

function formatUserRole(role: string) {
  return role.replaceAll('_', ' ')
}

const ROLE_INSTRUCTIONS = [
  {
    title: '1. School permissions come first',
    body: 'The Super Admin decides which modules your school can use. If a module is not enabled for the school, it cannot be added to any role.',
  },
  {
    title: '2. Roles group permissions',
    body: 'Create roles like Transport, Accountant, Reception, or a custom role, then switch permissions on or off for that role only.',
  },
  {
    title: '3. Users inherit from roles',
    body: 'A user does not get permissions directly. Instead, assign the user to one or more roles and they automatically inherit the role permissions.',
  },
  {
    title: '4. Assign users from the role',
    body: 'Open the Users tab on a selected role to attach staff, drivers, or other compatible accounts to that role.',
  },
]

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
]

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

function getModuleBarColor(module: string): string {
  return MODULE_BAR_COLORS[module] || 'bg-gray-500'
}

function getModuleBarBg(module: string): string {
  return MODULE_BAR_BG[module] || 'bg-gray-100 dark:bg-gray-950/60'
}

// ─── Loading Skeletons ───────────────────────────────────────────────────────

function RoleListSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
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

function RoleDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-md" />
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

// ─── Role List Item ──────────────────────────────────────────────────────────

function RoleListItemCard({
  role,
  isSelected,
  onClick,
}: {
  role: RoleListItem
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-150 ${
        isSelected
          ? 'bg-primary/10 border border-primary/25 shadow-sm'
          : 'hover:bg-muted/70 border border-transparent'
      }`}
    >
      <div
        className={`size-10 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset ${
          isSelected ? 'bg-primary/20' : 'bg-muted'
        }`}
        style={role.color && !isSelected ? { backgroundColor: `${role.color}20` } : undefined}
      >
        <ShieldCheck
          className={`size-4 ${isSelected ? 'text-primary' : role.color ? '' : 'text-muted-foreground'}`}
          style={role.color && !isSelected ? { color: role.color } : undefined}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-semibold truncate ${isSelected ? 'text-primary' : ''}`}>
            {role.name}
          </p>
          {role.isSystem && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] shrink-0">
              System
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="size-3" />
            {role.permissionCount} perms
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Users className="size-3" />
            {role.userCount} users
          </span>
        </div>
      </div>
      <ChevronRight
        className={`size-4 shrink-0 transition-transform ${
          isSelected
            ? 'translate-x-0 text-primary'
            : 'text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:text-muted-foreground'
        }`}
      />
    </button>
  )
}

// ─── Module Permissions Card (Grid-based, always visible) ────────────────────

function ModulePermissionsCard({
  moduleName,
  permissions,
  grantedIds,
  onToggle,
  readOnly = false,
}: {
  moduleName: string
  permissions: Permission[]
  grantedIds: Set<string>
  onToggle: (id: string) => void
  readOnly?: boolean
}) {
  const colorClass = useMemo(() => getModuleColor(moduleName), [moduleName])
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
    <Card className="overflow-hidden border bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex size-9 shrink-0 items-center justify-center rounded-md ${colorClass}`}>
              <ModuleIcon module={moduleName} className="size-3.5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-sm font-semibold leading-5">{moduleName}</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {grantedCount} of {totalCount} granted
              </p>
            </div>
          </div>
          <Badge
            variant={allGranted ? 'default' : noneGranted ? 'secondary' : 'outline'}
            className="h-5 shrink-0 px-2 text-[10px]"
          >
            {allGranted ? 'All' : noneGranted ? 'None' : `${grantedCount}/${totalCount}`}
          </Badge>
        </div>
        <div className={`mt-3 h-1.5 rounded-full ${barBgClass}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-1">
          {permissions.map((perm) => {
            const isGranted = grantedIds.has(perm.id)
            return (
              <div
                key={perm.id}
                className={`flex items-center justify-between rounded-md border px-2.5 py-2 transition-colors ${
                  isGranted
                    ? 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                    : 'border-transparent bg-muted/20 hover:border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={`truncate text-xs ${isGranted ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {perm.name}
                  </span>
                  <Badge variant="outline" className="h-3.5 shrink-0 px-1 py-0 text-[9px] leading-none">
                    {perm.action}
                  </Badge>
                </div>
                <Switch
                  checked={isGranted}
                  onCheckedChange={() => onToggle(perm.id)}
                  className="shrink-0 ml-2 scale-90"
                  disabled={readOnly}
                />
              </div>
            )
          })}
        </div>
        <>
        <Separator className="my-2" />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={handleSelectAll}
              disabled={allGranted || readOnly}
            >
              <CheckCircle2 className="mr-1 size-3" />
              All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={handleDeselectAll}
              disabled={noneGranted || readOnly}
            >
              <XCircle className="mr-1 size-3" />
              None
            </Button>
          </div>
        </>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SchoolRolesPage() {
  const { toast } = useToast()
  const user = useAppStore((s) => s.user)
  const savedListState = useAppStore((s) => s.pageState[SCHOOL_ROLES_LIST_STATE_KEY] as SchoolRolesListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)

  // Data state
  const [roles, setRoles] = useState<RoleListItem[]>([])
  const [schoolPermissions, setSchoolPermissions] = useState<Record<string, Permission[]>>({})
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleDetail, setRoleDetail] = useState<RoleDetail | null>(null)
  const [grantedPermissionIds, setGrantedPermissionIds] = useState<Set<string>>(new Set())
  const [originalPermissionIds, setOriginalPermissionIds] = useState<Set<string>>(new Set())

  // Role edit state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editColor, setEditColor] = useState('')
  const [originalEditData, setOriginalEditData] = useState({ name: '', description: '', color: '' })

  // UI state
  const [roleSearch, setRoleSearch] = useState(savedListState?.roleSearch ?? '')
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('permissions')

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Add User dialog state
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [schoolUsers, setSchoolUsers] = useState<SchoolUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [savingUsers, setSavingUsers] = useState(false)

  // User permissions expansion state
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  // Add User confirmation dialog state
  const [showConfirmAddDialog, setShowConfirmAddDialog] = useState(false)
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false)

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true)
      const res = await api.get<{ roles: RoleListItem[] }>('/api/school/roles')
      setRoles(res.roles || [])
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the roles list. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingRoles(false)
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

  // ── Fetch role detail ──
  const fetchRoleDetail = useCallback(async (roleId: string) => {
    try {
      setLoadingDetail(true)
      const res = await api.get<RoleDetail>(`/api/school/roles/${roleId}`)
      setRoleDetail(res)
      setGrantedPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setOriginalPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setEditName(res.name)
      setEditDescription(res.description || '')
      setEditColor(res.color || '')
      setOriginalEditData({ name: res.name, description: res.description || '', color: res.color || '' })
    } catch {
      toast({ title: "Couldn't Load Role Details", description: "We couldn't load the role details. Please try again.", variant: 'destructive' })
    } finally {
      setLoadingDetail(false)
    }
  }, [toast])

  // ── Initial load ──
  useEffect(() => {
    fetchRoles()
    fetchSchoolPermissions()
  }, [fetchRoles, fetchSchoolPermissions])

  // ── Load role detail when selected ──
  useEffect(() => {
    if (selectedRoleId) {
      fetchRoleDetail(selectedRoleId)
    } else {
      setRoleDetail(null)
      setGrantedPermissionIds(new Set())
      setOriginalPermissionIds(new Set())
      setLoadingDetail(false)
    }
  }, [selectedRoleId, fetchRoleDetail])

  // ── Toggle permission ──
  const handleTogglePermission = useCallback((permissionId: string) => {
    setGrantedPermissionIds((prev) => {
      const next = new Set(prev)
      if (next.has(permissionId)) {
        next.delete(permissionId)
      } else {
        next.add(permissionId)
      }
      return next
    })
  }, [])

  // ── Create role ──
  const handleCreateRole = useCallback(async () => {
    if (!newName.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter a name for the role.', variant: 'destructive' })
      return
    }
    try {
      setCreating(true)
      const res = await api.post<RoleListItem>('/api/school/roles', {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        color: newColor || undefined,
      })
      setRoles((prev) => [res, ...prev])
      setShowCreateDialog(false)
      setNewName('')
      setNewDescription('')
      setNewColor(PRESET_COLORS[0])
      setSelectedRoleId(res.id)
      toast({ title: 'Role Created', description: `"${res.name}" has been created successfully.` })
    } catch (err) {
      toast({
        title: "Couldn't Create Role",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }, [newName, newDescription, newColor, toast])

  // ── Save role changes ──
  const handleSave = useCallback(async () => {
    if (!selectedRoleId || !user?.id) return

    const isSuperAdminUser = user.role === 'SUPER_ADMIN'

    const hasPermChanges =
      grantedPermissionIds.size !== originalPermissionIds.size ||
      Array.from(grantedPermissionIds).some((id) => !originalPermissionIds.has(id))

    // Only Super Admin can change role fields (name, description, color)
    const hasFieldChanges = isSuperAdminUser && (
      editName !== originalEditData.name ||
      editDescription !== originalEditData.description ||
      editColor !== originalEditData.color
    )

    if (!hasPermChanges && !hasFieldChanges) return

    try {
      setSaving(true)
      const body: Record<string, unknown> = {}
      if (hasFieldChanges) {
        body.name = editName.trim()
        body.description = editDescription.trim() || null
        body.color = editColor || null
      }
      if (hasPermChanges) {
        body.permissionIds = Array.from(grantedPermissionIds)
      }

      const res = await api.put<RoleDetail>(`/api/school/roles/${selectedRoleId}`, body)
      setRoleDetail(res)
      setGrantedPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setOriginalPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setOriginalEditData({ name: res.name, description: res.description || '', color: res.color || '' })

      await fetchRoles()

      toast({ title: 'Role Updated', description: `"${res.name}" has been updated successfully.` })
    } catch (err) {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [selectedRoleId, user, grantedPermissionIds, originalPermissionIds, editName, editDescription, editColor, originalEditData, fetchRoles, toast])

  // ── Delete role ──
  const handleDeleteRole = useCallback(async () => {
    if (!selectedRoleId) return
    try {
      setDeleting(true)
      await api.delete(`/api/school/roles/${selectedRoleId}`)
      setSelectedRoleId(null)
      setRoleDetail(null)
      await fetchRoles()
      toast({ title: 'Role Deleted', description: 'The role has been deleted successfully.' })
    } catch (err) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }, [selectedRoleId, fetchRoles, toast])

  // ── Remove user from role ──
  const handleRemoveUser = useCallback(async (userId: string) => {
    if (!roleDetail || !user?.id) return
    try {
      const remainingUserIds = roleDetail.users
        .filter((u) => u.id !== userId)
        .map((u) => u.id)
      const res = await api.put<RoleDetail>(`/api/school/roles/${selectedRoleId}`, {
        userIds: remainingUserIds,
      })
      setRoleDetail(res)
      await fetchRoles()
      toast({ title: 'User Removed', description: 'User has been removed from this role and will no longer inherit its permissions.' })
    } catch (err) {
      toast({
        title: "Couldn't Remove User",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    }
  }, [roleDetail, selectedRoleId, user?.id, fetchRoles, toast])

  // ── Open Add User dialog ──
  const handleOpenAddUser = useCallback(async () => {
    setShowAddUserDialog(true)
    setUserSearch('')
    setSelectedUserIds(new Set())
    setLoadingUsers(true)
    try {
      const res = await api.get<{ users: SchoolUser[] }>('/api/school/users?limit=100')
      setSchoolUsers(res.users || [])
    } catch {
      toast({ title: "Couldn't Load Users", description: "We couldn't load the users list. Please try again.", variant: 'destructive' })
    } finally {
      setLoadingUsers(false)
    }
  }, [toast])

  // ── Save users to role ──
  const handleSaveUsers = useCallback(async () => {
    if (!selectedRoleId || !user?.id || selectedUserIds.size === 0) return
    try {
      setSavingUsers(true)
      // Merge existing + new user IDs
      const existingUserIds = (roleDetail?.users || []).map((u) => u.id)
      const allUserIds = [...new Set([...existingUserIds, ...Array.from(selectedUserIds)])]
      const res = await api.put<RoleDetail>(`/api/school/roles/${selectedRoleId}`, {
        userIds: allUserIds,
      })
      setRoleDetail(res)
      await fetchRoles()
      setShowAddUserDialog(false)
      toast({ title: 'Users Added', description: `${selectedUserIds.size} user${selectedUserIds.size !== 1 ? 's' : ''} added to the role. They now inherit all ${activePermissionCount} permission${activePermissionCount !== 1 ? 's' : ''} from this role.` })
    } catch (err) {
      toast({
        title: "Couldn't Add Users",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSavingUsers(false)
    }
  }, [selectedRoleId, user?.id, selectedUserIds, roleDetail, fetchRoles, toast])

  // ── Derived state ──
  const filteredRoles = useMemo(() => {
    if (!roleSearch.trim()) return roles
    const q = roleSearch.toLowerCase()
    return roles.filter((r) => r.name.toLowerCase().includes(q))
  }, [roles, roleSearch])

  const handleRoleSearchChange = (value: string) => {
    setRoleSearch(value)
    setPageState(SCHOOL_ROLES_LIST_STATE_KEY, { roleSearch: value })
  }

  const moduleNames = useMemo(
    () => Object.keys(schoolPermissions).sort(),
    [schoolPermissions]
  )

  const hasPermChanges = useMemo(() => {
    if (grantedPermissionIds.size !== originalPermissionIds.size) return true
    for (const id of grantedPermissionIds) {
      if (!originalPermissionIds.has(id)) return true
    }
    return false
  }, [grantedPermissionIds, originalPermissionIds])

  const hasFieldChanges = useMemo(() => {
    const isSuperAdminUser = user?.role === 'SUPER_ADMIN'
    // Only Super Admin can change role fields
    return isSuperAdminUser && (
      editName !== originalEditData.name ||
      editDescription !== originalEditData.description ||
      editColor !== originalEditData.color
    )
  }, [user?.role, editName, editDescription, editColor, originalEditData])

  const hasChanges = hasPermChanges || hasFieldChanges

  const totalSchoolPerms = useMemo(
    () => Object.values(schoolPermissions).reduce((sum, perms) => sum + perms.length, 0),
    [schoolPermissions]
  )

  // Filter users for the "Add User" dialog: exclude already assigned
  const availableUsers = useMemo(() => {
    const assignedIds = new Set((roleDetail?.users || []).map((u) => u.id))
    const compatibleUserRoles = getCompatibleUserRolesForRoleName(roleDetail?.name)
    return schoolUsers.filter((u) => !assignedIds.has(u.id) && compatibleUserRoles.includes(u.role))
  }, [schoolUsers, roleDetail])

  const incompatibleAvailableUserCount = useMemo(() => {
    const assignedIds = new Set((roleDetail?.users || []).map((u) => u.id))
    const compatibleUserRoles = getCompatibleUserRolesForRoleName(roleDetail?.name)
    return schoolUsers.filter((u) => !assignedIds.has(u.id) && !compatibleUserRoles.includes(u.role)).length
  }, [schoolUsers, roleDetail])

  const filteredAvailableUsers = useMemo(() => {
    if (!userSearch.trim()) return availableUsers
    const q = userSearch.toLowerCase()
    return availableUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [availableUsers, userSearch])

  // Group role permissions by module for inheritance display
  const permissionsByModule = useMemo(() => {
    if (!roleDetail) return {} as Record<string, Permission[]>
    const grouped: Record<string, Permission[]> = {}
    for (const perm of roleDetail.permissions) {
      if (!grouped[perm.module]) grouped[perm.module] = []
      grouped[perm.module].push(perm)
    }
    return grouped
  }, [roleDetail])

  const activeModuleCount = useMemo(
    () => Object.keys(permissionsByModule).length,
    [permissionsByModule]
  )

  const activePermissionCount = useMemo(
    () => roleDetail?.permissions.length ?? 0,
    [roleDetail]
  )

  // School Admin role is protected — only SUPER_ADMIN can modify it
  const isSchoolAdminRoleProtected = useMemo(
    () => roleDetail?.name === 'School Admin' && user?.role !== 'SUPER_ADMIN',
    [roleDetail?.name, user?.role]
  )

  // School Admin can create roles and manage permissions within the school's grant.
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const canCreateRole = user?.role === 'SUPER_ADMIN' || user?.role === 'SCHOOL_ADMIN'

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-stretch gap-3">
            <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-foreground/90">Roles &amp; Permissions</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage role access, permission inheritance, and user assignments.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowInstructionsDialog(true)}
            >
              <HelpCircle className="size-4" />
              Instructions
            </Button>
            {selectedRoleId && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setActiveTab('users')}
              >
                <Users className="size-4" />
                Assign Users
              </Button>
            )}
            {canCreateRole && (
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="gap-2 shrink-0"
                size="sm"
              >
                <Plus className="size-4" />
                Create Role
              </Button>
            )}
          </div>
        </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel: Role List */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4" />
                Roles
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {roles.length}
                </Badge>
              </CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search roles..."
                  value={roleSearch}
                  onChange={(e) => handleRoleSearchChange(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRoles ? (
                <RoleListSkeleton />
              ) : filteredRoles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <ShieldCheck className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {roleSearch ? 'No roles match your search' : canCreateRole ? 'No roles yet. Create your first role to grant permissions to users.' : 'No roles available'}
                  </p>
                  {!roleSearch && canCreateRole && (
                    <Button
                      size="sm"
                      className="mt-3 gap-2"
                      onClick={() => setShowCreateDialog(true)}
                    >
                      <Plus className="size-4" />
                      Create Role
                    </Button>
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px]">
                  <div className="space-y-1 px-3 pb-3">
                    {filteredRoles.map((role) => (
                      <RoleListItemCard
                        key={role.id}
                        role={role}
                        isSelected={selectedRoleId === role.id}
                        onClick={() => { setSelectedRoleId(role.id); setActiveTab('permissions') }}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Role Detail / Edit */}
        <div className="lg:col-span-8 xl:col-span-9">
          {!selectedRoleId ? (
            <Card className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <ShieldCheck className="size-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">Select a Role</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Choose a role to manage its permissions and assigned users. Users inherit permissions exclusively through roles.
              </p>
            </Card>
          ) : loadingDetail ? (
            <RoleDetailSkeleton />
          ) : roleDetail ? (
            <div className="space-y-4">
              {/* Role info card */}
              <Card>
                <CardContent className="px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="size-8 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${roleDetail.color || '#6b7280'}20` }}
                      >
                        <ShieldCheck className="size-4" style={{ color: roleDetail.color || '#6b7280' }} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{roleDetail.name}</h2>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="size-3" />
                            {roleDetail.permissions.length} of {totalSchoolPerms} permissions
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="size-3" />
                            {roleDetail.users.length} user{roleDetail.users.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSuperAdmin && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={roleDetail.users.length > 0}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      )}
                      <Button
                        onClick={handleSave}
                        disabled={!hasChanges || saving || isSchoolAdminRoleProtected}
                        className="h-8 shrink-0 gap-1.5 text-xs"
                        size="sm"
                      >
                        <Save className="size-3.5" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
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

              {/* School Admin role protection banner */}
              {isSchoolAdminRoleProtected && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                  <Lock className="size-3.5 text-rose-500" />
                  <span className="text-xs font-medium text-rose-700 dark:text-rose-400">
                    School Admin role is managed exclusively by Super Admin.
                  </span>
                </div>
              )}

              {/* Role edit fields — only Super Admin can edit role details */}
              {isSuperAdmin && !isSchoolAdminRoleProtected && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Pencil className="size-4" />
                      Role Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="role-name" className="text-xs font-medium">Role Name</Label>
                        <Input
                          id="role-name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Enter role name"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Color</Label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditColor(color)}
                              className={`size-7 rounded-md border-2 transition-all ${
                                editColor === color ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/30'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                          <Input
                            type="color"
                            value={editColor || '#6b7280'}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="size-7 p-0 border-0 cursor-pointer rounded-md"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role-description" className="text-xs font-medium">Description</Label>
                      <Textarea
                        id="role-description"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Describe what this role is for..."
                        className="min-h-[60px] resize-none"
                        rows={2}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Delete hint — only shown to Super Admin */}
              {isSuperAdmin && roleDetail.users.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <Lock className="size-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Cannot delete: {roleDetail.users.length} user{roleDetail.users.length !== 1 ? 's' : ''} inherit permissions from this role. Remove all users first.
                  </span>
                </div>
              )}

              {/* Tabs: Permissions & Users */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="permissions" className="gap-1.5">
                    <ShieldCheck className="size-3.5" />
                    Permissions
                  </TabsTrigger>
                  <TabsTrigger value="users" className="gap-1.5">
                    <Users className="size-3.5" />
                    Users ({roleDetail.users.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="permissions" className="mt-4">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border mb-3">
                    <Info className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      These permissions are automatically inherited by all {roleDetail.users.length} user{roleDetail.users.length !== 1 ? 's' : ''} assigned to this role
                    </span>
                  </div>
                  <div className="mb-3 flex flex-col gap-2 rounded-lg border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">Permission Matrix</p>
                      <p className="text-xs text-muted-foreground">
                        {grantedPermissionIds.size} selected from {totalSchoolPerms} available permissions
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={isSchoolAdminRoleProtected}
                        onClick={() =>
                          setGrantedPermissionIds(
                            new Set(Object.values(schoolPermissions).flat().map((permission) => permission.id))
                          )
                        }
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={isSchoolAdminRoleProtected}
                        onClick={() => setGrantedPermissionIds(new Set())}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <ScrollArea className="h-[calc(100vh-500px)] min-h-[420px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-1 pb-2">
                      {moduleNames.map((moduleName) => (
                        <ModulePermissionsCard
                          key={moduleName}
                          moduleName={moduleName}
                          permissions={schoolPermissions[moduleName]}
                          grantedIds={grantedPermissionIds}
                          onToggle={handleTogglePermission}
                          readOnly={isSchoolAdminRoleProtected}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="users" className="mt-4">
                  {/* Permission Inheritance Summary Banner */}
                  <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 mb-4">
                    <div className="size-8 rounded-md flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-900/40">
                      <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                        Users in this role automatically inherit {activePermissionCount} permission{activePermissionCount !== 1 ? 's' : ''} across {activeModuleCount} module{activeModuleCount !== 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">
                        Permissions are granted exclusively through roles — every user assigned to this role receives the same permission set
                      </p>
                    </div>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Users className="size-4" />
                          Assigned Users
                          {roleDetail.users.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] ml-1">
                              {roleDetail.users.length}
                            </Badge>
                          )}
                        </CardTitle>
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 text-xs"
                          onClick={handleOpenAddUser}
                          disabled={isSchoolAdminRoleProtected}
                        >
                          <UserPlus className="size-3.5" />
                          Add User
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {roleDetail.users.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Users className="size-8 text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">No users assigned to this role yet</p>
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            Click &quot;Add User&quot; to assign users — they will automatically inherit all {activePermissionCount} permissions from this role
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {roleDetail.users.map((roleUser) => {
                            const initials = roleUser.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)
                            const isExpanded = expandedUserId === roleUser.id
                            return (
                              <Collapsible
                                key={roleUser.id}
                                open={isExpanded}
                                onOpenChange={(open) => setExpandedUserId(open ? roleUser.id : null)}
                              >
                                <div className={`rounded-lg transition-colors ${isExpanded ? 'bg-muted/60' : 'hover:bg-muted/40'}`}>
                                  <div className="flex items-center gap-3 p-2">
                                    <Avatar className="size-8 shrink-0">
                                      <AvatarFallback
                                        className="text-[10px] font-medium"
                                        style={roleDetail.color ? { backgroundColor: `${roleDetail.color}20`, color: roleDetail.color } : undefined}
                                      >
                                        {initials}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{roleUser.name}</p>
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                          <Mail className="size-2.5" />
                                          {roleUser.email}
                                        </span>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none">
                                          {roleUser.role}
                                        </Badge>
                                      </div>
                                    </div>
                                    {/* Permission count badge */}
                                    <Badge
                                      className="text-[9px] px-2 gap-1 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800"
                                      variant="outline"
                                    >
                                      <ShieldCheck className="size-2.5" />
                                      {activePermissionCount} perm{activePermissionCount !== 1 ? 's' : ''}
                                    </Badge>
                                    {/* View permissions toggle */}
                                    <CollapsibleTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="size-7 p-0 text-muted-foreground hover:text-foreground shrink-0"
                                        title="View inherited permissions"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="size-3.5" />
                                        ) : (
                                          <Eye className="size-3.5" />
                                        )}
                                      </Button>
                                    </CollapsibleTrigger>
                                    {/* Remove user button */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="size-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                                      onClick={() => handleRemoveUser(roleUser.id)}
                                      title="Remove user from role"
                                      disabled={isSchoolAdminRoleProtected}
                                    >
                                      <X className="size-3.5" />
                                    </Button>
                                  </div>

                                  {/* Expanded: User Permissions Summary */}
                                  <CollapsibleContent>
                                    <div className="px-2 pb-3 pt-1 border-t border-border/50 mt-1">
                                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                                        <ShieldCheck className="size-3" />
                                        Inherited permissions from &quot;{roleDetail.name}&quot;
                                      </p>
                                      {activePermissionCount === 0 ? (
                                        <p className="text-xs text-muted-foreground/60 italic pl-1">
                                          This role has no permissions assigned yet. Add permissions in the Permissions tab first.
                                        </p>
                                      ) : (
                                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                          {Object.entries(permissionsByModule)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([moduleName, perms]) => (
                                              <div
                                                key={moduleName}
                                                className="rounded-md border bg-card px-3 py-2 shadow-sm"
                                              >
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className={`size-5 rounded-md flex items-center justify-center ${getModuleColor(moduleName)}`}>
                                                    <ModuleIcon module={moduleName} className="size-2.5" />
                                                  </div>
                                                  <span className="text-xs font-semibold">{moduleName}</span>
                                                  <Badge variant="secondary" className="ml-auto h-3.5 px-1 py-0 text-[8px] leading-none">
                                                    {perms.length}
                                                  </Badge>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                  {perms.map((perm) => (
                                                    <span
                                                      key={perm.id}
                                                      className="inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                                    >
                                                      {perm.action}
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>

      {/* Instructions Dialog */}
      <Dialog open={showInstructionsDialog} onOpenChange={setShowInstructionsDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="size-5" />
              Roles & Permissions Instructions
            </DialogTitle>
            <DialogDescription>
              Use this flow to decide what each staff member can access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">How access is decided</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Permissions are not assigned directly to users. Users receive access from the roles assigned to them.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {ROLE_INSTRUCTIONS.map((item) => (
                <div key={item.title} className="rounded-lg border bg-card p-4 shadow-sm">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm font-semibold">Recommended workflow</p>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <span className="font-medium text-foreground">Create role</span>
                  <p className="mt-1">Add a role for the job type.</p>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <span className="font-medium text-foreground">Enable permissions</span>
                  <p className="mt-1">Turn on only the modules they need.</p>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <span className="font-medium text-foreground">Assign users</span>
                  <p className="mt-1">Attach staff accounts to that role.</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowInstructionsDialog(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Role Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" />
              Create New Role
            </DialogTitle>
            <DialogDescription>
              Create a custom role with specific permissions for your school.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-role-name" className="text-xs font-medium">Role Name *</Label>
              <Input
                id="new-role-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Department Head, Lab Assistant"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role-desc" className="text-xs font-medium">Description</Label>
              <Textarea
                id="new-role-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Describe what this role is for..."
                className="min-h-[60px] resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={`size-7 rounded-md border-2 transition-all ${
                      newColor === color ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <Input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="size-7 p-0 border-0 cursor-pointer rounded-md"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateRole} disabled={creating || !newName.trim()}>
              {creating ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5" />
              Add Users to Role
            </DialogTitle>
            <DialogDescription>
              Select users to assign to the &quot;{roleDetail?.name}&quot; role. They will automatically inherit all {activePermissionCount} permissions granted to this role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            {roleDetail && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Only {getCompatibleUserRolesForRoleName(roleDetail.name).map(formatUserRole).join(', ')} users can be assigned to this role.
                {incompatibleAvailableUserCount > 0 && (
                  <span> {incompatibleAvailableUserCount} incompatible user{incompatibleAvailableUserCount !== 1 ? 's are' : ' is'} hidden.</span>
                )}
              </div>
            )}
            {selectedUserIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{selectedUserIds.size} selected:</span>
                {Array.from(selectedUserIds).map((id) => {
                  const u = schoolUsers.find((su) => su.id === id)
                  if (!u) return null
                  return (
                    <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
                      {u.name}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev)
                            next.delete(id)
                            return next
                          })
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="size-2.5" />
                      </button>
                    </Badge>
                  )
                })}
              </div>
            )}
            <ScrollArea className="h-[300px]">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : filteredAvailableUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {userSearch ? 'No users match your search' : 'No available users to add'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredAvailableUsers.map((u) => {
                    const isSelected = selectedUserIds.has(u.id)
                    const initials = u.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUserIds((prev) => {
                            const next = new Set(prev)
                            if (next.has(u.id)) {
                              next.delete(u.id)
                            } else {
                              next.add(u.id)
                            }
                            return next
                          })
                        }}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${
                          isSelected
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <Avatar className="size-8 shrink-0">
                          <AvatarFallback className="text-[10px] font-medium bg-muted">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-muted-foreground">{u.email}</span>
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 leading-none">
                              {u.role}
                            </Badge>
                          </div>
                        </div>
                        <div className={`size-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'
                        }`}>
                          {isSelected && <CheckCircle2 className="size-3" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddUserDialog(false)} disabled={savingUsers}>
              Cancel
            </Button>
            <Button onClick={() => { setShowConfirmAddDialog(true) }} disabled={savingUsers || selectedUserIds.size === 0}>
              {savingUsers ? 'Adding...' : `Review & Add ${selectedUserIds.size} User${selectedUserIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Confirmation Dialog - Shows permissions that will be inherited */}
      <Dialog open={showConfirmAddDialog} onOpenChange={setShowConfirmAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5" />
              Confirm Role Assignment
            </DialogTitle>
            <DialogDescription>
              Adding {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} to the &quot;{roleDetail?.name}&quot; role will grant them the following permissions:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Users being added */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Users:</span>
              {Array.from(selectedUserIds).map((id) => {
                const u = schoolUsers.find((su) => su.id === id)
                if (!u) return null
                return (
                  <Badge key={id} variant="secondary" className="text-[10px] gap-1">
                    {u.name}
                  </Badge>
                )
              })}
            </div>

            {/* Summary */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                Will inherit {activePermissionCount} permission{activePermissionCount !== 1 ? 's' : ''} across {activeModuleCount} module{activeModuleCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Permissions breakdown by module */}
            {activePermissionCount > 0 ? (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pr-1">
                  {Object.entries(permissionsByModule)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([moduleName, perms]) => (
                      <div
                        key={moduleName}
                        className="rounded-md border bg-card px-3 py-2 shadow-sm"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`size-5 rounded-md flex items-center justify-center ${getModuleColor(moduleName)}`}>
                            <ModuleIcon module={moduleName} className="size-2.5" />
                          </div>
                          <span className="text-xs font-semibold">{moduleName}</span>
                          <Badge variant="secondary" className="ml-auto h-3.5 px-1 py-0 text-[8px] leading-none">
                            {perms.length}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {perms.map((perm) => (
                            <span
                              key={perm.id}
                              className="inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {perm.action}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <Info className="size-3.5 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  This role has no permissions assigned yet. Users won&apos;t gain any access until permissions are added.
                </span>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground/70">
              Permissions come exclusively from roles. All users in this role will receive the same permission set.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmAddDialog(false)}
              disabled={savingUsers}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setShowConfirmAddDialog(false)
                await handleSaveUsers()
              }}
              disabled={savingUsers}
              className="gap-2"
            >
              {savingUsers ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Adding...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3.5" />
                  Confirm & Add User{selectedUserIds.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{roleDetail?.name}&quot;? This action cannot be undone. All users assigned to this role will lose the inherited permissions it provides.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete Role'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
