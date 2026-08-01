'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState, ResetUserPasswordDialog } from '@/components/shared'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CalendarDays, Eye, Filter, IdCard, KeyRound, Loader2, Mail, MoreHorizontal, Phone, PlusCircle, Route, Search, User as UserIcon, UserCheck, UserX, X } from 'lucide-react'

interface Driver {
  id: string
  userId?: string | null
  employeeId?: string | null
  firstName: string
  lastName: string
  name: string
  gender?: string | null
  phone: string | null
  email?: string | null
  avatar?: string | null
  dob?: string | null
  joinDate?: string | null
  drivingLicenseNumber?: string | null
  isActive?: boolean
}

interface TransportRoute {
  id: string
  routeName: string
  routeNumber: string | null
  driverName: string | null
  driverPhone: string | null
}

interface DriverDirectoryListState {
  search: string
  statusFilter: string
  assignmentFilter: string
  genderFilter: string
}

const DRIVER_DIRECTORY_LIST_STATE_KEY = 'transport:drivers:list'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'D'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function DetailItem({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border bg-background p-2.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
        <p className={`break-words text-xs font-medium leading-5 text-foreground ${mono ? 'font-mono' : ''}`}>
          {value || <span className="font-sans text-muted-foreground">Not added</span>}
        </p>
      </div>
    </div>
  )
}

