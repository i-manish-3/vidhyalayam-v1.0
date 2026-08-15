'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { ResetUserPasswordDialog } from '@/components/shared'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Filter,
  CheckCircle2,
  XCircle,
  List,
  Building2,
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

const ROLE_GRADIENT_COLORS: Record<string, string> = {
  Teacher: 'from-violet-500 to-fuchsia-500',
  Accountant: 'from-emerald-500 to-teal-500',
  'Sr. Accountant': 'from-emerald-600 to-teal-600',
  Librarian: 'from-sky-500 to-cyan-500',
  Office: 'from-amber-500 to-orange-500',
  Controller: 'from-indigo-500 to-violet-500',
  Reception: 'from-pink-500 to-rose-500',
  Transport: 'from-blue-500 to-sky-500',
  Security: 'from-slate-500 to-gray-500',
}

const ROLE_ROW_COLORS: Record<string, string> = {
  Teacher: 'from-violet-500/[0.02] via-background to-fuchsia-500/[0.02]',
  Accountant: 'from-emerald-500/[0.02] via-background to-teal-500/[0.02]',
  Librarian: 'from-sky-500/[0.02] via-background to-cyan-500/[0.02]',
  Office: 'from-amber-500/[0.02] via-background to-orange-500/[0.02]',
  Controller: 'from-indigo-500/[0.02] via-background to-violet-500/[0.02]',
  Reception: 'from-pink-500/[0.02] via-background to-rose-500/[0.02]',
  Transport: 'from-blue-500/[0.02] via-background to-sky-500/[0.02]',
}

