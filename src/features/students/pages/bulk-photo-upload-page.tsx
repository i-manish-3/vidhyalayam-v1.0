'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Camera,
  Search,
  CheckCircle2,
  AlertCircle,
  Users,
  ArrowLeft,
  RefreshCw,
  LayoutGrid,
  List,
  Trash2,
  Eye,
  X,
  GraduationCap,
  Hash,
  IdCard,
  User,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react'
import { LoadingState, EmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProfilePhotoDialog } from '@/components/shared/profile-photo-dialog'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// ============================================
// Types
// ============================================

interface Student {
  id: string
  admissionNumber: string
  rollNumber: string | null
  firstName: string
  lastName: string
  fullName?: string
  gender: string | null
  profileImage: string | null
  classId: string | null
  sectionId: string | null
  class?: { id: string; name: string } | null
  section?: { id: string; name: string } | null
  parentLinks?: Array<{
    relation: string
    isPrimary?: boolean
    parent: {
      id: string
      fatherName?: string | null
      motherName?: string | null
      name?: string
      phone: string | null
    }
  }>
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

type SortKey = 'name' | 'class' | 'adm' | 'roll' | 'father' | 'photoStatus'
type SortDirection = 'asc' | 'desc'

interface SortState {
  key: SortKey
  direction: SortDirection
}

// ============================================
// Pagination Helpers & Constants
// ============================================

const ALL_PAGE_SIZE = 99999
const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: ALL_PAGE_SIZE, label: 'All' },
]

function getFatherName(s: Student): string {
  const fatherLink = s.parentLinks?.find(
    (p) => p.relation?.toLowerCase() === 'father' || p.isPrimary
  )
  return fatherLink?.parent?.fatherName || fatherLink?.parent?.name || ''
}

// ============================================
// Subcomponents (Matching StudentsPage exactly)
// ============================================

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
    <Card
      className={cn(
        'group relative w-full overflow-hidden rounded-xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        styles.card
      )}
    >
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent', styles.accent)} />
      <div
        aria-hidden
        className={cn(
          'absolute -bottom-7 -right-5 size-16 rounded-full transition-transform group-hover:scale-125',
          styles.bubble
        )}
      />
      <CardContent className="relative p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">{title}</p>
            <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{value}</p>
            <p className="truncate text-[10px] leading-3 text-muted-foreground">{description}</p>
          </div>
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm',
              styles.icon
            )}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

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
      className="flex items-center gap-1.5 select-none hover:text-foreground transition-colors font-medium text-xs text-muted-foreground"
    >
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
      <SortIcon className={`size-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground/50'}`} />
    </button>
  )
}

function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  limit: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const displayLimit = limit === ALL_PAGE_SIZE ? total : limit
  const from = total === 0 ? 0 : (page - 1) * displayLimit + 1
  const to = Math.min(page * displayLimit, total)

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
        <Select
          value={limit === ALL_PAGE_SIZE ? 'all' : String(limit)}
          onValueChange={(v) => onPageSizeChange(v === 'all' ? ALL_PAGE_SIZE : Number(v))}
        >
          <SelectTrigger className="h-8 w-[78px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value === ALL_PAGE_SIZE ? 'all' : String(option.value)}
              >
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
// Main Page Component
// ============================================

