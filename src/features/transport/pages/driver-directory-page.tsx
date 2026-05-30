'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState, ResetUserPasswordDialog } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [resetTarget, setResetTarget] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

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
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver Directory"
        description={`${drivers.length} transport driver${drivers.length !== 1 ? 's' : ''} registered`}
        action={{ label: 'Add Driver', icon: PlusCircle, onClick: () => router.push('/transport/drivers/new') }}
      />

      {drivers.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No Drivers"
          description="Add transport drivers to assign them to routes."
          action={{ label: 'Add Driver', onClick: () => router.push('/transport/drivers/new') }}
        />
      ) : (
        <>
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
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name, ID, phone, license, route..."
                      className="h-9 pl-9"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Route Assignment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignments</SelectItem>
                      <SelectItem value="assigned">Assigned to Route</SelectItem>
                      <SelectItem value="unassigned">No Route</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={genderFilter} onValueChange={setGenderFilter}>
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
                    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" onClick={clearFilters}>
                      <X className="size-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="overflow-hidden rounded-lg border bg-card">

          {filteredDrivers.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No drivers match your filters</p>
              <Button variant="link" size="sm" onClick={clearFilters} className="mt-1">
                Clear filters
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-[260px] px-4">Driver</TableHead>
                  <TableHead className="min-w-[130px]">Employee ID</TableHead>
                  <TableHead className="min-w-[180px]">Contact</TableHead>
                  <TableHead className="min-w-[180px]">License</TableHead>
                  <TableHead className="min-w-[180px]">Assigned Routes</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="w-[60px]" />
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
                      className="cursor-pointer"
                      onClick={() => setSelectedDriver(driver)}
                    >
                      <TableCell className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-11 border">
                            {driver.avatar ? <AvatarImage src={driver.avatar} alt={driver.name} /> : null}
                            <AvatarFallback className="text-sm font-semibold">{initials(driver.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-semibold leading-tight">{driver.name}</div>
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <CalendarDays className="size-3.5" />
                              DOB {formatDate(driver.dob)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {driver.employeeId ? (
                          <span className="font-mono text-sm">{driver.employeeId}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="size-4 text-muted-foreground" />
                          {driver.phone || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm">
                          <IdCard className="size-4 text-muted-foreground" />
                          {driver.drivingLicenseNumber || '-'}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {assignedRoutes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {assignedRoutes.map((route) => (
                              <Badge key={route.id} variant="secondary" className="text-[11px]">
                                {route.routeNumber ? `${route.routeName} (#${route.routeNumber})` : route.routeName}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No route assigned</span>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant={isActive ? 'default' : 'destructive'} className="font-medium">
                          {isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedDriver(driver)
                              }}
                            >
                              <Eye className="mr-2 size-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!driver.userId}
                              onClick={(event) => {
                                event.stopPropagation()
                                setResetTarget(driver)
                              }}
                            >
                              <KeyRound className="mr-2 size-4" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isUpdating}
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleToggleStatus(driver)
                              }}
                              className={isActive ? 'text-destructive focus:text-destructive' : ''}
                            >
                              {isUpdating ? (
                                <Loader2 className="mr-2 size-4 animate-spin" />
                              ) : isActive ? (
                                <UserX className="mr-2 size-4" />
                              ) : (
                                <UserCheck className="mr-2 size-4" />
                              )}
                              {isUpdating ? 'Updating...' : isActive ? 'Disable' : 'Enable'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
        </>
      )}

      <Dialog open={!!selectedDriver} onOpenChange={(open) => { if (!open) setSelectedDriver(null) }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto p-4 sm:max-w-2xl">
          <DialogHeader className="gap-1">
            <DialogTitle className="text-base">Driver Profile</DialogTitle>
            <DialogDescription className="text-xs">
              Contact, license, and route assignment details.
            </DialogDescription>
          </DialogHeader>
          {selectedDriver && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <Avatar className="size-12 border bg-background">
                    {selectedDriver.avatar ? <AvatarImage src={selectedDriver.avatar} alt={selectedDriver.name} /> : null}
                    <AvatarFallback className="text-sm font-semibold">{initials(selectedDriver.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-foreground">{selectedDriver.name}</h3>
                      <Badge variant={selectedDriver.isActive !== false ? 'default' : 'destructive'} className="h-5 px-1.5 text-[10px]">
                        {selectedDriver.isActive !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                      {selectedDriver.employeeId && <span className="font-mono">{selectedDriver.employeeId}</span>}
                      {selectedDriver.phone && <span>{selectedDriver.phone}</span>}
                      <span>
                        {(routesByDriver.get(selectedDriver.id) || []).length} assigned route{(routesByDriver.get(selectedDriver.id) || []).length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <DetailItem icon={Phone} label="Phone" value={selectedDriver.phone} />
                <DetailItem icon={Mail} label="Email" value={selectedDriver.email && !selectedDriver.email.endsWith('@driver.local') ? selectedDriver.email : null} />
                <DetailItem icon={IdCard} label="Employee ID" value={selectedDriver.employeeId} mono />
                <DetailItem icon={UserIcon} label="Gender" value={selectedDriver.gender} />
                <DetailItem icon={CalendarDays} label="Date of Birth" value={formatDate(selectedDriver.dob)} />
                <DetailItem icon={CalendarDays} label="Join Date" value={formatDate(selectedDriver.joinDate)} />
                <div className="sm:col-span-2">
                  <DetailItem icon={IdCard} label="License Number" value={selectedDriver.drivingLicenseNumber} mono />
                </div>
              </div>

              <div className="space-y-2 rounded-md border bg-background p-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <Route className="size-3.5 text-muted-foreground" />
                  Assigned Routes
                </div>
                {(routesByDriver.get(selectedDriver.id) || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(routesByDriver.get(selectedDriver.id) || []).map((route) => (
                      <Badge key={route.id} variant="secondary" className="text-[11px]">
                        {route.routeNumber ? `${route.routeName} (#${route.routeNumber})` : route.routeName}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No route assigned.
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedDriver(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResetUserPasswordDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null)
        }}
        userId={resetTarget?.userId ?? null}
        userName={resetTarget?.name ?? ''}
        roleLabel="driver"
      />
    </div>
  )
}
