'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable, ResetUserPasswordDialog, type Column, type ActionItem } from '@/components/shared'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BookOpen, BriefcaseBusiness, CalendarDays, CheckCircle2, Eye, Filter, GraduationCap, KeyRound, Loader2, Mail, MapPin, Pencil, Phone, Search, User as UserIcon, UserCheck, UserPlus, UserX, Users, X } from 'lucide-react'

interface Teacher {
  [key: string]: unknown
  id: string
  userId?: string | null
  firstName: string
  lastName: string
  fullName?: string
  employeeId: string | null
  gender: string | null
  qualification: string | null
  specialization: string | null
  experience: number
  phone?: string | null
  profileImage?: string | null
  isActive: boolean
}

interface TeacherDetail extends Teacher {
  dateOfBirth: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  aadhaarNumber: string | null
  joinDate: string | null
  email: string | null
}

interface TeachersListState {
  search: string
  statusFilter: string
  subjectFilter: string
  experienceFilter: string
}

const TEACHERS_LIST_STATE_KEY = 'teachers:list'

function getTeacherName(teacher: Teacher) {
  return teacher.fullName || `${teacher.firstName} ${teacher.lastName}`.trim()
}

function getInitials(teacher: Teacher) {
  const name = getTeacherName(teacher)
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')

  return initials || 'T'
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const detailItemColors: Record<string, { from: string; to: string; iconBg: string }> = {
  Phone: { from: 'from-emerald-500', to: 'to-cyan-500', iconBg: 'from-emerald-500/10 to-cyan-500/10' },
  Email: { from: 'from-sky-500', to: 'to-blue-600', iconBg: 'from-sky-500/10 to-blue-600/10' },
  Gender: { from: 'from-violet-500', to: 'to-fuchsia-500', iconBg: 'from-violet-500/10 to-fuchsia-500/10' },
  Qualification: { from: 'from-amber-500', to: 'to-rose-500', iconBg: 'from-amber-500/10 to-rose-500/10' },
  Specialization: { from: 'from-cyan-500', to: 'to-teal-600', iconBg: 'from-cyan-500/10 to-teal-600/10' },
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  const colors = detailItemColors[label] || { from: 'from-primary', to: 'to-teal-600', iconBg: 'from-primary/10 to-teal-600/10' }
  return (
    <div className="flex items-start gap-2.5 overflow-hidden rounded-lg border border-primary/5 bg-gradient-to-br from-card via-card to-primary/[0.02] p-2.5 shadow-sm transition-all hover:shadow-md">
      <div className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-muted-foreground shadow-sm', colors.iconBg)}>
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-muted-foreground/80">{label}</p>
        <p className="break-words text-xs font-medium leading-5 text-foreground">
          {value || <span className="italic text-muted-foreground/50">Not added</span>}
        </p>
      </div>
    </div>
  )
}

export function TeachersPage() {
  const router = useRouter()
  const { toast } = useToast()
  const savedListState = useAppStore((state) => state.pageState[TEACHERS_LIST_STATE_KEY] as TeachersListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherDetail | null>(null)
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [statusFilter, setStatusFilter] = useState(savedListState?.statusFilter ?? 'all')
  const [subjectFilter, setSubjectFilter] = useState(savedListState?.subjectFilter ?? 'all')
  const [experienceFilter, setExperienceFilter] = useState(savedListState?.experienceFilter ?? 'all')
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [resetPasswordTeacher, setResetPasswordTeacher] = useState<Teacher | null>(null)

  const fetchTeachers = useCallback(async () => {
    try {
      const data = await api.get<{ teachers: Teacher[] }>('/api/school/teachers')
      setTeachers(data.teachers || [])
    } catch { toast({ title: "Couldn't Load Teachers", description: "We couldn't load the teachers list. Please refresh the page.", variant: 'destructive' }) }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchTeachers() }, [fetchTeachers])

  const activeTeachers = teachers.filter((teacher) => teacher.isActive).length
  const subjectCount = new Set(teachers.map((teacher) => teacher.specialization).filter(Boolean)).size
  const averageExperience = teachers.length
    ? Math.round(teachers.reduce((sum, teacher) => sum + (teacher.experience || 0), 0) / teachers.length)
    : 0
  const subjectOptions = useMemo(
    () => Array.from(new Set(teachers.map((teacher) => teacher.specialization).filter(Boolean) as string[])).sort(),
    [teachers]
  )
  const filteredTeachers = useMemo(() => {
    const filtered = teachers.filter((teacher) => {
      const searchText = [
        getTeacherName(teacher),
        teacher.employeeId,
        teacher.phone,
        teacher.specialization,
        teacher.qualification,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) return false
      if (statusFilter === 'active' && !teacher.isActive) return false
      if (statusFilter === 'inactive' && teacher.isActive) return false
      if (subjectFilter !== 'all' && teacher.specialization !== subjectFilter) return false

      const experience = teacher.experience || 0
      if (experienceFilter === '0-2' && experience > 2) return false
      if (experienceFilter === '3-5' && (experience < 3 || experience > 5)) return false
      if (experienceFilter === '6-10' && (experience < 6 || experience > 10)) return false
      if (experienceFilter === '10+' && experience < 10) return false

      return true
    })

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    return filtered.sort((a, b) => {
      const aId = a.employeeId ?? ''
      const bId = b.employeeId ?? ''
      if (!aId && !bId) return 0
      if (!aId) return 1
      if (!bId) return -1
      return collator.compare(aId, bId)
    })
  }, [experienceFilter, search, statusFilter, subjectFilter, teachers])
  const activeFilterCount = [search, statusFilter, subjectFilter, experienceFilter].filter((value) => value.trim() && value !== 'all').length

  const rememberListState = useCallback((patch: Partial<TeachersListState>) => {
    setPageState(TEACHERS_LIST_STATE_KEY, {
      search,
      statusFilter,
      subjectFilter,
      experienceFilter,
      ...patch,
    })
  }, [experienceFilter, search, setPageState, statusFilter, subjectFilter])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setSubjectFilter('all')
    setExperienceFilter('all')
    rememberListState({ search: '', statusFilter: 'all', subjectFilter: 'all', experienceFilter: 'all' })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    rememberListState({ search: value })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    rememberListState({ statusFilter: value })
  }

  const handleSubjectFilterChange = (value: string) => {
    setSubjectFilter(value)
    rememberListState({ subjectFilter: value })
  }

  const handleExperienceFilterChange = (value: string) => {
    setExperienceFilter(value)
    rememberListState({ experienceFilter: value })
  }

  const handleToggleStatus = async (teacher: Teacher) => {
    if (updatingStatusId) return

    const nextStatus = !teacher.isActive
    setUpdatingStatusId(teacher.id)
    try {
      await api.patch(`/api/school/teachers/${teacher.id}`, { isActive: nextStatus })
      toast({
        title: nextStatus ? 'Teacher Enabled' : 'Teacher Disabled',
        description: `${getTeacherName(teacher)} ${nextStatus ? 'can now log in again.' : 'can no longer log in.'}`,
      })
      await fetchTeachers()
    } catch (err) {
      toast({
        title: nextStatus ? "Couldn't Enable Teacher" : "Couldn't Disable Teacher",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const handleViewTeacher = async (teacher: Teacher) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setSelectedTeacher(null)

    try {
      const data = await api.get<TeacherDetail>(`/api/school/teachers/${teacher.id}`)
      setSelectedTeacher(data)
    } catch (err) {
      setDetailOpen(false)
      toast({
        title: "Couldn't Load Teacher",
        description: err instanceof Error ? err.message : "We couldn't load this teacher's details. Please try again.",
        variant: 'destructive',
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const subjectColor = (subject: string | null) => {
    const colors = [
      { bg: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300', dot: 'bg-sky-500' },
      { bg: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300', dot: 'bg-violet-500' },
      { bg: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300', dot: 'bg-emerald-500' },
      { bg: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300', dot: 'bg-amber-500' },
      { bg: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300', dot: 'bg-rose-500' },
      { bg: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20 dark:text-cyan-300', dot: 'bg-cyan-500' },
      { bg: 'bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/20 dark:text-fuchsia-300', dot: 'bg-fuchsia-500' },
    ]
    if (!subject) return colors[0]
    let hash = 0
    for (let i = 0; i < subject.length; i++) { hash = subject.charCodeAt(i) + ((hash << 5) - hash) }
    return colors[Math.abs(hash) % colors.length]
  }

  const columns: Column<Teacher>[] = [
    {
      key: 'employeeId',
      label: 'Employee ID',
      className: 'w-[130px]',
      render: (teacher: Teacher) => teacher.employeeId
        ? <span className="font-mono text-xs font-semibold tracking-tight text-primary/80">{teacher.employeeId}</span>
        : <span className="text-xs text-muted-foreground/60 italic">Not added</span>,
    },
    {
      key: 'name',
      label: 'Teacher',
      className: 'min-w-[240px]',
      render: (teacher: Teacher) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-10 border-2 border-primary/10 shadow-sm">
            <AvatarImage src={teacher.profileImage || undefined} alt={getTeacherName(teacher)} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 text-xs font-bold text-white shadow-sm">
              {getInitials(teacher)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{getTeacherName(teacher)}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              {teacher.phone ? (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Phone className="size-3 text-muted-foreground/50" />
                  {teacher.phone}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground/50">
                  <UserIcon className="size-3" />
                  {teacher.gender || 'No contact'}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'specialization',
      label: 'Subject',
      render: (teacher: Teacher) => {
        const sc = subjectColor(teacher.specialization)
        return teacher.specialization
          ? <Badge variant="outline" className={cn('gap-1.5 border text-[11px] font-medium', sc.bg)}>
              <span className={cn('size-1.5 rounded-full', sc.dot)} />
              {teacher.specialization}
            </Badge>
          : <span className="text-xs text-muted-foreground/60 italic">Not assigned</span>
      },
    },
    {
      key: 'qualification',
      label: 'Qualification',
      render: (teacher: Teacher) => teacher.qualification
        ? <span className="text-sm font-medium text-foreground/80">{teacher.qualification}</span>
        : <span className="text-xs text-muted-foreground/60 italic">Not added</span>,
    },
    {
      key: 'experience',
      label: 'Experience',
      className: 'w-[120px]',
      render: (teacher: Teacher) => {
        const exp = teacher.experience || 0
        return (
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex h-6 w-10 items-center justify-center rounded-md text-[11px] font-bold text-white shadow-sm',
              exp >= 10 ? 'bg-gradient-to-br from-amber-500 to-rose-500' :
              exp >= 5 ? 'bg-gradient-to-br from-emerald-500 to-cyan-500' :
              exp > 0 ? 'bg-gradient-to-br from-sky-500 to-blue-600' :
              'bg-gradient-to-br from-muted-foreground/40 to-muted-foreground/20'
            )}>
              {exp}
            </div>
            <span className="text-xs text-muted-foreground">yr{exp === 1 ? '' : 's'}</span>
          </div>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      className: 'w-[110px]',
      render: (teacher: Teacher) => (
        <Badge className={cn(
          'gap-1.5 border text-[11px] font-semibold',
          teacher.isActive
            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
        )}>
          <span className={cn('size-1.5 rounded-full', teacher.isActive ? 'bg-emerald-500' : 'bg-rose-500')} />
          {teacher.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ]

  const actions = (teacher: Teacher): ActionItem[] => {
    const isUpdating = updatingStatusId === teacher.id
    return [
      {
        label: 'View Details',
        icon: Eye,
        onClick: () => void handleViewTeacher(teacher),
      },
      {
        label: 'Edit',
        icon: Pencil,
        onClick: () => router.push(`/teachers/${teacher.id}/edit`),
      },
      {
        label: 'Reset Password',
        icon: KeyRound,
        onClick: () => setResetPasswordTeacher(teacher),
        disabled: !teacher.userId,
      },
      {
        label: isUpdating ? 'Updating...' : teacher.isActive ? 'Disable' : 'Enable',
        icon: isUpdating ? Loader2 : teacher.isActive ? UserX : UserCheck,
        onClick: () => void handleToggleStatus(teacher),
        variant: teacher.isActive ? 'destructive' : 'default',
        disabled: isUpdating,
      },
    ]
  }

  const selectedTeacherName = selectedTeacher ? getTeacherName(selectedTeacher) : 'Teacher Details'
  const selectedTeacherEmail = selectedTeacher?.email && !selectedTeacher.email.endsWith('@teacher.local')
    ? selectedTeacher.email
    : null
  const selectedTeacherAddress = selectedTeacher
    ? [selectedTeacher.address, selectedTeacher.city, selectedTeacher.state, selectedTeacher.pincode].filter(Boolean).join(', ')
    : ''

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div aria-hidden className="absolute left-1/4 top-0 size-16 rounded-full bg-teal-300/8 blur-sm" />
        <div aria-hidden className="absolute bottom-4 left-[15%] size-10 rounded-full bg-cyan-300/10 blur-md" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <GraduationCap className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Teachers</h1>
            <p className="mt-0.5 text-xs text-white/80">{teachers.length} teacher{teachers.length !== 1 ? 's' : ''} on record</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/teachers/new')}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <UserPlus className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Add Teacher</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="group relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-primary/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-primary/5 transition-all group-hover:scale-110" />
          <div aria-hidden className="absolute -bottom-3 left-8 size-10 rounded-full bg-primary/[0.03]" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm shadow-primary/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <Users className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Teachers</p>
              <p className="mt-0.5 text-2xl font-bold">{teachers.length}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-card to-emerald-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-emerald-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-emerald-500/5 transition-all group-hover:scale-110" />
          <div aria-hidden className="absolute -bottom-3 left-8 size-10 rounded-full bg-emerald-500/[0.03]" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active</p>
              <p className="mt-0.5 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{activeTeachers}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.07] via-card to-sky-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-sky-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-sky-500/5 transition-all group-hover:scale-110" />
          <div aria-hidden className="absolute -bottom-3 left-8 size-10 rounded-full bg-sky-500/[0.03]" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm shadow-sky-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <BookOpen className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Subjects</p>
              <p className="mt-0.5 text-2xl font-bold text-sky-600 dark:text-sky-400">{subjectCount}</p>
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.07] via-card to-amber-500/[0.03] p-4 shadow-sm transition-all hover:shadow-md hover:border-amber-500/40">
          <div aria-hidden className="absolute -right-5 -top-5 size-20 rounded-full border-[14px] border-amber-500/5 transition-all group-hover:scale-110" />
          <div aria-hidden className="absolute -bottom-3 left-8 size-10 rounded-full bg-amber-500/[0.03]" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20 transition-all group-hover:scale-110 group-hover:shadow-md">
              <GraduationCap className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Avg. Exp.</p>
              <p className="mt-0.5 text-2xl font-bold text-amber-600 dark:text-amber-400">{averageExperience} yrs</p>
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

          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.25fr)_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search name, ID, phone..."
                className="h-9 border-primary/15 bg-background pl-9 transition-all focus-visible:border-primary/30"
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-500" />Active</span>
                </SelectItem>
                <SelectItem value="inactive">
                  <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-500" />Inactive</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={subjectFilter} onValueChange={handleSubjectFilterChange}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Subject" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Subjects</SelectItem>
                {subjectOptions.map((subject) => {
                  const sc = subjectColor(subject)
                  return (
                    <SelectItem key={subject} value={subject}>
                      <span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', sc.dot)} />{subject}</span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Select value={experienceFilter} onValueChange={handleExperienceFilterChange}>
              <SelectTrigger className="h-9 border-primary/15 bg-background"><SelectValue placeholder="Experience" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Experience</SelectItem>
                {['0-2', '3-5', '6-10', '10+'].map((range) => (
                  <SelectItem key={range} value={range}>
                    <span className="flex items-center gap-2">
                      <span className={cn(
                        'size-2 rounded-full',
                        range === '0-2' ? 'bg-sky-500' : range === '3-5' ? 'bg-emerald-500' : range === '6-10' ? 'bg-amber-500' : 'bg-rose-500'
                      )} />
                      {range} years
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 lg:justify-end">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">{filteredTeachers.length}</span> shown
            </p>
            {activeFilterCount > 0 && (
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/20" onClick={clearFilters}>
                <X className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-card via-card to-sky-500/[0.02] shadow-sm">
        <DataTable
          columns={columns}
          data={filteredTeachers}
          showSearch={false}
          actions={actions}
          isLoading={loading}
          onRowClick={(teacher) => void handleViewTeacher(teacher)}
        />
      </div>

      {/* Gradient Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={(open) => {
        setDetailOpen(open)
        if (!open) setSelectedTeacher(null)
      }}>
        <DialogContent className="gap-0 overflow-hidden border-primary/15 p-0 shadow-xl shadow-primary/10 sm:max-w-2xl">
          <div className="relative bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 text-white">
            <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full border-[15px] border-cyan-200/15" />
            <div aria-hidden className="absolute -bottom-6 right-12 size-16 rounded-full bg-cyan-300/8" />
            <div aria-hidden className="absolute left-8 top-2 size-12 rounded-full bg-white/5 blur-md" />
            <div aria-hidden className="absolute bottom-0 left-1/3 h-px w-24 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-md backdrop-blur-sm">
                <GraduationCap className="size-4.5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-base font-semibold text-white">Teacher Details</DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">Profile, contact, and professional information.</DialogDescription>
              </div>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055]">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="size-7 animate-spin text-primary/50" />
              </div>
            ) : selectedTeacher ? (
              <div className="space-y-3 p-4">
                {/* Profile Summary */}
                <div className="relative overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.03] via-card to-cyan-500/[0.03] p-4 shadow-sm">
                  <div aria-hidden className="absolute -right-4 -top-4 size-16 rounded-full border-[12px] border-primary/5" />
                  <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Avatar className="size-14 shrink-0 border-2 border-primary/20 shadow-sm">
                      <AvatarImage src={selectedTeacher.profileImage || undefined} alt={selectedTeacherName} className="object-cover" />
                      <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 text-sm font-bold text-white">
                        {getInitials(selectedTeacher)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold">{selectedTeacherName}</h3>
                        <Badge className={cn(
                          'h-5 gap-1.5 px-1.5 text-[10px] font-semibold',
                          selectedTeacher.isActive
                            ? 'border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-pink-500/10 text-rose-700 dark:text-rose-300'
                        )}>
                          <span className={cn('size-1.5 rounded-full', selectedTeacher.isActive ? 'bg-emerald-500' : 'bg-rose-500')} />
                          {selectedTeacher.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {selectedTeacher.employeeId && <span className="font-mono font-semibold text-primary/70">{selectedTeacher.employeeId}</span>}
                        {selectedTeacher.specialization && (
                          <span className="flex items-center gap-1"><BookOpen className="size-3 text-primary/50" />{selectedTeacher.specialization}</span>
                        )}
                        <span className="flex items-center gap-1">{selectedTeacher.experience || 0} yr{selectedTeacher.experience === 1 ? '' : 's'} experience</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Info */}
                <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-sky-50 p-3 dark:border-sky-800/30 dark:from-sky-950/20 dark:via-card dark:to-sky-950/20">
                  <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-sky-500/5" />
                  <div className="relative flex items-center gap-2 mb-2.5">
                    <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                      <UserIcon className="size-3" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Personal Info</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DetailItem icon={Phone} label="Phone" value={selectedTeacher.phone} />
                    <DetailItem icon={Mail} label="Email" value={selectedTeacherEmail} />
                    <DetailItem icon={UserIcon} label="Gender" value={selectedTeacher.gender} />
                    <DetailItem icon={CalendarDays} label="Date of Birth" value={formatDate(selectedTeacher.dateOfBirth)} />
                  </div>
                </div>

                {/* Professional Info */}
                <div className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-amber-50 p-3 dark:border-amber-800/30 dark:from-amber-950/20 dark:via-card dark:to-amber-950/20">
                  <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-amber-500/5" />
                  <div className="relative flex items-center gap-2 mb-2.5">
                    <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                      <BriefcaseBusiness className="size-3" />
                    </span>
                    <span className="text-xs font-semibold text-foreground/80">Professional Info</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <DetailItem icon={GraduationCap} label="Qualification" value={selectedTeacher.qualification} />
                    <DetailItem icon={BriefcaseBusiness} label="Specialization" value={selectedTeacher.specialization} />
                    <DetailItem icon={CalendarDays} label="Join Date" value={formatDate(selectedTeacher.joinDate)} />
                    <DetailItem icon={BriefcaseBusiness} label="Experience" value={selectedTeacher.experience > 0 ? `${selectedTeacher.experience} year${selectedTeacher.experience === 1 ? '' : 's'}` : null} />
                  </div>
                </div>

                {/* Address */}
                {selectedTeacherAddress && (
                  <div className="relative overflow-hidden rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-violet-50 p-3 dark:border-violet-800/30 dark:from-violet-950/20 dark:via-card dark:to-violet-950/20">
                    <div aria-hidden className="absolute -right-4 -top-4 size-14 rounded-full border-[10px] border-violet-500/5" />
                    <div className="relative flex items-center gap-2 mb-2.5">
                      <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/20">
                        <MapPin className="size-3" />
                      </span>
                      <span className="text-xs font-semibold text-foreground/80">Address</span>
                    </div>
                    <p className="text-sm font-medium text-foreground/80">{selectedTeacherAddress}</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="border-t border-primary/10 bg-background px-5 py-3">
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
              {selectedTeacher && (
                <Button size="sm" onClick={() => router.push(`/teachers/${selectedTeacher.id}/edit`)} className="gap-2">
                  <Pencil className="size-3.5" /> Edit
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ResetUserPasswordDialog
        open={!!resetPasswordTeacher}
        onOpenChange={(open) => { if (!open) setResetPasswordTeacher(null) }}
        userId={resetPasswordTeacher?.userId ?? null}
        userName={resetPasswordTeacher ? getTeacherName(resetPasswordTeacher) : ''}
        roleLabel="teacher"
      />
    </div>
  )
}
