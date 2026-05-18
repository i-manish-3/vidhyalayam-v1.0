'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAppStore, type PageName } from '@/lib/store'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Power,
  PowerOff,
  Loader2,
  MapPin,
  Phone,
  Mail,
  Globe,
  GraduationCap,
  Users,
  Calendar,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Eye as EyeIcon,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ClipboardList,
  CalendarCheck,
  DollarSign,
  BookOpen,
  Bus,
  Library,
  Package,
  Wallet,
  Bell,
  Megaphone,
  Clock,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  subdomain: string
  status: string
  trialEndsAt?: string
  onboardingDate?: string
  academicYear?: string
  board?: string
  studentCount: number
  teacherCount: number
  admin: SchoolAdmin | null
  createdAt: string
}

interface Permission {
  id: string
  code: string
  name: string
  module: string
  description?: string
  action: string
}

interface FormData {
  name: string
  subdomain: string
  address: string
  city: string
  state: string
  pincode: string
  country: string
  contactPhone: string
  contactEmail: string
  website: string
  academicYear: string
  board: string
  adminName: string
  adminEmail: string
  adminPassword: string
  adminPhone: string
  status: string
}

const emptyForm: FormData = {
  name: '',
  subdomain: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  contactPhone: '',
  contactEmail: '',
  website: '',
  academicYear: '2025-2026',
  board: 'CBSE',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  adminPhone: '',
  status: 'active',
}

const MODULE_ICONS: Record<string, LucideIcon> = {
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
  'Petty Cash': Wallet,
  Notifications: Bell,
  Announcements: Megaphone,
  Classes: GraduationCap,
  Subjects: BookOpen,
  Settings: Settings,
  'Roles & Permissions': ShieldCheck,
}

const MODULE_BORDER_COLORS: Record<string, string> = {
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
  'Petty Cash': 'border-l-yellow-500',
  Notifications: 'border-l-red-500',
  Announcements: 'border-l-fuchsia-500',
  Classes: 'border-l-indigo-500',
  Subjects: 'border-l-purple-500',
  Settings: 'border-l-gray-500',
  'Roles & Permissions': 'border-l-slate-500',
}

const MODULE_COLORS: Record<string, string> = {
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
  'Petty Cash': 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40',
  Notifications: 'text-red-600 bg-red-50 dark:bg-red-950/40',
  Announcements: 'text-fuchsia-600 bg-fuchsia-50 dark:bg-fuchsia-950/40',
  Classes: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40',
  Subjects: 'text-purple-600 bg-purple-50 dark:bg-purple-950/40',
  Settings: 'text-gray-600 bg-gray-50 dark:bg-gray-950/40',
  'Roles & Permissions': 'text-slate-600 bg-slate-50 dark:bg-slate-950/40',
}

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE', 'NIOS', 'Other']
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-800' },
  { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'trial', label: 'Trial', color: 'bg-blue-100 text-blue-800' },
  { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-800' },
]