export function BulkPhotoUploadPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)

  // Filters & Search
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all')
  const [photoFilter, setPhotoFilter] = useState<'all' | 'missing' | 'uploaded'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table')

  // Pagination state
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)

  // Sorting
  const [sort, setSort] = useState<SortState | null>({ key: 'name', direction: 'asc' })

  // Data & loading
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Camera Dialog state
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false)
  const [activeStudent, setActiveStudent] = useState<Student | null>(null)

  // Photo Preview Modal (full student object for rich modal)
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null)

  // Delete Photo confirmation
  const [deleteConfirmStudent, setDeleteConfirmStudent] = useState<Student | null>(null)
  const [deletingPhoto, setDeletingPhoto] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 280)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch classes and sections
  const fetchClassesAndSections = useCallback(async () => {
    try {
      const [classRes, secRes] = await Promise.all([
        api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true }),
        api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
      ])
      setClasses(Array.isArray(classRes?.classes) ? classRes.classes : [])
      setSections(Array.isArray(secRes?.sections) ? secRes.sections : [])
    } catch {
      // fallback
    }
  }, [])

  useEffect(() => {
    void fetchClassesAndSections()
  }, [fetchClassesAndSections])

  // Filter sections by selected class
  const filteredSections = useMemo(() => {
    if (selectedClassId === 'all') return []
    return sections.filter((s) => s.classId === selectedClassId)
  }, [sections, selectedClassId])

  // Fetch students
  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {
        limit: 'all',
        isActive: 'true',
      }
      if (selectedClassId !== 'all') params.classId = selectedClassId
      if (selectedSectionId !== 'all') params.sectionId = selectedSectionId
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim()
      if (currentSchoolAcademicYear) params.academicYear = currentSchoolAcademicYear

      const res = await api.get<{ students: Student[] }>('/api/school/students', params, {
        skipLogoutOn401: true,
      })
      setStudents(Array.isArray(res?.students) ? res.students : [])
    } catch (err) {
      toast({
        title: 'Error loading students',
        description: err instanceof Error ? err.message : 'Could not fetch student records.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedClassId, selectedSectionId, debouncedSearch, currentSchoolAcademicYear, toast])

  useEffect(() => {
    void fetchStudents()
  }, [fetchStudents])

  // Summary statistics calculated on all fetched students
  const stats = useMemo(() => {
    const total = students.length
    const withPhoto = students.filter((s) => Boolean(s.profileImage)).length
    const missing = total - withPhoto
    const percent = total > 0 ? Math.round((withPhoto / total) * 100) : 0
    return { total, withPhoto, missing, percent }
  }, [students])

  // Filtered students by photo presence
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (photoFilter === 'missing') return !s.profileImage
      if (photoFilter === 'uploaded') return Boolean(s.profileImage)
      return true
    })
  }, [students, photoFilter])

  // Sorted students
  const sortedStudents = useMemo(() => {
    if (!sort) return filteredStudents
    const { key, direction } = sort
    const factor = direction === 'asc' ? 1 : -1

    return [...filteredStudents].sort((a, b) => {
      let av: string | number = ''
      let bv: string | number = ''

      switch (key) {
        case 'name':
          av = (a.fullName || `${a.firstName} ${a.lastName}`).toLowerCase()
          bv = (b.fullName || `${b.firstName} ${b.lastName}`).toLowerCase()
          break
        case 'class':
          av = `${a.class?.name || ''} ${a.section?.name || ''}`.toLowerCase()
          bv = `${b.class?.name || ''} ${b.section?.name || ''}`.toLowerCase()
          break
        case 'adm':
          av = a.admissionNumber || ''
          bv = b.admissionNumber || ''
          break
        case 'roll':
          av = a.rollNumber || ''
          bv = b.rollNumber || ''
          break
        case 'father':
          av = getFatherName(a).toLowerCase()
          bv = getFatherName(b).toLowerCase()
          break
        case 'photoStatus':
          av = a.profileImage ? 1 : 0
          bv = b.profileImage ? 1 : 0
          return (av - bv) * factor
      }

      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * factor
    })
  }, [filteredStudents, sort])

  // Paginated students
  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / (limit === ALL_PAGE_SIZE ? sortedStudents.length || 1 : limit)))
  const paginatedStudents = useMemo(() => {
    if (limit === ALL_PAGE_SIZE) return sortedStudents
    const start = (page - 1) * limit
    return sortedStudents.slice(start, start + limit)
  }, [sortedStudents, page, limit])

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const handleClassFilterChange = (val: string) => {
    setSelectedClassId(val)
    setSelectedSectionId('all')
    setPage(1)
  }

  const handleSectionFilterChange = (val: string) => {
    setSelectedSectionId(val)
    setPage(1)
  }

  const handlePhotoFilterChange = (val: 'all' | 'missing' | 'uploaded') => {
    setPhotoFilter(val)
    setPage(1)
  }

  const clearFilters = () => {
    setSelectedClassId('all')
    setSelectedSectionId('all')
    setPhotoFilter('all')
    setSearchQuery('')
    setPage(1)
  }

  const hasActiveFilters =
    selectedClassId !== 'all' ||
    selectedSectionId !== 'all' ||
    photoFilter !== 'all' ||
    Boolean(searchQuery.trim())

  // Open camera for student
  const handleOpenUpload = (student: Student) => {
    setActiveStudent(student)
    setCameraDialogOpen(true)
  }

  // Save photo handler
  const handleSavePhoto = async (dataUrl: string) => {
    if (!activeStudent) return
    const studentId = activeStudent.id
    const studentName = (activeStudent.fullName || `${activeStudent.firstName} ${activeStudent.lastName}`).trim()
    setUpdatingId(studentId)

    try {
      const res = await api.patch<{ student: Student }>(`/api/school/students/${studentId}`, {
        profileImage: dataUrl,
      })

      const updatedPhotoUrl = res?.student?.profileImage || dataUrl

      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, profileImage: updatedPhotoUrl } : s))
      )

      // If the preview student was the updated one, update preview state too
      setPreviewStudent((prev) =>
        prev && prev.id === studentId ? { ...prev, profileImage: updatedPhotoUrl } : prev
      )

      toast({
        title: 'Photo Updated',
        description: `Profile photo saved for ${studentName}.`,
      })
    } catch (err) {
      toast({
        title: 'Upload Failed',
        description: err instanceof Error ? err.message : 'Failed to update student profile photo.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingId(null)
    }
  }

  // Remove photo handler
  const handleConfirmDeletePhoto = async () => {
    if (!deleteConfirmStudent) return
    const studentId = deleteConfirmStudent.id
    const studentName = (deleteConfirmStudent.fullName || `${deleteConfirmStudent.firstName} ${deleteConfirmStudent.lastName}`).trim()
    setDeletingPhoto(true)

    try {
      await api.patch(`/api/school/students/${studentId}`, {
        profileImage: null,
      })

      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, profileImage: null } : s))
      )

      setPreviewStudent((prev) =>
        prev && prev.id === studentId ? { ...prev, profileImage: null } : prev
      )

      toast({
        title: 'Photo Removed',
        description: `Profile photo removed for ${studentName}.`,
      })
      setDeleteConfirmStudent(null)
    } catch (err) {
      toast({
        title: 'Failed to remove photo',
        description: err instanceof Error ? err.message : 'Could not remove photo.',
        variant: 'destructive',
      })
    } finally {
      setDeletingPhoto(false)
    }
  }

  if (loading && students.length === 0) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* ─── Header (Exact StudentsPage Signature) ─── */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />

        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Camera className="size-5.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Bulk Student Photo Upload</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {stats.total.toLocaleString('en-IN')} students
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">
              Live camera portrait capture and student profile photo management
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => router.push('/students')}
            className="relative shrink-0 gap-1.5 border border-white/40 bg-white/20 text-white backdrop-blur-xs transition-transform hover:-translate-y-0.5 hover:bg-white/30 hover:text-white"
          >
            <ArrowLeft className="size-4" /> Back to Students
          </Button>
        </div>
      </div>

      {/* ─── 4 Stats Cards (Exact StudentStatCard components) ─── */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StudentStatCard
          title="Total Students"
          value={stats.total}
          description="All enrolled students"
          icon={Users}
          tone="sky"
        />
        <StudentStatCard
          title="With Photos"
          value={stats.withPhoto}
          description={`${stats.percent}% uploaded`}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StudentStatCard
          title="Missing Photos"
          value={stats.missing}
          description="Pending photo capture"
          icon={AlertCircle}
          tone="rose"
        />
        <StudentStatCard
          title="Filtered Students"
          value={sortedStudents.length}
          description="Matching current filters"
          icon={GraduationCap}
          tone="violet"
        />
      </div>

      {/* ─── Main Content Card (Matching StudentsPage Card) ─── */}
      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <Camera className="size-4" />
              </span>
              Student Photo Directory
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, adm no, roll..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full bg-background/90 pl-9 shadow-sm sm:w-56 text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Filters Toggle Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters((prev) => !prev)}
                className="gap-1 h-9"
              >
                <ChevronDown
                  className={cn('size-4 transition-transform', showFilters && 'rotate-180')}
                />
                Filters
              </Button>

              {/* View Toggle (Table / Grid) */}
              <div className="flex items-center gap-0.5 bg-background/80 p-0.5 rounded-lg border border-border/80 h-9">
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-7 rounded-md"
                  onClick={() => setViewMode('table')}
                  title="Table View"
                >
                  <List className="size-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-7 rounded-md"
                  onClick={() => setViewMode('grid')}
                  title="Card Gallery View"
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchStudents()}
                disabled={loading}
                className="gap-1 h-9"
              >
                <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                Refresh
              </Button>

              {/* Clear Filters */}
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
          {/* Collapsible Filter Row (Same as StudentsPage) */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-2 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.045] via-transparent to-violet-500/[0.045] px-4 py-3 sm:grid-cols-3 xl:grid-cols-3">
              <Select value={selectedClassId} onValueChange={handleClassFilterChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes ({classes.length})</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedSectionId}
                onValueChange={handleSectionFilterChange}
                disabled={selectedClassId === 'all'}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {filteredSections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={photoFilter} onValueChange={handlePhotoFilterChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Photo Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Photo Status ({stats.total})</SelectItem>
                  <SelectItem value="missing">Missing Photos ({stats.missing})</SelectItem>
                  <SelectItem value="uploaded">With Photo Uploaded ({stats.withPhoto})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Body Content */}
          {sortedStudents.length === 0 && !loading ? (
            <div className="py-12">
              <EmptyState
                icon={Camera}
                title="No Students Found"
                description={
                  hasActiveFilters
                    ? 'No students match your selected filters. Try changing or clearing your filters.'
                    : 'No active student records available.'
                }
                action={
                  hasActiveFilters
                    ? { label: 'Clear Filters', onClick: clearFilters }
                    : undefined
                }
              />
            </div>
          ) : viewMode === 'table' ? (
            /* ─── Table View (Exact styling from StudentsPage) ─── */
            <div className="mx-4 my-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
              <Table>
                <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                  <TableRow>
                    <TableHead className="w-[54px] text-center">
                      <span className="flex items-center justify-center gap-1">
                        <ImageIcon className="size-3.5 text-muted-foreground" />
                      </span>
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label="Student Name"
                        icon={User}
                        sortKey="name"
                        sort={sort}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label="Class & Section"
                        icon={GraduationCap}
                        sortKey="class"
                        sort={sort}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label="Adm.No."
                        icon={IdCard}
                        sortKey="adm"
                        sort={sort}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label="Roll"
                        icon={Hash}
                        sortKey="roll"
                        sort={sort}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label="Father's Name"
                        icon={Users}
                        sortKey="father"
                        sort={sort}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortableHeader
                        label="Photo Status"
                        icon={Camera}
                        sortKey="photoStatus"
                        sort={sort}
                        onSort={handleSort}
                      />
                    </TableHead>
                    <TableHead className="w-[180px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStudents.map((s) => {
                    const studentName = (s.fullName || `${s.firstName} ${s.lastName}`).trim()
                    const hasPhoto = Boolean(s.profileImage)
                    const fatherName = getFatherName(s)
                    const isUpdating = updatingId === s.id

                    return (
                      <TableRow
                        key={s.id}
                        className="transition-colors hover:bg-sky-500/[0.055]"
                      >
                        {/* Photo avatar cell */}
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => (hasPhoto ? setPreviewStudent(s) : handleOpenUpload(s))}
                            className="group/avatar relative size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer mx-auto ring-1 ring-border/60 hover:ring-2 hover:ring-primary transition-all"
                            title={hasPhoto ? 'Click to view photo' : 'Click to take photo'}
                          >
                            {hasPhoto ? (
                              <img
                                src={s.profileImage!}
                                alt={studentName}
                                className="size-full object-cover"
                              />
                            ) : (
                              <User className="size-4.5 text-muted-foreground" />
                            )}
                            <div className="absolute inset-0 bg-black/45 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                              {hasPhoto ? <Eye className="size-3.5" /> : <Camera className="size-3.5" />}
                            </div>
                          </button>
                        </TableCell>

                        {/* Student Name */}
                        <TableCell>
                          <Link
                            href={`/students/${s.id}`}
                            className="font-medium hover:text-primary transition-colors text-sm"
                          >
                            {studentName}
                          </Link>
                        </TableCell>

                        {/* Class & Section */}
                        <TableCell>
                          <span className="font-semibold text-foreground text-xs sm:text-sm">
                            {s.class?.name || '--'}
                          </span>
                          {s.section?.name && (
                            <span className="text-muted-foreground text-xs">
                              {' '}• Sec {s.section.name}
                            </span>
                          )}
                        </TableCell>

                        {/* Adm.No */}
                        <TableCell>
                          <span className="font-mono text-xs sm:text-sm font-semibold text-primary">
                            {s.admissionNumber || '--'}
                          </span>
                        </TableCell>

                        {/* Roll */}
                        <TableCell>
                          <span className="font-mono text-xs sm:text-sm text-muted-foreground">
                            {s.rollNumber || '--'}
                          </span>
                        </TableCell>

                        {/* Father's Name */}
                        <TableCell>
                          <span className="text-xs sm:text-sm text-muted-foreground">
                            {fatherName || '--'}
                          </span>
                        </TableCell>

                        {/* Photo Status */}
                        <TableCell>
                          {hasPhoto ? (
                            <Badge variant="success" className="text-[10px] px-2 py-0.5 h-5 gap-1 font-semibold">
                              <CheckCircle2 className="size-3 text-emerald-600" /> Photo Added
                            </Badge>
                          ) : (
                            <Badge variant="warning" className="text-[10px] px-2 py-0.5 h-5 gap-1 font-semibold">
                              <AlertCircle className="size-3 text-amber-500" /> Missing
                            </Badge>
                          )}
                        </TableCell>

                        {/* Action buttons with bold, high-contrast, crystal-clear text */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {hasPhoto ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenUpload(s)}
                                disabled={isUpdating}
                                className="h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 border-slate-300 dark:border-slate-700 bg-background text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs"
                              >
                                <Camera className="size-3.5 text-primary" />
                                <span className="font-semibold text-slate-900 dark:text-slate-100">Change</span>
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleOpenUpload(s)}
                                disabled={isUpdating}
                                className="h-8 px-3 rounded-lg text-xs font-semibold gap-1.5 bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 shadow-sky-500/15 transition-all"
                              >
                                <Camera className="size-3.5" />
                                <span>Take Photo</span>
                              </Button>
                            )}

                            {hasPhoto && (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setPreviewStudent(s)}
                                  className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                                  title="View Photo in Dialog"
                                >
                                  <Eye className="size-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteConfirmStudent(s)}
                                  className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
                                  title="Remove Photo"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* ─── Compact Grid View ─── */
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
              {paginatedStudents.map((student) => {
                const studentName = (student.fullName || `${student.firstName} ${student.lastName}`).trim()
                const hasPhoto = Boolean(student.profileImage)
                const isUpdating = updatingId === student.id

                return (
                  <Card
                    key={student.id}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border p-2.5 sm:p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                      hasPhoto
                        ? 'border-emerald-200/80 bg-gradient-to-b from-card via-card to-emerald-50/25 dark:border-emerald-500/25 dark:to-emerald-500/5'
                        : 'border-slate-200/80 bg-gradient-to-b from-card via-card to-slate-50/50 dark:border-slate-800 dark:to-slate-900/30 hover:border-sky-300'
                    }`}
                  >
                    {/* Micro meta row */}
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted/60 truncate">
                        #{student.admissionNumber}
                      </span>
                      {student.rollNumber && (
                        <span className="text-[10px] font-semibold text-muted-foreground shrink-0">
                          R-{student.rollNumber}
                        </span>
                      )}
                    </div>

                    {/* Avatar with click-to-view/camera */}
                    <div className="flex flex-col items-center text-center my-0.5">
                      <div className="relative group/avatar mb-1.5">
                        {hasPhoto ? (
                          <button
                            type="button"
                            onClick={() => setPreviewStudent(student)}
                            className="relative size-16 sm:size-17 overflow-hidden rounded-xl border-2 border-emerald-500/40 shadow-xs cursor-pointer group-hover/avatar:border-emerald-500 transition-all block"
                            title="Click to view photo in modal"
                          >
                            <img
                              src={student.profileImage!}
                              alt={studentName}
                              className="size-full object-cover transition-transform duration-300 group-hover/avatar:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye className="size-4" />
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenUpload(student)}
                            className="flex size-16 sm:size-17 items-center justify-center rounded-xl border-2 border-dashed border-sky-300/80 dark:border-sky-500/40 bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-500/10 dark:to-cyan-500/10 text-sky-700 dark:text-sky-300 group-hover/avatar:border-sky-500 group-hover/avatar:scale-105 transition-all cursor-pointer shadow-xs"
                            title="Click to take photo"
                          >
                            <div className="flex flex-col items-center">
                              <Camera className="size-4.5 text-sky-500 mb-0.5" />
                              <span className="text-[8.5px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                                Snap
                              </span>
                            </div>
                          </button>
                        )}

                        {/* Status Pill Dot */}
                        <span
                          className={`absolute -bottom-1 -right-1 flex size-4.5 items-center justify-center rounded-full text-white shadow-xs ${
                            hasPhoto ? 'bg-emerald-500 ring-2 ring-card' : 'bg-amber-500 ring-2 ring-card'
                          }`}
                        >
                          {hasPhoto ? <CheckCircle2 className="size-2.5" /> : <AlertCircle className="size-2.5" />}
                        </span>
                      </div>

                      {/* Student Name */}
                      <h3
                        className="font-bold text-xs sm:text-[13px] text-foreground truncate max-w-full leading-tight"
                        title={studentName}
                      >
                        {studentName}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-medium mt-0.5 truncate max-w-full">
                        {student.class?.name || '--'}
                        {student.section?.name ? ` • Sec ${student.section.name}` : ''}
                      </p>
                    </div>

                    {/* Sleek Action Buttons with visible text */}
                    <div className="mt-2 pt-1.5 border-t border-border/40 flex items-center gap-1.5">
                      {hasPhoto ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenUpload(student)}
                            disabled={isUpdating}
                            className="flex-1 h-7 rounded-lg text-[11px] font-semibold gap-1 border-slate-300 dark:border-slate-700 bg-background text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs"
                          >
                            <Camera className="size-3 text-primary" />
                            <span className="font-semibold text-slate-900 dark:text-slate-100">Change</span>
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => setPreviewStudent(student)}
                            className="size-7 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
                            title="View Photo Modal"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleOpenUpload(student)}
                          disabled={isUpdating}
                          className="w-full h-7 rounded-lg text-[11px] font-semibold gap-1 bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 shadow-sky-500/15"
                        >
                          <Camera className="size-3" />
                          <span>Take Photo</span>
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* ─── Pagination Footer ─── */}
          {sortedStudents.length > 0 && (
            <Pagination
              page={page}
              limit={limit}
              total={sortedStudents.length}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={(newLimit) => {
                setLimit(newLimit)
                setPage(1)
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Profile Photo Dialog (Live Camera & File Upload) ─── */}
      {activeStudent && (
        <ProfilePhotoDialog
          open={cameraDialogOpen}
          onOpenChange={(open) => {
            setCameraDialogOpen(open)
            if (!open) setActiveStudent(null)
          }}
          currentPhoto={activeStudent.profileImage}
          onPhotoSelected={handleSavePhoto}
          title={`Take Photo: ${(activeStudent.fullName || `${activeStudent.firstName} ${activeStudent.lastName}`).trim()}`}
          description={`Class: ${activeStudent.class?.name || '--'} | Adm No: ${activeStudent.admissionNumber}`}
          initialMode="camera"
        />
      )}

      {/* ─── View Photo Modal (Styled to the exact Project Modal convention) ─── */}
      <Dialog
        open={Boolean(previewStudent)}
        onOpenChange={(open) => {
          if (!open) setPreviewStudent(null)
        }}
      >
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-sky-500/20 bg-card p-0 shadow-2xl shadow-sky-500/15 sm:max-w-xl [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          {/* Header conforming to AGENTS.md rule */}
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#0284c7_0%,#0d9488_55%,#059669_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-cyan-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-emerald-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Camera className="size-5 text-white" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold tracking-normal text-white truncate">
                  {previewStudent
                    ? (previewStudent.fullName || `${previewStudent.firstName} ${previewStudent.lastName}`).trim()
                    : 'View Photo'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/80 truncate">
                  {previewStudent?.class?.name
                    ? `${previewStudent.class.name}${previewStudent.section?.name ? ` • Sec ${previewStudent.section.name}` : ''}`
                    : 'Student Profile Picture'}
                  {previewStudent?.admissionNumber ? ` • Adm #${previewStudent.admissionNumber}` : ''}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Modal Body */}
          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-sky-500/[0.03] via-background to-emerald-500/[0.055] p-4 sm:p-5">
            {/* Section 1: Portrait Showcase */}
            <section className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-sky-500/10 sm:p-5">
              <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
              <div className="relative mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-sm">
                    <ImageIcon className="size-4 text-white" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Student Portrait</h3>
                    <p className="text-[10px] text-muted-foreground">Official school identity profile photo</p>
                  </div>
                </div>
                <Badge variant="success" className="text-[10px] font-semibold gap-1">
                  <CheckCircle2 className="size-3 text-emerald-600" /> Active Photo
                </Badge>
              </div>

              <div className="relative mx-auto flex items-center justify-center overflow-hidden rounded-2xl border-2 border-white/80 bg-slate-900/5 p-2 shadow-inner dark:border-white/10 dark:bg-black/30">
                {previewStudent?.profileImage ? (
                  <img
                    src={previewStudent.profileImage}
                    alt={previewStudent.fullName || 'Student'}
                    className="max-h-[320px] w-auto rounded-xl object-contain shadow-md"
                  />
                ) : (
                  <div className="flex h-52 w-full flex-col items-center justify-center text-muted-foreground">
                    <User className="size-12 opacity-40 mb-2" />
                    <p className="text-xs">No profile picture uploaded</p>
                  </div>
                )}
              </div>
            </section>

            {/* Section 2: Student Identity Details */}
            {previewStudent && (
              <section className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900/40 dark:via-card dark:to-slate-900/20">
                <div className="relative mb-3 flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
                    <IdCard className="size-4 text-white" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Student Information</h3>
                    <p className="text-[10px] text-muted-foreground">Academic identification records</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg border border-border/60 bg-background/80 p-2.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Admission No</p>
                    <p className="font-mono font-bold text-foreground mt-0.5 truncate">{previewStudent.admissionNumber || '--'}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-2.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Class & Sec</p>
                    <p className="font-semibold text-foreground mt-0.5 truncate">
                      {previewStudent.class?.name || '--'}{previewStudent.section?.name ? ` (${previewStudent.section.name})` : ''}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-2.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Roll No</p>
                    <p className="font-mono font-bold text-foreground mt-0.5 truncate">{previewStudent.rollNumber || '--'}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-2.5">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Father&apos;s Name</p>
                    <p className="font-semibold text-foreground mt-0.5 truncate">{getFatherName(previewStudent) || '--'}</p>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Footer conforming to AGENTS.md rule */}
          <DialogFooter className="shrink-0 border-t border-primary/10 bg-muted/30 px-4 py-3 sm:px-5 flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const student = previewStudent
                  setPreviewStudent(null)
                  if (student) handleOpenUpload(student)
                }}
                className="h-8 px-3 text-xs font-semibold gap-1.5 bg-gradient-to-r from-sky-500 to-teal-500 text-white hover:from-sky-600 hover:to-teal-600 shadow-sm"
              >
                <Camera className="size-3.5" />
                Retake / Change Photo
              </Button>
              {previewStudent?.profileImage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const student = previewStudent
                    setPreviewStudent(null)
                    if (student) setDeleteConfirmStudent(student)
                  }}
                  className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  Remove
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewStudent(null)}
              className="h-8 px-4 text-xs font-medium"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Remove Photo Confirmation Dialog (Conforming to AGENTS.md modal rule) ─── */}
      <Dialog
        open={Boolean(deleteConfirmStudent)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmStudent(null)
        }}
      >
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-rose-500/20 bg-card p-0 shadow-2xl shadow-rose-500/15 sm:max-w-md [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,#e11d48_0%,#dc2626_48%,#991b1b_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-rose-300/20 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Trash2 className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">
                  Remove Profile Photo
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/80">
                  This action will permanently delete the student&apos;s photo
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-rose-500/[0.04] via-background to-rose-500/[0.02] p-4 sm:p-5">
            <section className="relative overflow-hidden rounded-xl border border-rose-200/80 bg-gradient-to-br from-rose-50 via-white to-rose-50 p-4 shadow-sm dark:border-rose-500/25 dark:from-rose-500/15 dark:via-card dark:to-rose-500/10">
              <p className="text-xs text-foreground leading-relaxed">
                Are you sure you want to remove the profile photo of{' '}
                <strong className="font-bold text-foreground">
                  {(deleteConfirmStudent?.fullName ||
                    `${deleteConfirmStudent?.firstName} ${deleteConfirmStudent?.lastName}`).trim()}
                </strong>{' '}
                (Adm No: #{deleteConfirmStudent?.admissionNumber})?
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                The student avatar will revert to the default placeholder until a new portrait is captured.
              </p>
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-rose-500/10 bg-muted/30 px-4 py-3 sm:px-5 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmStudent(null)}
              disabled={deletingPhoto}
              className="h-8 px-4 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeletePhoto}
              disabled={deletingPhoto}
              className="h-8 px-4 text-xs font-semibold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deletingPhoto ? 'Removing...' : 'Yes, Remove Photo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
