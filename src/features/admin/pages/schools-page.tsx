'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore, type User } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToastAction } from '@/components/ui/toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  PlusCircle,
  Building2,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
  Power,
  PowerOff,
  Loader2,
  MapPin,
  Phone,
  Mail,
  GraduationCap,
  Users,
  KeyRound,
  Eye as EyeIcon,
  EyeOff,
  ShieldCheck,
  LogIn,
  ClipboardList,
  CalendarCheck,
  DollarSign,
  BookOpen,
  Bus,
  Library,
  Package,
  Bell,
  Megaphone,
  Clock,
  Settings,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SchoolAdmin {
  id: string
  name: string
  email: string
}

interface SchoolListItem {
  id: string
  name: string
  logo?: string
  address?: string
  city?: string
  state?: string
  contactPhone?: string
  contactEmail?: string
  status: string
  trialEndsAt?: string
  onboardingDate?: string
  academicYear?: string
  board?: string
  studentCount: number
  teacherCount: number
  admin: SchoolAdmin | null
  createdAt: string
  deletedAt?: string | null
}

interface Permission {
  id: string
  code: string
  name: string
  module: string
  description?: string
  action: string
}

export type { Permission }

export const MODULE_ICONS: Record<string, LucideIcon> = {
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
  Notifications: Bell,
  Announcements: Megaphone,
  Classes: GraduationCap,
  Subjects: BookOpen,
  Settings: Settings,
  'Roles & Permissions': ShieldCheck,
}

export const MODULE_BORDER_COLORS: Record<string, string> = {
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
  Notifications: 'border-l-red-500',
  Announcements: 'border-l-fuchsia-500',
  Classes: 'border-l-indigo-500',
  Subjects: 'border-l-purple-500',
  Settings: 'border-l-gray-500',
  'Roles & Permissions': 'border-l-slate-500',
}

export const MODULE_COLORS: Record<string, string> = {
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
  Notifications: 'text-red-600 bg-red-50 dark:bg-red-950/40',
  Announcements: 'text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/40',
  Classes: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
  Subjects: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40',
  Settings: 'text-gray-600 bg-gray-50 dark:bg-gray-950/40',
  'Roles & Permissions': 'text-slate-600 bg-slate-50 dark:bg-slate-950/40',
}

export const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'NIOS', 'Other']
export const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-800' },
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'trial', label: 'Trial', color: 'bg-blue-100 text-blue-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-800' },
]

interface SchoolsListState {
  search: string
  statusFilter: string
  page: number
}

const SCHOOLS_LIST_STATE_KEY = 'schools:list'

