'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
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
  GraduationCap,
  Users,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Eye as EyeIcon,
  EyeOff,
  ShieldCheck,
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
  'Petty Cash': Wallet,
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
  'Petty Cash': 'border-l-yellow-500',
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
  'Petty Cash': 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40',
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

export function SchoolsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [schools, setSchools] = useState<SchoolListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingSchool, setDeletingSchool] = useState<SchoolListItem | null>(null)
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
    router.push(`/admin/schools/${schoolId}`)
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
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Schools</h1>
            <p className="text-sm text-muted-foreground">Manage all registered schools on the platform</p>
          </div>
        </div>
        <Button onClick={() => router.push('/admin/schools/new')} className="gap-2">
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
              <Button onClick={() => router.push('/admin/schools/new')} className="mt-4 gap-2">
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
