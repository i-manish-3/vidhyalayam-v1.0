'use client'

import { useState, useEffect, useCallback, useMemo, type ElementType } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Shield,
  ShieldCheck,
  Plus,
  Search,
  Trash2,
  Save,
  Lock,
  School,
  Users,
  Info,
  Pencil,
  Layers,
  Palette,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolInfo {
  id: string
  name: string
}

interface RoleListItem {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  isActive: boolean
  createdAt: string
  permissionCount: number
  userCount: number
  school: SchoolInfo | null
}

interface Permission {
  id: string
  code: string
  name: string
  module: string
  action: string
  description?: string | null
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
  createdAt: string
  updatedAt: string
  userCount: number
  school: SchoolInfo | null
  users: RoleUser[]
  permissions: Permission[]
}

interface SchoolOption {
  id: string
  name: string
}

interface SuperAdminRolesListState {
  roleSearch?: string
  schoolFilter?: string
}

const SUPER_ADMIN_ROLES_LIST_STATE_KEY = 'admin:super-admin-roles:list'

// ─── Constants ───────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#10b981', '#059669', '#8b5cf6', '#6366f1', '#ec4899',
  '#f59e0b', '#06b6d4', '#ef4444', '#0ea5e9', '#14b8a6',
]

// ─── Loading Skeletons ───────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  note,
  icon,
}: {
  label: string
  value: string | number
  note: string
  icon: ElementType
}) {
  const Icon = icon

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-white shadow-md shadow-primary/20">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminRolesPage() {
  const { toast } = useToast()
  const savedListState = useAppStore((s) => s.pageState[SUPER_ADMIN_ROLES_LIST_STATE_KEY] as SuperAdminRolesListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)

  // Data state
  const [roles, setRoles] = useState<RoleListItem[]>([])
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [allPermissions, setAllPermissions] = useState<Record<string, Permission[]>>({})
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
  const [schoolFilter, setSchoolFilter] = useState<string>(savedListState?.schoolFilter ?? 'all')
  const [loadingRoles, setLoadingRoles] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('permissions')

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [newSchoolId, setNewSchoolId] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Fetch roles ──
  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true)
      const params = new URLSearchParams()
      if (schoolFilter && schoolFilter !== 'all') params.set('schoolId', schoolFilter)
      if (roleSearch) params.set('search', roleSearch)
      const res = await api.get<{ roles: RoleListItem[]; total: number }>(`/api/super-admin/roles?${params.toString()}`)
      setRoles(res.roles || [])
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the roles. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingRoles(false)
    }
  }, [schoolFilter, roleSearch, toast])

  // ── Fetch schools ──
  const fetchSchools = useCallback(async () => {
    try {
      const res = await api.get<{ schools: SchoolOption[] }>('/api/super-admin/schools?limit=200')
      setSchools(res.schools || [])
    } catch {
      // Silently fail — school filter is optional
    }
  }, [])

  // ── Fetch all permissions ──
  const fetchAllPermissions = useCallback(async () => {
    try {
      const res = await api.get<{ modules: Record<string, Permission[]> }>('/api/super-admin/permissions')
      setAllPermissions(res.modules || {})
    } catch {
      toast({ title: "Couldn't Load Permissions", description: "We couldn't load the permissions. Please refresh the page.", variant: 'destructive' })
    }
  }, [toast])

  // ── Fetch role detail ──
  const fetchRoleDetail = useCallback(async (roleId: string) => {
    try {
      setLoadingDetail(true)
      const res = await api.get<RoleDetail>(`/api/super-admin/roles/${roleId}`)
      setRoleDetail(res)
      setGrantedPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setOriginalPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setEditName(res.name)
      setEditDescription(res.description || '')
      setEditColor(res.color || '')
      setOriginalEditData({ name: res.name, description: res.description || '', color: res.color || '' })
    } catch {
      toast({ title: "Couldn't Load Role Details", description: "We couldn't load the role details. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingDetail(false)
    }
  }, [toast])

  // ── Initial load ──
  useEffect(() => {
    fetchRoles()
    fetchSchools()
    fetchAllPermissions()
  }, [fetchRoles, fetchSchools, fetchAllPermissions])

  // ── Reload roles when filters change ──
  useEffect(() => {
    fetchRoles()
  }, [schoolFilter, fetchRoles])

  const rememberListState = (patch: Partial<SuperAdminRolesListState>) => {
    setPageState(SUPER_ADMIN_ROLES_LIST_STATE_KEY, {
      roleSearch,
      schoolFilter,
      ...patch,
    })
  }

  const handleRoleSearchChange = (value: string) => {
    setRoleSearch(value)
    rememberListState({ roleSearch: value })
  }

  const handleSchoolFilterChange = (value: string) => {
    setSchoolFilter(value)
    rememberListState({ schoolFilter: value })
  }

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

  // ── Toggle all permissions in a module ──
  const handleToggleModule = useCallback((modulePermIds: string[], grantAll: boolean) => {
    setGrantedPermissionIds((prev) => {
      const next = new Set(prev)
      for (const pid of modulePermIds) {
        if (grantAll) {
          next.add(pid)
        } else {
          next.delete(pid)
        }
      }
      return next
    })
  }, [])

  // ── Create role ──
  const handleCreateRole = useCallback(async () => {
    if (!newName.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter a role name.', variant: 'destructive' })
      return
    }
    if (!newSchoolId) {
      toast({ title: 'Missing Information', description: 'Please select a school.', variant: 'destructive' })
      return
    }
    try {
      setCreating(true)
      const res = await api.post<RoleListItem>('/api/super-admin/roles', {
        schoolId: newSchoolId,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        color: newColor || undefined,
      })
      setRoles((prev) => [res, ...prev])
      setShowCreateDialog(false)
      setNewName('')
      setNewDescription('')
      setNewColor(PRESET_COLORS[0])
      setNewSchoolId('')
      setSelectedRoleId(res.id)
      toast({ title: 'Role Created', description: `"${res.name}" has been created successfully.` })
    } catch (err) {
      toast({
        title: "Couldn't Create Role",
        description: err instanceof Error ? err.message : "We couldn't create the role. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }, [newName, newDescription, newColor, newSchoolId, toast])

  const isPredefined = roleDetail?.isSystem ?? false

  // ── Save role changes ──
  const handleSave = useCallback(async () => {
    if (!selectedRoleId) return

    const hasPermChanges =
      grantedPermissionIds.size !== originalPermissionIds.size ||
      Array.from(grantedPermissionIds).some((id) => !originalPermissionIds.has(id))

    const hasFieldChanges =
      editName !== originalEditData.name ||
      editDescription !== originalEditData.description ||
      editColor !== originalEditData.color

    // For predefined roles, only permission changes are allowed
    if (isPredefined) {
      if (!hasPermChanges) return
    } else {
      if (!hasPermChanges && !hasFieldChanges) return
    }

    try {
      setSaving(true)
      const body: Record<string, unknown> = {}
      // Only send field changes for custom (non-predefined) roles
      if (!isPredefined && hasFieldChanges) {
        body.name = editName.trim()
        body.description = editDescription.trim() || null
        body.color = editColor || null
      }
      if (hasPermChanges) {
        body.permissionIds = Array.from(grantedPermissionIds)
      }

      const res = await api.put<RoleDetail>(`/api/super-admin/roles/${selectedRoleId}`, body)
      setRoleDetail(res)
      setGrantedPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setOriginalPermissionIds(new Set(res.permissions.map((p) => p.id)))
      setOriginalEditData({ name: res.name, description: res.description || '', color: res.color || '' })

      await fetchRoles()

      toast({ title: 'Role Updated', description: `"${res.name}" has been updated successfully.` })
    } catch (err) {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : "We couldn't save the changes. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [selectedRoleId, grantedPermissionIds, originalPermissionIds, editName, editDescription, editColor, originalEditData, isPredefined, fetchRoles, toast])

  // ── Delete role ──
  const handleDeleteRole = useCallback(async () => {
    if (!selectedRoleId) return
    try {
      setDeleting(true)
      await api.delete(`/api/super-admin/roles/${selectedRoleId}`)
      setSelectedRoleId(null)
      setRoleDetail(null)
      await fetchRoles()
      toast({ title: 'Role Deleted', description: 'The role has been deleted successfully.' })
    } catch (err) {
      toast({
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : "We couldn't delete the role. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }, [selectedRoleId, fetchRoles, toast])

  // ── Derived state ──
  const hasPermChanges = useMemo(() => {
    if (grantedPermissionIds.size !== originalPermissionIds.size) return true
    for (const id of grantedPermissionIds) {
      if (!originalPermissionIds.has(id)) return true
    }
    return false
  }, [grantedPermissionIds, originalPermissionIds])

  const hasFieldChanges = useMemo(() => {
    return (
      editName !== originalEditData.name ||
      editDescription !== originalEditData.description ||
      editColor !== originalEditData.color
    )
  }, [editName, editDescription, editColor, originalEditData])

  const hasChanges = hasPermChanges || hasFieldChanges

  const moduleNames = useMemo(
    () => Object.keys(allPermissions).sort(),
    [allPermissions]
  )

  const totalPermissions = useMemo(
    () => Object.values(allPermissions).reduce((sum, perms) => sum + perms.length, 0),
    [allPermissions]
  )
  const roleGrantPercent = totalPermissions > 0
    ? Math.round((grantedPermissionIds.size / totalPermissions) * 100)
    : 0

  const groupedRoles = useMemo(() => {
    const grouped: Record<string, { school: SchoolInfo | null; roles: RoleListItem[] }> = {}
    for (const role of roles) {
      const key = role.school?.id || '__no_school'
      if (!grouped[key]) {
        grouped[key] = { school: role.school, roles: [] }
      }
      grouped[key].roles.push(role)
    }
    return Object.values(grouped)
  }, [roles])

  const assignedUsers = useMemo(
    () => roles.reduce((sum, role) => sum + role.userCount, 0),
    [roles]
  )

  const systemRoleCount = useMemo(
    () => roles.filter((role) => role.isSystem).length,
    [roles]
  )

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-stretch gap-3">
          <span aria-hidden className="bg-brand mt-0.5 w-1 shrink-0 self-stretch rounded-full" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Roles Studio</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Build school-level roles, tune permission bundles, and audit inherited access.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Roles" value={roles.length} note="Across schools" icon={ShieldCheck} />
        <SummaryStat label="System Roles" value={systemRoleCount} note="Protected roles" icon={Lock} />
        <SummaryStat label="Assigned Users" value={assignedUsers} note="Role memberships" icon={Users} />
        <SummaryStat label="Permission Types" value={totalPermissions} note="Available controls" icon={Layers} />
      </div>

      {/* Filters */}
      <Card className="py-0">
        <CardContent className="p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={roleSearch}
            onChange={(e) => handleRoleSearchChange(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <Select value={schoolFilter} onValueChange={handleSchoolFilterChange}>
          <SelectTrigger leadingIcon={<School className="size-3.5" />} className="h-9 w-full lg:w-[260px]">
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((school) => (
              <SelectItem key={school.id} value={school.id}>
                {school.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreateDialog(true)} className="h-9 gap-2">
          <Plus className="size-4" />
          Create Role
        </Button>
        </div>
        </CardContent>
      </Card>

      {/* Role browser + detail */}
      <div className="space-y-6">
        {/* Role browser */}
        <div>
          <Card className="h-full overflow-hidden rounded-lg bg-card py-0 shadow-sm">
            <CardHeader className="border-b px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-white shadow-sm">
                      <Shield className="size-4" />
                    </span>
                    Browse Roles
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    {groupedRoles.length} school groups
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {roles.length} roles
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRoles ? (
                <ListSkeleton />
              ) : roles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <ShieldCheck className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {roleSearch ? 'No roles match your search' : 'No roles found'}
                  </p>
                </div>
              ) : (
                <div className="quick-actions-scrollbar overflow-x-auto px-3 pb-3">
                  <div className="flex min-w-max gap-3">
                    {groupedRoles.map((group) => (
                      <div key={group.school?.id || '__no_school'} className="w-[300px] shrink-0 overflow-hidden rounded-lg border bg-muted/20 lg:w-[340px]">
                        <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-white shadow-sm">
                            <School className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-foreground/90">
                              {group.school?.name || 'Unknown School'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {group.roles.length} role{group.roles.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1 p-1.5">
                          {group.roles.map((role) => (
                            <button
                              key={role.id}
                              onClick={() => { setSelectedRoleId(role.id); setActiveTab('permissions') }}
                              className={`group relative w-full overflow-hidden rounded-md border p-2.5 text-left transition-all ${
                                selectedRoleId === role.id
                                  ? 'border-primary/40 bg-primary/10 shadow-sm'
                                  : 'border-transparent bg-card hover:border-primary/30 hover:bg-primary/[0.03]'
                              }`}
                            >
                              <span
                                aria-hidden
                                className="absolute inset-y-2 left-0 w-1 rounded-r-full"
                                style={{ backgroundColor: role.color || '#6b7280' }}
                              />
                              <div className="flex items-start gap-2 pl-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-sm font-medium">{role.name}</span>
                                    {selectedRoleId === role.id && (
                                      <Badge variant="outline" className="h-4 px-1.5 text-[9px]">
                                        Selected
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                      {role.permissionCount} perms
                                    </Badge>
                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                      {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                                    </Badge>
                                  </div>
                                </div>
                                {role.isSystem && (
                                  <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[9px]">
                                    <Lock className="size-2.5 mr-0.5" />
                                    System
                                  </Badge>
                                )}
                              </div>
                              <div className="hidden">
                                <span className="text-[10px] text-muted-foreground">
                                  {role.permissionCount} perms
                                </span>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Role Detail */}
        <div>
          {!selectedRoleId ? (
            <Card className="flex flex-col items-center justify-center rounded-lg py-20 text-center shadow-sm">
              <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-brand-soft text-white shadow-md shadow-primary/20">
                <ShieldCheck className="size-7" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">Select a Role</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                Choose a role to view its details and manage permissions. Predefined roles can have their permissions modified, but name and deletion are locked.
              </p>
            </Card>
          ) : loadingDetail ? (
            <DetailSkeleton />
          ) : roleDetail ? (
            <div className="space-y-4">
              {/* Role info card */}
              <Card className="overflow-hidden rounded-lg bg-card py-0 shadow-sm">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-white shadow-md shadow-primary/20">
                        <ShieldCheck className="size-7" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold tracking-tight">{roleDetail.name}</h2>
                          {roleDetail.isSystem && (
                            <Badge variant="secondary" className="text-[10px] px-2 gap-1">
                              <Lock className="size-3" />
                              Predefined
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {roleDetail.school && (
                            <>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <School className="size-3" />
                                {roleDetail.school.name}
                              </span>
                              <span className="text-muted-foreground/40">·</span>
                            </>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="size-3" />
                            {roleDetail.permissions.length} of {totalPermissions} permissions
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="size-3" />
                            {roleDetail.users.length} user{roleDetail.users.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isPredefined && (
                        <Button
                          variant="destructive"
                          className="h-10 gap-2"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={roleDetail.users.length > 0}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      )}
                      <Button
                        onClick={handleSave}
                        disabled={!hasChanges || saving}
                        className="h-10 gap-2 shrink-0"
                      >
                        <Save className="size-4" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 border-t bg-muted/20 px-4 py-3 sm:grid-cols-3">
                    <div className="rounded-lg border bg-card px-3 py-2">
                      <p className="text-[11px] font-medium text-muted-foreground">Granted</p>
                      <p className="mt-0.5 text-sm font-semibold">{roleDetail.permissions.length} permissions</p>
                    </div>
                    <div className="rounded-lg border bg-card px-3 py-2">
                      <p className="text-[11px] font-medium text-muted-foreground">Assigned Users</p>
                      <p className="mt-0.5 text-sm font-semibold">{roleDetail.users.length} users</p>
                    </div>
                    <div className="rounded-lg border bg-card px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-muted-foreground">Coverage</p>
                        <span className="text-xs font-semibold tabular-nums">{roleGrantPercent}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-300"
                          style={{ width: `${roleGrantPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Unsaved changes indicator */}
                  {hasPermChanges && (
                    <div className="mx-4 mb-4 mt-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                      <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Unsaved permission changes. Click &quot;Save Changes&quot; to apply.
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Predefined role notice */}
              {isPredefined && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Lock className="size-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    This is a predefined role. Its name, description, and color cannot be changed, and it cannot be deleted. You can still modify its permissions.
                  </span>
                </div>
              )}

              {/* Role edit fields — only for custom roles */}
              {!isPredefined && (
                <Card className="overflow-hidden rounded-lg bg-card py-0 shadow-sm">
                  <CardHeader className="border-b px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Pencil className="size-4" />
                      Role Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="space-y-2">
                        <Label htmlFor="sa-role-name" className="text-xs font-medium">Role Name</Label>
                        <Input
                          id="sa-role-name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Enter role name"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Role Color</Label>
                        <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/20 p-2">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEditColor(color)}
                              className={`size-8 rounded-lg border-2 shadow-sm transition-all ${
                                editColor === color ? 'border-foreground scale-105 ring-2 ring-primary/20' : 'border-transparent hover:border-muted-foreground/30'
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                          <Input
                            type="color"
                            value={editColor || '#6b7280'}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="size-8 cursor-pointer rounded-lg border-0 p-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sa-role-desc" className="text-xs font-medium">Description</Label>
                      <Textarea
                        id="sa-role-desc"
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

              {/* Delete hint for custom roles with users */}
              {!isPredefined && roleDetail.users.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <Lock className="size-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Cannot delete: {roleDetail.users.length} user{roleDetail.users.length !== 1 ? 's' : ''} inherit permissions from this role. Remove all users first.
                  </span>
                </div>
              )}

              {/* Tabs: Permissions & Users */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg border bg-card p-1 shadow-sm">
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
                  <div className="mb-3 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
                    <Info className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {isPredefined
                        ? `Toggle permissions for this predefined role. Changes are automatically inherited by all ${roleDetail.users.length} user${roleDetail.users.length !== 1 ? 's' : ''} assigned to this role`
                        : `These permissions are automatically inherited by all ${roleDetail.users.length} user${roleDetail.users.length !== 1 ? 's' : ''} assigned to this role`
                      }
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {moduleNames.map((moduleName) => {
                        const perms = allPermissions[moduleName]
                        const permIds = perms.map((p) => p.id)
                        const grantedInModule = perms.filter((p) => grantedPermissionIds.has(p.id)).length
                        const allGranted = grantedInModule === perms.length
                        const modulePercent = perms.length > 0
                          ? Math.round((grantedInModule / perms.length) * 100)
                          : 0
                        return (
                          <Card key={moduleName} className="overflow-hidden rounded-lg bg-card py-0 shadow-sm transition-colors hover:border-primary/30">
                            <CardHeader className="border-b px-4 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-white shadow-sm">
                                    <Shield className="size-5" />
                                  </div>
                                  <div className="min-w-0">
                                    <CardTitle className="truncate text-sm font-semibold">{moduleName}</CardTitle>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {grantedInModule} of {perms.length} permissions enabled
                                    </p>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {modulePercent}%
                                  </Badge>
                                  <Switch
                                    checked={allGranted}
                                    onCheckedChange={(checked) => handleToggleModule(permIds, checked)}
                                    className="shrink-0"
                                  />
                                </div>
                              </div>
                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-300"
                                  style={{ width: `${modulePercent}%` }}
                                />
                              </div>
                            </CardHeader>
                            <CardContent className="p-3">
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {perms.map((perm) => {
                                  const isGranted = grantedPermissionIds.has(perm.id)
                                  return (
                                    <div
                                      key={perm.id}
                                      className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                                        isGranted ? 'bg-primary/5' : 'hover:bg-muted/40'
                                      }`}
                                    >
                                      <span className={`min-w-0 flex-1 text-sm ${isGranted ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                        {perm.name}
                                      </span>
                                      <Switch
                                        checked={isGranted}
                                        onCheckedChange={() => handleTogglePermission(perm.id)}
                                        className="shrink-0"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                </TabsContent>

                <TabsContent value="users" className="mt-4">
                  {roleDetail.users.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center rounded-lg py-12 text-center shadow-sm">
                      <Users className="size-10 text-muted-foreground/30 mb-3" />
                      <h3 className="text-sm font-semibold text-muted-foreground">No Users Assigned</h3>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        No users are currently assigned to this role.
                      </p>
                    </Card>
                  ) : (
                    <Card className="overflow-hidden rounded-lg bg-card py-0 shadow-sm">
                      <CardHeader className="border-b px-4 py-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                          <Users className="size-4" />
                          Assigned Users
                          <Badge variant="secondary" className="text-[10px] ml-1">
                            {roleDetail.users.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1">
                          {roleDetail.users.map((roleUser) => (
                            <div
                              key={roleUser.id}
                              className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/40"
                            >
                              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[10px] font-medium text-white shadow-sm">
                                {roleUser.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{roleUser.name}</p>
                                <span className="text-[11px] text-muted-foreground">{roleUser.email}</span>
                              </div>
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                {roleUser.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </div>
      </div>

      {/* Create Role Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b bg-muted/30 px-5 py-4 text-left sm:px-6">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-white shadow-sm">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-xl font-semibold">Create new role</DialogTitle>
                <DialogDescription className="text-sm">
                  Create a custom role for a specific school. Assign permissions after creation.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            {/* Live preview */}
            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-border"
                  style={{ backgroundColor: `${newColor}20` }}
                >
                  <ShieldCheck className="size-5" style={{ color: newColor }} />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <h3 className="line-clamp-1 text-base font-semibold text-foreground">
                    {newName.trim() || 'Role name preview'}
                  </h3>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {newDescription.trim() || 'Your role description will appear here.'}
                  </p>
                </div>
              </div>
            </div>

            {/* School */}
            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <School className="size-4 text-brand" />
                School
              </div>

              <div className="space-y-1.5">
                <Label>
                  School <span className="text-destructive">*</span>
                </Label>
                <Select value={newSchoolId} onValueChange={setNewSchoolId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a school" />
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* Role details */}
            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Pencil className="size-4 text-brand" />
                Role details
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-new-role-name">
                  Role name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sa-new-role-name"
                  value={newName}
                  maxLength={50}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Department Head, Lab Assistant"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sa-new-role-desc">Description</Label>
                <Textarea
                  id="sa-new-role-desc"
                  value={newDescription}
                  rows={3}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe what this role is for..."
                  className="resize-none"
                />
              </div>
            </section>

            {/* Color */}
            <section className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Palette className="size-4 text-brand" />
                Accent color
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    aria-label={`Select color ${color}`}
                    className={`size-8 rounded-md border-2 transition-all ${
                      newColor === color
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <Input
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className="size-8 cursor-pointer rounded-md border-0 p-0"
                  aria-label="Custom color"
                />
              </div>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t bg-muted/20 px-5 py-4 sm:px-6">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateRole} disabled={creating || !newName.trim() || !newSchoolId}>
              <Plus className="mr-2 size-4" />
              {creating ? 'Creating...' : 'Create role'}
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
