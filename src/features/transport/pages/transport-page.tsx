'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlusCircle, Bus, User, MoreVertical, Pencil, Trash2, Search, X, CheckCircle2, CircleOff } from 'lucide-react'

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

interface TransportDriver {
  id: string
  name: string
  phone: string | null
  avatar?: string | null
}

export function TransportPage() {
  const router = useRouter()
  const { toast } = useToast()
  const viewingAcademicYear = useAppStore((state) => state.viewingAcademicYear)
  const currentSchool = useAppStore((state) => state.currentSchool)
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [drivers, setDrivers] = useState<TransportDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
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
      return Array.isArray(parsed) ? parsed.filter((month): month is string => typeof month === 'string' && !!month.trim()) : []
    } catch {
      return value.split(',').map(month => month.trim()).filter(Boolean)
    }
  }

  const handleEdit = (route: TransportRoute) => {
    router.push(`/transport/routes/${route.id}/edit`)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport Routes"
        description={`${routes.length} route${routes.length !== 1 ? 's' : ''} in the transport network`}
        action={{ label: 'Add Route', icon: PlusCircle, onClick: () => router.push('/transport/routes/new') }}
      />

      {routes.length === 0 ? (
        <EmptyState
          icon={Bus}
          title="No Transport Routes"
          description="Add transport routes to manage student commuting and vehicle assignments."
          action={{ label: 'Add Route', onClick: () => router.push('/transport/routes/new') }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold">Route List</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredRoutes.length} of {routes.length} route{routes.length !== 1 ? 's' : ''} shown
                </p>
              </div>
              <div className="relative w-full lg:max-w-md">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search route, driver, vehicle, or stop"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredRoutes.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No routes match &ldquo;{searchQuery}&rdquo;</p>
              <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
                Clear search
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-[320px] px-4">Route</TableHead>
                  <TableHead className="min-w-[220px]">Driver</TableHead>
                  <TableHead className="min-w-[180px]">Fee Year</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="w-[52px]" />
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
                        'cursor-pointer',
                        isInactive ? 'bg-muted/20 opacity-75' : ''
                      )}
                      onClick={() => setSelectedRoute(route)}
                    >
                      <TableCell className="px-4 py-4 align-top whitespace-normal">
                        <div className="flex min-w-0 gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <Bus className="size-5" />
                          </div>
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold leading-tight">{route.routeName}</h3>
                              {route.routeNumber && (
                                <Badge variant="outline" className="font-mono text-[11px]">#{route.routeNumber}</Badge>
                              )}
                              {route.distance != null && (
                                <Badge variant="secondary" className="text-[11px]">{route.distance} km</Badge>
                              )}
                            </div>
                            {stopsList.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {stopsList.map((stop, i) => (
                                  <Badge key={`${route.id}-stop-${i}`} variant="outline" className="max-w-[160px] truncate text-[11px]">
                                    {stop.name}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4 align-top whitespace-normal">
                        <div className="flex items-start gap-3">
                          <Avatar className="size-9 border">
                            {driver?.avatar ? <AvatarImage src={driver.avatar} alt={route.driverName || 'Driver'} /> : null}
                            <AvatarFallback className="text-xs font-semibold">
                              {route.driverName ? driverInitials(route.driverName) : <User className="size-4 text-muted-foreground" />}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 space-y-1">
                            <div className="truncate text-sm font-medium">
                              {route.driverName || 'Not assigned'}
                            </div>
                            {route.driverPhone && (
                              <p className="text-xs text-muted-foreground">{route.driverPhone}</p>
                            )}
                            {route.vehicleNumber && (
                              <p className="text-xs font-medium text-muted-foreground">{route.vehicleNumber}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4 align-top whitespace-normal">
                        <div className="space-y-2">
                          <Badge variant="outline">{route.academicYear || '2025-2026'}</Badge>
                          {feeMonths.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {feeMonths.slice(0, 4).map((month) => (
                                <Badge key={`${route.id}-${month}`} variant="secondary" className="text-[11px]">
                                  {month}
                                </Badge>
                              ))}
                              {feeMonths.length > 4 && (
                                <Badge variant="secondary" className="text-[11px]">+{feeMonths.length - 4}</Badge>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No months selected</p>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="py-4 align-top">
                        {isInactive ? (
                          <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
                            <CircleOff className="size-3" />
                            Inactive
                          </Badge>
                        ) : (
                          <Badge className="gap-1.5 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300">
                            <CheckCircle2 className="size-3" />
                            Active
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="py-4 align-top">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreVertical className="size-4" />
                              <span className="sr-only">Open route actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={(event) => {
                              event.stopPropagation()
                              handleEdit(route)
                            }}>
                              <Pencil className="mr-2 size-3.5" />
                              Edit
                            </DropdownMenuItem>
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
      )}

      <Dialog open={!!selectedRoute} onOpenChange={(open) => { if (!open) setSelectedRoute(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedRoute?.routeName || 'Route Details'}</DialogTitle>
          </DialogHeader>
          {selectedRoute && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {selectedRoute.routeNumber && <Badge variant="outline">#{selectedRoute.routeNumber}</Badge>}
                <Badge variant="secondary">{selectedRoute.academicYear || 'Academic year not set'}</Badge>
              </div>
              {sortedStopsByFare(selectedRoute).length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No stops added for this route.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Stop Name</TableHead>
                        <TableHead className="text-right">Fare</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedStopsByFare(selectedRoute).map((stop, index) => (
                        <TableRow key={`${selectedRoute.id}-modal-stop-${index}`}>
                          <TableCell className="font-medium">{stop.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(stop.fare || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRoute} onOpenChange={(open) => { if (!open) setDeleteRoute(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Route</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{deleteRoute?.routeName}&rdquo;</strong>? This action cannot be undone. All data associated with this route will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
