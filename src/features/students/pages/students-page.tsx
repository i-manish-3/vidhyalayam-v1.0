'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  Search,
  GraduationCap,
  UserCheck,
  UserX,
  Eye,
  MoreHorizontal,
  Printer,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  ShieldOff,
  ShieldCheck,
  Loader2,
  Heart,
  Edit,
  User,
  type LucideIcon,
} from 'lucide-react'

// ============================================
// Types
// ============================================

interface Student {
  id: string
  schoolId: string
  admissionNumber: string | null
  firstName: string
  lastName: string
  fullName: string
  rollNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  category: string | null
  aadhaarNumber: string | null
  bloodGroup: string | null
  profileImage: string | null
  admissionDate: string | null
  admissionStatus: string | null
  isActive: boolean
  classId: string | null
  sectionId: string | null
  siblingId?: string | null
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
  admission?: {
    registrationNumber: string | null
    transportRouteId: string | null
    dateOfAdmission: string | null
    profileImage: string | null
  } | null
  transportRouteName?: string | null
  parentLinks?: Array<{
    id: string
    relation: string
    isPrimary: boolean
    parent: {
      id: string
      fatherName: string | null
      motherName: string | null
      phone: string | null
    }
  }>
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface ClassOption {
  id: string
  name: string
}

interface SectionOption {
  id: string
  name: string
  classId: string
}

// ============================================
// Constants
// ============================================

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

// ============================================
// Helpers
// ============================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '--'
  }
}

// ============================================
// Pagination Component
// ============================================

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

  // Generate page numbers with ellipsis (max 5 visible)
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
        <span className="ml-2">
          Showing {from} to {to} of {total} students
        </span>
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

// ============================================
// Main Component
// ============================================

