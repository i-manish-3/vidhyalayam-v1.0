'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { ResetUserPasswordDialog } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  Lock,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Power,
  PowerOff,
  CircleDot,
  Mail,
  Phone,
  CalendarDays,
  IdCard,
  KeyRound,
  MapPin,
  User as UserIcon,
  Loader2,
  Pencil,
  X,
  type LucideIcon,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolUser {
  id: string
  userId?: string | null
  employeeId?: string | null
  name: string
  email: string
  role: string
  phone?: string | null
  isActive: boolean
  isLocked?: boolean
  lockedUntil?: string | null
  failedAttempts?: number
  assignedRoles?: { id: string; name: string; color?: string | null }[]
}

interface StaffDetail {
  id: string
  userId?: string | null
  employeeId?: string | null
  firstName?: string
  lastName?: string
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
  city?: string | null
  state?: string | null
  pincode?: string | null
  profileImage?: string | null
  isActive: boolean
  assignedRoles?: { id: string; name: string; color?: string | null }[]
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

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

type StatusFilter = 'all' | 'active' | 'inactive'

interface StaffListState {
  searchQuery: string
  roleFilter: string
  statusFilter: StatusFilter
  page: number
  limit: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const STAFF_LIST_STATE_KEY = 'staff:list'

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

function formatDate(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function DetailItem({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-background p-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
        <p className={`break-words text-xs font-medium leading-4 text-foreground ${mono ? 'font-mono' : ''}`}>
          {value || <span className="font-sans text-muted-foreground">Not added</span>}
        </p>
      </div>
    </div>
  )
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

function StatusBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 h-5 leading-none gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      >
        <CircleDot className="size-2.5" />
        Active
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className="text-[10px] px-1.5 py-0 h-5 leading-none gap-1 bg-slate-100 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400"
    >
      <CircleDot className="size-2.5" />
      Inactive
    </Badge>
  )
}

function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationInfo
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const { page, limit, total, totalPages } = pagination
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = []
    if (page <= 3) {
      pages.push(1, 2, 3, 4, 'ellipsis-end', totalPages)
    } else if (page >= totalPages - 2) {
      pages.push(1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
    } else {
      pages.push(1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages)
    }
    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page:</span>
        <Select value={String(limit)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(size => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2">{from}–{to} of {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageNumbers.map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">
                ...
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className="size-8 text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function StaffPage() {
  const router = useRouter()
  const { toast } = useToast()
  const savedListState = useAppStore((s) => s.pageState[STAFF_LIST_STATE_KEY] as StaffListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)

  const [users, setUsers] = useState<SchoolUser[]>([])
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([])
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(savedListState?.searchQuery?.trim() ?? '')
  const [roleFilter, setRoleFilter] = useState<string>(savedListState?.roleFilter ?? 'all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedListState?.statusFilter ?? 'all')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: savedListState?.page ?? 1,
    limit: savedListState?.limit ?? 25,
    total: 0,
    totalPages: 1,
  })

  // Pending toggle target — opens the confirm dialog when set.
  const [toggleTarget, setToggleTarget] = useState<SchoolUser | null>(null)
  const [resetTarget, setResetTarget] = useState<SchoolUser | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffDetail | null>(null)
  const initialStaffPageRef = useRef(pagination.page)
  const firstStaffFetchRef = useRef(true)

  const rememberListState = useCallback((patch: Partial<StaffListState>) => {
    setPageState(STAFF_LIST_STATE_KEY, {
      searchQuery,
      roleFilter,
      statusFilter,
      page: pagination.page,
      limit: pagination.limit,
      ...patch,
    })
  }, [pagination.limit, pagination.page, roleFilter, searchQuery, setPageState, statusFilter])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // ── Fetch staff ──
  // Server returns the full set; filtering/pagination is applied client-side
  // here because the search, role, and status filters need to compose against
  // the same in-memory list.
  const fetchUsers = useCallback(
    async (
      page: number,
      limit: number,
      search: string,
      role: string,
      status: StatusFilter,
    ) => {
      try {
        setLoadingUsers(true)
        const res = await api.get<{
          staff: Array<{
            id: string
            employeeId?: string | null
            firstName: string
            lastName: string
            name: string
            phone?: string | null
            email?: string | null
            designation?: string | null
            joinDate?: string | null
            isActive: boolean
            assignedRoles?: { id: string; name: string; color?: string | null }[]
          }>
        }>('/api/school/staff')

        const all = res.staff || []
        const q = search.trim().toLowerCase()
        const filtered = all.filter((s) => {
          if (q) {
            const matches = [s.name, s.employeeId, s.phone, s.email, s.designation]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
            if (!matches) return false
          }
          if (role !== 'all') {
            const hasRole = s.assignedRoles?.some((r) => r.id === role)
            if (!hasRole) return false
          }
          if (status === 'active' && !s.isActive) return false
          if (status === 'inactive' && s.isActive) return false
          return true
        })

        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
        filtered.sort((a, b) => {
          const aId = a.employeeId ?? ''
          const bId = b.employeeId ?? ''
          if (!aId && !bId) return 0
          if (!aId) return 1
          if (!bId) return -1
          return collator.compare(aId, bId)
        })

        const total = filtered.length
        const totalPages = Math.max(1, Math.ceil(total / limit))
        const safePage = Math.min(page, totalPages)
        const start = (safePage - 1) * limit
        const slice = filtered.slice(start, start + limit)

        const mapped: SchoolUser[] = slice.map((s) => ({
          id: s.id,
          employeeId: s.employeeId ?? null,
          name: s.name,
          email: s.email || '',
          role: 'STAFF',
          phone: s.phone ?? null,
          isActive: s.isActive,
          assignedRoles: s.assignedRoles ?? [],
        }))

        setUsers(mapped)
        setPagination({ page: safePage, limit, total, totalPages })
      } catch {
        toast({ title: "Couldn't Load Staff", description: "We couldn't load the staff list. Please refresh the page.", variant: 'destructive' })
      } finally {
        setLoadingUsers(false)
      }
    },
    [toast],
  )

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<{ roles: AvailableRole[] }>('/api/school/roles')
      setAvailableRoles(res.roles || [])
    } catch {
      // silent — roles are just for display + filter options
    }
  }, [])

