'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState, EmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import {
  SchoolBirthdayCardDialog,
  type BirthdayCardStudent,
  type BirthdayCardSchool,
} from '@/features/birthdays/components/school-birthday-card'
import { cn } from '@/lib/utils'
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
  DropdownMenuCheckboxItem,
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
  Search,
  GraduationCap,
  UserCheck,
  UserX,
  Eye,
  MoreHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldOff,
  ShieldCheck,
  Loader2,
  Download,
  Heart,
  Edit,
  User,
  Image as ImageIcon,
  Hash,
  FileText,
  IdCard,
  CalendarDays,
  Bus,
  Bed,
  Phone,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Columns3,
  UserRound,
  VenusAndMars,
  Cake,
  Droplet,
  Tag,
  Fingerprint,
  Activity,
  BadgeCheck,
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
  assignedHouse?: { id: string; name: string; color: string } | null
  transportRouteName?: string | null
  hostelName?: string | null
  hostelRoomNumber?: string | null
  hostelBedNumber?: string | null
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

interface StudentsListPageState {
  classFilter: string
  sectionFilter: string
  genderFilter: string
  statusFilter: string
  transportFilter: string
  hostelFilter: string
  searchQuery: string
  showFilters: boolean
  page: number
  limit: number
  visibleColumns: ColumnId[]
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

const ALLOCATION_FILTER_OPTIONS = [
  { value: 'with', label: 'With' },
  { value: 'without', label: 'Without' },
]

const ALL_PAGE_SIZE = 0
const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: ALL_PAGE_SIZE, label: 'All' },
]

const STUDENTS_LIST_STATE_KEY = 'students:list'
const DEFAULT_STATUS_FILTER = 'active'

// ============================================
// Column configuration
// ============================================

type ColumnId =
  | 'photo'
  | 'name'
  | 'father'
  | 'mother'
  | 'class'
  | 'roll'
  | 'reg'
  | 'adm'
  | 'admDate'
  | 'route'
  | 'hostel'
  | 'phone'
  | 'gender'
  | 'house'
  | 'dob'
  | 'bloodGroup'
  | 'category'
  | 'aadhaar'
  | 'status'

interface ColumnConfig {
  id: ColumnId
  label: string
  icon: LucideIcon
  sortKey?: SortKey
  // Mandatory columns are always shown and cannot be hidden by the user.
  mandatory?: boolean
  // Whether the column is shown by default (before the user customises).
  defaultVisible?: boolean
}

const COLUMN_CONFIG: ColumnConfig[] = [
  { id: 'photo', label: 'Photo', icon: ImageIcon, mandatory: true, defaultVisible: true },
  { id: 'name', label: 'Student Name', icon: User, sortKey: 'name', mandatory: true, defaultVisible: true },
  { id: 'father', label: "Father's Name", icon: Users, sortKey: 'father', defaultVisible: true },
  { id: 'mother', label: "Mother's Name", icon: UserRound, sortKey: 'mother' },
  { id: 'class', label: 'Class', icon: GraduationCap, sortKey: 'class', defaultVisible: true },
  { id: 'roll', label: 'Roll', icon: Hash, sortKey: 'roll', defaultVisible: true },
  { id: 'reg', label: 'Reg.No.', icon: FileText, sortKey: 'reg', defaultVisible: true },
  { id: 'adm', label: 'Adm.No.', icon: IdCard, sortKey: 'adm', defaultVisible: true },
  { id: 'admDate', label: 'Adm.Date', icon: CalendarDays, sortKey: 'admDate', defaultVisible: true },
  { id: 'gender', label: 'Gender', icon: VenusAndMars, sortKey: 'gender' },
  { id: 'house', label: 'House', icon: BadgeCheck, sortKey: 'house', defaultVisible: true },
  { id: 'dob', label: 'Date of Birth', icon: Cake, sortKey: 'dob' },
  { id: 'bloodGroup', label: 'Blood Group', icon: Droplet, sortKey: 'bloodGroup' },
  { id: 'category', label: 'Category', icon: Tag, sortKey: 'category' },
  { id: 'aadhaar', label: 'Aadhaar No.', icon: Fingerprint, sortKey: 'aadhaar' },
  { id: 'route', label: 'Route', icon: Bus, defaultVisible: true },
  { id: 'hostel', label: 'Hostel', icon: Bed },
  { id: 'phone', label: 'Phone', icon: Phone, defaultVisible: true },
  { id: 'status', label: 'Status', icon: Activity, sortKey: 'status' },
]

