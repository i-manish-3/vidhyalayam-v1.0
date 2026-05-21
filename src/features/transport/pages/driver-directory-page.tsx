'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CalendarDays, IdCard, Phone, PlusCircle, Search, UserCheck, X } from 'lucide-react'

interface Driver {
  id: string
  name: string
  phone: string | null
  avatar?: string | null
  dob?: string | null
  drivingLicenseNumber?: string | null
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
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DriverDirectoryPage() {
  const { toast } = useToast()
  const { goBack, navigateTo } = useAppStore()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [search, setSearch] = useState('')
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)

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

  const filteredDrivers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return drivers

    return drivers.filter((driver) => {
      const assignedRoutes = routesByDriver.get(driver.id) || []
      const haystack = [
        driver.name,
        driver.phone,
        driver.drivingLicenseNumber,
        ...assignedRoutes.flatMap((route) => [route.routeName, route.routeNumber]),
      ].filter(Boolean).join(' ').toLowerCase()

      return haystack.includes(query)
    })
  }, [drivers, routesByDriver, search])

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver Directory"
        description={`${drivers.length} transport driver${drivers.length !== 1 ? 's' : ''} registered`}
        backAction={{ onClick: () => goBack('transport') }}
        action={{ label: 'Add Driver', icon: PlusCircle, onClick: () => navigateTo('add-driver') }}
      />

      {drivers.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No Drivers"
          description="Add transport drivers to assign them to routes."
          action={{ label: 'Add Driver', onClick: () => navigateTo('add-driver') }}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search driver, phone, license, or route"
                className="h-10 pl-9 pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>

          {filteredDrivers.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="mx-auto mb-3 size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No drivers match &ldquo;{search}&rdquo;</p>
              <Button variant="link" size="sm" onClick={() => setSearch('')} className="mt-1">
                Clear search
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="min-w-[260px] px-4">Driver</TableHead>
                  <TableHead className="min-w-[180px]">Contact</TableHead>
                  <TableHead className="min-w-[180px]">License</TableHead>
                  <TableHead className="min-w-[180px]">Assigned Routes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.map((driver) => {
                  const assignedRoutes = routesByDriver.get(driver.id) || []
                  return (
                    <TableRow key={driver.id} className="cursor-pointer" onClick={() => setSelectedDriver(driver)}>
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
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <Dialog open={!!selectedDriver} onOpenChange={(open) => { if (!open) setSelectedDriver(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Driver Profile</DialogTitle>
          </DialogHeader>
          {selectedDriver && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="size-16 border">
                  {selectedDriver.avatar ? <AvatarImage src={selectedDriver.avatar} alt={selectedDriver.name} /> : null}
                  <AvatarFallback className="text-lg font-semibold">{initials(selectedDriver.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-semibold leading-tight">{selectedDriver.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedDriver.phone || 'No phone added'}</p>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Phone</p>
                  <p className="mt-1 text-sm font-medium">{selectedDriver.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Date of Birth</p>
                  <p className="mt-1 text-sm font-medium">{formatDate(selectedDriver.dob)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">License Number</p>
                  <p className="mt-1 text-sm font-medium">{selectedDriver.drivingLicenseNumber || '-'}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Assigned Routes</p>
                {(routesByDriver.get(selectedDriver.id) || []).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(routesByDriver.get(selectedDriver.id) || []).map((route) => (
                      <Badge key={route.id} variant="secondary">
                        {route.routeNumber ? `${route.routeName} (#${route.routeNumber})` : route.routeName}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No route assigned.
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