  // Filter changes always reset back to page 1.
  useEffect(() => {
    const nextPage = firstStaffFetchRef.current ? initialStaffPageRef.current : 1
    firstStaffFetchRef.current = false
    fetchUsers(nextPage, pagination.limit, debouncedSearch, roleFilter, statusFilter)
  }, [debouncedSearch, fetchUsers, pagination.limit, roleFilter, statusFilter])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  // ── Pagination handlers ──
  const handlePageChange = useCallback((page: number) => {
    rememberListState({ page })
    fetchUsers(page, pagination.limit, debouncedSearch, roleFilter, statusFilter)
  }, [fetchUsers, pagination.limit, debouncedSearch, roleFilter, statusFilter, rememberListState])

  const handlePageSizeChange = useCallback((size: number) => {
    rememberListState({ page: 1, limit: size })
    fetchUsers(1, size, debouncedSearch, roleFilter, statusFilter)
  }, [fetchUsers, debouncedSearch, roleFilter, statusFilter, rememberListState])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    rememberListState({ searchQuery: value, page: 1 })
  }

  const handleRoleFilterChange = (value: string) => {
    setRoleFilter(value)
    rememberListState({ roleFilter: value, page: 1 })
  }

  const handleStatusFilterChange = (value: StatusFilter) => {
    setStatusFilter(value)
    rememberListState({ statusFilter: value, page: 1 })
  }

  // ── Navigation ──
  const handleViewStaff = useCallback(async (userId: string) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setSelectedStaff(null)
    try {
      const res = await api.get<StaffDetail>(`/api/school/staff/${userId}`)
      setSelectedStaff(res)
    } catch (err) {
      setDetailOpen(false)
      toast({
        title: "Couldn't Load Staff",
        description: err instanceof Error ? err.message : "We couldn't load this staff member's details. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  const handleCreateStaff = useCallback(() => {
    router.push('/staff/new')
  }, [router])

  // ── Toggle active/inactive ──
  const handleConfirmToggle = useCallback(async () => {
    if (!toggleTarget) return
    const target = toggleTarget
    const nextActive = !target.isActive
    try {
      setTogglingId(target.id)
      await api.patch(`/api/school/staff/${target.id}`, { isActive: nextActive })
      toast({
        title: nextActive ? 'Staff Enabled' : 'Staff Disabled',
        description: `${target.name} ${nextActive ? 'can now sign in.' : 'will no longer be able to sign in.'}`,
      })
      setToggleTarget(null)
      await fetchUsers(pagination.page, pagination.limit, debouncedSearch, roleFilter, statusFilter)
    } catch (err) {
      toast({
        title: 'Update Failed',
        description: err instanceof Error ? err.message : "We couldn't update the staff status. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setTogglingId(null)
    }
  }, [toggleTarget, toast, fetchUsers, pagination.page, pagination.limit, debouncedSearch, roleFilter, statusFilter])

  // ── Derived state ──
  const filterableRoles = useMemo(() => {
    // Hide identity/system roles that aren't assignable to staff.
    const excluded = new Set(['School Admin', 'Teacher', 'Student', 'Parent', 'Staff', 'Transport'])
    return availableRoles
      .filter((r) => !excluded.has(r.name))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [availableRoles])

  const hasActiveFilters = roleFilter !== 'all' || statusFilter !== 'all' || debouncedSearch !== ''

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setRoleFilter('all')
    setStatusFilter('all')
    rememberListState({ searchQuery: '', roleFilter: 'all', statusFilter: 'all', page: 1 })
  }, [rememberListState])

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Staff List</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage staff profiles, roles, and account status
          </p>
        </div>
        <Button onClick={handleCreateStaff} className="gap-2 shrink-0">
          <UserPlus className="size-4" />
          Add Staff
        </Button>
      </div>

      {/* Staff Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="size-4" />
                Staff Members
                <Badge variant="secondary" className="text-[10px]">
                  {pagination.total}
                </Badge>
              </CardTitle>
            </div>

            {/* Filters Row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name, employee ID, email..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
                  <SelectTrigger className="h-9 w-full sm:w-[180px] text-sm">
                    <SelectValue placeholder="All roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    {filterableRoles.map((role) => {
                      const Icon = ROLE_DISPLAY_ICONS[role.name] || Shield
                      return (
                        <SelectItem key={role.id} value={role.id}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="size-3.5" />
                            {role.name}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>

                <Select
                  value={statusFilter}
                  onValueChange={(v) => handleStatusFilterChange(v as StatusFilter)}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[140px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="active">Active only</SelectItem>
                    <SelectItem value="inactive">Inactive only</SelectItem>
                  </SelectContent>
                </Select>

                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 gap-1 text-xs"
                  >
                    <X className="size-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingUsers ? (
            <div className="p-4">
              <StaffTableSkeleton />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="size-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">No Staff Found</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                {hasActiveFilters
                  ? 'No staff members match your current filters.'
                  : 'No staff members have been added yet. Click "Add Staff" to get started.'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 gap-1">
                  <X className="size-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[130px]">Employee ID</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="hidden lg:table-cell">Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((staff) => {
                      const firstAssignedRole = staff.assignedRoles?.[0]
                      const displayRoleName = firstAssignedRole?.name ?? formatRoleName(staff.role)
                      const extraRoleCount = (staff.assignedRoles?.length ?? 0) > 1 ? (staff.assignedRoles!.length - 1) : 0
                      const isToggling = togglingId === staff.id
                      return (
                        <TableRow
                          key={staff.id}
                          className={`cursor-pointer ${!staff.isActive ? 'opacity-70' : ''}`}
                          onClick={() => handleViewStaff(staff.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="size-8 shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                                  {getInitials(staff.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium text-sm truncate">{staff.name}</span>
                                {staff.isLocked && (
                                  <>
                                    <Lock className="size-3 text-red-600 dark:text-red-400 shrink-0" />
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 leading-none border-red-300 text-red-700 dark:border-red-700 dark:text-red-400 shrink-0">
                                      Locked
                                    </Badge>
                                  </>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {staff.employeeId ? (
                              <span className="font-mono text-xs">{staff.employeeId}</span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{staff.email}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {staff.phone || '—'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] px-1.5 py-0 h-5 leading-none ${getRoleBadgeColor(staff.role)}`}
                                style={firstAssignedRole?.color ? { backgroundColor: `${firstAssignedRole.color}20`, color: firstAssignedRole.color } : undefined}
                              >
                                {displayRoleName}
                              </Badge>
                              {extraRoleCount > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 leading-none">
                                  +{extraRoleCount}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <StatusBadge active={staff.isActive} />
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  disabled={isToggling}
                                >
                                  <MoreHorizontal className="size-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleViewStaff(staff.id)}>
                                  <Eye className="size-4" />
                                  View profile
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setResetTarget(staff)}
                                  disabled={!staff.userId}
                                >
                                  <KeyRound className="size-4" />
                                  Reset password
                                </DropdownMenuItem>
                                {staff.isActive ? (
                                  <DropdownMenuItem
                                    onClick={() => setToggleTarget(staff)}
                                    className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                  >
                                    <PowerOff className="size-4" />
                                    Disable account
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => setToggleTarget(staff)}
                                    className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                                  >
                                    <Power className="size-4" />
                                    Enable account
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
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
                    {users.map((staff) => {
                      const firstAssignedRole = staff.assignedRoles?.[0]
                      const displayRoleName = firstAssignedRole?.name ?? formatRoleName(staff.role)
                      const extraRoleCount = (staff.assignedRoles?.length ?? 0) > 1 ? (staff.assignedRoles!.length - 1) : 0
                      const isToggling = togglingId === staff.id
                      return (
                        <div
                          key={staff.id}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-150 hover:bg-muted/60 border border-transparent ${!staff.isActive ? 'opacity-70' : ''}`}
                        >
                          <button
                            onClick={() => handleViewStaff(staff.id)}
                            className="flex flex-1 items-center gap-3 text-left min-w-0"
                          >
                            <Avatar className="size-9 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-medium">
                                {getInitials(staff.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate">{staff.name}</p>
                                {staff.isLocked && (
                                  <Lock className="size-3 text-red-600 dark:text-red-400 shrink-0" />
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                {staff.employeeId && (
                                  <span className="font-mono text-[11px] text-muted-foreground">{staff.employeeId}</span>
                                )}
                                <Badge
                                  variant="secondary"
                                  className={`text-[9px] px-1.5 py-0 h-4 leading-none ${getRoleBadgeColor(staff.role)}`}
                                  style={firstAssignedRole?.color ? { backgroundColor: `${firstAssignedRole.color}20`, color: firstAssignedRole.color } : undefined}
                                >
                                  {displayRoleName}
                                </Badge>
                                {extraRoleCount > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 leading-none">
                                    +{extraRoleCount}
                                  </Badge>
                                )}
                                <StatusBadge active={staff.isActive} />
                              </div>
                            </div>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                disabled={isToggling}
                              >
                                <MoreHorizontal className="size-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewStaff(staff.id)}>
                                <Eye className="size-4" />
                                View profile
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setResetTarget(staff)}
                                disabled={!staff.userId}
                              >
                                <KeyRound className="size-4" />
                                Reset password
                              </DropdownMenuItem>
                              {staff.isActive ? (
                                <DropdownMenuItem
                                  onClick={() => setToggleTarget(staff)}
                                  className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                                >
                                  <PowerOff className="size-4" />
                                  Disable account
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => setToggleTarget(staff)}
                                  className="text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400"
                                >
                                  <Power className="size-4" />
                                  Enable account
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>

              <Pagination
                pagination={pagination}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Disable / Enable confirmation */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.isActive ? 'Disable this staff account?' : 'Enable this staff account?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.isActive ? (
                <>
                  <span className="font-medium text-foreground">{toggleTarget?.name}</span>{' '}
                  will no longer be able to sign in. Their record stays intact and you can re-enable the account at any time.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{toggleTarget?.name}</span>{' '}
                  will regain sign-in access immediately with their existing role and permissions.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!togglingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmToggle()
              }}
              disabled={!!togglingId}
              className={
                toggleTarget?.isActive
                  ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/40'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/40'
              }
            >
              {togglingId
                ? 'Working…'
                : toggleTarget?.isActive
                  ? 'Disable account'
                  : 'Enable account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Staff Detail Modal */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setSelectedStaff(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto p-3.5 sm:max-w-lg">
          <DialogHeader className="gap-0.5">
            <DialogTitle className="text-[15px]">Staff Profile</DialogTitle>
            <DialogDescription className="text-xs">
              Profile, contact, and employment information.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : selectedStaff ? (
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/30 p-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-10 border bg-background">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {getInitials(selectedStaff.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold text-foreground">{selectedStaff.name}</h3>
                      <Badge variant={selectedStaff.isActive ? 'default' : 'destructive'} className="h-4 px-1 text-[9px]">
                        {selectedStaff.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      {selectedStaff.employeeId && <span className="font-mono">{selectedStaff.employeeId}</span>}
                      {selectedStaff.designation && <span>{selectedStaff.designation}</span>}
                      {selectedStaff.department && <span>{selectedStaff.department}</span>}
                    </div>
                    {(selectedStaff.assignedRoles?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedStaff.assignedRoles!.map((role) => (
                          <Badge
                            key={role.id}
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 leading-none"
                            style={role.color ? { backgroundColor: `${role.color}20`, color: role.color } : undefined}
                          >
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-1.5 sm:grid-cols-2">
                <DetailItem icon={IdCard} label="Employee ID" value={selectedStaff.employeeId} mono />
                <DetailItem icon={Briefcase} label="Designation" value={selectedStaff.designation} />
                <DetailItem icon={Phone} label="Phone" value={selectedStaff.phone} />
                <DetailItem
                  icon={Mail}
                  label="Email"
                  value={selectedStaff.email && !selectedStaff.email.endsWith('@staff.local') ? selectedStaff.email : null}
                />
                <DetailItem icon={UserIcon} label="Gender" value={selectedStaff.gender} />
                <DetailItem icon={CalendarDays} label="Date of Birth" value={formatDate(selectedStaff.dateOfBirth)} />
                <DetailItem icon={Briefcase} label="Department" value={selectedStaff.department} />
                <DetailItem icon={CalendarDays} label="Join Date" value={formatDate(selectedStaff.joinDate)} />
                <DetailItem icon={GraduationCap} label="Qualification" value={selectedStaff.qualification} />
                <div className="sm:col-span-2">
                  <DetailItem
                    icon={MapPin}
                    label="Address"
                    value={[selectedStaff.address, selectedStaff.city, selectedStaff.state, selectedStaff.pincode]
                      .filter(Boolean)
                      .join(', ') || null}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            {selectedStaff && (
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  setDetailOpen(false)
                  router.push(`/staff/${selectedStaff.id}/edit`)
                }}
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResetUserPasswordDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        userId={resetTarget?.userId ?? null}
        userName={resetTarget?.name ?? ''}
        roleLabel="staff member"
      />
    </div>
  )
}