const DEFAULT_VISIBLE_COLUMNS: ColumnId[] = COLUMN_CONFIG.filter(c => c.defaultVisible).map(c => c.id)

const DEFAULT_STUDENTS_LIST_STATE: StudentsListPageState = {
  classFilter: 'all',
  sectionFilter: 'all',
  genderFilter: 'all',
  statusFilter: DEFAULT_STATUS_FILTER,
  transportFilter: 'all',
  hostelFilter: 'all',
  searchQuery: '',
  showFilters: false,
  page: 1,
  limit: 25,
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
}

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

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

// ============================================
// Sorting
// ============================================

type SortKey =
  | 'name'
  | 'father'
  | 'mother'
  | 'class'
  | 'roll'
  | 'reg'
  | 'adm'
  | 'admDate'
  | 'gender'
  | 'house'
  | 'dob'
  | 'bloodGroup'
  | 'category'
  | 'aadhaar'
  | 'status'
type SortDirection = 'asc' | 'desc'

interface SortState {
  key: SortKey
  direction: SortDirection
}

function getFatherName(s: Student): string {
  return s.parentLinks?.find(p => p.relation === 'Father')?.parent.fatherName || ''
}

function getMotherName(s: Student): string {
  // The mother's name lives on the parent record; fall back across links since
  // it may be stored on the primary parent rather than a "Mother" relation row.
  for (const link of s.parentLinks ?? []) {
    if (link.parent.motherName) return link.parent.motherName
  }
  return ''
}

function getSortValue(s: Student, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return (s.fullName || `${s.firstName} ${s.lastName}`).toLowerCase()
    case 'father':
      return getFatherName(s).toLowerCase()
    case 'mother':
      return getMotherName(s).toLowerCase()
    case 'class':
      return `${s.class?.name || ''} ${s.section?.name || ''}`.toLowerCase()
    case 'roll':
      return s.rollNumber || ''
    case 'reg':
      return s.admission?.registrationNumber || ''
    case 'adm':
      return s.admissionNumber || ''
    case 'admDate': {
      const d = s.admission?.dateOfAdmission
      return d ? new Date(d).getTime() : 0
    }
    case 'gender':
      return (s.gender || '').toLowerCase()
    case 'house':
      return (s.assignedHouse?.name || '').toLowerCase()
    case 'dob': {
      const d = s.dateOfBirth
      return d ? new Date(d).getTime() : 0
    }
    case 'bloodGroup':
      return (s.bloodGroup || '').toLowerCase()
    case 'category':
      return (s.category || '').toLowerCase()
    case 'aadhaar':
      return s.aadhaarNumber || ''
    case 'status':
      return s.isActive ? 'active' : 'disabled'
  }
}

function sortStudents(students: Student[], sort: SortState | null): Student[] {
  if (!sort) return students
  const { key, direction } = sort
  const factor = direction === 'asc' ? 1 : -1
  return [...students].sort((a, b) => {
    const av = getSortValue(a, key)
    const bv = getSortValue(b, key)
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * factor
    }
    return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor
  })
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
  const displayLimit = limit === ALL_PAGE_SIZE ? total : limit
  const from = total === 0 ? 0 : (page - 1) * displayLimit + 1
  const to = Math.min(page * displayLimit, total)

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
        <Select value={limit === ALL_PAGE_SIZE ? 'all' : String(limit)} onValueChange={(v) => onPageSizeChange(v === 'all' ? ALL_PAGE_SIZE : Number(v))}>
          <SelectTrigger className="h-8 w-[78px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value === ALL_PAGE_SIZE ? 'all' : String(option.value)}>
                {option.label}
              </SelectItem>
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
// Sortable Header
// ============================================

function SortableHeader({
  label,
  icon: Icon,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  icon: LucideIcon
  sortKey: SortKey
  sort: SortState | null
  onSort: (key: SortKey) => void
}) {
  const isActive = sort?.key === sortKey
  const SortIcon = !isActive ? ArrowUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1.5 select-none hover:text-foreground transition-colors"
    >
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
      <SortIcon className={`size-3.5 ${isActive ? 'text-brand' : 'text-muted-foreground/50'}`} />
    </button>
  )
}

// ============================================
// Main Component
// ============================================

