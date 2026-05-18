'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { StatsCard, LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
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
  ClipboardCheck,
  UserPlus,
  Search,
  GraduationCap,
  CalendarDays,
  BarChart3,
  Eye,
  MoreHorizontal,
  Printer,
  ChevronDown,
  Heart,
  UserCheck,
  UserX,
  ShieldOff,
  ShieldCheck,
  Loader2,
} from 'lucide-react'

// ============================================
// Types
// ============================================

interface AdmissionStats {
  totalApplications: number
  byStatus: Record<string, number>
  byClass: Record<string, { className: string; count: number }>
  byCategory: Record<string, number>
  byGender: Record<string, number>
  thisMonthApplications: number
}

interface Admission {
  id: string
  schoolId: string
  studentId: string | null
  studentIsActive?: boolean
  admissionNumber: string | null
  academicYear: string
  status: string
  firstName: string
  lastName: string
  fullName?: string
  dateOfBirth: string | null
  dateOfAdmission?: string | null
  gender: string | null
  nationality: string | null
  religion: string | null
  category: string | null
  motherTongue: string | null
  aadhaarNumber: string | null
  bloodGroup: string | null
  medicalConditions: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  country: string | null
  profileImage: string | null
  classId: string | null
  sectionId: string | null
  className?: string | null
  sectionName?: string | null
  previousSchool: string | null
  previousSchoolTC: string | null
  previousClass: string | null
  previousResult: string | null
  fatherName: string | null
  fatherPhone: string | null
  fatherEmail: string | null
  fatherOccupation: string | null
  fatherAadhaar: string | null
  motherName: string | null
  motherPhone: string | null
  motherEmail: string | null
  motherOccupation: string | null
  motherAadhaar: string | null
  annualIncome: number | null
  sourceOfInfo: string | null
  formNumber: string | null
  siblingId: string | null
  sibling?: { id: string; firstName: string; lastName: string; admissionNumber: string | null; className?: string | null } | null
  appliedDate: string
  admittedAt: string | null
  remarks: string | null
  documentsCount?: number
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
}

interface ClassOption {
  id: string
  name: string
}


// ============================================
// Constants
// ============================================

const CATEGORY_OPTIONS = [
  { value: 'General', label: 'General' },
  { value: 'OBC', label: 'OBC' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'EWS', label: 'EWS' },
]

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
]

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
// Main Component
// ============================================

