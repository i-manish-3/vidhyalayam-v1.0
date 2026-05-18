'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { toAcademicYearOptions } from '@/lib/academic-years'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PlusCircle, Bus, MapPin, User, MoreVertical, Pencil, Trash2, Search, X, Route as RouteIcon, Users, ArrowRight, CheckCircle2, CircleOff, Wallet } from 'lucide-react'

const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface TransportRoute {
  id: string
  routeName: string
  routeNumber: string | null
  academicYear: string
  feeMonths: string
  startPoint: string | null
  endPoint: string | null
  stops: string | null
  distance: number | null
  driverName: string | null
  driverPhone: string | null
  vehicleNumber: string | null
  capacity: number
  fee: number
  isActive: boolean
  _count?: { allocations: number }
  [key: string]: unknown
}

interface TransportStop {
  name: string
  fare?: number
}

interface EditableTransportStop {
  name: string
  fare: string
}

export function TransportPage() {
  const { toast } = useToast()
  const { navigateTo, currentSchool } = useAppStore()
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [editRoute, setEditRoute] = useState<TransportRoute | null>(null)
  const [editForm, setEditForm] = useState({
    routeName: '', routeNumber: '', startPoint: '', endPoint: '',
    stops: '', distance: '', driverName: '', driverPhone: '',
    vehicleNumber: '', capacity: '40', fee: '', academicYear: '2025-2026', feeMonths: [] as string[], isActive: true,
  })
  const [editStops, setEditStops] = useState<EditableTransportStop[]>([])
  const [newStopName, setNewStopName] = useState('')
  const [newStopFare, setNewStopFare] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteRoute, setDeleteRoute] = useState<TransportRoute | null>(null)
  const [deleting, setDeleting] = useState(false)
  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears, currentSchool?.academicYear),
    [availableAcademicYears, currentSchool?.academicYear]
  )

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ routes: TransportRoute[] }>('/api/school/transport/routes')
      setRoutes(res.routes || [])
    } catch {
      toast({ title: "Couldn't Load Routes", description: "We couldn't load the transport routes. Please refresh the page.", variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const fetchAcademicYears = useCallback(async () => {
    try {
      const res = await api.get<{ academicYears: string[] }>('/api/school/academic-years')
      setAvailableAcademicYears(res.academicYears || [])
    } catch {
      setAvailableAcademicYears(currentSchool?.academicYear ? [currentSchool.academicYear] : [])
    }
  }, [currentSchool?.academicYear])

  useEffect(() => { fetchAcademicYears() }, [fetchAcademicYears])

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
    setEditRoute(route)
    const stopsList = parseStops(route.stops)
    setEditStops(stopsList.map(stop => ({
      name: stop.name,
      fare: stop.fare != null ? String(stop.fare) : String(route.fee || 0),
    })))
    setNewStopName('')
    setNewStopFare('')
    setEditForm({
      routeName: route.routeName,
      routeNumber: route.routeNumber || '',
      startPoint: route.startPoint || '',
      endPoint: route.endPoint || '',
      stops: '',
      distance: route.distance != null ? String(route.distance) : '',
      driverName: route.driverName || '',
      driverPhone: route.driverPhone || '',
      vehicleNumber: route.vehicleNumber || '',
      capacity: String(route.capacity || 40),
      fee: String(route.fee || 0),
      academicYear: route.academicYear || '2025-2026',
      feeMonths: parseFeeMonths(route.feeMonths),
      isActive: route.isActive !== false,
    })
    setShowEdit(true)
  }

  const handleAddEditStop = () => {
    const name = newStopName.trim()
    const fare = Number(newStopFare)
    if (!name) return

    if (!newStopFare.trim() || !Number.isFinite(fare) || fare < 0) {
      toast({ title: 'Invalid Stop Fare', description: 'Please enter a valid fare for this stop.' })
      return
    }

    if (editStops.some(stop => stop.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: 'Duplicate Stop', description: 'This stop already exists in the list.' })
      return
    }
    setEditStops(prev => [...prev, { name, fare: String(fare) }])
    setNewStopName('')
    setNewStopFare('')
  }

  const handleRemoveEditStop = (index: number) => {
    setEditStops(prev => prev.filter((_, i) => i !== index))
  }

  const toggleEditFeeMonth = (month: string) => {
    setEditForm((form) => ({
      ...form,
      feeMonths: form.feeMonths.includes(month)
        ? form.feeMonths.filter((item) => item !== month)
        : [...form.feeMonths, month],
    }))
  }

  const handleUpdate = async () => {
    if (!editRoute) return

    const routeCode = editForm.routeName.trim()
    const fareAmount = Number(editForm.fee)
    const capacity = Number(editForm.capacity)
    const stops = editStops.map(stop => ({
      name: stop.name.trim(),
      fare: Number(stop.fare),
    }))

    if (!routeCode) {
      toast({ title: 'Route Code Required', description: 'Please enter the route code.', variant: 'destructive' })
      return
    }

    if (!editForm.academicYear) {
      toast({ title: 'Academic Year Required', description: 'Please choose the academic year.', variant: 'destructive' })
      return
    }

    if (!editForm.fee.trim() || !Number.isFinite(fareAmount) || fareAmount < 0) {
      toast({ title: 'Invalid Fare', description: 'Please enter a valid fare for the selected academic year.', variant: 'destructive' })
      return
    }

    if (editForm.feeMonths.length === 0) {
      toast({ title: 'Fee Months Required', description: 'Please select at least one fee month.', variant: 'destructive' })
      return
    }

    if (!Number.isInteger(capacity) || capacity < 1) {
      toast({ title: 'Invalid Capacity', description: 'Please enter a valid vehicle capacity.', variant: 'destructive' })
      return
    }

    if (stops.length === 0 || stops.some(stop => !stop.name || !Number.isFinite(stop.fare) || stop.fare < 0)) {
      toast({ title: 'Stops Required', description: 'Please add each stop with a valid fare.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await api.put(`/api/school/transport/routes/${editRoute.id}`, {
        routeName: routeCode,
        routeNumber: editForm.routeNumber || null,
        startPoint: editForm.startPoint || null,
        endPoint: editForm.endPoint || null,
        stops,
        distance: editForm.distance ? parseFloat(editForm.distance) : null,
        driverName: editForm.driverName || null,
        driverPhone: editForm.driverPhone || null,
        vehicleNumber: editForm.vehicleNumber || null,
        capacity,
        fee: fareAmount,
        academicYear: editForm.academicYear,
        feeMonths: editForm.feeMonths,
        isActive: editForm.isActive,
      })
      toast({ title: 'Route Updated', description: `"${routeCode}" has been updated successfully.` })
      setShowEdit(false)
      setEditRoute(null)
      fetchData()
    } catch (err) {
      toast({ title: "Couldn't Update Route", description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteRoute) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/transport/routes/${deleteRoute.id}`)
      toast({ title: 'Route Deleted', description: `"${deleteRoute.routeName}" has been removed.` })
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
      (r.startPoint && r.startPoint.toLowerCase().includes(q)) ||
      (r.endPoint && r.endPoint.toLowerCase().includes(q)) ||
      parseStops(r.stops).some(stop =>
        stop.name.toLowerCase().includes(q) ||
        (stop.fare != null && String(stop.fare).includes(q))
      )
  })

  const activeCount = routes.filter(r => r.isActive !== false).length
  const inactiveCount = routes.length - activeCount
  const totalAllocations = routes.reduce((sum, route) => sum + (route._count?.allocations || 0), 0)
  const totalCapacity = routes.reduce((sum, route) => sum + (route.capacity || 0), 0)
  const averageFee = routes.length
    ? Math.round(routes.reduce((sum, route) => sum + (Number(route.fee) || 0), 0) / routes.length)
    : 0
  const capacityUsedPercent = totalCapacity > 0 ? Math.round((totalAllocations / totalCapacity) * 100) : 0

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport Routes"
        description={`${routes.length} route${routes.length !== 1 ? 's' : ''} in the transport network`}
        action={{ label: 'Add Route', icon: PlusCircle, onClick: () => navigateTo('add-transport-route') }}
      />

      {routes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Active Routes</p>
                <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <RouteIcon className="size-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{inactiveCount} inactive</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Students Assigned</p>
                <p className="mt-1 text-2xl font-semibold">{totalAllocations}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                <Users className="size-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{capacityUsedPercent}% of {totalCapacity} seats used</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Total Seats</p>
                <p className="mt-1 text-2xl font-semibold">{totalCapacity}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <Bus className="size-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{Math.max(totalCapacity - totalAllocations, 0)} seats available</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Average Fee</p>
                <p className="mt-1 text-2xl font-semibold">{formatCurrency(averageFee)}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                <Wallet className="size-5" />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Academic year route fare</p>
          </div>
        </div>
      )}

      {routes.length === 0 ? (
        <EmptyState
          icon={Bus}
          title="No Transport Routes"
          description="Add transport routes to manage student commuting and vehicle assignments."
          action={{ label: 'Add Route', onClick: () => navigateTo('add-transport-route') }}
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
                  <TableHead className="min-w-[170px]">Capacity</TableHead>
                  <TableHead className="min-w-[130px]">Fare</TableHead>
                  <TableHead className="min-w-[120px]">Status</TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.map(route => {
                  const stopsList = parseStops(route.stops)
                  const allocationCount = route._count?.allocations || 0
                  const capacity = route.capacity || 0
                  const usedPercent = capacity > 0 ? Math.min(100, Math.round((allocationCount / capacity) * 100)) : 0
                  const isInactive = route.isActive === false
                  const feeMonths = parseFeeMonths(route.feeMonths)

                  return (
                    <TableRow key={route.id} className={isInactive ? 'bg-muted/20 opacity-75' : ''}>
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

                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="size-3.5 shrink-0" />
                              <span>{route.startPoint || 'Start not set'}</span>
                              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                              <span>{route.endPoint || 'End not set'}</span>
                            </div>

                            {stopsList.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {stopsList.slice(0, 4).map((stop, i) => (
                                  <Badge key={`${route.id}-stop-${i}`} variant="outline" className="max-w-[160px] truncate text-[11px]">
                                    {stop.name}{stop.fare != null ? `: ${formatCurrency(stop.fare)}` : ''}
                                  </Badge>
                                ))}
                                {stopsList.length > 4 && (
                                  <Badge variant="secondary" className="text-[11px]">+{stopsList.length - 4} more</Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4 align-top whitespace-normal">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <User className="size-4 shrink-0 text-muted-foreground" />
                            <span>{route.driverName || 'Not assigned'}</span>
                          </div>
                          {route.driverPhone && (
                            <p className="pl-6 text-xs text-muted-foreground">{route.driverPhone}</p>
                          )}
                          {route.vehicleNumber && (
                            <p className="pl-6 text-xs font-medium text-muted-foreground">{route.vehicleNumber}</p>
                          )}
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
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium">{allocationCount}/{capacity}</span>
                            <span className="text-xs text-muted-foreground">{usedPercent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${usedPercent}%` }} />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-4 align-top">
                        <div className="space-y-1">
                          <p className="font-semibold">{formatCurrency(route.fee)}</p>
                          <p className="text-xs text-muted-foreground">for academic year</p>
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
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreVertical className="size-4" />
                              <span className="sr-only">Open route actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => handleEdit(route)}>
                              <Pencil className="mr-2 size-3.5" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteRoute(route)}
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

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transport Route</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Route Code <span className="text-destructive">*</span></Label>
                <Input value={editForm.routeName} onChange={e => setEditForm(f => ({ ...f, routeName: e.target.value }))} placeholder="e.g., TR-001" />
              </div>
              <div className="space-y-2">
                <Label>Route Number</Label>
                <Input value={editForm.routeNumber} onChange={e => setEditForm(f => ({ ...f, routeNumber: e.target.value }))} placeholder="e.g., R-001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Academic Year <span className="text-destructive">*</span></Label>
                <Select value={editForm.academicYear} onValueChange={value => setEditForm(f => ({ ...f, academicYear: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYearOptions.map((year) => (
                      <SelectItem key={year.value} value={year.value}>
                        {year.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fare for Academic Year <span className="text-destructive">*</span></Label>
                <Input type="number" value={editForm.fee} onChange={e => setEditForm(f => ({ ...f, fee: e.target.value }))} placeholder="e.g., 1500" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fees Applied Months <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-3 gap-2">
                {FEE_MONTH_OPTIONS.map((month) => (
                  <label key={month} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Checkbox checked={editForm.feeMonths.includes(month)} onCheckedChange={() => toggleEditFeeMonth(month)} />
                    <span>{month}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Point</Label>
                <Input value={editForm.startPoint} onChange={e => setEditForm(f => ({ ...f, startPoint: e.target.value }))} placeholder="e.g., School Campus" />
              </div>
              <div className="space-y-2">
                <Label>End Point</Label>
                <Input value={editForm.endPoint} onChange={e => setEditForm(f => ({ ...f, endPoint: e.target.value }))} placeholder="e.g., City Bus Stand" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input type="number" value={editForm.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g., 40" />
              </div>
              <div className="space-y-2 flex items-end">
                <div className="flex items-center gap-3 rounded-lg border p-3 w-full">
                  <Switch checked={editForm.isActive} onCheckedChange={checked => setEditForm(f => ({ ...f, isActive: checked }))} />
                  <Label className="text-sm cursor-pointer">{editForm.isActive ? 'Active' : 'Inactive'}</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Stops</Label>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_auto]">
                <Input
                  value={newStopName}
                  onChange={e => setNewStopName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditStop() } }}
                  placeholder="Stop name"
                />
                <Input
                  type="number"
                  min="0"
                  value={newStopFare}
                  onChange={e => setNewStopFare(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditStop() } }}
                  placeholder="Fare"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddEditStop}
                  className="shrink-0"
                  disabled={!newStopName.trim() || !newStopFare.trim()}
                >
                  <PlusCircle className="size-4" />
                </Button>
              </div>
              {editStops.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editStops.map((stop, i) => (
                    <Badge key={`${stop.name}-${i}`} variant="outline" className="text-xs gap-1 pr-1">
                      {stop.name}: {formatCurrency(Number(stop.fare))}
                      <button type="button" onClick={() => handleRemoveEditStop(i)} className="hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Driver Name</Label>
                <Input value={editForm.driverName} onChange={e => setEditForm(f => ({ ...f, driverName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Driver Phone</Label>
                <Input value={editForm.driverPhone} onChange={e => setEditForm(f => ({ ...f, driverPhone: e.target.value }))} placeholder="e.g., +91 98765 43210" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vehicle Number</Label>
              <Input value={editForm.vehicleNumber} onChange={e => setEditForm(f => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))} placeholder="e.g., KA-01-AB-1234" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={!editForm.routeName || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