export function StudentsPage() {
  const router = useRouter()
  const { toast } = useToast()
  // Global "viewing academic year" — top-bar switcher. Without this, the page
  // always returned the school's currently-active session, so changing the
  // year from the top bar appeared to do nothing.
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const currentSchool = useAppStore((s) => s.currentSchool)
  const birthdayCardSchool: BirthdayCardSchool = useMemo(() => ({
    name: currentSchool?.name,
    logo: currentSchool?.logo,
    address: currentSchool?.address,
    city: currentSchool?.city,
    state: currentSchool?.state,
    pincode: currentSchool?.pincode,
    contactPhone: currentSchool?.contactPhone,
    academicYear: currentSchool?.academicYear,
  }), [currentSchool])
  const savedListState = useAppStore((s) => s.pageState[STUDENTS_LIST_STATE_KEY] as StudentsListPageState | undefined)
  const setPageState = useAppStore((s) => s.setPageState)
  const initialListState = {
    ...DEFAULT_STUDENTS_LIST_STATE,
    ...savedListState,
    statusFilter: savedListState?.statusFilter === 'disabled'
      ? savedListState.statusFilter
      : DEFAULT_STATUS_FILTER,
  }
  const { hasPermission } = usePermissions()
  const canAdmit = hasPermission(PERMISSIONS.ADMISSION_CREATE)
  const canEdit = hasPermission(PERMISSIONS.STUDENT_UPDATE)
  const canEnableDisable = hasPermission(PERMISSIONS.STUDENT_ENABLE_DISABLE)

  // Data states
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: initialListState.page,
    limit: initialListState.limit,
    total: 0,
    totalPages: 0,
  })

  // Filter states
  const [classFilter, setClassFilter] = useState(initialListState.classFilter)
  const [sectionFilter, setSectionFilter] = useState(initialListState.sectionFilter)
  const [genderFilter, setGenderFilter] = useState(initialListState.genderFilter)
  const [statusFilter, setStatusFilter] = useState(initialListState.statusFilter)
  const [transportFilter, setTransportFilter] = useState(initialListState.transportFilter)
  const [hostelFilter, setHostelFilter] = useState(initialListState.hostelFilter)
  const [searchQuery, setSearchQuery] = useState(initialListState.searchQuery)
  const [showFilters, setShowFilters] = useState(
    initialListState.showFilters ||
    initialListState.classFilter !== 'all' ||
    initialListState.sectionFilter !== 'all' ||
    initialListState.genderFilter !== 'all' ||
    initialListState.statusFilter !== DEFAULT_STATUS_FILTER ||
    initialListState.transportFilter !== 'all' ||
    initialListState.hostelFilter !== 'all'
  )

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(initialListState.searchQuery)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Toggle states
  const [toggleDialog, setToggleDialog] = useState<{ open: boolean; student: Student | null }>({
    open: false,
    student: null,
  })
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Birthday card dialog
  const [birthdayStudent, setBirthdayStudent] = useState<Student | null>(null)

  // Stats (fetched separately to include all students)
  const [stats, setStats] = useState({ total: 0, active: 0, disabled: 0, thisMonth: 0 })

  // Column sort (client-side, applies to the loaded page)
  const [sort, setSort] = useState<SortState | null>(null)

  const handleSort = useCallback((key: SortKey) => {
    setSort(prev => {
      if (prev?.key !== key) return { key, direction: 'asc' }
      return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    })
  }, [])

  // Column visibility — user picks which columns to show; persisted per session.
  const [visibleColumns, setVisibleColumns] = useState<ColumnId[]>(() => {
    const saved = initialListState.visibleColumns
    const valid = Array.isArray(saved)
      ? saved.filter((id): id is ColumnId => COLUMN_CONFIG.some(c => c.id === id))
      : []
    return valid.length > 0 ? valid : DEFAULT_VISIBLE_COLUMNS
  })

  const isColumnVisible = useCallback(
    (id: ColumnId) => visibleColumns.includes(id),
    [visibleColumns]
  )

  const sortedStudents = useMemo(() => sortStudents(students, sort), [students, sort])

  const rememberListState = useCallback((patch: Partial<StudentsListPageState>) => {
    setPageState(STUDENTS_LIST_STATE_KEY, {
      classFilter,
      sectionFilter,
      genderFilter,
      statusFilter,
      transportFilter,
      hostelFilter,
      searchQuery,
      showFilters,
      page: pagination.page,
      limit: pagination.limit,
      visibleColumns,
      ...patch,
    })
  }, [classFilter, genderFilter, hostelFilter, pagination.limit, pagination.page, searchQuery, sectionFilter, setPageState, showFilters, statusFilter, transportFilter, visibleColumns])

  const handleToggleColumn = useCallback((id: ColumnId) => {
    const config = COLUMN_CONFIG.find(c => c.id === id)
    if (config?.mandatory) return
    setVisibleColumns(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      // Keep the canonical column order regardless of toggle order.
      const ordered = COLUMN_CONFIG.filter(c => next.includes(c.id)).map(c => c.id)
      rememberListState({ visibleColumns: ordered })
      return ordered
    })
  }, [rememberListState])

  const handleResetColumns = useCallback(() => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
    rememberListState({ visibleColumns: DEFAULT_VISIBLE_COLUMNS })
  }, [rememberListState])

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
        limit: limit === ALL_PAGE_SIZE ? 'all' : String(limit),
      }
      if (debouncedSearch) params.search = debouncedSearch
      if (classFilter !== 'all') params.classId = classFilter
      if (sectionFilter !== 'all') params.sectionId = sectionFilter
      if (genderFilter !== 'all') params.gender = genderFilter
      if (statusFilter === 'active') params.isActive = 'true'
      else if (statusFilter === 'disabled') params.isActive = 'false'
      if (transportFilter !== 'all') params.transport = transportFilter
      if (hostelFilter !== 'all') params.hostel = hostelFilter
      const resolvedYear = viewingAcademicYear || currentSchoolAcademicYear || ''
      if (resolvedYear) params.academicYear = resolvedYear

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
  }, [debouncedSearch, classFilter, sectionFilter, genderFilter, statusFilter, transportFilter, hostelFilter, viewingAcademicYear, currentSchoolAcademicYear])

  const handleExportCsv = useCallback(async () => {
    setExporting(true)
    try {
      const params: Record<string, string> = {
        page: '1',
        limit: 'all',
      }
      const exportSearch = searchQuery.trim() || debouncedSearch
      if (exportSearch) params.search = exportSearch
      if (classFilter !== 'all') params.classId = classFilter
      if (sectionFilter !== 'all') params.sectionId = sectionFilter
      if (genderFilter !== 'all') params.gender = genderFilter
      if (statusFilter === 'active') params.isActive = 'true'
      else if (statusFilter === 'disabled') params.isActive = 'false'
      if (transportFilter !== 'all') params.transport = transportFilter
      if (hostelFilter !== 'all') params.hostel = hostelFilter
      const resolvedYear = viewingAcademicYear || currentSchoolAcademicYear || ''
      if (resolvedYear) params.academicYear = resolvedYear

      const data = await api.get<{ students: Student[] }>('/api/school/students', params, { skipLogoutOn401: true })
      const rows = sortStudents(Array.isArray(data?.students) ? data.students : [], sort)
      const header = [
        'Admission No',
        'Registration No',
        'Student Name',
        "Father's Name",
        "Mother's Name",
        'Phone',
        'Class',
        'Section',
        'Roll',
        'Gender',
        'House',
        'Date of Birth',
        'Admission Date',
        'Category',
        'Blood Group',
        'Aadhaar No',
        'Transport Route',
        'Hostel',
        'Hostel Room',
        'Hostel Bed',
        'Status',
      ]
      const csvRows = rows.map((student) => {
        const fatherLink = student.parentLinks?.find((link) => link.relation === 'Father')
        const phone = fatherLink?.parent.phone || student.parentLinks?.find((link) => link.parent.phone)?.parent.phone || ''
        return [
          student.admissionNumber,
          student.admission?.registrationNumber,
          student.fullName || `${student.firstName} ${student.lastName}`.trim(),
          getFatherName(student),
          getMotherName(student),
          phone,
          student.class?.name,
          student.section?.name,
          student.rollNumber,
          student.gender,
          student.assignedHouse?.name,
          formatDate(student.dateOfBirth),
          formatDate(student.admission?.dateOfAdmission),
          student.category,
          student.bloodGroup,
          student.aadhaarNumber,
          student.transportRouteName,
          student.hostelName,
          student.hostelRoomNumber,
          student.hostelBedNumber,
          student.isActive ? 'Active' : 'Disabled',
        ].map(csvEscape).join(',')
      })
      const csv = [header.map(csvEscape).join(','), ...csvRows].join('\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `students-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast({ title: 'Export ready', description: `${rows.length} student${rows.length !== 1 ? 's' : ''} exported.` })
    } catch {
      toast({ title: 'Export failed', description: 'Could not export students. Please try again.', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }, [
    classFilter,
    currentSchoolAcademicYear,
    debouncedSearch,
    genderFilter,
    hostelFilter,
    searchQuery,
    sectionFilter,
    sort,
    statusFilter,
    toast,
    transportFilter,
    viewingAcademicYear,
  ])

  // Fetch stats separately (aggregated server-side; no student rows downloaded)
  const fetchStats = useCallback(async () => {
    try {
      const resolvedYear = viewingAcademicYear || currentSchoolAcademicYear || ''
      const statsParams: Record<string, string> = {}
      if (resolvedYear) statsParams.academicYear = resolvedYear
      const data = await api.get<{ total: number; active: number; inactive: number; admittedThisMonth: number }>(
        '/api/school/students/stats',
        statsParams,
        { skipLogoutOn401: true }
      )
      setStats({
        total: data?.total ?? 0,
        active: data?.active ?? 0,
        disabled: data?.inactive ?? 0,
        thisMonth: data?.admittedThisMonth ?? 0,
      })
    } catch {
      // Stats may not be available
    }
  }, [viewingAcademicYear, currentSchoolAcademicYear])

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
      await fetchStudents(initialListState.page, initialListState.limit)
    }
    init()
  }, [])

  // Re-fetch when filters, search, or the global academic-year switcher change
  // (reset to page 1). Year is included so top-bar switching refreshes the
  // list immediately instead of requiring a manual page refresh.
  useEffect(() => {
    if (!loading || students.length > 0) {
      fetchStudents(1, pagination.limit)
    }
  }, [debouncedSearch, classFilter, sectionFilter, genderFilter, statusFilter, transportFilter, hostelFilter, viewingAcademicYear, currentSchoolAcademicYear])

  // Refresh the header stats card when the viewing year changes too — without
  // this, the counts (Total / Active / Disabled / This month) stay anchored to
  // whichever year was active on first mount.
  useEffect(() => {
    fetchStats()
  }, [viewingAcademicYear, currentSchoolAcademicYear, fetchStats])

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
    router.push(`/students/${student.id}`)
  }

  // ============================================
  // Pagination Handlers
  // ============================================

  const handlePageChange = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }))
    rememberListState({ page })
    fetchStudents(page, pagination.limit)
  }, [fetchStudents, pagination.limit, rememberListState])

  const handlePageSizeChange = useCallback((size: number) => {
    setPagination(prev => ({ ...prev, page: 1, limit: size }))
    rememberListState({ page: 1, limit: size })
    fetchStudents(1, size)
  }, [fetchStudents, rememberListState])

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    rememberListState({ searchQuery: value, page: 1 })
  }

  const handleShowFiltersChange = () => {
    const next = !showFilters
    setShowFilters(next)
    rememberListState({ showFilters: next })
  }

  const handleClassFilterChange = (value: string) => {
    setClassFilter(value)
    setSectionFilter('all')
    rememberListState({ classFilter: value, sectionFilter: 'all', page: 1 })
  }

  const handleSectionFilterChange = (value: string) => {
    setSectionFilter(value)
    rememberListState({ sectionFilter: value, page: 1 })
  }

  const handleGenderFilterChange = (value: string) => {
    setGenderFilter(value)
    rememberListState({ genderFilter: value, page: 1 })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    rememberListState({ statusFilter: value, page: 1 })
  }

  const handleTransportFilterChange = (value: string) => {
    setTransportFilter(value)
    rememberListState({ transportFilter: value, page: 1 })
  }

  const handleHostelFilterChange = (value: string) => {
    setHostelFilter(value)
    rememberListState({ hostelFilter: value, page: 1 })
  }

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

  const hasActiveFilters =
    classFilter !== 'all' ||
    sectionFilter !== 'all' ||
    genderFilter !== 'all' ||
    statusFilter !== DEFAULT_STATUS_FILTER ||
    transportFilter !== 'all' ||
    hostelFilter !== 'all'
  const studentListTitle = statusFilter === 'active'
    ? 'Active Students'
    : statusFilter === 'disabled'
      ? 'Disabled Students'
      : 'All Students'

  const clearFilters = () => {
    setClassFilter('all')
    setSectionFilter('all')
    setGenderFilter('all')
    setStatusFilter(DEFAULT_STATUS_FILTER)
    setTransportFilter('all')
    setHostelFilter('all')
    rememberListState({
      classFilter: 'all',
      sectionFilter: 'all',
      genderFilter: 'all',
      statusFilter: DEFAULT_STATUS_FILTER,
      transportFilter: 'all',
      hostelFilter: 'all',
      page: 1,
    })
  }

  // ============================================
  // Main Render
  // ============================================

  if (loading && students.length === 0) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Users className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Students</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {stats.total.toLocaleString('en-IN')} records
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Profiles, admissions and student status in one place</p>
          </div>
        </div>
        {canAdmit && (
          <Button
            variant="secondary"
            onClick={() => router.push('/students/admit')}
            className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-transform hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
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
          tone="sky"
        />
        <StudentStatCard
          title="Active"
          value={stats.active}
          description="Currently active"
          icon={UserCheck}
          tone="emerald"
        />
        <StudentStatCard
          title="Disabled"
          value={stats.disabled}
          description="Currently disabled"
          icon={UserX}
          tone="rose"
        />
        <StudentStatCard
          title="This Month"
          value={stats.thisMonth}
          description="New admissions"
          icon={GraduationCap}
          tone="violet"
        />
      </div>

      {/* Students Table */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <Users className="size-4" />
              </span>
              {studentListTitle}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, adm no, roll..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-56"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowFiltersChange}
                className="gap-1 h-9"
              >
                <ChevronDown className={`size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                Filters
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-9">
                    <Columns3 className="size-4" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {COLUMN_CONFIG.map(col => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={isColumnVisible(col.id)}
                      disabled={col.mandatory}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => handleToggleColumn(col.id)}
                    >
                      <col.icon className="size-3.5 text-muted-foreground mr-2" />
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleResetColumns}>
                    Reset to default
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={exporting || pagination.total === 0}
                className="gap-1 h-9"
              >
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                CSV
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
            <div className="grid grid-cols-2 gap-2 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3 sm:grid-cols-3 xl:grid-cols-6">
              <Select value={classFilter} onValueChange={handleClassFilterChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sectionFilter} onValueChange={handleSectionFilterChange} disabled={classFilter === 'all'}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Section" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {filteredSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={genderFilter} onValueChange={handleGenderFilterChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  {GENDER_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={transportFilter} onValueChange={handleTransportFilterChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Transport" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transport</SelectItem>
                  {ALLOCATION_FILTER_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} Transport
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={hostelFilter} onValueChange={handleHostelFilterChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Hostel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Hostel</SelectItem>
                  {ALLOCATION_FILTER_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} Hostel
                    </SelectItem>
                  ))}
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
                action={canAdmit ? { label: 'Admit Student', onClick: () => router.push('/students/admit') } : undefined}
              />
            </div>
          ) : (
            <div className="mx-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    {isColumnVisible('photo') && (
                      <TableHead className="w-[44px]">
                        <span className="flex items-center gap-1.5"><ImageIcon className="size-3.5 text-muted-foreground" />Photo</span>
                      </TableHead>
                    )}
                    {isColumnVisible('name') && (
                      <TableHead>
                        <SortableHeader label="Student Name" icon={User} sortKey="name" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('father') && (
                      <TableHead>
                        <SortableHeader label="Father's Name" icon={Users} sortKey="father" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('mother') && (
                      <TableHead>
                        <SortableHeader label="Mother's Name" icon={UserRound} sortKey="mother" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('class') && (
                      <TableHead>
                        <SortableHeader label="Class" icon={GraduationCap} sortKey="class" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('roll') && (
                      <TableHead>
                        <SortableHeader label="Roll" icon={Hash} sortKey="roll" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('reg') && (
                      <TableHead>
                        <SortableHeader label="Reg.No." icon={FileText} sortKey="reg" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('adm') && (
                      <TableHead>
                        <SortableHeader label="Adm.No." icon={IdCard} sortKey="adm" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('admDate') && (
                      <TableHead>
                        <SortableHeader label="Adm.Date" icon={CalendarDays} sortKey="admDate" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('gender') && (
                      <TableHead>
                        <SortableHeader label="Gender" icon={VenusAndMars} sortKey="gender" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('house') && (
                      <TableHead>
                        <SortableHeader label="House" icon={BadgeCheck} sortKey="house" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('dob') && (
                      <TableHead>
                        <SortableHeader label="Date of Birth" icon={Cake} sortKey="dob" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('bloodGroup') && (
                      <TableHead>
                        <SortableHeader label="Blood Group" icon={Droplet} sortKey="bloodGroup" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('category') && (
                      <TableHead>
                        <SortableHeader label="Category" icon={Tag} sortKey="category" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('aadhaar') && (
                      <TableHead>
                        <SortableHeader label="Aadhaar No." icon={Fingerprint} sortKey="aadhaar" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    {isColumnVisible('route') && (
                      <TableHead>
                        <span className="flex items-center gap-1.5"><Bus className="size-3.5 text-muted-foreground" />Route</span>
                      </TableHead>
                    )}
                    {isColumnVisible('hostel') && (
                      <TableHead>
                        <span className="flex items-center gap-1.5"><Bed className="size-3.5 text-muted-foreground" />Hostel</span>
                      </TableHead>
                    )}
                    {isColumnVisible('phone') && (
                      <TableHead>
                        <span className="flex items-center gap-1.5"><Phone className="size-3.5 text-muted-foreground" />Phone</span>
                      </TableHead>
                    )}
                    {isColumnVisible('status') && (
                      <TableHead>
                        <SortableHeader label="Status" icon={Activity} sortKey="status" sort={sort} onSort={handleSort} />
                      </TableHead>
                    )}
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStudents.map((s) => {
                    const isToggling = togglingId === s.id
                    const fatherLink = s.parentLinks?.find(p => p.relation === 'Father')
                    const fatherName = fatherLink?.parent.fatherName
                    const fatherPhone = fatherLink?.parent.phone
                    const motherName = getMotherName(s)
                    const name = s.fullName || `${s.firstName} ${s.lastName}`
                    const photoSrc = s.profileImage || s.admission?.profileImage

                    return (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer transition-colors hover:bg-sky-500/[0.055] ${!s.isActive ? 'opacity-60 bg-rose-500/[0.035]' : ''}`}
                        onClick={() => handleViewStudent(s)}
                      >
                        {/* Photo */}
                        {isColumnVisible('photo') && (
                          <TableCell>
                            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                              {photoSrc ? (
                                <img src={photoSrc} alt={name} className="size-full object-cover" />
                              ) : (
                                <User className="size-4 text-primary" />
                              )}
                            </div>
                          </TableCell>
                        )}

                        {/* Student Name */}
                        {isColumnVisible('name') && (
                          <TableCell>
                            <div>
                              <p className={`font-medium ${!s.isActive ? 'line-through decoration-muted-foreground' : ''}`}>
                                {name}
                              </p>
                              {s.siblingId && (
                                <Badge variant="info" className="text-[10px] px-1 py-0 h-4 gap-0.5 mt-0.5">
                                  <Heart className="size-2.5" /> Sibling
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        )}

                        {/* Father's Name */}
                        {isColumnVisible('father') && (
                          <TableCell>
                            <span className="text-sm">{fatherName || '--'}</span>
                          </TableCell>
                        )}

                        {/* Mother's Name */}
                        {isColumnVisible('mother') && (
                          <TableCell>
                            <span className="text-sm">{motherName || '--'}</span>
                          </TableCell>
                        )}

                        {/* Class */}
                        {isColumnVisible('class') && (
                          <TableCell>
                            <span className="text-sm">{s.class?.name || '--'}</span>
                            {s.section?.name && <span className="text-xs text-muted-foreground ml-1">- {s.section.name}</span>}
                          </TableCell>
                        )}

                        {/* Roll */}
                        {isColumnVisible('roll') && (
                          <TableCell>
                            <span className="text-sm font-mono">{s.rollNumber || '--'}</span>
                          </TableCell>
                        )}

                        {/* Reg.No. */}
                        {isColumnVisible('reg') && (
                          <TableCell>
                            <span className="text-sm font-mono">{s.admission?.registrationNumber || '--'}</span>
                          </TableCell>
                        )}

                        {/* Adm.No. */}
                        {isColumnVisible('adm') && (
                          <TableCell>
                            <span className={`font-mono text-sm font-semibold ${s.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                              {s.admissionNumber || '--'}
                            </span>
                          </TableCell>
                        )}

                        {/* Adm.Date */}
                        {isColumnVisible('admDate') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {formatDate(s.admission?.dateOfAdmission)}
                            </span>
                          </TableCell>
                        )}

                        {/* Gender */}
                        {isColumnVisible('gender') && (
                          <TableCell>
                            <span className="text-sm">{s.gender || '--'}</span>
                          </TableCell>
                        )}

                        {/* House */}
                        {isColumnVisible('house') && (
                          <TableCell>
                            {s.assignedHouse ? (
                              <span className="inline-flex items-center gap-1.5 text-sm">
                                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.assignedHouse.color }} />
                                {s.assignedHouse.name}
                              </span>
                            ) : (
                              <span className="text-sm">--</span>
                            )}
                          </TableCell>
                        )}

                        {/* Date of Birth */}
                        {isColumnVisible('dob') && (
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{formatDate(s.dateOfBirth)}</span>
                          </TableCell>
                        )}

                        {/* Blood Group */}
                        {isColumnVisible('bloodGroup') && (
                          <TableCell>
                            <span className="text-sm font-mono">{s.bloodGroup || '--'}</span>
                          </TableCell>
                        )}

                        {/* Category */}
                        {isColumnVisible('category') && (
                          <TableCell>
                            <span className="text-sm">{s.category || '--'}</span>
                          </TableCell>
                        )}

                        {/* Aadhaar No. */}
                        {isColumnVisible('aadhaar') && (
                          <TableCell>
                            <span className="text-sm font-mono">{s.aadhaarNumber || '--'}</span>
                          </TableCell>
                        )}

                        {/* Route */}
                        {isColumnVisible('route') && (
                          <TableCell>
                            <span className="text-sm">{s.transportRouteName || '--'}</span>
                          </TableCell>
                        )}

                        {/* Hostel */}
                        {isColumnVisible('hostel') && (
                          <TableCell>
                            {s.hostelName ? (
                              <div className="text-sm">
                                <span>{s.hostelName}</span>
                                {(s.hostelRoomNumber || s.hostelBedNumber) && (
                                  <p className="text-xs text-muted-foreground">
                                    {[s.hostelRoomNumber ? `Room ${s.hostelRoomNumber}` : null, s.hostelBedNumber ? `Bed ${s.hostelBedNumber}` : null]
                                      .filter(Boolean)
                                      .join(' / ')}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm">--</span>
                            )}
                          </TableCell>
                        )}

                        {/* Phone */}
                        {isColumnVisible('phone') && (
                          <TableCell>
                            <span className="text-sm">{fatherPhone || '--'}</span>
                          </TableCell>
                        )}

                        {/* Status */}
                        {isColumnVisible('status') && (
                          <TableCell>
                            <Badge variant={s.isActive ? 'success' : 'secondary'} className="text-[10px] px-1.5 py-0 h-5">
                              {s.isActive ? 'Active' : 'Disabled'}
                            </Badge>
                          </TableCell>
                        )}

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
                                <DropdownMenuItem onClick={() => router.push(`/students/${s.id}/edit`)}>
                                  <Edit className="size-4 mr-2" /> Edit
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => setBirthdayStudent(s)}>
                                <Cake className="size-4 mr-2" /> Birthday Card
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

      {/* Birthday Card Dialog */}
      <SchoolBirthdayCardDialog
        open={birthdayStudent !== null}
        student={birthdayStudent}
        school={birthdayCardSchool}
        onClose={() => setBirthdayStudent(null)}
      />
    </div>
  )
}

function StudentStatCard({
  title,
  value,
  description,
  icon: Icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  tone: 'sky' | 'emerald' | 'rose' | 'violet'
}) {
  const styles = {
    sky: {
      card: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05]',
      icon: 'bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/20',
      accent: 'from-sky-500 via-sky-400',
      bubble: 'bg-sky-500/[0.10]',
    },
    emerald: {
      card: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05]',
      icon: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/20',
      accent: 'from-emerald-500 via-emerald-400',
      bubble: 'bg-emerald-500/[0.10]',
    },
    rose: {
      card: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05]',
      icon: 'bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/20',
      accent: 'from-rose-500 via-rose-400',
      bubble: 'bg-rose-500/[0.10]',
    },
    violet: {
      card: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05]',
      icon: 'bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/20',
      accent: 'from-violet-500 via-violet-400',
      bubble: 'bg-violet-500/[0.10]',
    },
  }[tone]

  return (
    <Card className={cn('group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', styles.card)}>
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div aria-hidden className={cn('absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125', styles.bubble)} />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm', styles.icon)}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