export function AdmissionsPage() {
  const { toast } = useToast()
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const navigateTo = useAppStore((s) => s.navigateTo)
  const setSelectedStudentId = useAppStore((s) => s.setSelectedStudentId)

  // Data states
  const [admissions, setAdmissions] = useState<Admission[]>([])
  const [stats, setStats] = useState<AdmissionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<ClassOption[]>([])

  // Filter states
  const [classFilter, setClassFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Toggle states
  const [toggleDialog, setToggleDialog] = useState<{ open: boolean; admission: Admission | null }>({
    open: false,
    admission: null,
  })
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ============================================
  // Data Fetching
  // ============================================

  const fetchAdmissions = useCallback(async () => {
    try {
      const data = await api.get<{ admissions: Admission[] }>('/api/school/admissions', undefined, { skipLogoutOn401: true })
      setAdmissions(Array.isArray(data?.admissions) ? data.admissions : [])
    } catch {
      setAdmissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<AdmissionStats>('/api/school/admissions/stats', undefined, { skipLogoutOn401: true })
      setStats(data || null)
    } catch {
      // Use null stats - dashboard will show zeros
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

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchAdmissions(), fetchStats(), fetchClasses()])
    }
    init()
  }, [fetchAdmissions, fetchStats, fetchClasses])

  // ============================================
  // Filtered Data
  // ============================================

  const filteredAdmissions = useMemo(() => {
    return admissions.filter((a) => {
      if (classFilter !== 'all' && a.classId !== classFilter) return false
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false
      if (genderFilter !== 'all' && a.gender !== genderFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const name = `${a.firstName} ${a.lastName}`.toLowerCase()
        const fullName = (a.fullName || '').toLowerCase()
        const admNo = (a.admissionNumber || '').toLowerCase()
        const aadhaar = (a.aadhaarNumber || '').toLowerCase()
        const phone = (a.fatherPhone || a.motherPhone || '').toLowerCase()
        if (!name.includes(q) && !fullName.includes(q) && !admNo.includes(q) && !aadhaar.includes(q) && !phone.includes(q)) return false
      }
      return true
    })
  }, [admissions, classFilter, categoryFilter, genderFilter, searchQuery])

  // ============================================
  // Navigate to Student Detail Page
  // ============================================

  const handleViewAdmission = (admission: Admission) => {
    const studentId = admission.studentId || admission.id
    setSelectedStudentId(studentId)
    navigateTo('student-detail')
  }

  // ============================================
  // Toggle Student Active/Inactive
  // ============================================

  const handleToggleStudent = async () => {
    const admission = toggleDialog.admission
    if (!admission?.studentId) return

    const newStatus = !(admission.studentIsActive ?? true)
    setTogglingId(admission.studentId)
    setToggleDialog({ open: false, admission: null })

    try {
      await api.patch(`/api/school/students/${admission.studentId}`, { isActive: newStatus })

      // Update local state
      setAdmissions(prev =>
        prev.map(a =>
          a.studentId === admission.studentId
            ? { ...a, studentIsActive: newStatus }
            : a
        )
      )

      toast({
        title: newStatus ? 'Student Enabled' : 'Student Disabled',
        description: `${admission.fullName || `${admission.firstName} ${admission.lastName}`} has been ${newStatus ? 'enabled' : 'disabled'} successfully.`,
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
  // Main Render
  // ============================================

  if (loading) return <LoadingState />

  const hasActiveFilters = classFilter !== 'all' || categoryFilter !== 'all' || genderFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admissions</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage student admissions</p>
        </div>
        <Button onClick={() => navigateTo('admission-form')} className="gap-2 shrink-0">
          <UserPlus className="size-4" /> Admit Student
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Admitted"
          value={stats?.byStatus?.admitted || 0}
          description="All time"
          icon={ClipboardCheck}
        />
        <StatsCard
          title="This Month"
          value={stats?.thisMonthApplications || 0}
          description="New admissions"
          icon={CalendarDays}
        />
        <StatsCard
          title="Admissions"
          value={stats?.totalApplications || 0}
          description="Total records"
          icon={BarChart3}
        />
        <StatsCard
          title="This Year"
          value={stats?.byStatus?.admitted || 0}
          description="Admitted students"
          icon={GraduationCap}
        />
      </div>

      {/* Admissions Table */}
      <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base">Admitted Students</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search name, adm no..."
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
                    onClick={() => {
                      setClassFilter('all')
                      setCategoryFilter('all')
                      setGenderFilter('all')
                    }}
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
              <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classes</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Results count */}
            <div className="px-4 pb-2 text-sm text-muted-foreground">
              {filteredAdmissions.length} student{filteredAdmissions.length !== 1 ? 's' : ''} found
            </div>

            {/* Table */}
            {filteredAdmissions.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={ClipboardCheck}
                  title="No Students Found"
                  description="No admitted students match your current filters. Click 'Admit Student' to register a new student."
                  action={{ label: 'Admit Student', onClick: () => navigateTo('admission-form') }}
                />
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden mx-4 mb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Adm. No</TableHead>
                      <TableHead>Student Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[110px]">Admitted On</TableHead>
                      <TableHead className="w-[50px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAdmissions.map((a) => {
                      const isActive = a.studentIsActive ?? true
                      const isToggling = togglingId === a.studentId
                      return (
                        <TableRow
                          key={a.id}
                          className={`cursor-pointer hover:bg-muted/50 ${!isActive ? 'opacity-60 bg-muted/30' : ''}`}
                          onClick={() => handleViewAdmission(a)}
                        >
                          <TableCell>
                            <span className={`font-mono text-sm font-semibold ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                              {a.admissionNumber || '--'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className={`font-medium ${!isActive ? 'line-through decoration-muted-foreground' : ''}`}>
                                {a.fullName || `${a.firstName} ${a.lastName}`}
                              </p>
                              <div className="flex items-center gap-1.5">
                                {a.fatherName && <p className="text-xs text-muted-foreground">F: {a.fatherName}</p>}
                                {a.siblingId && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 text-[10px] px-1 py-0 h-4 gap-0.5">
                                    <Heart className="size-2.5" /> Sibling
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{a.className || a.class?.name || '--'}</span>
                            {a.sectionName && <span className="text-xs text-muted-foreground ml-1">- {a.sectionName}</span>}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{a.gender || '--'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{a.category || '--'}</span>
                          </TableCell>
                          <TableCell>
                            {isToggling ? (
                              <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            ) : isActive ? (
                              <Badge variant="default" className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 font-medium">
                                <UserCheck className="size-3" /> Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 bg-red-100 text-red-700 hover:bg-red-100 border-red-200 font-medium">
                                <UserX className="size-3" /> Disabled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{formatDate(a.admittedAt || a.appliedDate)}</span>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewAdmission(a)}>
                                  <Eye className="size-4 mr-2" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toast({ title: 'Print', description: 'Print form feature coming soon' })}>
                                  <Printer className="size-4 mr-2" /> Print Form
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {isActive ? (
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onClick={() => setToggleDialog({ open: true, admission: a })}
                                    disabled={isToggling}
                                  >
                                    <ShieldOff className="size-4 mr-2" /> Disable Student
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    className="text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                                    onClick={() => setToggleDialog({ open: true, admission: a })}
                                    disabled={isToggling}
                                  >
                                    <ShieldCheck className="size-4 mr-2" /> Enable Student
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
            )}
          </CardContent>
        </Card>

      {/* Toggle Confirmation Dialog */}
      <AlertDialog
        open={toggleDialog.open}
        onOpenChange={(open) => setToggleDialog({ open, admission: open ? toggleDialog.admission : null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleDialog.admission && (toggleDialog.admission.studentIsActive ?? true)
                ? 'Disable Student'
                : 'Enable Student'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleDialog.admission && (toggleDialog.admission.studentIsActive ?? true) ? (
                <>
                  Are you sure you want to disable{' '}
                  <span className="font-semibold text-foreground">
                    {toggleDialog.admission.fullName || `${toggleDialog.admission.firstName} ${toggleDialog.admission.lastName}`}
                  </span>
                  ? The student will be marked as inactive and will not appear in active student lists, attendance, or fee collections.
                </>
              ) : (
                <>
                  Are you sure you want to enable{' '}
                  <span className="font-semibold text-foreground">
                    {toggleDialog.admission ? toggleDialog.admission.fullName || `${toggleDialog.admission.firstName} ${toggleDialog.admission.lastName}` : ''}
                  </span>
                  ? The student will be reactivated and will appear in active student lists again.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStudent}
              className={
                toggleDialog.admission && (toggleDialog.admission.studentIsActive ?? true)
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600'
                  : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600'
              }
            >
              {toggleDialog.admission && (toggleDialog.admission.studentIsActive ?? true)
                ? 'Disable Student'
                : 'Enable Student'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