export function SchoolsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const login = useAppStore((s) => s.login)
  const setCurrentSchool = useAppStore((s) => s.setCurrentSchool)
  const savedListState = useAppStore((s) => s.pageState[SCHOOLS_LIST_STATE_KEY] as SchoolsListState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [schools, setSchools] = useState<SchoolListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [statusFilter, setStatusFilter] = useState(savedListState?.statusFilter ?? 'all')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingSchool, setDeletingSchool] = useState<SchoolListItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(savedListState?.page ?? 1)
  const [totalSchools, setTotalSchools] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 10
  const [resetSchool, setResetSchool] = useState<SchoolListItem | null>(null)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [restoringSchoolId, setRestoringSchoolId] = useState<string | null>(null)

  const rememberListState = useCallback((patch: Partial<SchoolsListState>) => {
    setPageState(SCHOOLS_LIST_STATE_KEY, {
      search,
      statusFilter,
      page,
      ...patch,
    })
  }, [page, search, setPageState, statusFilter])

  const fetchData = useCallback(async (page = 1) => {
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(pageSize),
      }
      if (search) params.search = search
      if (statusFilter === 'archived') {
        params.archived = 'true'
      } else if (statusFilter && statusFilter !== 'all') {
        params.status = statusFilter
      }

      const res = await api.get<{ schools: SchoolListItem[]; pagination: { total: number; totalPages: number } }>('/api/super-admin/schools', params)
      setSchools(res.schools || [])
      setTotalSchools(res.pagination?.total || 0)
      setTotalPages(Math.max(1, res.pagination?.totalPages || 1))
    } catch {
      toast({ title: "Couldn't Load Schools", description: "We couldn't load the schools. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, toast])

  useEffect(() => { fetchData(page) }, [fetchData, page])

  const handleStatusChange = async (school: SchoolListItem, newStatus: string) => {
    try {
      await api.patch(`/api/super-admin/schools/${school.id}`, { status: newStatus })
      toast({ title: 'Success', description: `${school.name} has been ${newStatus === 'active' ? 'activated' : newStatus === 'suspended' ? 'suspended' : 'updated'}.` })
      fetchData(page)
    } catch (err) {
      toast({ title: "Couldn't Update Status", description: err instanceof Error ? err.message : "We couldn't update the status. Please try again.", variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    if (!deletingSchool) return
    const schoolToArchive = deletingSchool
    setSaving(true)
    try {
      await api.delete(`/api/super-admin/schools/${schoolToArchive.id}`)
      toast({
        title: 'School Archived',
        description: `${schoolToArchive.name} is hidden from active schools. You can restore it from Archived.`,
        action: (
          <ToastAction altText="Undo archive" onClick={() => handleRestore(schoolToArchive)}>
            Undo
          </ToastAction>
        ),
      })
      setShowDeleteDialog(false)
      setDeletingSchool(null)
      fetchData(page)
    } catch (err) {
      toast({ title: "Couldn't Archive School", description: err instanceof Error ? err.message : "We couldn't archive the school. Please try again.", variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleRestore = async (school: SchoolListItem) => {
      setRestoringSchoolId(school.id)
    try {
      await api.patch(`/api/super-admin/schools/${school.id}`, { restore: true })
      toast({ title: 'School Restored', description: `${school.name} is visible again and its archived users are restored.` })
      fetchData(page)
    } catch (err) {
      toast({ title: "Couldn't Restore School", description: err instanceof Error ? err.message : "We couldn't restore the school. Please try again.", variant: 'destructive' })
    } finally {
      setRestoringSchoolId(null)
    }
  }

  const viewSchool = (schoolId: string) => {
    router.push(`/admin/schools/${schoolId}`)
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
    rememberListState({ search: value, page: 1 })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setPage(1)
    rememberListState({ statusFilter: value, page: 1 })
  }

  const handlePageChange = (value: number) => {
    const nextPage = Math.min(Math.max(1, value), totalPages)
    setPage(nextPage)
    rememberListState({ page: nextPage })
  }

  const handleImpersonate = async (school: SchoolListItem) => {
    if (school.status !== 'active') {
      toast({
        title: "Can't impersonate",
        description: 'Only active schools can be impersonated.',
        variant: 'destructive',
      })
      return
    }
    setImpersonatingId(school.id)
    try {
      await api.post('/api/super-admin/impersonate/start', { schoolId: school.id })
      const me = await api.get<User & { school: Parameters<typeof setCurrentSchool>[0] }>(
        '/api/auth/me',
        undefined,
        { skipLogoutOn401: true },
      )
      login({
        ...me,
        impersonatingSchoolId: school.id,
        impersonatingSchoolName: school.name,
      })
      if (me.school) setCurrentSchool(me.school)
      toast({
        title: 'Impersonating school',
        description: `You're now acting as ${school.name}.`,
      })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      toast({
        title: 'Failed to impersonate',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setImpersonatingId(null)
    }
  }

  const statusBadge = (school: SchoolListItem) => {
    if (school.deletedAt) {
      return <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-100">Archived</Badge>
    }

    const status = school.status
    const option = STATUS_OPTIONS.find(o => o.value === status)
    if (!option) return <Badge>{status}</Badge>
    return <Badge className={cn(option.color, 'hover:opacity-90')}>{option.label}</Badge>
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const showingFrom = totalSchools === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = Math.min(page * pageSize, totalSchools)
  const pageNumbers: (number | 'ellipsis-start' | 'ellipsis-end')[] = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, 'ellipsis-end', totalPages]
    if (page >= totalPages - 2) return [1, 'ellipsis-start', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, 'ellipsis-start', page - 1, page, page + 1, 'ellipsis-end', totalPages]
  })()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-10 -top-12 size-36 rounded-full border-[18px] border-white/10" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Building2 className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Schools</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85">{totalSchools} on platform</span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Manage every registered school — trials, activation, suspension, and passwords.
            </p>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <Button
            onClick={() => router.push('/admin/schools/new')}
            size="sm"
            className="h-9 gap-1.5 rounded-lg bg-white px-4 font-semibold text-primary [background-image:none] shadow-lg shadow-black/10 transition-all hover:bg-white/90 hover:shadow-xl active:scale-[0.98]"
          >
            <PlusCircle className="size-4" />
            Add School
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="overflow-hidden rounded-xl border border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] shadow-sm dark:border-sky-500/20">
        <div className="flex flex-col gap-3 border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <Search className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Find a school</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Search by name, city, email, or board — or filter by status</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {schools.length} result{schools.length === 1 ? '' : 's'} on this page
          </span>
        </div>
        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search schools by name, city, or email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-9 bg-white pl-9 shadow-sm dark:bg-input/30"
            />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="h-9 w-full bg-white shadow-sm sm:w-[160px] dark:bg-input/30">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {statusFilter === 'archived' && (
          <div className="flex items-center gap-1.5 border-t border-rose-500/10 bg-rose-500/[0.05] px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            Showing archived schools — use each row&apos;s menu to restore it.
          </div>
        )}
      </div>

      {/* Schools Table */}
      {loading ? (
        <div className="overflow-hidden rounded-xl border border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] shadow-sm dark:border-sky-500/20">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      ) : schools.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-dashed border-sky-500/25 bg-gradient-to-br from-sky-50 via-card to-cyan-50/60 dark:from-sky-500/[0.06] dark:via-card dark:to-cyan-500/[0.04]">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-sky-300/50 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-lg shadow-sky-500/25">
              <Building2 className="size-6" />
            </div>
            <h3 className="text-lg font-semibold">No Schools Found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || statusFilter !== 'all' ? 'Try adjusting your search or filter.' : 'Add your first school to get started.'}
            </p>
            {!search && statusFilter === 'all' && (
              <Button onClick={() => router.push('/admin/schools/new')} className="mt-4 gap-2">
                <PlusCircle className="size-4" />
                Add School
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] shadow-sm dark:border-sky-500/20">
            <Table>
              <TableHeader className="bg-gradient-to-r from-cyan-500/[0.07] via-sky-500/[0.04] to-violet-500/[0.07]">
                <TableRow>
                  <TableHead className="min-w-[250px] px-4 py-2.5">School</TableHead>
                  <TableHead className="px-4 py-2.5">Location</TableHead>
                  <TableHead className="px-4 py-2.5">Board</TableHead>
                  <TableHead className="px-4 py-2.5">Status</TableHead>
                  <TableHead className="px-4 py-2.5 text-center">Students</TableHead>
                  <TableHead className="px-4 py-2.5 text-center">Teachers</TableHead>
                  <TableHead className="px-4 py-2.5">Admin</TableHead>
                  <TableHead className="px-4 py-2.5">Created</TableHead>
                  <TableHead className="w-[50px] px-4 py-2.5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((school) => {
                  const isArchived = !!school.deletedAt

                  return (
                  <TableRow
                    key={school.id}
                    className={cn('cursor-pointer transition-colors hover:bg-cyan-500/[0.045]', isArchived && 'opacity-75')}
                    onClick={() => viewSchool(school.id)}
                  >
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-sky-300/60 bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-sm shadow-sky-500/20 dark:border-sky-500/40">
                          {school.logo ? (
                            <img src={school.logo} alt={school.name} className="size-full object-cover" />
                          ) : (
                            <GraduationCap className="size-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{school.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[school.city, school.state].filter(Boolean).join(', ') || school.contactEmail || school.board || 'School'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="size-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{school.city || '-'}, {school.state || ''}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <Badge variant="secondary" className="text-xs">{school.board || '-'}</Badge>
                    </TableCell>
                    <TableCell className="px-4">{statusBadge(school)}</TableCell>
                    <TableCell className="px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <GraduationCap className="size-3 text-muted-foreground" />
                        <span className="text-sm tabular-nums">{school.studentCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="size-3 text-muted-foreground" />
                        <span className="text-sm tabular-nums">{school.teacherCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      {school.admin ? (
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-600 text-[9px] font-semibold text-white">
                            {school.admin.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm">{school.admin.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{school.admin.email}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 text-sm text-muted-foreground">{formatDate(school.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); viewSchool(school.id) }}>
                            <Eye className="mr-2 size-4" />
                            View Details
                          </DropdownMenuItem>
                          {!isArchived && school.status === 'active' && (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); handleImpersonate(school) }}
                              disabled={impersonatingId === school.id}
                              className="text-blue-600"
                            >
                              {impersonatingId === school.id ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                              ) : (
                                <LogIn className="mr-2 size-4" />
                              )}
                              Enter as School
                            </DropdownMenuItem>
                          )}
                          {isArchived ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); handleRestore(school) }}
                                className="text-emerald-600"
                                disabled={restoringSchoolId === school.id}
                              >
                                {restoringSchoolId === school.id ? (
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="mr-2 size-4" />
                                )}
                                Restore
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); viewSchool(school.id) }}>
                                <Pencil className="mr-2 size-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {school.status === 'active' && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(school, 'suspended') }} className="text-amber-600">
                                  <PowerOff className="mr-2 size-4" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              {(school.status === 'suspended' || school.status === 'pending' || school.status === 'trial') && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStatusChange(school, 'active') }} className="text-emerald-600">
                                  <Power className="mr-2 size-4" />
                                  Activate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              {school.admin && (
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setResetSchool(school); setNewPassword(''); setConfirmPassword(''); setShowPassword(false); setShowResetDialog(true) }}>
                                  <KeyRound className="mr-2 size-4" />
                                  Reset Password
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); setDeletingSchool(school); setShowDeleteDialog(true) }}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 size-4" />
                                Archive
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-3 border-t border-sky-500/15 bg-gradient-to-r from-sky-500/[0.06] via-primary/[0.03] to-violet-500/[0.06] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {showingFrom} to {showingTo} of {totalSchools} schools
              </p>
              <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      className={cn('h-8', page <= 1 && 'pointer-events-none opacity-50')}
                      aria-disabled={page <= 1}
                      onClick={(event) => {
                        event.preventDefault()
                        if (page > 1) handlePageChange(page - 1)
                      }}
                    />
                  </PaginationItem>
                  {pageNumbers.map((p, index) => (
                    <PaginationItem key={`${p}-${index}`}>
                      {p === 'ellipsis-start' || p === 'ellipsis-end' ? (
                        <PaginationEllipsis className="size-8" />
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={p === page}
                          className="size-8 text-xs"
                          onClick={(event) => {
                            event.preventDefault()
                            handlePageChange(p)
                          }}
                        >
                          {p}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      className={cn('h-8', page >= totalPages && 'pointer-events-none opacity-50')}
                      aria-disabled={page >= totalPages}
                      onClick={(event) => {
                        event.preventDefault()
                        if (page < totalPages) handlePageChange(page + 1)
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </>
      )}

      {/* Archive Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-destructive/25 bg-card p-0 shadow-2xl shadow-destructive/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#ef4444_0%,#b91c1c_48%,#7f1d1d_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-rose-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-orange-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Trash2 className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">Archive School</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  Hide this school from the active list
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-red-500/[0.04] via-background to-rose-500/[0.06] p-4 sm:p-5">
            <section className="rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-orange-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-orange-500/10">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-sm"><Building2 className="size-4 text-white" /></span>
                <div><h3 className="text-sm font-semibold">School being archived</h3><p className="text-[10px] text-muted-foreground">This action cannot be undone from here</p></div>
              </div>
              <div className="rounded-lg border border-rose-200/70 bg-white/80 px-3 py-2 shadow-sm dark:border-rose-500/20 dark:bg-background/35">
                <p className="text-sm font-semibold">{deletingSchool?.name || 'This school'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {deletingSchool?.city || 'School'} · {deletingSchool?.state || 'Registered on the platform'}
                </p>
              </div>
            </section>

            <Alert className="border-rose-200/80 bg-rose-50/80 text-rose-900 dark:border-rose-500/25 dark:bg-rose-950/30 dark:text-rose-200">
              <AlertTriangle className="size-4" />
              <AlertTitle>Users will be disabled</AlertTitle>
              <AlertDescription>
                Archiving <strong>{deletingSchool?.name}</strong> hides it from active schools and disables its users.
                School data stays saved, so you can restore it later.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="shrink-0 border-t border-destructive/10 bg-muted/30 px-4 py-3 sm:px-5">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => { setShowDeleteDialog(false); setDeletingSchool(null) }} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {saving ? 'Archiving...' : 'Archive School'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Admin Password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resetSchool?.admin?.name}</strong> ({resetSchool?.admin?.email}). The admin will need to use this new password to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password *</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimum 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password *</Label>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter the new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-sm text-destructive">Passwords do not match.</p>
            )}
            {newPassword && newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-sm text-destructive">Password must be at least 6 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowResetDialog(false); setResetSchool(null) }}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!resetSchool || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword) return
                setResettingPassword(true)
                try {
                  await api.post(`/api/super-admin/schools/${resetSchool.id}/reset-password`, { newPassword })
                  toast({ title: 'Password Reset', description: `Password for ${resetSchool.admin?.name} has been reset successfully.` })
                  setShowResetDialog(false)
                  setResetSchool(null)
                  setNewPassword('')
                  setConfirmPassword('')
                } catch (err) {
                  toast({ title: "Couldn't Reset Password", description: err instanceof Error ? err.message : "We couldn't reset the password. Please try again.", variant: 'destructive' })
                } finally {
                  setResettingPassword(false)
                }
              }}
              disabled={resettingPassword || !newPassword || newPassword.length < 6 || !confirmPassword || newPassword !== confirmPassword}
            >
              {resettingPassword ? <><Loader2 className="size-4 animate-spin mr-2" />Resetting...</> : <><KeyRound className="size-4 mr-2" />Reset Password</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
