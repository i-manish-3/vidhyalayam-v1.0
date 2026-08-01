'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlusCircle, Bus, User, MoreVertical, Pencil, Trash2, Search, X, CheckCircle2, CircleOff, MapPin, CalendarDays } from 'lucide-react'

interface TransportRoute {
  id: string
  routeName: string
  routeNumber: string | null
  academicYear: string
  feeMonths: string
  stops: string | null
  distance: number | null
  driverName: string | null
  driverPhone: string | null
  vehicleNumber: string | null
  fee: number
  isActive: boolean
  _count?: { allocations: number }
  [key: string]: unknown
}

interface TransportStop {
  name: string
  fare?: number
}

const FEE_MONTH_OPTIONS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function sortAcademicMonths(months: string[]): string[] {
  return [...months].sort((a, b) => {
    const ai = FEE_MONTH_OPTIONS.findIndex((month) => month.toLowerCase() === a.toLowerCase())
    const bi = FEE_MONTH_OPTIONS.findIndex((month) => month.toLowerCase() === b.toLowerCase())
    if (ai === -1 && bi === -1) return a.localeCompare(b)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

interface TransportDriver {
  id: string
  name: string
  phone: string | null
  avatar?: string | null
  isActive?: boolean
}

interface TransportRouteListState {
  searchQuery: string
}

const TRANSPORT_ROUTE_LIST_STATE_KEY = 'transport:routes:list'

export function TransportPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.TRANSPORT_CREATE)
  const canUpdate = hasPermission(PERMISSIONS.TRANSPORT_UPDATE)
  const canDelete = hasPermission(PERMISSIONS.TRANSPORT_DELETE)
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const currentSchool = useAppStore((state) => state.currentSchool)
  const savedListState = useAppStore((state) => state.pageState[TRANSPORT_ROUTE_LIST_STATE_KEY] as TransportRouteListState | undefined)
  const setPageState = useAppStore((state) => state.setPageState)
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [drivers, setDrivers] = useState<TransportDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState(savedListState?.searchQuery ?? '')
  const [selectedRoute, setSelectedRoute] = useState<TransportRoute | null>(null)
  const [deleteRoute, setDeleteRoute] = useState<TransportRoute | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      // Honor the global viewing-academic-year switcher (top bar). Falls back
      // to the school's active session if no override is set. Without this
      // query param, the API returns the school's active year — which made
      // toggling years from the top bar feel like fares had changed in
      // historic sessions when in fact you were still looking at the active
      // session's data.
      const year = viewingAcademicYear || currentSchool?.academicYear || ''
      const routeQuery = year ? `?academicYear=${encodeURIComponent(year)}` : ''
      const [routesRes, driversRes] = await Promise.all([
        api.get<{ routes: TransportRoute[] }>(`/api/school/transport/routes${routeQuery}`),
        api.get<{ drivers: TransportDriver[] }>('/api/school/transport/drivers').catch(() => ({ drivers: [] })),
      ])
      setRoutes(routesRes.routes || [])
      setDrivers(driversRes.drivers || [])
    } catch {
      toast({ title: "Couldn't Load Routes", description: "We couldn't load the transport routes. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast, viewingAcademicYear, currentSchool?.academicYear])

  useEffect(() => { fetchData() }, [fetchData])

  const parseStops = (stops: string | null | undefined): TransportStop[] => {
    if (!stops) return []
    try {
      const parsed = JSON.parse(stops)
      if (!Array.isArray(parsed)) {
        return stops.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name }))
      }

      return parsed
        .map((stop) => {
          if (typeof stop === 'string') return { name: stop }
          if (stop && typeof stop === 'object' && typeof stop.name === 'string') {
            return {
              name: stop.name,
              fare: typeof stop.fare === 'number' ? stop.fare : undefined,
            }
          }
          return null
        })
        .filter((stop): stop is TransportStop => !!stop && !!stop.name)
    } catch {
      return stops.split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name }))
    }
  }

  const formatCurrency = (value: number | null | undefined) =>
    `Rs. ${(Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  const driverInitials = (name: string | null | undefined) => {
    const parts = (name || 'Driver').trim().split(/\s+/).filter(Boolean)
    return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'D'
  }

  const findDriver = (route: TransportRoute) =>
    drivers.find((driver) =>
      driver.name === route.driverName && (!route.driverPhone || driver.phone === route.driverPhone)
    )

  const sortedStopsByFare = (route: TransportRoute | null) =>
    parseStops(route?.stops).sort((a, b) => Number(a.fare || 0) - Number(b.fare || 0))

  const parseFeeMonths = (value: string | null | undefined): string[] => {
    if (!value) return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? sortAcademicMonths(parsed.filter((month): month is string => typeof month === 'string' && !!month.trim())) : []
    } catch {
      return sortAcademicMonths(value.split(',').map(month => month.trim()).filter(Boolean))
    }
  }

  const handleEdit = (route: TransportRoute) => {
    router.push(`/transport/routes/${route.id}/edit`)
  }

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    setPageState(TRANSPORT_ROUTE_LIST_STATE_KEY, { searchQuery: value })
  }

  const handleDelete = async () => {
    if (!deleteRoute) return
    setDeleting(true)
    try {
      // Delete is year-scoped — passing the currently viewed academic year so
      // the API only deactivates this year's fares/allocations. Historic
      // sessions for the same route are preserved.
      const year = viewingAcademicYear || currentSchool?.academicYear || ''
      const qs = year ? `?academicYear=${encodeURIComponent(year)}` : ''
      await api.delete(`/api/school/transport/routes/${deleteRoute.id}${qs}`)
      toast({
        title: 'Route Removed',
        description: year
          ? `"${deleteRoute.routeName}" removed from ${year}. Past sessions are intact.`
          : `"${deleteRoute.routeName}" has been removed.`,
      })
      setDeleteRoute(null)
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't Delete Route", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  const filteredRoutes = routes.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.trim().toLowerCase()
    return r.routeName.toLowerCase().includes(q) ||
      (r.routeNumber && r.routeNumber.toLowerCase().includes(q)) ||
      (r.driverName && r.driverName.toLowerCase().includes(q)) ||
      (r.driverPhone && r.driverPhone.toLowerCase().includes(q)) ||
      (r.vehicleNumber && r.vehicleNumber.toLowerCase().includes(q)) ||
      (r.academicYear && r.academicYear.toLowerCase().includes(q)) ||
      parseFeeMonths(r.feeMonths).some(month => month.toLowerCase().includes(q)) ||
      parseStops(r.stops).some(stop =>
        stop.name.toLowerCase().includes(q) ||
        (stop.fare != null && String(stop.fare).includes(q))
      )
  })

  if (loading) return <LoadingState />

  const activeCount = routes.filter((r) => r.isActive !== false).length
  const inactiveCount = routes.length - activeCount

  return (
    <div className="space-y-4">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <Bus className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Transport Routes</h1>
              <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
                {routes.length} routes
              </span>
            </div>
            <p className="mt-0.5 text-xs text-white/80">Manage routes, stops, fees, and driver assignments.</p>
          </div>
        </div>
        {canCreate && (
          <Button
            variant="secondary"
            onClick={() => router.push('/transport/routes/new')}
            className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: 'white', color: 'var(--primary)' }}
          >
            <PlusCircle className="size-4" strokeWidth={2.2} />
            <span className="font-semibold">Add Route</span>
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Card className="group relative overflow-hidden rounded-xl border-sky-500/20 bg-gradient-to-br from-sky-500/[0.15] via-card to-sky-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-sky-500 via-sky-400 to-transparent" />
          <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-sky-500/[0.10] transition-transform group-hover:scale-125" />
          <CardContent className="relative p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Total Routes</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums">{routes.length}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">In the transport network</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/20">
                <Bus className="size-4" />
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
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Active</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums text-emerald-600">{activeCount}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">Currently operating</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/20">
                <CheckCircle2 className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group relative overflow-hidden rounded-xl border-rose-500/20 bg-gradient-to-br from-rose-500/[0.14] via-card to-rose-500/[0.05] py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-500 via-rose-400 to-transparent" />
          <div aria-hidden className="absolute -bottom-7 -right-5 size-16 rounded-full bg-rose-500/[0.10] transition-transform group-hover:scale-125" />
          <CardContent className="relative p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium leading-4 text-muted-foreground">Inactive</p>
                <p className="text-lg font-bold leading-6 tracking-tight tabular-nums text-rose-600">{inactiveCount}</p>
                <p className="truncate text-[10px] leading-3 text-muted-foreground">Not currently active</p>
              </div>
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-sm shadow-rose-500/20">
                <CircleOff className="size-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {routes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16">
          <div className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/20 to-primary/20">
            <Bus className="size-7 text-primary/60" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No Transport Routes</h3>
          <p className="mt-1 text-sm text-muted-foreground">Add transport routes to manage student commuting and vehicle assignments.</p>
          {canCreate && (
            <Button onClick={() => router.push('/transport/routes/new')} className="mt-4 gap-2">
              <PlusCircle className="size-4" />
              Add Route
            </Button>
          )}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
          <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                  <Bus className="size-4" />
                </span>
                Route List
                <span className="text-xs font-normal text-muted-foreground">
                  {filteredRoutes.length} of {routes.length} shown
                </span>
              </CardTitle>
              <div className="relative w-full lg:max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search route, driver, vehicle, or stop"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-9 pl-9 pr-9 text-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredRoutes.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Search className="mx-auto mb-3 size-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No routes match &ldquo;{searchQuery}&rdquo;</p>
                <Button variant="link" size="sm" onClick={() => handleSearchChange('')} className="mt-1">
                  Clear search
                </Button>
              </div>
            ) : (
              <div className="mx-4 mt-4 mb-4 overflow-x-auto rounded-xl border border-sky-500/15 shadow-sm">
                <Table>
                  <TableHeader className="bg-gradient-to-r from-sky-500/[0.08] via-primary/[0.04] to-violet-500/[0.07]">
                    <TableRow>
                      <TableHead className="min-w-[300px] py-2.5 pl-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</TableHead>
                      <TableHead className="min-w-[200px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Driver</TableHead>
                      <TableHead className="min-w-[180px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fee Year</TableHead>
                      <TableHead className="min-w-[100px] py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                      <TableHead className="w-[52px] py-2.5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoutes.map(route => {
                      const stopsList = parseStops(route.stops)
                      const isInactive = route.isActive === false
                      const feeMonths = parseFeeMonths(route.feeMonths)
                      const driver = findDriver(route)

                      return (
                        <TableRow
                          key={route.id}
                          className={cn(
                            'cursor-pointer transition-colors',
                            isInactive ? 'opacity-75' : 'hover:bg-sky-500/[0.04]'
                          )}
                          onClick={() => setSelectedRoute(route)}
                        >
                          <TableCell className="py-3 pl-4 align-top whitespace-normal">
                            <div className="flex min-w-0 gap-3">
                              <span className={cn(
                                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                                isInactive
                                  ? 'bg-muted/30 text-muted-foreground'
                                  : 'bg-gradient-to-br from-sky-500/20 to-violet-500/20 text-primary'
                              )}>
                                <Bus className="size-5" />
                              </span>
                              <div className="min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className={cn('font-semibold leading-tight', isInactive && 'text-muted-foreground')}>{route.routeName}</h3>
                                  {route.routeNumber && (
                                    <Badge variant="outline" className="font-mono text-[10px]">#{route.routeNumber}</Badge>
                                  )}
                                  {route.distance != null && (
                                    <Badge variant="secondary" className="text-[10px]">{route.distance} km</Badge>
                                  )}
                                </div>
                                {stopsList.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {stopsList.slice(0, 6).map((stop, i) => (
                                      <Badge key={`${route.id}-stop-${i}`} variant="outline" className="max-w-[140px] truncate text-[10px]">
                                        <MapPin className="mr-0.5 inline size-2.5" />
                                        {stop.name}
                                      </Badge>
                                    ))}
                                    {stopsList.length > 6 && (
                                      <Badge variant="outline" className="text-[10px]">+{stopsList.length - 6}</Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3 align-top whitespace-normal">
                            <div className="flex items-start gap-2.5">
                              <Avatar className="size-8 border">
                                {driver?.avatar ? <AvatarImage src={driver.avatar} alt={route.driverName || 'Driver'} /> : null}
                                <AvatarFallback className="text-[10px] font-semibold">
                                  {route.driverName ? driverInitials(route.driverName) : <User className="size-3.5 text-muted-foreground" />}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 space-y-0.5">
                                <div className={cn('truncate text-sm font-medium', isInactive && 'text-muted-foreground')}>
                                  {route.driverName || <span className="text-muted-foreground italic">Not assigned</span>}
                                </div>
                                {route.driverPhone && (
                                  <p className="text-xs text-muted-foreground">{route.driverPhone}</p>
                                )}
                                {route.vehicleNumber && (
                                  <p className="text-xs font-medium text-muted-foreground/80">{route.vehicleNumber}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="py-3 align-top whitespace-normal">
                            <div className="space-y-1.5">
                              <Badge variant="outline" className="font-mono text-[10px]">{route.academicYear || 'N/A'}</Badge>
                              {feeMonths.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {feeMonths.slice(0, 4).map((month) => (
                                    <Badge key={`${route.id}-${month}`} variant="secondary" className="text-[10px]">
                                      {month}
                                    </Badge>
                                  ))}
                                  {feeMonths.length > 4 && (
                                    <Badge variant="secondary" className="text-[10px]">+{feeMonths.length - 4}</Badge>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No months</p>
                              )}
                            </div>
                          </TableCell>

                          <TableCell className="py-3 align-top">
                            {isInactive ? (
                              <Badge variant="secondary" className="gap-1 text-muted-foreground">
                                <CircleOff className="size-3" />
                                Inactive
                              </Badge>
                            ) : (
                              <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                                <CheckCircle2 className="size-3" />
                                Active
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell className="py-3 align-top">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 text-muted-foreground hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/30"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <MoreVertical className="size-3.5" />
                                  <span className="sr-only">Open route actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                {canUpdate && (
                                  <DropdownMenuItem onClick={(event) => {
                                    event.stopPropagation()
                                    handleEdit(route)
                                  }}>
                                    <Pencil className="mr-2 size-3.5" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        setDeleteRoute(route)
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 size-3.5" />
                                      Delete
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
      )}

      {/* Route Detail Dialog */}
      <Dialog open={!!selectedRoute} onOpenChange={(open) => { if (!open) setSelectedRoute(null) }}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-lg [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-full [&>button]:text-white [&>button]:opacity-85 [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Bus className="size-5 text-white" />
              </span>
              <div>
                <DialogTitle className="text-lg font-bold tracking-normal text-white">
                  {selectedRoute?.routeName || 'Route Details'}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs text-white/75">
                  {selectedRoute?.routeNumber && <>#{selectedRoute.routeNumber} &middot; </>}
                  {selectedRoute?.academicYear}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {selectedRoute && (
            <div className="themed-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] p-4 sm:p-5">
              {/* Driver info */}
              <div className="rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10 border-2 border-white shadow-sm">
                    {(() => {
                      const d = findDriver(selectedRoute)
                      return d?.avatar ? <AvatarImage src={d.avatar} alt={selectedRoute.driverName || 'Driver'} /> : null
                    })()}
                    <AvatarFallback className="text-xs font-semibold">
                      {selectedRoute.driverName ? driverInitials(selectedRoute.driverName) : <User className="size-4 text-muted-foreground" />}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{selectedRoute.driverName || 'Not assigned'}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedRoute.driverPhone && <span className="text-xs text-muted-foreground">{selectedRoute.driverPhone}</span>}
                      {selectedRoute.vehicleNumber && <span className="text-xs text-muted-foreground">{selectedRoute.vehicleNumber}</span>}
                      {selectedRoute.distance != null && <span className="text-xs text-muted-foreground">{selectedRoute.distance} km</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stops & Fares */}
              <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-cyan-500/10">
                <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin className="size-3.5" />
                  Stops & Fares
                </h4>
                {sortedStopsByFare(selectedRoute).length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No stops added for this route.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-emerald-500/15 shadow-sm">
                    <Table>
                      <TableHeader className="bg-gradient-to-r from-emerald-500/[0.08] to-cyan-500/[0.07]">
                        <TableRow>
                          <TableHead className="py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">#</TableHead>
                          <TableHead className="py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stop Name</TableHead>
                          <TableHead className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fare</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedStopsByFare(selectedRoute).map((stop, index) => (
                          <TableRow key={`${selectedRoute.id}-modal-stop-${index}`}>
                            <TableCell className="py-2 text-xs text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="py-2 font-medium">{stop.name}</TableCell>
                            <TableCell className="py-2 text-right tabular-nums font-semibold text-emerald-600">{formatCurrency(stop.fare || 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Fee Months */}
              {parseFeeMonths(selectedRoute.feeMonths).length > 0 && (
                <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-rose-50 p-4 shadow-sm dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-rose-500/10">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <CalendarDays className="size-3.5" />
                    Fee Months
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {parseFeeMonths(selectedRoute.feeMonths).map((month) => (
                      <Badge key={month} variant="secondary" className="border-violet-500/25 bg-violet-500/[0.08] text-xs">
                        {month}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] to-transparent px-5 py-3 sm:px-6">
            <Button variant="outline" size="sm" className="h-8 px-4 text-xs" onClick={() => setSelectedRoute(null)}>
              Close
            </Button>
            {selectedRoute && canUpdate && (
              <Button size="sm" className="h-8 gap-1.5 px-4 text-xs" onClick={() => { setSelectedRoute(null); handleEdit(selectedRoute) }}>
                <Pencil className="size-3.5" />
                Edit Route
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRoute} onOpenChange={(open) => { if (!open) setDeleteRoute(null) }}>
        <AlertDialogContent className="overflow-hidden border-primary/20 bg-card p-0 shadow-2xl shadow-primary/15 sm:max-w-md">
          <AlertDialogHeader className="relative overflow-hidden border-b border-white/15 bg-[linear-gradient(135deg,var(--primary)_0%,#0d9488_48%,#2563eb_100%)] px-5 py-4 pr-12 text-white sm:px-6">
            <div aria-hidden className="absolute -right-10 -top-16 size-40 rounded-full border-[18px] border-white/10" />
            <div aria-hidden className="absolute -bottom-14 left-10 size-28 rounded-full bg-emerald-300/20 blur-2xl" />
            <div aria-hidden className="absolute bottom-0 right-24 h-24 w-44 rounded-full bg-sky-300/15 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-md backdrop-blur-sm">
                <Trash2 className="size-5 text-white" />
              </span>
              <div>
                <AlertDialogTitle className="text-lg font-bold tracking-normal text-white">Delete Route</AlertDialogTitle>
                <AlertDialogDescription className="mt-0.5 text-xs text-white/75">
                  Remove &ldquo;{deleteRoute?.routeName}&rdquo; from the transport network.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.055] px-5 py-4 sm:px-6">
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. All data associated with this route will be permanently removed for the selected academic year.
            </p>
          </div>
          <AlertDialogFooter className="shrink-0 flex-wrap gap-2 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] to-transparent px-5 py-3 sm:px-6">
            <AlertDialogCancel disabled={deleting} className="h-8 px-4 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="h-8 gap-1.5 px-4 text-xs bg-rose-600 hover:bg-rose-700"
            >
              <Trash2 className="size-3.5" />
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