export function StudentsPage() {
  const { toast } = useToast()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const navigateTo = useAppStore((s) => s.navigateTo)
  const goBack = useAppStore((s) => s.goBack)
  const setSelectedStudentId = useAppStore((s) => s.setSelectedStudentId)
  const { hasPermission } = usePermissions()
  const canAdmit = hasPermission(PERMISSIONS.ADMISSION_CREATE)
  const canEdit = hasPermission(PERMISSIONS.STUDENT_UPDATE)
  const canEnableDisable = hasPermission(PERMISSIONS.STUDENT_ENABLE_DISABLE)

  // Data states
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  })

  // Filter states
  const [classFilter, setClassFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Toggle states
  const [toggleDialog, setToggleDialog] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null,
  })
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Stats (fetched separately to include all students)
  const [stats, setStats] = useState({ total: 0, active: 0, disabled: 0, thisMonth: 0 })

  // ============================================
  // Debounced Search
  // ============================================

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
    }
  }, [searchQuery])

  // ============================================
  // Data Fetching
  // ============================================

  const fetchStudents = useCallback(async (page: number, limit: number) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      }
      if (debouncedSearch) params.search = debouncedSearch
      if (classFilter !== 'all') params.classId = classFilter
      if (sectionFilter !== 'all') params.sectionId = sectionFilter
      if (genderFilter !== 'all') params.gender = genderFilter
      if (statusFilter === 'active') params.isActive = 'true'
      else if (statusFilter === 'disabled') params.isActive = 'false'

      const data = await api.get<{ students: Student[]; pagination: PaginationInfo }>(
        '/api/school/students',
        params,
        { skipLogoutOn401: true }
      )
      setStudents(Array.isArray(data?.students) ? data.students : [])
      if (data?.pagination) {
        setPagination(data.pagination)
      }
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, classFilter, sectionFilter, genderFilter, statusFilter])

  // Fetch stats separately (all students, no filters)
  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<{ students: Student[]; pagination: { total: number } }>(
        '/api/school/students',
        { limit: '500' },
        { skipLogoutOn401: true }
      )
      const allStudents = Array.isArray(data?.students) ? data.students : []
      const now = new Date()
      setStats({
        total: data?.pagination?.total ?? allStudents.length,
        active: allStudents.filter(s => s.isActive).length,
        disabled: allStudents.filter(s => !s.isActive).length,
        thisMonth: allStudents.filter(s => {
          const admDate = s.admissionDate ? new Date(s.admissionDate) : null
          if (!admDate) return false
          return admDate.getMonth() === now.getMonth() && admDate.getFullYear() === now.getFullYear()
        }).length,
      })
    } catch {
      // Stats may not be available
    }
  }, [])

  const fetchClasses = useCallback(async () => {
    try {
      const data = await api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true })
      setClasses(Array.isArray(data?.classes) ? data.classes : [])
    } catch {
      // Classes may not be available
    }
  }, [])

  const fetchSections = useCallback(async () => {
    try {
      const data = await api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true })
      setSections(Array.isArray(data?.sections) ? data.sections : [])
    } catch {
      // Sections may not be available
    }
  }, [])

  // Initial load
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchStats(), fetchClasses(), fetchSections()])
      await fetchStudents(1, 25)
    }
    init()
  }, [])

  // Re-fetch when filters or search change (reset to page 1)
  useEffect(() => {
    if (!loading || students.length > 0 || debouncedSearch) {
      fetchStudents(1, pagination.limit)
    }
  }, [debouncedSearch, classFilter, sectionFilter, genderFilter, statusFilter])

  // ============================================
  // Filtered Sections
  // ============================================

  const filteredSections = useMemo(() => {
    if (classFilter !== 'all') {
      return sections.filter(s => s.classId === classFilter)
    }
    return []
  }, [sections, classFilter])

  // ============================================
  // Navigation
  // ============================================

  const handleViewStudent = (student: Student) => {
    setSelectedStudentId(student.id)
    navigateTo('student-detail')
  }

  // ============================================
  // Pagination Handlers
  // ============================================

  const handlePageChange = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }))
    fetchStudents(page, pagination.limit)
  }, [fetchStudents, pagination.limit])

  const handlePageSizeChange = useCallback((size: number) => {
    setPagination(prev => ({ ...prev, page: 1, limit: size }))
    fetchStudents(1, size)
  }, [fetchStudents])

  // ============================================
  // Toggle Student Active/Inactive
  // ============================================

  const handleToggleStudent = async () => {
    const student = toggleDialog.student
    if (!student) return

    const newStatus = !student.isActive
    setTogglingId(student.id)
    setToggleDialog({ open: false, student: null })

    try {
      await api.patch(`/api/school/students/${student.id}`, { isActive: newStatus })

      // Update local state
      setStudents(prev =>
        prev.map(s =>
          s.id === student.id
            ? { ...s, isActive: newStatus }
            : s
        )
      )

      // Refresh stats
      fetchStats()

      toast({
        title: newStatus ? 'Student Enabled' : 'Student Disabled',
        description: `${student.fullName} has been ${newStatus ? 'enabled' : 'disabled'} successfully.`,
      })
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${newStatus ? 'enable' : 'disable'} student. Please try again.`,
        variant: 'destructive',
      })
    } finally {
      setTogglingId(null)
    }
  }

  // ============================================
  // Filter Reset
  // ============================================

  const hasActiveFilters = classFilter !== 'all' || sectionFilter !== 'all' || genderFilter !== 'all' || statusFilter !== 'all'

  const clearFilters = () => {
    setClassFilter('all')
    setSectionFilter('all')
    setGenderFilter('all')
    setStatusFilter('all')
  }

  // ============================================
  // Main Render
  // ============================================

  if (loading && students.length === 0) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => goBack('dashboard')} className="mt-0.5 size-9 shrink-0">
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Students</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Manage all students</p>
          </div>
        </div>
        {canAdmit && (
          <Button onClick={() => navigateTo('admission-form')} className="gap-2 shrink-0">
            <GraduationCap className="size-4" /> Admit Student
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StudentStatCard
          title="Total Students"
          value={stats.total}
          description="All students"
          icon={Users}
        />
        <StudentStatCard
          title="Active"
          value={stats.active}
          description="Currently active"
          icon={UserCheck}
        />
        <StudentStatCard
          title="Disabled"
          value={stats.disabled}
          description="Currently disabled"
          icon={UserX}
        />
        <StudentStatCard
          title="This Month"
          value={stats.thisMonth}
          description="New admissions"
          icon={GraduationCap}
        />
      </div>

      {/* Students Table */}
      <Card className="gap-0 py-0">
        <CardHeader className="px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">All Students</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, adm no, roll..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 w-full sm:w-56"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="gap-1 h-9"
              >
                <ChevronDown className={`size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                Filters
              </Button>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-destructive h-9"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Filter row */}
          {showFilters && (
            <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setSectionFilter('all') }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sectionFilter} onValueChange={setSectionFilter} disabled={classFilter === 'all'}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {filteredSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Table */}
          {students.length === 0 && !loading ? (
            <div className="py-8">
              <EmptyState
                icon={Users}
                title="No Students Found"
                description={
                  canAdmit
                    ? "No students match your current filters. Click 'Admit Student' to register a new student."
                    : 'No students match your current filters.'
                }
                action={canAdmit ? { label: 'Admit Student', onClick: () => navigateTo('admission-form') } : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto mx-4 mb-4 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[44px]">Photo</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Father&apos;s Name</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Roll</TableHead>
                    <TableHead>Reg.No.</TableHead>
                    <TableHead>Adm.No.</TableHead>
                    <TableHead>Adm.Date</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s) => {
                    const isToggling = togglingId === s.id
                    const fatherLink = s.parentLinks?.find(p => p.relation === 'Father')
                    const fatherName = fatherLink?.parent.fatherName
                    const fatherPhone = fatherLink?.parent.phone
                    const name = s.fullName || `${s.firstName} ${s.lastName}`
                    const photoSrc = s.profileImage || s.admission?.profileImage

                    return (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer hover:bg-muted/50 ${!s.isActive ? 'opacity-60 bg-muted/30' : ''}`}
                        onClick={() => handleViewStudent(s)}
                      >
                        {/* Photo */}
                        <TableCell>
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {photoSrc ? (
                              <img src={photoSrc} alt={name} className="size-full object-cover" />
                            ) : (
                              <User className="size-4 text-primary" />
                            )}
                          </div>
                        </TableCell>

                        {/* Student Name */}
                        <TableCell>
                          <div>
                            <p className={`font-medium ${!s.isActive ? 'line-through decoration-muted-foreground' : ''}`}>
                              {name}
                            </p>
                            {s.siblingId && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 text-[10px] px-1 py-0 h-4 gap-0.5 mt-0.5">
                                <Heart className="size-2.5" /> Sibling
                              </Badge>
                            )}
                          </div>
                        </TableCell>

                        {/* Father's Name */}
                        <TableCell>
                          <span className="text-sm">{fatherName || '--'}</span>
                        </TableCell>

                        {/* Class */}
                        <TableCell>
                          <span className="text-sm">{s.class?.name || '--'}</span>
                          {s.section?.name && <span className="text-xs text-muted-foreground ml-1">- {s.section.name}</span>}
                        </TableCell>

                        {/* Roll */}
                        <TableCell>
                          <span className="text-sm font-mono">{s.rollNumber || '--'}</span>
                        </TableCell>

                        {/* Reg.No. */}
                        <TableCell>
                          <span className="text-sm font-mono">{s.admission?.registrationNumber || '--'}</span>
                        </TableCell>

                        {/* Adm.No. */}
                        <TableCell>
                          <span className={`font-mono text-sm font-semibold ${s.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                            {s.admissionNumber || '--'}
                          </span>
                        </TableCell>

                        {/* Adm.Date */}
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(s.admission?.dateOfAdmission)}
                          </span>
                        </TableCell>

                        {/* Route */}
                        <TableCell>
                          <span className="text-sm">{s.transportRouteName || '--'}</span>
                        </TableCell>

                        {/* Phone */}
                        <TableCell>
                          <span className="text-sm">{fatherPhone || '--'}</span>
                        </TableCell>

                        {/* Actions */}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewStudent(s)}>
                                <Eye className="size-4 mr-2" /> View
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => { setSelectedStudentId(s.id); navigateTo('edit-student') }}>
                                  <Edit className="size-4 mr-2" /> Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => toast({ title: 'Print', description: 'Print admission form feature coming soon' })}>
                                <Printer className="size-4 mr-2" /> Print Admission Form
                              </DropdownMenuItem>
                              {canEnableDisable && <DropdownMenuSeparator />}
                              {canEnableDisable && (
                                isToggling ? (
                                  <DropdownMenuItem disabled>
                                    <Loader2 className="size-4 mr-2 animate-spin" /> Updating...
                                  </DropdownMenuItem>
                                ) : s.isActive ? (
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onClick={() => setToggleDialog({ open: true, student: s })}
                                  >
                                    <ShieldOff className="size-4 mr-2" /> Disable
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                                    onClick={() => setToggleDialog({ open: true, student: s })}
                                  >
                                    <ShieldCheck className="size-4 mr-2" /> Enable
                                  </DropdownMenuItem>
                                )
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
          )}

          {/* Pagination */}
          {pagination.total > 0 && (
            <Pagination
              pagination={pagination}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          )}
        </CardContent>
      </Card>

      {/* Toggle Confirmation Dialog */}
      <AlertDialog
        open={toggleDialog.open}
        onOpenChange={(open) => setToggleDialog({ open, student: open ? toggleDialog.student : null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleDialog.student?.isActive ? 'Disable Student' : 'Enable Student'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleDialog.student?.isActive ? (
                <>
                  Are you sure you want to disable{' '}
                  <span className="font-semibold text-foreground">
                    {toggleDialog.student.fullName || `${toggleDialog.student.firstName} ${toggleDialog.student.lastName}`}
                  </span>
                  ? The student will be marked as inactive. Their parent will lose access to view student details, attendance, and fee information.
                </>
              ) : (
                <>
                  Are you sure you want to enable{' '}
                  <span className="font-semibold text-foreground">
                    {toggleDialog.student ? toggleDialog.student.fullName || `${toggleDialog.student.firstName} ${toggleDialog.student.lastName}` : ''}
                  </span>
                  ? The student will be reactivated and their parent will regain full access.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStudent}
              className={
                toggleDialog.student?.isActive
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600'
                  : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600'
              }
            >
              {toggleDialog.student?.isActive ? 'Disable Student' : 'Enable Student'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StudentStatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
}) {
  return (
    <Card className="w-full overflow-hidden rounded-md py-0 shadow-xs">
      <CardContent className="p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-base font-semibold leading-5 tracking-tight">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <Icon className="size-3" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
