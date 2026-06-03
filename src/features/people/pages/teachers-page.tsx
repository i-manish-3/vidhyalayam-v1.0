'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, DataTable, ResetUserPasswordDialog, type Column, type ActionItem } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border bg-background p-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
        <p className="break-words text-xs font-medium leading-5 text-foreground">
          {value || <span className="text-muted-foreground">Not added</span>}
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

  const columns: Column<Teacher>[] = [
    {
      key: 'employeeId',
      label: 'Employee ID',
      className: 'w-[130px]',
      render: (teacher: Teacher) => teacher.employeeId
        ? <span className="font-mono text-sm">{teacher.employeeId}</span>
        : <span className="text-muted-foreground">Not added</span>,
    },
    {
      key: 'name',
      label: 'Teacher',
      className: 'min-w-[240px]',
      render: (teacher: Teacher) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-10 border bg-muted">
            <AvatarImage src={teacher.profileImage || undefined} alt={getTeacherName(teacher)} className="object-cover" />
            <AvatarFallback className="text-xs font-semibold text-muted-foreground">
              {getInitials(teacher)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{getTeacherName(teacher)}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {teacher.phone && (
                <span>{teacher.phone}</span>
              )}
              {!teacher.phone && <span>{teacher.gender || 'No contact added'}</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'specialization',
      label: 'Subject',
      render: (teacher: Teacher) => teacher.specialization
        ? <Badge variant="secondary" className="font-medium">{teacher.specialization}</Badge>
        : <span className="text-muted-foreground">Not assigned</span>,
    },
    {
      key: 'qualification',
      label: 'Qualification',
      render: (teacher: Teacher) => teacher.qualification || <span className="text-muted-foreground">Not added</span>,
    },
    {
      key: 'experience',
      label: 'Experience',
      className: 'w-[120px]',
      render: (teacher: Teacher) => (
        <span className="text-sm">
          {teacher.experience || 0} yr{teacher.experience === 1 ? '' : 's'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      className: 'w-[110px]',
      render: (teacher: Teacher) => (
        <Badge variant={teacher.isActive ? 'default' : 'destructive'} className="font-medium">
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
    <div className="space-y-4">
      <PageHeader title="Teachers" description={`${teachers.length} teachers`} action={{ label: 'Add Teacher', icon: UserPlus, onClick: () => router.push('/teachers/new') }} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Teachers</p>
              <p className="text-lg font-semibold">{teachers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-lg font-semibold">{activeTeachers}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
              <BookOpen className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subjects</p>
              <p className="text-lg font-semibold">{subjectCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <GraduationCap className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg. Exp.</p>
              <p className="text-lg font-semibold">{averageExperience} yrs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Filter className="size-4" />
              </div>
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
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
                  className="h-9 pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={subjectFilter} onValueChange={handleSubjectFilterChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjectOptions.map((subject) => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={experienceFilter} onValueChange={handleExperienceFilterChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Experience</SelectItem>
                  <SelectItem value="0-2">0-2 years</SelectItem>
                  <SelectItem value="3-5">3-5 years</SelectItem>
                  <SelectItem value="6-10">6-10 years</SelectItem>
                  <SelectItem value="10+">10+ years</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2 lg:justify-end">
              <p className="text-xs text-muted-foreground">
                {filteredTeachers.length} shown
              </p>
              {activeFilterCount > 0 && (
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clearFilters}>
                  <X className="size-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filteredTeachers}
        showSearch={false}
        actions={actions}
        isLoading={loading}
        onRowClick={(teacher) => void handleViewTeacher(teacher)}
      />

      <Dialog open={detailOpen} onOpenChange={(open) => {
        setDetailOpen(open)
        if (!open) setSelectedTeacher(null)
      }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto p-4 sm:max-w-2xl">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-base">Teacher Details</DialogTitle>
            <DialogDescription className="text-xs">
              Profile, contact, and professional information.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="size-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : selectedTeacher ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <Avatar className="size-12 border bg-background">
                    <AvatarImage src={selectedTeacher.profileImage || undefined} alt={selectedTeacherName} className="object-cover" />
                    <AvatarFallback className="text-sm font-semibold">
                      {getInitials(selectedTeacher)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-foreground">{selectedTeacherName}</h3>
                      <Badge variant={selectedTeacher.isActive ? 'default' : 'destructive'} className="h-5 px-1.5 text-[10px]">
                        {selectedTeacher.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                      {selectedTeacher.employeeId && <span className="font-mono">{selectedTeacher.employeeId}</span>}
                      {selectedTeacher.specialization && <span>{selectedTeacher.specialization}</span>}
                      <span>
                        {selectedTeacher.experience || 0} yr{selectedTeacher.experience === 1 ? '' : 's'} experience
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <DetailItem icon={Phone} label="Phone" value={selectedTeacher.phone} />
                <DetailItem icon={Mail} label="Email" value={selectedTeacherEmail} />
                <DetailItem icon={UserIcon} label="Gender" value={selectedTeacher.gender} />
                <DetailItem icon={CalendarDays} label="Date of Birth" value={formatDate(selectedTeacher.dateOfBirth)} />
                <DetailItem icon={GraduationCap} label="Qualification" value={selectedTeacher.qualification} />
                <DetailItem icon={BriefcaseBusiness} label="Specialization" value={selectedTeacher.specialization} />
                <DetailItem icon={CalendarDays} label="Join Date" value={formatDate(selectedTeacher.joinDate)} />
                <DetailItem
                  icon={BriefcaseBusiness}
                  label="Experience"
                  value={
                    selectedTeacher.experience > 0
                      ? `${selectedTeacher.experience} year${selectedTeacher.experience === 1 ? '' : 's'}`
                      : null
                  }
                />
                <div className="sm:col-span-2">
                  <DetailItem icon={MapPin} label="Address" value={selectedTeacherAddress || null} />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            {selectedTeacher && (
              <Button size="sm" onClick={() => router.push(`/teachers/${selectedTeacher.id}/edit`)} className="gap-1.5">
                <Pencil className="size-3.5" />
                Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResetUserPasswordDialog
        open={!!resetPasswordTeacher}
        onOpenChange={(open) => {
          if (!open) setResetPasswordTeacher(null)
        }}
        userId={resetPasswordTeacher?.userId ?? null}
        userName={resetPasswordTeacher ? getTeacherName(resetPasswordTeacher) : ''}
        roleLabel="teacher"
      />
    </div>
  )
}