const ROLE_DOT_COLORS: Record<string, string> = {
  Teacher: 'bg-violet-500',
  Accountant: 'bg-emerald-500',
  'Sr. Accountant': 'bg-emerald-600',
  Librarian: 'bg-sky-500',
  Office: 'bg-amber-500',
  Controller: 'bg-indigo-500',
  Reception: 'bg-pink-500',
  Transport: 'bg-blue-500',
  Security: 'bg-slate-500',
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
      <Badge className="text-[10px] px-2 py-0 h-5 leading-none gap-1.5 border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 text-emerald-700 shadow-sm dark:text-emerald-300">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Active
      </Badge>
    )
  }
  return (
    <Badge className="text-[10px] px-2 py-0 h-5 leading-none gap-1.5 border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-pink-500/10 text-rose-600 shadow-sm dark:text-rose-300">
      <span className="size-2 rounded-full bg-rose-400" />
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
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-primary/10 bg-gradient-to-r from-primary/[0.02] via-background to-cyan-500/[0.02] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-xs font-medium">Rows per page:</span>
        <Select value={String(limit)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-8 w-[70px] border-primary/15 text-xs font-medium shadow-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(size => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2 text-xs font-medium">
          <span className="text-foreground/80">{from}</span><span className="text-muted-foreground">–</span><span className="text-foreground/80">{to}</span>
          <span className="text-muted-foreground"> of </span>
          <span className="text-foreground/80">{total}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-8 border-primary/15 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pageNumbers.map((p, i) => {
          if (p === 'ellipsis-start' || p === 'ellipsis-end') {
            return (
              <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm font-medium">
                ...
              </span>
            )
          }
          return (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="icon"
              className={cn(
                'size-8 text-xs font-bold shadow-sm transition-all',
                p === page
                  ? 'bg-gradient-to-br from-primary to-teal-600 text-white shadow-primary/20 hover:from-primary/90 hover:to-teal-600/90'
                  : 'border-primary/15 hover:border-primary/30 hover:shadow-md'
              )}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          )
        })}
        <Button
          variant="outline"
          size="icon"
          className="size-8 border-primary/15 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
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
  const activeFilterCount = [roleFilter !== 'all', statusFilter !== 'all', debouncedSearch !== ''].filter(Boolean).length
  const staffCountLabel = loadingUsers
    ? 'Loading staff members'
    : `${pagination.total} staff member${pagination.total === 1 ? '' : 's'}`

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setRoleFilter('all')
    setStatusFilter('all')
    rememberListState({ searchQuery: '', roleFilter: 'all', statusFilter: 'all', page: 1 })
  }, [rememberListState])

  // ── Render ──
  const totalActive = users.filter((u) => u.isActive).length
  const totalInactive = users.filter((u) => !u.isActive).length

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div aria-hidden className="absolute left-1/4 top-0 size-16 rounded-full bg-teal-300/8 blur-sm" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Users className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Staff List</h1>
            <p className="mt-0.5 text-xs text-white/80">View and manage staff profiles, roles, and account status.</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={handleCreateStaff}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <UserPlus className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Add Staff</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="group relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-primary/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-primary/5 transition-all group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm shadow-primary/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Staff</p>
              <p className="mt-0.5 text-2xl font-bold">{pagination.total}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-card to-emerald-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-emerald-500/5 transition-all group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active</p>
              <p className="mt-0.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalActive}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.07] via-card to-rose-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-rose-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-rose-500/5 transition-all group-hover:scale-110" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-sm shadow-rose-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <XCircle className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Inactive</p>
              <p className="mt-0.5 text-2xl font-bold text-rose-600 dark:text-rose-400">{totalInactive}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] via-card to-sky-500/[0.03] p-3 shadow-sm">
        <div aria-hidden className="absolute -right-6 -top-6 size-16 rounded-full border-[12px] border-sky-500/5" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/[0.08] to-teal-600/[0.06] text-primary shadow-sm">
              <Filter className="size-4" />
            </span>
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <Badge className="h-5 gap-1 border-primary/20 bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                {activeFilterCount}
              </Badge>
            )}
          </div>

          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.4fr)_minmax(160px,0.8fr)_minmax(140px,0.7fr)]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, employee ID, email..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 border-primary/15 bg-background pl-9 pr-9 text-sm transition-all focus-visible:border-primary/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <Select value={roleFilter} onValueChange={handleRoleFilterChange}>
              <SelectTrigger className="h-9 border-primary/15 bg-background text-sm">
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

            <Select value={statusFilter} onValueChange={(v) => handleStatusFilterChange(v as StatusFilter)}>
              <SelectTrigger className="h-9 border-primary/15 bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-muted-foreground" />All status</span>
                </SelectItem>
                <SelectItem value="active">
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />Active only</span>
                </SelectItem>
                <SelectItem value="inactive">
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-500" />Inactive only</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
            <p className="whitespace-nowrap text-xs text-muted-foreground">
              {loadingUsers ? 'Loading...' : <><span className="font-semibold text-foreground/80">{users.length}</span> shown</>}
            </p>
            {hasActiveFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1.5 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20">
                <X className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-sky-500/[0.02] shadow-sm">
        <div aria-hidden className="absolute -right-6 -top-6 size-20 rounded-full border-[14px] border-primary/5" />
        <div className="relative border-b border-primary/10 bg-gradient-to-r from-primary/[0.06] via-teal-600/[0.04] to-cyan-600/[0.05] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm shadow-primary/20">
              <Users className="size-4" />
            </span>
            <span className="text-sm font-semibold">Staff Members</span>
            <Badge variant="secondary" className="h-5 gap-1 border-primary/20 bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
              {pagination.total}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{staffCountLabel}</p>
        </div>

        <div className="p-0">
          {loadingUsers ? (
            <div className="p-4">
              <StaffTableSkeleton />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <span className="mb-4 flex size-14 items-center justify-center rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-primary/[0.06] to-cyan-500/[0.06] shadow-sm">
                <Users className="size-7 text-primary/50" strokeWidth={1.5} />
              </span>
              <h3 className="text-base font-semibold text-foreground">No Staff Found</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {hasActiveFilters
                  ? 'No staff members match your current filters.'
                  : 'No staff members have been added yet. Click "Add Staff" to get started.'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-3 gap-1">
                  <X className="size-3.5" /> Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-violet-500/[0.06] via-fuchsia-500/[0.04] to-cyan-500/[0.06] hover:from-violet-500/[0.06] hover:via-fuchsia-500/[0.04] hover:to-cyan-500/[0.06]">
                      <TableHead className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Name</TableHead>
                      <TableHead className="w-[130px] py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Employee ID</TableHead>
                      <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">Email</TableHead>
                      <TableHead className="hidden py-3 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 lg:table-cell">Phone</TableHead>
                      <TableHead className="py-3 text-[11px] font-bold uppercase tracking-wider text-primary/70">Role</TableHead>
                      <TableHead className="w-[110px] py-3 text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">Status</TableHead>
                      <TableHead className="w-12 py-3" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((staff, idx) => {
                      const firstAssignedRole = staff.assignedRoles?.[0]
                      const displayRoleName = firstAssignedRole?.name ?? formatRoleName(staff.role)
                      const extraRoleCount = (staff.assignedRoles?.length ?? 0) > 1 ? (staff.assignedRoles!.length - 1) : 0
                      const roleGradient = ROLE_GRADIENT_COLORS[displayRoleName] || 'from-primary to-teal-600'
                      const roleDot = ROLE_DOT_COLORS[displayRoleName] || 'bg-primary'
                      const rowTone = ROLE_ROW_COLORS[displayRoleName]
                      const rowBg = rowTone
                        ? `bg-gradient-to-br ${rowTone}`
                        : idx % 2 === 0 ? 'bg-gradient-to-br from-background via-background to-primary/[0.01]' : 'bg-gradient-to-br from-primary/[0.02] via-background to-cyan-500/[0.02]'
                      const isToggling = togglingId === staff.id
                      return (
                        <TableRow
                          key={staff.id}
                          className={cn(
                            'cursor-pointer transition-all duration-150',
                            rowBg,
                            'hover:shadow-sm hover:brightness-[1.02]',
                            !staff.isActive && 'opacity-60'
                          )}
                          onClick={() => handleViewStaff(staff.id)}
                        >
                          <TableCell className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="size-10 shrink-0 border-2 shadow-md" style={{ borderColor: `${firstAssignedRole?.color || 'var(--primary)'}40` }}>
                                <AvatarFallback className={cn('bg-gradient-to-br text-[11px] font-bold text-white', roleGradient)}>
                                  {getInitials(staff.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate text-sm font-bold text-foreground">{staff.name}</span>
                                {staff.isLocked && (
                                  <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-sm">
                                    <Lock className="size-3" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            {staff.employeeId ? (
                              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-gradient-to-r from-emerald-500/8 to-cyan-500/8 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-sm">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                {staff.employeeId}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            {staff.email ? (
                              <span className="inline-flex items-center gap-1.5 text-sm text-foreground/70">
                                <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/20">
                                  <Mail className="size-3" />
                                </span>
                                <span className="truncate max-w-[180px]">{staff.email}</span>
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="hidden py-3 lg:table-cell">
                            {staff.phone ? (
                              <span className="inline-flex items-center gap-1.5 text-sm text-foreground/70">
                                <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                                  <Phone className="size-3" />
                                </span>
                                {staff.phone}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                className={cn(
                                  'text-[10px] px-2 py-0 h-5 leading-none font-bold gap-1.5 border-0 shadow-sm',
                                )}
                                style={{
                                  background: firstAssignedRole?.color
                                    ? `linear-gradient(135deg, ${firstAssignedRole.color}18, ${firstAssignedRole.color}08)`
                                    : undefined,
                                  color: firstAssignedRole?.color || undefined,
                                  border: firstAssignedRole?.color ? `1px solid ${firstAssignedRole.color}30` : undefined,
                                }}
                              >
                                <span className={cn('size-2 rounded-full', roleDot)} />
                                {displayRoleName}
                              </Badge>
                              {extraRoleCount > 0 && (
                                <Badge className="text-[9px] px-1.5 py-0 h-4 leading-none border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-600 dark:text-violet-300">
                                  +{extraRoleCount}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3"><StatusBadge active={staff.isActive} /></TableCell>
                          <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 transition-all hover:scale-110 hover:bg-primary/5" disabled={isToggling}>
                                  <MoreHorizontal className="size-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 border-primary/10 shadow-xl">
                                <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleViewStaff(staff.id)} className="gap-2.5 text-sky-700 focus:text-sky-700 dark:text-sky-400 dark:focus:text-sky-400">
                                  <Eye className="size-4" /> View profile
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setResetTarget(staff)} disabled={!staff.userId} className="gap-2.5 text-amber-700 focus:text-amber-700 dark:text-amber-400 dark:focus:text-amber-400">
                                  <KeyRound className="size-4" /> Reset password
                                </DropdownMenuItem>
                                {staff.isActive ? (
                                  <DropdownMenuItem onClick={() => setToggleTarget(staff)} className="gap-2.5 text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400">
                                    <PowerOff className="size-4" /> Disable account
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => setToggleTarget(staff)} className="gap-2.5 text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400">
                                    <Power className="size-4" /> Enable account
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
                  <div className="space-y-2 p-3">
                    {users.map((staff) => {
                      const firstAssignedRole = staff.assignedRoles?.[0]
                      const displayRoleName = firstAssignedRole?.name ?? formatRoleName(staff.role)
                      const extraRoleCount = (staff.assignedRoles?.length ?? 0) > 1 ? (staff.assignedRoles!.length - 1) : 0
                      const roleGradient = ROLE_GRADIENT_COLORS[displayRoleName] || 'from-primary to-teal-600'
                      const roleDot = ROLE_DOT_COLORS[displayRoleName] || 'bg-primary'
                      const rowTone = ROLE_ROW_COLORS[displayRoleName]
                      const cardBg = rowTone
                        ? `bg-gradient-to-br ${rowTone}`
                        : 'bg-gradient-to-br from-card via-card to-primary/[0.01]'
                      const isToggling = togglingId === staff.id
                      return (
                        <div
                          key={staff.id}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border border-primary/10 p-3 transition-all hover:shadow-md',
                            cardBg,
                            !staff.isActive && 'opacity-60'
                          )}
                        >
                          <button
                            onClick={() => handleViewStaff(staff.id)}
                            className="flex flex-1 items-center gap-3 text-left min-w-0"
                          >
                            <Avatar className="size-9 shrink-0 border-2 shadow-md" style={{ borderColor: `${firstAssignedRole?.color || 'var(--primary)'}40` }}>
                              <AvatarFallback className={cn('bg-gradient-to-br text-[10px] font-bold text-white', roleGradient)}>
                                {getInitials(staff.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-bold text-foreground">{staff.name}</p>
                                {staff.isLocked && (
                                  <span className="flex size-4 items-center justify-center rounded bg-gradient-to-br from-rose-500 to-pink-500 text-white">
                                    <Lock className="size-2.5" />
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {staff.employeeId && (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-gradient-to-r from-emerald-500/8 to-cyan-500/8 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                    <span className="size-1 rounded-full bg-emerald-500" />
                                    {staff.employeeId}
                                  </span>
                                )}
                                <Badge
                                  className="text-[9px] px-1.5 py-0 h-4 leading-none font-bold gap-1 border-0"
                                  style={{
                                    background: firstAssignedRole?.color
                                      ? `linear-gradient(135deg, ${firstAssignedRole.color}18, ${firstAssignedRole.color}08)`
                                      : undefined,
                                    color: firstAssignedRole?.color || undefined,
                                    border: firstAssignedRole?.color ? `1px solid ${firstAssignedRole.color}30` : undefined,
                                  }}
                                >
                                  <span className={cn('size-1.5 rounded-full', roleDot)} />
                                  {displayRoleName}
                                </Badge>
                                {extraRoleCount > 0 && (
                                  <Badge className="text-[8px] px-1 py-0 h-3.5 leading-none border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-600 dark:text-violet-300">
                                    +{extraRoleCount}
                                  </Badge>
                                )}
                                <StatusBadge active={staff.isActive} />
                              </div>
                            </div>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8 shrink-0 transition-all hover:scale-110 hover:bg-primary/5" disabled={isToggling}>
                                <MoreHorizontal className="size-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 border-primary/10 shadow-xl">
                              <DropdownMenuLabel className="text-xs font-bold text-foreground/80">Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewStaff(staff.id)} className="gap-2.5 text-sky-700 focus:text-sky-700 dark:text-sky-400 dark:focus:text-sky-400">
                                <Eye className="size-4" /> View profile
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setResetTarget(staff)} disabled={!staff.userId} className="gap-2.5 text-amber-700 focus:text-amber-700 dark:text-amber-400 dark:focus:text-amber-400">
                                <KeyRound className="size-4" /> Reset password
                              </DropdownMenuItem>
                              {staff.isActive ? (
                                <DropdownMenuItem onClick={() => setToggleTarget(staff)} className="gap-2.5 text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400">
                                  <PowerOff className="size-4" /> Disable account
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => setToggleTarget(staff)} className="gap-2.5 text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400">
                                  <Power className="size-4" /> Enable account
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
        </div>
      </div>

      {/* Disable / Enable confirmation dialog */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <AlertDialogContent className={cn(
          'gap-0 overflow-hidden p-0 shadow-xl',
          toggleTarget?.isActive ? 'border-destructive/20 shadow-destructive/10' : 'border-emerald-500/20 shadow-emerald-500/10'
        )}>
          <div className={cn(
            'relative px-5 py-4 text-white',
            toggleTarget?.isActive
              ? 'bg-[linear-gradient(135deg,var(--destructive)_0%,#dc2626_48%,#b91c1c_100%)]'
              : 'bg-[linear-gradient(135deg,#059669_0%,#0d9488_48%,#2563eb_100%)]'
          )}>
            <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[15px] border-white/8" />
            <div aria-hidden className="absolute -bottom-6 right-12 size-16 rounded-full bg-white/5" />
            <div aria-hidden className="absolute left-8 top-2 size-10 rounded-full bg-white/5 blur-sm" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
                {toggleTarget?.isActive ? <PowerOff className="size-4.5 text-white" /> : <Power className="size-4.5 text-white" />}
              </span>
              <div>
                <AlertDialogTitle className="text-base font-semibold text-white">
                  {toggleTarget?.isActive ? 'Disable this staff account?' : 'Enable this staff account?'}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-0.5 text-xs text-white/75">
                  {toggleTarget?.isActive
                    ? `${toggleTarget?.name} will no longer be able to sign in. Their record stays intact.`
                    : `${toggleTarget?.name} will regain sign-in access immediately.`}
                </AlertDialogDescription>
              </div>
            </div>
          </div>
          <div className={cn(
            'px-5 py-4',
            toggleTarget?.isActive
              ? 'bg-gradient-to-br from-rose-500/[0.02] via-background to-rose-500/[0.03]'
              : 'bg-gradient-to-br from-emerald-500/[0.02] via-background to-emerald-500/[0.03]'
          )}>
            <div className="flex items-center justify-end gap-3">
              <AlertDialogCancel disabled={!!togglingId}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirmToggle() }}
                disabled={!!togglingId}
                className={cn(
                  'gap-2 text-white',
                  toggleTarget?.isActive
                    ? 'bg-destructive hover:bg-destructive/90'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                )}
              >
                {togglingId ? (
                  <><Loader2 className="size-4 animate-spin" /> Working…</>
                ) : toggleTarget?.isActive ? (
                  <><PowerOff className="size-4" /> Disable account</>
                ) : (
                  <><Power className="size-4" /> Enable account</>
                )}
              </AlertDialogAction>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Staff Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={(open) => { setDetailOpen(open); if (!open) setSelectedStaff(null) }}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Users className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Staff Profile</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">Profile, contact, and employment information.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Loading staff profile...</p>
                </div>
              </div>
            ) : selectedStaff ? (
              <div className="space-y-4">
                {/* Profile Summary */}
                <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.04] via-card to-cyan-500/[0.04] p-5 shadow-md">
                  <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-primary/5" />
                  <div className="relative flex items-center gap-4">
                    <Avatar className="size-16 shrink-0 border-[3px] shadow-lg" style={{ borderColor: `${selectedStaff.assignedRoles?.[0]?.color || 'var(--primary)'}40` }}>
                      <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 text-base font-bold text-white shadow-inner">
                        {getInitials(selectedStaff.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="truncate text-xl font-bold text-foreground">{selectedStaff.name}</h3>
                        <Badge className={cn(
                          'h-6 gap-1.5 px-2.5 text-[11px] font-bold shadow-sm',
                          selectedStaff.isActive
                            ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/12 to-cyan-500/12 text-emerald-700 dark:text-emerald-300'
                            : 'border-rose-500/30 bg-gradient-to-r from-rose-500/12 to-pink-500/12 text-rose-700 dark:text-rose-300'
                        )}>
                          <span className={cn('size-2 rounded-full', selectedStaff.isActive ? 'bg-emerald-500' : 'bg-rose-500')} />
                          {selectedStaff.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        {selectedStaff.employeeId && (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                            <span className="size-1.5 rounded-full bg-primary" />
                            {selectedStaff.employeeId}
                          </span>
                        )}
                        {selectedStaff.designation && (
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Briefcase className="size-3.5 text-muted-foreground/60" />
                            {selectedStaff.designation}
                          </span>
                        )}
                        {selectedStaff.department && (
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Building2 className="size-3.5 text-muted-foreground/60" />
                            {selectedStaff.department}
                          </span>
                        )}
                      </div>
                      {(selectedStaff.assignedRoles?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {selectedStaff.assignedRoles!.map((role) => (
                            <Badge
                              key={role.id}
                              className={cn(
                                'text-[10px] px-2.5 py-0.5 h-5 leading-none font-bold gap-1.5 border-0 shadow-sm',
                              )}
                              style={{
                                background: role.color
                                  ? `linear-gradient(135deg, ${role.color}18, ${role.color}08)`
                                  : undefined,
                                color: role.color || undefined,
                                border: role.color ? `1px solid ${role.color}30` : '1px solid hsl(var(--primary)/0.2)',
                              }}
                            >
                              <span className={cn('size-1.5 rounded-full', role.color ? '' : 'bg-primary')}
                                style={role.color ? { backgroundColor: role.color } : undefined}
                              />
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Employment Info */}
                <div className="relative overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-800/30 dark:from-sky-950/20 dark:via-card dark:to-sky-950/20">
                  <div aria-hidden className="absolute -right-5 -top-5 size-16 rounded-full border-[12px] border-sky-500/5" />
                  <div className="relative mb-3 flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm"><Briefcase className="size-4 text-white" /></span>
                    <div><h3 className="text-sm font-semibold">Employment Info</h3><p className="text-[10px] text-muted-foreground">Job details and qualifications</p></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-3 rounded-lg border border-sky-200/40 bg-white/60 p-3 dark:border-sky-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                        <IdCard className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Employee ID</p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-foreground">{selectedStaff.employeeId || <span className="font-sans font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-sky-200/40 bg-white/60 p-3 dark:border-sky-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                        <Briefcase className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Designation</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{selectedStaff.designation || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-sky-200/40 bg-white/60 p-3 dark:border-sky-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                        <Building2 className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Department</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{selectedStaff.department || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-sky-200/40 bg-white/60 p-3 dark:border-sky-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                        <CalendarDays className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Join Date</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{formatDate(selectedStaff.joinDate) || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-sky-200/40 bg-white/60 p-3 sm:col-span-2 dark:border-sky-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400">
                        <GraduationCap className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">Qualification</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{selectedStaff.qualification || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-4 shadow-sm dark:border-amber-800/30 dark:from-amber-950/20 dark:via-card dark:to-amber-950/20">
                  <div aria-hidden className="absolute -right-5 -top-5 size-16 rounded-full border-[12px] border-amber-500/5" />
                  <div className="relative mb-3 flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm"><Phone className="size-4 text-white" /></span>
                    <div><h3 className="text-sm font-semibold">Contact Info</h3><p className="text-[10px] text-muted-foreground">Phone, email and personal details</p></div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200/40 bg-white/60 p-3 dark:border-amber-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                        <Phone className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Phone</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{selectedStaff.phone || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200/40 bg-white/60 p-3 dark:border-amber-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                        <Mail className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Email</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground break-all">
                          {selectedStaff.email && !selectedStaff.email.endsWith('@staff.local')
                            ? selectedStaff.email
                            : <span className="font-normal text-muted-foreground">—</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200/40 bg-white/60 p-3 dark:border-amber-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                        <UserIcon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Gender</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{selectedStaff.gender || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-amber-200/40 bg-white/60 p-3 dark:border-amber-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
                        <CalendarDays className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Date of Birth</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground">{formatDate(selectedStaff.dateOfBirth) || <span className="font-normal text-muted-foreground">—</span>}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Address */}
                {[selectedStaff.address, selectedStaff.city, selectedStaff.state, selectedStaff.pincode].filter(Boolean).length > 0 && (
                  <div className="relative overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-violet-50 p-4 shadow-sm dark:border-violet-800/30 dark:from-violet-950/20 dark:via-card dark:to-violet-950/20">
                    <div aria-hidden className="absolute -right-5 -top-5 size-16 rounded-full border-[12px] border-violet-500/5" />
                    <div className="relative mb-3 flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm"><MapPin className="size-4 text-white" /></span>
                      <div><h3 className="text-sm font-semibold">Address</h3><p className="text-[10px] text-muted-foreground">Residential location</p></div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-violet-200/40 bg-white/60 p-3 dark:border-violet-800/20 dark:bg-card/60">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                        <MapPin className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Full Address</p>
                        <p className="mt-0.5 text-sm font-bold text-foreground leading-relaxed">
                          {[selectedStaff.address, selectedStaff.city, selectedStaff.state, selectedStaff.pincode].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5">
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setDetailOpen(false)}>
                Close
              </Button>
              {selectedStaff && (
                <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => { setDetailOpen(false); router.push(`/staff/${selectedStaff.id}/edit`) }}>
                  <Pencil className="size-3.5" /> Edit Staff
                </Button>
              )}
            </div>
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