export function SchoolsPage() {
  const { toast } = useToast()
  const { setCurrentPage, setSelectedSchoolId } = useAppStore()
  const [schools, setSchools] = useState<SchoolListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingSchool, setDeletingSchool] = useState<SchoolListItem | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 10
  const [resetSchool, setResetSchool] = useState<SchoolListItem | null>(null)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [permissionModules, setPermissionModules] = useState<Record<string, Permission[]>>({})
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([])
  const [loadingPermissions, setLoadingPermissions] = useState(false)

  const fetchData = useCallback(async (page = 1) => {
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(pageSize),
      }
      if (search) params.search = search
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter

      const res = await api.get<{ schools: SchoolListItem[]; pagination: { total: number; totalPages: number } }>('/api/super-admin/schools', params)
      setSchools(res.schools || [])
      setTotalPages(res.pagination?.totalPages || 1)
    } catch {
      toast({ title: "Couldn't Load Schools", description: "We couldn't load the schools. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, toast])

  useEffect(() => { fetchData(page) }, [fetchData, page])

  // Fetch permissions catalog when dialog opens
  useEffect(() => {
    if (showAddDialog) {
      setLoadingPermissions(true)
      api.get<{ modules: Record<string, Permission[]> }>('/api/super-admin/permissions')
        .then((res) => {
          const modules = res.modules || {}
          setPermissionModules(modules)
          // Auto-select all permissions by default
          const allIds = Object.values(modules).flatMap((perms) => perms.map((p) => p.id))
          setSelectedPermissionIds(allIds)
        })
        .catch(() => {
          toast({ title: "Couldn't Load Permissions", description: "We couldn't load the permissions catalog. Please refresh the page.", variant: 'destructive' })
        })
        .finally(() => setLoadingPermissions(false))
    } else {
      setPermissionModules({})
      setSelectedPermissionIds([])
    }
  }, [showAddDialog, toast])

  const handleAdd = async () => {
    if (!form.name || !form.subdomain || !form.adminName || !form.adminEmail || !form.adminPassword) {
      toast({ title: 'Missing Information', description: 'Please fill in all required fields (School Name, Subdomain, Admin Name, Email, and Password).', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/super-admin/schools', { ...form, permissionIds: selectedPermissionIds })
      toast({ title: 'Success', description: `${form.name} has been created successfully.` })
      setShowAddDialog(false)
      setForm(emptyForm)
      setPermissionModules({})
      setSelectedPermissionIds([])
      fetchData(1)
    } catch (err) {
      toast({ title: "Couldn't Create School", description: err instanceof Error ? err.message : "We couldn't create the school. Please try again.", variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

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
    setSaving(true)
    try {
      await api.delete(`/api/super-admin/schools/${deletingSchool.id}`)
      toast({ title: 'Success', description: `${deletingSchool.name} has been deleted.` })
      setShowDeleteDialog(false)
      setDeletingSchool(null)
      fetchData(page)
    } catch (err) {
      toast({ title: "Couldn't Delete School", description: err instanceof Error ? err.message : "We couldn't delete the school. Please try again.", variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const viewSchool = (schoolId: string) => {
    setSelectedSchoolId(schoolId)
    setCurrentPage('school-detail' as PageName)
  }

  const statusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find(o => o.value === status)
    if (!option) return <Badge>{status}</Badge>
    return <Badge className={cn(option.color, 'hover:opacity-90')}>{option.label}</Badge>
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schools</h1>
          <p className="text-sm text-muted-foreground">Manage all registered schools on the platform</p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2">
          <PlusCircle className="size-4" />
          Add School
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search schools by name, city, or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Schools Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : schools.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="size-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">No Schools Found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Add your first school to get started.'}
            </p>
            {!search && statusFilter === 'all' && (
              <Button onClick={() => setShowAddDialog(true)} className="mt-4 gap-2">
                <PlusCircle className="size-4" />
                Add School
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">School</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Students</TableHead>
                  <TableHead className="text-center">Teachers</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schools.map((school) => (
                  <TableRow
                    key={school.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => viewSchool(school.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          {school.logo ? (
                            <img src={school.logo} alt={school.name} className="size-9 rounded-lg object-cover" />
                          ) : (
                            <GraduationCap className="size-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{school.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{school.subdomain}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <MapPin className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{school.city || '-'}, {school.state || ''}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{school.board || '-'}</Badge>
                    </TableCell>
                    <TableCell>{statusBadge(school.status)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="size-3 text-muted-foreground" />
                        <span className="text-sm">{school.studentCount}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="size-3 text-muted-foreground" />
                        <span className="text-sm">{school.teacherCount}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {school.admin ? (
                        <div className="min-w-0">
                          <p className="text-sm truncate">{school.admin.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{school.admin.email}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(school.createdAt)}</TableCell>
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
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add School Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New School</DialogTitle>
            <DialogDescription>Add a new school to the platform. Fill in the details below.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="school-info" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="school-info">School Info</TabsTrigger>
              <TabsTrigger value="contact-info">Contact & Address</TabsTrigger>
              <TabsTrigger value="admin-info">Admin Account</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>

            <TabsContent value="school-info" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>School Name *</Label>
                  <Input placeholder="e.g., Delhi Public School" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Subdomain *</Label>
                  <Input placeholder="e.g., dpsdelhi" value={form.subdomain} onChange={e => setForm(f => ({ ...f, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
                  <p className="text-xs text-muted-foreground">Will be used as: {form.subdomain || 'school'}.mydigitalacademy.in</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Board *</Label>
                  <Select value={form.board} onValueChange={v => setForm(f => ({ ...f, board: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BOARDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Academic Year</Label>
                  <Input placeholder="2025-2026" value={form.academicYear} onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Initial Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="contact-info" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <Input placeholder="Street address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input placeholder="City" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input placeholder="State" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pincode</Label>
                  <Input placeholder="110001" value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input placeholder="India" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="+91 98765 43210" className="pl-9" value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Contact Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input type="email" placeholder="info@school.com" className="pl-9" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="https://www.school.com" className="pl-9" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="admin-info" className="space-y-4 mt-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 mb-2">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  This admin account will be the primary administrator for the school. They can manage all aspects of the school after logging in.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Admin Name *</Label>
                  <Input placeholder="Full Name" value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Admin Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input type="email" placeholder="admin@school.com" className="pl-9" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input type="password" placeholder="Min 6 characters" value={form.adminPassword} onChange={e => setForm(f => ({ ...f, adminPassword: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Admin Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="+91 98765 43210" className="pl-9" value={form.adminPhone} onChange={e => setForm(f => ({ ...f, adminPhone: e.target.value }))} />
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="permissions" className="space-y-4 mt-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  Select which modules and features this school will have access to. You can modify these later from the Permissions page.
                </p>
              </div>

              {loadingPermissions ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      {Object.keys(permissionModules).filter(
                        (mod) => permissionModules[mod].some((p) => selectedPermissionIds.includes(p.id))
                      ).length} of {Object.keys(permissionModules).length} modules selected ({selectedPermissionIds.length} permissions)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const allIds = Object.values(permissionModules).flatMap((perms) => perms.map((p) => p.id))
                          setSelectedPermissionIds(allIds)
                        }}
                      >
                        <CheckCircle2 className="size-3.5 mr-1" />
                        Select All Modules
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPermissionIds([])}
                      >
                        <XCircle className="size-3.5 mr-1" />
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-[400px]">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pr-1 pb-2">
                      {Object.entries(permissionModules).map(([moduleName, permissions]) => {
                        const IconComponent = MODULE_ICONS[moduleName] || ShieldCheck
                        const borderColor = MODULE_BORDER_COLORS[moduleName] || 'border-l-gray-500'
                        const colorClass = MODULE_COLORS[moduleName] || 'text-gray-600 bg-gray-50 dark:bg-gray-950/40'
                        const modulePermIds = permissions.map((p) => p.id)
                        const isModuleEnabled = modulePermIds.some((id) => selectedPermissionIds.includes(id))
                        const selectedInModule = modulePermIds.filter((id) => selectedPermissionIds.includes(id)).length

                        return (
                          <Card
                            key={moduleName}
                            className={cn(
                              'border-l-4 transition-shadow hover:shadow-md',
                              borderColor,
                              !isModuleEnabled && 'opacity-60'
                            )}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={cn('size-7 rounded-md flex items-center justify-center shrink-0', colorClass)}>
                                    <IconComponent className="size-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{moduleName}</p>
                                    <Badge variant="secondary" className="text-[10px] mt-0.5">
                                      {permissions.length} permissions
                                    </Badge>
                                  </div>
                                </div>
                                <Switch
                                  checked={isModuleEnabled}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedPermissionIds((prev) => [...new Set([...prev, ...modulePermIds])])
                                    } else {
                                      setSelectedPermissionIds((prev) => prev.filter((id) => !modulePermIds.includes(id)))
                                    }
                                  }}
                                />
                              </div>
                              {isModuleEnabled && selectedInModule < modulePermIds.length && (
                                <p className="text-[11px] text-muted-foreground mt-2">
                                  {selectedInModule} of {modulePermIds.length} enabled
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </>
              )}
            </TabsContent>

          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setForm(emptyForm) }}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !form.name || !form.subdomain || !form.adminName || !form.adminEmail || !form.adminPassword}>
              {saving ? <><Loader2 className="size-4 animate-spin mr-2" />Creating...</> : 'Create School'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete School</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deletingSchool?.name}</strong>? This action cannot be undone. All data associated with this school will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDeleteDialog(false); setDeletingSchool(null) }}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <><Loader2 className="size-4 animate-spin mr-2" />Deleting...</> : 'Delete School'}
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