export function DriverDirectoryPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.TRANSPORT_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.TRANSPORT_UPDATE)
  const savedListState = useAppStore((state) => state.pageState[DRIVER_DIRECTORY_LIST_STATE_KEY] as DriverDirectoryListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [search, setSearch] = useState(savedListState?.search ?? '')
  const [statusFilter, setStatusFilter] = useState(savedListState?.statusFilter ?? 'all')
  const [assignmentFilter, setAssignmentFilter] = useState(savedListState?.assignmentFilter ?? 'all')
  const [genderFilter, setGenderFilter] = useState(savedListState?.genderFilter ?? 'all')
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [resetTarget, setResetTarget] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const rememberListState = useCallback((patch: Partial<DriverDirectoryListState>) => {
    setPageState(DRIVER_DIRECTORY_LIST_STATE_KEY, {
      search,
      statusFilter,
      assignmentFilter,
      genderFilter,
      ...patch,
    })
  }, [assignmentFilter, genderFilter, search, setPageState, statusFilter])

  const fetchData = useCallback(async () => {
    try {
      const [driversRes, routesRes] = await Promise.all([
        api.get<{ drivers: Driver[] }>('/api/school/transport/drivers'),
        api.get<{ routes: TransportRoute[] }>('/api/school/transport/routes').catch(() => ({ routes: [] })),
      ])
      setDrivers(driversRes.drivers || [])
      setRoutes(routesRes.routes || [])
    } catch {
      toast({
        title: "Couldn't Load Drivers",
        description: 'Please refresh and try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleStatus = useCallback(async (driver: Driver) => {
    if (updatingStatusId) return
    const nextStatus = !driver.isActive
    setUpdatingStatusId(driver.id)
    try {
      const res = await api.patch<{ unassignedRouteCount?: number }>(
        `/api/school/transport/drivers/${driver.id}`,
        { isActive: nextStatus }
      )
      const unassigned = res?.unassignedRouteCount ?? 0
      toast({
        title: nextStatus ? 'Driver Enabled' : 'Driver Disabled',
        description: nextStatus
          ? `${driver.name} can now be assigned to routes again.`
          : unassigned > 0
            ? `${driver.name} disabled. Removed from ${unassigned} route${unassigned === 1 ? '' : 's'} — please assign a new driver.`
            : `${driver.name} will no longer appear in the driver picker.`,
      })
      await fetchData()
    } catch (err) {
      toast({
        title: nextStatus ? "Couldn't Enable Driver" : "Couldn't Disable Driver",
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setUpdatingStatusId(null)
    }
  }, [fetchData, toast, updatingStatusId])

  const routesByDriver = useMemo(() => {
    const map = new Map<string, TransportRoute[]>()
    for (const driver of drivers) {
      const assignedRoutes = routes.filter((route) =>
        route.driverName === driver.name && (!route.driverPhone || route.driverPhone === driver.phone)
      )
      map.set(driver.id, assignedRoutes)
    }
    return map
  }, [drivers, routes])

  const genderOptions = useMemo(
    () => Array.from(new Set(drivers.map((driver) => driver.gender).filter(Boolean) as string[])).sort(),
    [drivers]
  )

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = drivers.filter((driver) => {
      const assignedRoutes = routesByDriver.get(driver.id) || []

      if (query) {
        const haystack = [
          driver.name,
          driver.employeeId,
          driver.phone,
          driver.drivingLicenseNumber,
          ...assignedRoutes.flatMap((route) => [route.routeName, route.routeNumber]),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(query)) return false
      }

      const isActive = driver.isActive !== false
      if (statusFilter === 'active' && !isActive) return false
      if (statusFilter === 'inactive' && isActive) return false

      if (assignmentFilter === 'assigned' && assignedRoutes.length === 0) return false
      if (assignmentFilter === 'unassigned' && assignedRoutes.length > 0) return false

      if (genderFilter !== 'all' && driver.gender !== genderFilter) return false

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
  }, [drivers, routesByDriver, search, statusFilter, assignmentFilter, genderFilter])

  const activeFilterCount = [
    search.trim() && 'search',
    statusFilter !== 'all' && 'status',
    assignmentFilter !== 'all' && 'assignment',
    genderFilter !== 'all' && 'gender',
  ].filter(Boolean).length

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setAssignmentFilter('all')
    setGenderFilter('all')
    rememberListState({ search: '', statusFilter: 'all', assignmentFilter: 'all', genderFilter: 'all' })
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    rememberListState({ search: value })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    rememberListState({ statusFilter: value })
  }

  const handleAssignmentFilterChange = (value: string) => {
    setAssignmentFilter(value)
    rememberListState({ assignmentFilter: value })
  }

  const handleGenderFilterChange = (value: string) => {
    setGenderFilter(value)
    rememberListState({ genderFilter: value })
  }

  const activeDrivers = drivers.filter((d) => d.isActive !== false).length
  const inactiveDrivers = drivers.length - activeDrivers
  const assignedDrivers = drivers.filter((d) => (routesByDriver.get(d.id) || []).length > 0).length

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <UserCheck className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Driver Directory</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {drivers.length} drivers
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Manage transport drivers and route assignments.</p>
          </div>
        </div>
        {canCreate && (
          <Button
            variant="secondary"
            onClick={() => router.push('/transport/drivers/new')}
            className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <PlusCircle className="size-4" strokeWidth={2.2} />
            <span className="font-semibold">Add Driver</span>
          </Button>
        )}
      </div>

      {drivers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-primary/20">
            <UserCheck className="size-7 text-primary/60" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No Drivers</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add transport drivers to assign them to routes.</p>
          {canCreate && (
            <Button onClick={() => router.push('/transport/drivers/new')} className="mt-4 gap-2">
              <PlusCircle className="size-4" />
              Add Driver
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid gap-2 sm:grid-cols-3">
            <Card className="group relative overflow-hidden rounded-xl border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500 via-sky-400 to-transparent" />
              <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-sky-500/[0.10] transition-transform group-hover:scale-125" />
              <CardContent className="relative p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Active Drivers</p>
                    <p className="text-lg font-bold leading-6 tracking-tight tabular-nums text-emerald-600">{activeDrivers}</p>
                    <p className="truncate text-[10px] leading-3 text-muted-foreground">{inactiveDrivers} inactive</p>
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/20">
                    <UserCheck className="size-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group relative overflow-hidden rounded-xl border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.15] via-card to-emerald-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-transparent" />
              <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-emerald-500/[0.10] transition-transform group-hover:scale-125" />
              <CardContent className="relative p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Assigned to Route</p>
                    <p className="text-lg font-bold leading-6 tracking-tight tabular-nums text-emerald-600">{assignedDrivers}</p>
                    <p className="truncate text-[10px] leading-3 text-muted-foreground">{drivers.length - assignedDrivers} unassigned</p>
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20">
                    <Route className="size-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group relative overflow-hidden rounded-xl border-violet-500/20 bg-gradient-to-br from-violet-500/[0.14] via-card to-violet-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-violet-400 to-transparent" />
              <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-violet-500/[0.10] transition-transform group-hover:scale-125" />
              <CardContent className="relative p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Total Drivers</p>
                    <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{drivers.length}</p>
                    <p className="truncate text-[10px] leading-3 text-muted-foreground">In the transport network</p>
                  </div>
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm shadow-violet-500/20">
                    <UserIcon className="size-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
            <CardContent className="p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                    <Filter className="size-4" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filters</span>
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
                      placeholder="Search name, ID, phone, license, route..."
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

                  <Select value={assignmentFilter} onValueChange={handleAssignmentFilterChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Route Assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignments</SelectItem>
                      <SelectItem value="assigned">Assigned to Route</SelectItem>
                      <SelectItem value="unassigned">No Route</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={genderFilter} onValueChange={handleGenderFilterChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Genders</SelectItem>
                      {genderOptions.map((gender) => (
                        <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2 lg:justify-end">
                  <p className="text-xs text-muted-foreground">
                    {filteredDrivers.length} shown
                  </p>
                  {activeFilterCount > 0 && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearFilters}>
                      <X className="size-3" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="gap-0 overflow-hidden border-violet-500/15 bg-gradient-to-br from-card via-card to-violet-500/[0.035] py-0 shadow-sm">
            <CardHeader className="border-b border-violet-500/15 bg-gradient-to-r from-violet-500/[0.10] via-primary/[0.05] to-sky-500/[0.08] px-4 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-sky-500 text-white shadow-sm shadow-violet-500/20">
                    <UserCheck className="size-4" />
                  </span>
                  Driver List
                </CardTitle>
                <Badge variant="secondary" className="text-xs">{filteredDrivers.length} records</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredDrivers.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <Search className="mx-auto mb-3 size-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No drivers match your filters</p>
                  <Button variant="link" size="sm" onClick={clearFilters} className="mt-1">
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-violet-500/15 shadow-sm">
                  <Table>
                    <TableHeader className="bg-gradient-to-r from-violet-500/[0.08] via-primary/[0.04] to-sky-500/[0.07]">
                      <TableRow>
                        <TableHead className="min-w-[260px] py-2.5 pl-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Driver</TableHead>
                        <TableHead className="min-w-[120px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee ID</TableHead>
                        <TableHead className="min-w-[160px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</TableHead>
                        <TableHead className="min-w-[160px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">License</TableHead>
                        <TableHead className="min-w-[180px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assigned Routes</TableHead>
                        <TableHead className="min-w-[90px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                        <TableHead className="w-[60px] py-2.5" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDrivers.map((driver) => {
                        const assignedRoutes = routesByDriver.get(driver.id) || []
                        const isActive = driver.isActive !== false
                        const isUpdating = updatingStatusId === driver.id
                        return (
                          <TableRow
                            key={driver.id}
                            className={cn('cursor-pointer transition-colors', isActive ? 'hover:bg-violet-500/[0.04]' : 'opacity-75')}
                            onClick={() => setSelectedDriver(driver)}
                          >
                            <TableCell className="py-3 pl-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="size-10 border-2 border-white shadow-sm">
                                  {driver.avatar ? <AvatarImage src={driver.avatar} alt={driver.name} /> : null}
                                  <AvatarFallback className={cn('text-xs font-semibold', isActive ? 'bg-gradient-to-br from-violet-500/20 to-sky-500/20 text-primary' : 'bg-muted text-muted-foreground')}>{initials(driver.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className={cn('text-sm font-semibold leading-tight', !isActive && 'text-muted-foreground')}>{driver.name}</div>
                                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <CalendarDays className="size-3" />
                                    {formatDate(driver.dob)}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              {driver.employeeId ? (
                                <span className="font-mono text-sm">{driver.employeeId}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600">
                                  <Phone className="size-3" />
                                </span>
                                {driver.phone || <span className="text-muted-foreground">-</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600">
                                  <IdCard className="size-3" />
                                </span>
                                {driver.drivingLicenseNumber || <span className="text-muted-foreground">-</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              {assignedRoutes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {assignedRoutes.slice(0, 2).map((route) => (
                                    <Badge key={route.id} variant="secondary" className="text-[10px] border-emerald-500/25 bg-emerald-500/[0.08]">
                                      {route.routeNumber ? `#${route.routeNumber}` : route.routeName}
                                    </Badge>
                                  ))}
                                  {assignedRoutes.length > 2 && (
                                    <Badge variant="secondary" className="text-[10px]">+{assignedRoutes.length - 2}</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground italic">None</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              {isActive ? (
                                <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                                  <span className="size-1.5 rounded-full bg-emerald-500" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1 text-muted-foreground">
                                  <span className="size-1.5 rounded-full bg-muted-foreground" />
                                  Inactive
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="py-3">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30">
                                    <MoreHorizontal className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={(event) => { event.stopPropagation(); setSelectedDriver(driver) }}>
                                    <Eye className="mr-2 size-3.5" /> View Details
                                  </DropdownMenuItem>
                                  {canUpdate && (
                                    <>
                                      <DropdownMenuItem disabled={!driver.userId} onClick={(event) => { event.stopPropagation(); setResetTarget(driver) }}>
                                        <KeyRound className="mr-2 size-3.5" /> Reset Password
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={isUpdating}
                                        onClick={(event) => { event.stopPropagation(); void handleToggleStatus(driver) }}
                                        className={isActive ? 'text-destructive focus:text-destructive' : ''}
                                      >
                                        {isUpdating ? (
                                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                                        ) : isActive ? (
                                          <UserX className="mr-2 size-3.5" />
                                        ) : (
                                          <UserCheck className="mr-2 size-3.5" />
                                        )}
                                        {isUpdating ? 'Updating...' : isActive ? 'Disable' : 'Enable'}
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
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Driver Profile Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={(open) => { if (!open) setSelectedDriver(null) }}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-lg [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <Avatar className="size-11 border-2 border-white/50 shadow-md">
                {selectedDriver?.avatar ? <AvatarImage src={selectedDriver.avatar} alt={selectedDriver?.name || ''} /> : null}
                <AvatarFallback className="bg-white/20 text-sm font-bold text-white">
                  {selectedDriver ? initials(selectedDriver.name) : 'DR'}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">
                  {selectedDriver?.name || 'Driver Profile'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  {selectedDriver?.employeeId && <>{selectedDriver.employeeId} &middot; </>}
                  Contact, license, and route assignment details.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {selectedDriver && (
            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
              {/* Status badge row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={selectedDriver.isActive !== false ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted/60 text-muted-foreground'}>
                  {selectedDriver.isActive !== false ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {(routesByDriver.get(selectedDriver.id) || []).length} assigned route{(routesByDriver.get(selectedDriver.id) || []).length === 1 ? '' : 's'}
                </Badge>
              </div>

              {/* Contact & IDs */}
              <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                    <Phone className="size-3" />
                  </span>
                  Contact &amp; IDs
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <DetailItem icon={Phone} label="Phone" value={selectedDriver.phone} />
                  <DetailItem icon={Mail} label="Email" value={selectedDriver.email && !selectedDriver.email.endsWith('@driver.local') ? selectedDriver.email : null} />
                  <DetailItem icon={IdCard} label="Employee ID" value={selectedDriver.employeeId} mono />
                  <DetailItem icon={UserIcon} label="Gender" value={selectedDriver.gender} />
                </div>
              </div>

              {/* Dates */}
              <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-cyan-500/10">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                    <CalendarDays className="size-3" />
                  </span>
                  Dates &amp; License
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <DetailItem icon={CalendarDays} label="Date of Birth" value={formatDate(selectedDriver.dob)} />
                  <DetailItem icon={CalendarDays} label="Join Date" value={formatDate(selectedDriver.joinDate)} />
                  <div className="sm:col-span-2">
                    <DetailItem icon={IdCard} label="License Number" value={selectedDriver.drivingLicenseNumber} mono />
                  </div>
                </div>
              </div>

              {/* Assigned Routes */}
              <div className="rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-rose-500/10">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                    <Route className="size-3" />
                  </span>
                  Assigned Routes
                </h4>
                {(routesByDriver.get(selectedDriver.id) || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(routesByDriver.get(selectedDriver.id) || []).map((route) => (
                      <Badge key={route.id} variant="secondary" className="border-amber-500/25 bg-amber-500/[0.08] text-[11px]">
                        <Route className="mr-1 inline size-2.5" />
                        {route.routeNumber ? `${route.routeName} (#${route.routeNumber})` : route.routeName}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/[0.04] p-4 text-center text-xs text-muted-foreground">
                    No route assigned to this driver.
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] to-transparent px-5 py-3 sm:px-6">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setSelectedDriver(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResetUserPasswordDialog
        open={!!resetTarget}
        onOpenChange={(open) => { if (!open) setResetTarget(null) }}
        userId={resetTarget?.userId ?? null}
        userName={resetTarget?.name ?? ''}
        roleLabel="driver"
      />
    </div>
  )
}
