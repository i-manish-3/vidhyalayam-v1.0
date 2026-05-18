'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Users,
  Shield,
  ShieldCheck,
  Search,
  UserPlus,
  Eye,
  GraduationCap,
  Calculator,
  Library,
  Briefcase,
  Headphones,
  Bus,
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

const STAFF_USER_ROLES = new Set(['TEACHER', 'STAFF', 'SCHOOL_ADMIN'])

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function getRoleBadgeColor(role: string): string {
  return ROLE_BADGE_COLORS[role] || 'bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400'
}

function formatRoleName(role: string): string {
  return role.replace(/_/g, ' ')
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function StaffTableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-4 w-20 mb-2" />
            <Skeleton className="h-7 w-10" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StaffPage() {
  const { toast } = useToast()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const navigateTo = useAppStore((s) => s.navigateTo)
  const setStaffDetailId = useAppStore((s) => s.setStaffDetailId)

  const [users, setUsers] = useState<SchoolUser[]>([])
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingUsers, setLoadingUsers] = useState(true)

  // ── Fetch staff users ──
  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true)
      const res = await api.get<{ users: SchoolUser[] }>('/api/school/users?limit=100')
      const staffUsers = (res.users || []).filter((u) => STAFF_USER_ROLES.has(u.role))
      setUsers(staffUsers)
    } catch {
      toast({ title: "Couldn't Load Staff", description: "We couldn't load the staff list. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingUsers(false)
    }
  }, [toast])

  // ── Fetch roles for permission counts ──
  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      setAvailableRoles(res.roles || [])
    } catch {
      // silent — roles are just for display
    }
  }, [])

  // ── Initial load ──
  useEffect(() => {
    fetchUsers()
    fetchRoles()
  }, [fetchUsers, fetchRoles])

  // ── Navigate to detail ──
  const handleViewStaff = useCallback((userId: string) => {
    setStaffDetailId(userId)
    navigateTo('staff-detail')
  }, [setStaffDetailId, navigateTo])

  // ── Navigate to create ──
  const handleCreateStaff = useCallback(() => {
    navigateTo('staff-create')
  }, [navigateTo])

  // ── Derived state ──
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.phone && u.phone.toLowerCase().includes(q))
    )
  }, [users, searchQuery])

  const roleBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const u of users) {
      counts[u.role] = (counts[u.role] || 0) + 1
    }
    return counts
  }, [users])

  const totalStaffCount = users.length

  // ── Render ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage staff members and their roles — permissions are automatically inherited
          </p>
        </div>
        <Button onClick={handleCreateStaff} className="gap-2 shrink-0">
          <UserPlus className="size-4" />
          Add Staff
        </Button>
      </div>

      {/* Info Banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
          Permissions are automatically inherited from roles — when you assign a role to a staff member, they instantly receive all permissions defined for that role.
        </span>
      </div>

      {/* Stats Row */}
      {loadingUsers ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Staff</p>
                  <p className="text-2xl font-bold tracking-tight">{totalStaffCount}</p>
                </div>
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="size-5 text-primary" />
                </div>
              </div>
            </CardContent>
            <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/40" />
          </Card>

          {Object.entries(roleBreakdown)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 3)
            .map(([role, count]) => (
              <Card key={role} className="relative overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{formatRoleName(role)}</p>
                      <p className="text-2xl font-bold tracking-tight">{count}</p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
                      <Shield className="size-5 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
                <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-muted/60 via-muted to-muted/40" />
              </Card>
            ))}
        </div>
      )}

      {/* Staff Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4" />
              Staff Members
              <Badge variant="secondary" className="text-[10px]">
                {filteredUsers.length}
              </Badge>
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingUsers ? (
            <div className="p-4">
              <StaffTableSkeleton />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="size-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">No Staff Found</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                {searchQuery
                  ? 'No staff members match your search criteria.'
                  : 'No staff members have been added yet. Click "Add Staff" to get started.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="hidden lg:table-cell">Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="hidden lg:table-cell">Permissions</TableHead>
                      <TableHead className="w-12">View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((staff) => {
                      const roleInfo = availableRoles.find(
                        (r) => r.name.toLowerCase() === staff.role.replace('_', ' ').toLowerCase() || (r.name === 'Teacher' && staff.role === 'TEACHER')
                      )
                      const permCount = roleInfo?.permissionCount ?? 0
                      return (
                        <TableRow key={staff.id} className="cursor-pointer" onClick={() => handleViewStaff(staff.id)}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="size-8 shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                                  {getInitials(staff.name)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{staff.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{staff.email}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {staff.phone || '—'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 h-5 leading-none ${getRoleBadgeColor(staff.role)}`}
                            >
                              {formatRoleName(staff.role)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <ShieldCheck className="size-3" />
                              {permCount} perm{permCount !== 1 ? 's' : ''}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-8" onClick={(e) => { e.stopPropagation(); handleViewStaff(staff.id) }}>
                              <Eye className="size-4 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden">
                <ScrollArea className="max-h-[calc(100vh-420px)] min-h-[300px]">
                  <div className="space-y-1 px-3 pb-3">
                    {filteredUsers.map((staff) => {
                      const roleInfo = availableRoles.find(
                        (r) => r.name.toLowerCase() === staff.role.replace('_', ' ').toLowerCase() || (r.name === 'Teacher' && staff.role === 'TEACHER')
                      )
                      const permCount = roleInfo?.permissionCount ?? 0
                      return (
                        <button
                          key={staff.id}
                          onClick={() => handleViewStaff(staff.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-150 hover:bg-muted/60 border border-transparent"
                        >
                          <Avatar className="size-9 shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                              {getInitials(staff.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{staff.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge
                                variant="secondary"
                                className={`text-[9px] px-1.5 py-0 h-4 leading-none ${getRoleBadgeColor(staff.role)}`}
                              >
                                {formatRoleName(staff.role)}
                              </Badge>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <ShieldCheck className="size-3" />
                                {permCount}
                              </span>
                            </div>
                          </div>
                          <Eye className="size-4 text-muted-foreground/50 shrink-0" />
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
