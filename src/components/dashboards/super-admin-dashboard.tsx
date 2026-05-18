'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { StatsCard } from '@/components/shared'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/api'
import {
  School, CheckCircle, Clock, Users, Building2, ShieldCheck, Lock,
  ArrowRight, Plus, Search, Save, Trash2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { LoadingState } from '@/components/shared'

const COLORS = ['oklch(0.596 0.145 163.225)', 'oklch(0.562 0.118 175.5)', 'oklch(0.769 0.159 57.7)', 'oklch(0.577 0.245 27.325)', 'oklch(0.558 0.214 293)']

const mockGrowthData = [
  { month: 'Jan', schools: 12 },
  { month: 'Feb', schools: 18 },
  { month: 'Mar', schools: 22 },
  { month: 'Apr', schools: 28 },
  { month: 'May', schools: 35 },
  { month: 'Jun', schools: 42 },
  { month: 'Jul', schools: 48 },
  { month: 'Aug', schools: 55 },
  { month: 'Sep', schools: 62 },
  { month: 'Oct', schools: 68 },
  { month: 'Nov', schools: 74 },
  { month: 'Dec', schools: 80 },
]

const mockStatusData = [
  { name: 'Active', value: 42 },
  { name: 'Trial', value: 18 },
  { name: 'Pending', value: 8 },
  { name: 'Suspended', value: 3 },
]

const PRESET_COLORS = [
  '#10b981', '#059669', '#8b5cf6', '#6366f1', '#ec4899',
  '#f59e0b', '#06b6d4', '#ef4444', '#0ea5e9', '#14b8a6',
]

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoleListItem {
  id: string
  name: string
  description?: string | null
  color?: string | null
  isSystem: boolean
  isActive: boolean
  createdAt: string
  permissionCount: number
  userCount: number
  school: { id: string; name: string; primaryColor?: string | null } | null
}

interface SchoolOption {
  id: string
  name: string
  status: string
  subdomain: string
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SuperAdminDashboard() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<{
    totalSchools: number
    activeSchools: number
    trialSchools: number
    totalStudents: number
    totalTeachers: number
  } | null>(null)
  const [schools, setSchools] = useState<SchoolOption[]>([])

  // School-roles state
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('')
  const [schoolRoles, setSchoolRoles] = useState<RoleListItem[]>([])
  const [loadingRoles, setLoadingRoles] = useState(false)
  const [roleSearch, setRoleSearch] = useState('')

  // Create role dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [newRoleColor, setNewRoleColor] = useState(PRESET_COLORS[0])
  const [creating, setCreating] = useState(false)

  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const setSelectedSuperAdminRoleId = useAppStore((s) => s.setSelectedSuperAdminRoleId)

  // ── Initial data fetch ──
  useEffect(() => {
    async function fetchData() {
      try {
        const [analyticsData, schoolsData] = await Promise.all([
          api.get<{
            totalSchools: number
            activeSchools: number
            trialSchools: number
            totalStudents: number
            totalTeachers: number
          }>('/api/super-admin/analytics'),
          api.get<{ schools: SchoolOption[] }>('/api/super-admin/schools'),
        ])
        setAnalytics(analyticsData)
        setSchools(schoolsData.schools || [])
      } catch {
        // Use defaults
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // ── Fetch roles when school is selected ──
  const fetchSchoolRoles = useCallback(async (schoolId: string) => {
    if (!schoolId) {
      setSchoolRoles([])
      return
    }
    try {
      setLoadingRoles(true)
      const res = await api.get<{ roles: RoleListItem[]; total: number }>(`/api/super-admin/roles?schoolId=${schoolId}&limit=200`)
      setSchoolRoles(res.roles || [])
    } catch {
      toast({ title: "Couldn't Load Roles", description: "We couldn't load the roles list. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoadingRoles(false)
    }
  }, [toast])

  useEffect(() => {
    if (selectedSchoolId) {
      fetchSchoolRoles(selectedSchoolId)
    } else {
      setSchoolRoles([])
    }
  }, [selectedSchoolId, fetchSchoolRoles])

  // ── Create role handler ──
  const handleCreateRole = useCallback(async () => {
    if (!newRoleName.trim() || !selectedSchoolId) {
      toast({ title: 'Missing Information', description: 'Please enter a name for the role.', variant: 'destructive' })
      return
    }
    try {
      setCreating(true)
      await api.post<RoleListItem>('/api/super-admin/roles', {
        schoolId: selectedSchoolId,
        name: newRoleName.trim(),
        description: newRoleDesc.trim() || undefined,
        color: newRoleColor || undefined,
      })
      setShowCreateDialog(false)
      setNewRoleName('')
      setNewRoleDesc('')
      setNewRoleColor(PRESET_COLORS[0])
      await fetchSchoolRoles(selectedSchoolId)
      toast({ title: 'Role Created', description: `"${newRoleName.trim()}" has been created successfully.` })
    } catch (err) {
      toast({
        title: "Couldn't Create Role",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setCreating(false)
    }
  }, [newRoleName, newRoleDesc, newRoleColor, selectedSchoolId, fetchSchoolRoles, toast])

  if (loading) return <LoadingState />

  const totalSchools = analytics?.totalSchools || schools.length
  const activeSchools = analytics?.activeSchools || schools.filter(s => s.status === 'active').length
  const trialSchools = analytics?.trialSchools || schools.filter(s => s.status === 'trial').length
  const totalStudents = analytics?.totalStudents || 0

  const selectedSchool = schools.find(s => s.id === selectedSchoolId)

  // Filter roles by search
  const filteredRoles = roleSearch.trim()
    ? schoolRoles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
    : schoolRoles

  // Count stats for selected school
  const predefinedCount = schoolRoles.filter(r => r.isSystem).length
  const customCount = schoolRoles.filter(r => !r.isSystem).length

  const handleRoleClick = (roleId: string) => {
    setSelectedSuperAdminRoleId(roleId)
    setCurrentPage('super-admin-roles')
  }

  const handleManageAllRoles = () => {
    setCurrentPage('super-admin-roles')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of all schools on the My Digital Academy platform
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Schools"
          value={totalSchools}
          icon={School}
          trend={{ value: 12, isPositive: true }}
          description="from last month"
        />
        <StatsCard
          title="Active Schools"
          value={activeSchools}
          icon={CheckCircle}
          trend={{ value: 8, isPositive: true }}
          description="from last month"
        />
        <StatsCard
          title="Trial Schools"
          value={trialSchools}
          icon={Clock}
          trend={{ value: 3, isPositive: false }}
          description="from last month"
        />
        <StatsCard
          title="Total Students"
          value={totalStudents}
          icon={Users}
          trend={{ value: 18, isPositive: true }}
          description="across all schools"
        />
      </div>

      {/* School Roles Management Section */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-4" />
                School Roles
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Select a school to view and manage its roles and permissions
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 h-8 text-xs"
                onClick={handleManageAllRoles}
              >
                Manage All Roles
                <ArrowRight className="size-3" />
              </Button>
            </div>
          </div>

          {/* School Selector */}
          <div className="flex flex-col sm:flex-row gap-3 mt-3">
            <Select value={selectedSchoolId} onValueChange={(val) => { setSelectedSchoolId(val); setRoleSearch('') }}>
              <SelectTrigger className="w-full sm:w-[280px] h-9">
                <Building2 className="size-3.5 mr-1.5 shrink-0" />
                <SelectValue placeholder="Select a school..." />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSchoolId && (
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search roles..."
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!selectedSchoolId ? (
            /* No school selected - prompt to select */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="size-7 text-muted-foreground/40" />
              </div>
              <h3 className="text-sm font-semibold text-muted-foreground">Select a School</h3>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                Choose a school above to view and manage its roles and permissions
              </p>
            </div>
          ) : loadingRoles ? (
            /* Loading skeleton */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-md" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : schoolRoles.length === 0 ? (
            /* No roles */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShieldCheck className="size-10 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-semibold text-muted-foreground">No Roles Found</h3>
              <p className="text-xs text-muted-foreground/60 mt-1">
                This school doesn&apos;t have any roles yet. Create the first one.
              </p>
              <Button
                size="sm"
                className="gap-1.5 mt-4"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="size-3.5" />
                Create Role
              </Button>
            </div>
          ) : (
            /* Roles grid */
            <div className="space-y-4">
              {/* Quick stats for selected school */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5" />
                  {schoolRoles.length} total role{schoolRoles.length !== 1 ? 's' : ''}
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3" />
                  {predefinedCount} predefined
                </span>
                <span className="text-muted-foreground/30">·</span>
                <span className="flex items-center gap-1.5">
                  <Plus className="size-3" />
                  {customCount} custom
                </span>
                {selectedSchool && (
                  <>
                    <span className="text-muted-foreground/30 hidden sm:inline">·</span>
                    <span className="hidden sm:flex items-center gap-1.5">
                      <Building2 className="size-3" />
                      {selectedSchool.name}
                    </span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleRoleClick(role.id)}
                    className="w-full text-left p-3.5 rounded-lg border hover:border-primary/30 hover:bg-primary/[0.02] transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="size-9 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: `${role.color || 'oklch(0.554 0.046 257)'}15` }}
                      >
                        <ShieldCheck
                          className="size-4"
                          style={{ color: role.color || 'oklch(0.554 0.046 257)' }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{role.name}</span>
                          {role.isSystem && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 gap-0.5 shrink-0">
                              <Lock className="size-2.5" />
                              System
                            </Badge>
                          )}
                        </div>
                        {role.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                            {role.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="size-2.5" />
                            {role.permissionCount} perm{role.permissionCount !== 1 ? 's' : ''}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Users className="size-2.5" />
                            {role.userCount} user{role.userCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="size-3.5 text-muted-foreground/0 group-hover:text-primary/60 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>

              {/* Add Role Button */}
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Click any role to view and edit its permissions
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <Plus className="size-3.5" />
                  Add Custom Role
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Schools Growth Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Schools Growth</CardTitle>
            <CardDescription>Platform schools growth over the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mockGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs text-muted-foreground" />
                  <YAxis className="text-xs text-muted-foreground" />
                  <Tooltip
                    formatter={(value: number) => [value, 'Schools']}
                    contentStyle={{
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="schools" fill="oklch(0.596 0.145 163.225)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Status Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schools by Status</CardTitle>
            <CardDescription>Distribution of school statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mockStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {mockStatusData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {mockStatusData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <div className="size-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                  <span className="text-muted-foreground">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Schools Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Schools</CardTitle>
          <CardDescription>Recently registered schools on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {schools.slice(0, 5).map((school) => (
              <div key={school.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{school.name}</p>
                    <p className="text-xs text-muted-foreground">{school.subdomain}.mydigitalacademy.in</p>
                  </div>
                </div>
                <Badge variant={school.status === 'active' ? 'default' : school.status === 'trial' ? 'secondary' : 'outline'}>
                  {school.status}
                </Badge>
              </div>
            ))}
            {schools.length === 0 && (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Users className="size-4" />
                No schools found. Demo data will appear here.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Role Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-5" />
              Create Custom Role
            </DialogTitle>
            <DialogDescription>
              Add a new role to {selectedSchool?.name || 'the selected school'}. You can assign permissions after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dash-new-role-name" className="text-xs font-medium">Role Name *</Label>
              <Input
                id="dash-new-role-name"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="e.g., Department Head, Lab Assistant"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dash-new-role-desc" className="text-xs font-medium">Description</Label>
              <Textarea
                id="dash-new-role-desc"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Describe what this role is for..."
                className="min-h-[60px] resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Color</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewRoleColor(color)}
                    className={`size-7 rounded-md border-2 transition-all ${
                      newRoleColor === color ? 'border-foreground scale-110' : 'border-transparent hover:border-muted-foreground/30'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <Input
                  type="color"
                  value={newRoleColor}
                  onChange={(e) => setNewRoleColor(e.target.value)}
                  className="size-7 p-0 border-0 cursor-pointer rounded-md"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreateRole} disabled={creating || !newRoleName.trim()}>
              {creating ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
