'use client'

import { useState, useEffect, useCallback, useMemo, type ElementType } from 'react'
import { api } from '@/lib/api'
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
  Sparkles,
  Layers,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolInfo {
  id: string
  name: string
  primaryColor?: string | null
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

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone = 'primary',
}: {
  label: string
  value: string | number
  icon: ElementType
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminRolesPage() {
  const { toast } = useToast()

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
  const [roleSearch, setRoleSearch] = useState('')
  const [schoolFilter, setSchoolFilter] = useState<string>('all')
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
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-2">
              <Badge variant="secondary" className="w-fit gap-2 bg-primary/10 text-primary hover:bg-primary/10">
                <Sparkles className="size-3.5" />
                Super Admin Control
              </Badge>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground/90">Roles Studio</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Build school-level roles, tune permission bundles, and audit inherited access.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[520px]">
              <SummaryTile label="Roles" value={roles.length} icon={ShieldCheck} />
              <SummaryTile label="System Roles" value={systemRoleCount} icon={Lock} tone="amber" />
              <SummaryTile label="Assigned Users" value={assignedUsers} icon={Users} tone="sky" />
              <SummaryTile label="Permission Types" value={totalPermissions} icon={Layers} tone="emerald" />
            </div>
          </div>
        </div>
      </section>
      {/* Filters */}
      <section className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={roleSearch}
            onChange={(e) => setRoleSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="h-9 w-full lg:w-[260px]">
            <School className="size-3.5 mr-1.5 shrink-0" />
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
      </section>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left panel: Role List */}
        <div className="lg:col-span-4 xl:col-span-3">
          <Card className="h-full overflow-hidden rounded-xl shadow-sm">
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4" />
                Role Catalog
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {roles.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Grouped by school for faster review.
              </CardDescription>
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
                <ScrollArea className="h-[calc(100vh-360px)] min-h-[300px]">
                  <div className="space-y-4 px-3 pb-3">
                    {groupedRoles.map((group) => (
                      <div key={group.school?.id || '__no_school'}>
                        <div className="flex items-center gap-2 mb-1.5 px-1">
                          <School className="size-3 text-muted-foreground" />
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                            {group.school?.name || 'Unknown School'}
                          </span>
                          <Badge variant="outline" className="text-[9px] ml-auto shrink-0">
                            {group.roles.length}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {group.roles.map((role) => (
                            <button
                              key={role.id}
                              onClick={() => { setSelectedRoleId(role.id); setActiveTab('permissions') }}
                              className={`w-full text-left rounded-lg border p-2.5 transition-all ${
                                selectedRoleId === role.id
                                  ? 'border-primary/40 bg-primary/10 shadow-sm'
                                  : 'border-border/50 bg-background hover:border-primary/20 hover:bg-primary/[0.03]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="size-3 rounded-full shrink-0"
                                  style={{ backgroundColor: role.color || '#6b7280' }}
                                />
                                <span className="text-sm font-medium truncate">{role.name}</span>
                                {role.isSystem && (
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 ml-auto shrink-0">
                                    <Lock className="size-2.5 mr-0.5" />
                                    System
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 ml-5">
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
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right panel: Role Detail */}
        <div className="lg:col-span-8 xl:col-span-9">
          {!selectedRoleId ? (
            <Card className="flex flex-col items-center justify-center py-20 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <ShieldCheck className="size-7 text-muted-foreground/50" />
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
              <Card>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-10 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${roleDetail.color || '#6b7280'}20` }}
                      >
                        <ShieldCheck className="size-5" style={{ color: roleDetail.color || '#6b7280' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold">{roleDetail.name}</h2>
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
                          size="sm"
                          className="gap-1.5 h-8 text-xs"
                          onClick={() => setShowDeleteDialog(true)}
                          disabled={roleDetail.users.length > 0}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      )}
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
                  </div>

                  {/* Unsaved changes indicator */}
                  {hasPermChanges && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mt-3">
                      <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Unsaved permission changes — click &quot;Save Permissions&quot; to apply
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
                    This is a predefined role — its name, description, and color cannot be changed, and it cannot be deleted. However, you can modify its permissions.
                  </span>
                </div>
              )}

              {/* Role edit fields — only for custom roles */}
              {!isPredefined && (
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
                      {isPredefined
                        ? `Toggle permissions for this predefined role — changes are automatically inherited by all ${roleDetail.users.length} user${roleDetail.users.length !== 1 ? 's' : ''} assigned to this role`
                        : `These permissions are automatically inherited by all ${roleDetail.users.length} user${roleDetail.users.length !== 1 ? 's' : ''} assigned to this role`
                      }
                    </span>
                  </div>
                  <ScrollArea className="h-[calc(100vh-640px)] min-h-[200px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pr-1 pb-2">
                      {moduleNames.map((moduleName) => {
                        const perms = allPermissions[moduleName]
                        const permIds = perms.map((p) => p.id)
                        const grantedInModule = perms.filter((p) => grantedPermissionIds.has(p.id)).length
                        const allGranted = grantedInModule === perms.length
                        return (
                          <Card key={moduleName} className="overflow-hidden">
                            <CardHeader className="pb-2 pt-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="size-7 rounded-md flex items-center justify-center shrink-0 bg-primary/10">
                                  <Shield className="size-3.5 text-primary" />
                                </div>
                                <CardTitle className="text-sm font-semibold truncate">{moduleName}</CardTitle>
                                <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                                  {grantedInModule}/{perms.length}
                                </Badge>
                                <Switch
                                  checked={allGranted}
                                  onCheckedChange={(checked) => handleToggleModule(permIds, checked)}
                                  className="shrink-0 scale-90"
                                />
                              </div>
                            </CardHeader>
                            <CardContent className="px-4 pb-3 pt-0">
                              <div className="space-y-0.5">
                                {perms.map((perm) => {
                                  const isGranted = grantedPermissionIds.has(perm.id)
                                  return (
                                    <div
                                      key={perm.id}
                                      className="flex items-center justify-between w-full py-1.5 px-2 rounded-md transition-colors gap-2"
                                    >
                                      <span className={`text-xs truncate flex-1 ${isGranted ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                        {perm.name}
                                      </span>
                                      <Switch
                                        checked={isGranted}
                                        onCheckedChange={() => handleTogglePermission(perm.id)}
                                        className="shrink-0 scale-90"
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
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="users" className="mt-4">
                  {roleDetail.users.length === 0 ? (
                    <Card className="flex flex-col items-center justify-center py-12 text-center">
                      <Users className="size-10 text-muted-foreground/30 mb-3" />
                      <h3 className="text-sm font-semibold text-muted-foreground">No Users Assigned</h3>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        No users are currently assigned to this role.
                      </p>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
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
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40"
                            >
                              <div className="size-8 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary text-[10px] font-medium">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" />
              Create New Role
            </DialogTitle>
            <DialogDescription>
              Create a custom role for a specific school. You can assign permissions after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">School *</Label>
              <Select value={newSchoolId} onValueChange={setNewSchoolId}>
                <SelectTrigger className="h-9">
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
            <div className="space-y-2">
              <Label htmlFor="sa-new-role-name" className="text-xs font-medium">Role Name *</Label>
              <Input
                id="sa-new-role-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Department Head, Lab Assistant"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-new-role-desc" className="text-xs font-medium">Description</Label>
              <Textarea
                id="sa-new-role-desc"
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
            <Button onClick={handleCreateRole} disabled={creating || !newName.trim() || !newSchoolId}>
              {creating ? 'Creating...' : 'Create Role'}
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
