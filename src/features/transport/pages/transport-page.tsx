'use client'

import { useState, useEffect, useCallback } from 'react'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { PlusCircle, Bus, MapPin, Phone, User, MoreVertical, Pencil, Trash2, Search, X, Route as RouteIcon, Users } from 'lucide-react'

interface TransportRoute {
  id: string
  routeName: string
  routeNumber: string | null
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

export function TransportPage() {
  const { toast } = useToast()
  const { navigateTo } = useAppStore()
  const [routes, setRoutes] = useState<TransportRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [editRoute, setEditRoute] = useState<TransportRoute | null>(null)
  const [editForm, setEditForm] = useState({
    routeName: '', routeNumber: '', startPoint: '', endPoint: '',
    stops: '', distance: '', driverName: '', driverPhone: '',
    vehicleNumber: '', capacity: '40', fee: '', isActive: true,
  })
  const [editStops, setEditStops] = useState<string[]>([])
  const [newStop, setNewStop] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteRoute, setDeleteRoute] = useState<TransportRoute | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get<{ routes: TransportRoute[] }>('/api/school/transport/routes')
      setRoutes(res.routes || [])
    } catch {
      toast({ title: 'Couldn\'t Load Routes', description: 'We couldn\'t load the transport routes. Please refresh the page.', variant: 'destructive' })
    } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { fetchData() }, [fetchData])

  const parseStops = (stops: string | null | undefined): string[] => {
    if (!stops) return []
    try {
      const parsed = JSON.parse(stops)
      return Array.isArray(parsed) ? parsed : stops.split(',').map(s => s.trim()).filter(Boolean)
    } catch {
      return stops.split(',').map(s => s.trim()).filter(Boolean)
    }
  }

  const handleEdit = (route: TransportRoute) => {
    setEditRoute(route)
    const stopsList = parseStops(route.stops)
    setEditStops(stopsList)
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
      isActive: route.isActive !== false,
    })
    setShowEdit(true)
  }

  const handleAddEditStop = () => {
    const trimmed = newStop.trim()
    if (!trimmed) return
    if (editStops.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: 'Duplicate Stop', description: 'This stop already exists in the list.' })
      return
    }
    setEditStops(prev => [...prev, trimmed])
    setNewStop('')
  }

  const handleRemoveEditStop = (index: number) => {
    setEditStops(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdate = async () => {
    if (!editRoute) return
    setSaving(true)
    try {
      await api.put(`/api/school/transport/routes/${editRoute.id}`, {
        routeName: editForm.routeName,
        routeNumber: editForm.routeNumber || null,
        startPoint: editForm.startPoint || null,
        endPoint: editForm.endPoint || null,
        stops: editStops,
        distance: editForm.distance ? parseFloat(editForm.distance) : null,
        driverName: editForm.driverName || null,
        driverPhone: editForm.driverPhone || null,
        vehicleNumber: editForm.vehicleNumber || null,
        capacity: parseInt(editForm.capacity) || 40,
        fee: parseFloat(editForm.fee) || 0,
        isActive: editForm.isActive,
      })
      toast({ title: 'Route Updated', description: `"${editForm.routeName}" has been updated successfully.` })
      setShowEdit(false)
      setEditRoute(null)
      fetchData()
    } catch (err) {
      toast({ title: 'Couldn\'t Update Route', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally { setSaving(false) }
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
      toast({ title: 'Couldn\'t Delete Route', description: err instanceof Error ? err.message : 'Something went wrong. Please try again.', variant: 'destructive' })
    } finally { setDeleting(false) }
  }

  // Filter routes by search
  const filteredRoutes = routes.filter(r => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return r.routeName.toLowerCase().includes(q) ||
      (r.routeNumber && r.routeNumber.toLowerCase().includes(q)) ||
      (r.driverName && r.driverName.toLowerCase().includes(q)) ||
      (r.vehicleNumber && r.vehicleNumber.toLowerCase().includes(q)) ||
      (r.startPoint && r.startPoint.toLowerCase().includes(q)) ||
      (r.endPoint && r.endPoint.toLowerCase().includes(q))
  })

  const activeCount = routes.filter(r => r.isActive !== false).length
  const inactiveCount = routes.length - activeCount

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transport Routes"
        description={`${routes.length} route${routes.length !== 1 ? 's' : ''} · ${activeCount} active · ${inactiveCount} inactive`}
        action={{ label: 'Add Route', icon: PlusCircle, onClick: () => navigateTo('add-transport-route') }}
      />

      {/* Search */}
      {routes.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by route name, number, driver..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
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
      ) : filteredRoutes.length === 0 ? (
        <div className="text-center py-12">
          <Search className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No routes match &ldquo;{searchQuery}&rdquo;</p>
          <Button variant="link" size="sm" onClick={() => setSearchQuery('')} className="mt-1">
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRoutes.map(route => {
            const stopsList = parseStops(route.stops)
            const allocationCount = route._count?.allocations || 0

            return (
              <Card
                key={route.id}
                className={`group relative overflow-hidden transition-all duration-200 hover:shadow-md border ${route.isActive === false ? 'opacity-60' : ''}`}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 dark:bg-emerald-900/50">
                      <Bus className="size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight truncate" title={route.routeName}>
                        {route.routeName}
                      </h3>
                      {route.routeNumber && (
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">#{route.routeNumber}</p>
                      )}
                    </div>
                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="size-4" />
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
                  </div>

                  {/* Badges Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="text-[10px] px-1.5 py-0 h-5 font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                      ₹{route.fee?.toLocaleString() || 0}/mo
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      <Users className="size-3 mr-0.5" />
                      {allocationCount}/{route.capacity}
                    </Badge>
                    {route.distance != null && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        {route.distance} km
                      </Badge>
                    )}
                    {route.isActive === false && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">
                        Inactive
                      </Badge>
                    )}
                  </div>

                  {/* Route Path */}
                  {(route.startPoint || route.endPoint) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <RouteIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{route.startPoint || '—'}</span>
                      <span className="text-muted-foreground/50">→</span>
                      <span className="truncate">{route.endPoint || '—'}</span>
                    </div>
                  )}

                  {/* Stops */}
                  {stopsList.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Stops</p>
                      <div className="flex flex-wrap gap-1">
                        {stopsList.slice(0, 4).map((stop, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            <MapPin className="size-2.5 mr-0.5" />
                            {stop}
                          </Badge>
                        ))}
                        {stopsList.length > 4 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            +{stopsList.length - 4} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Driver & Vehicle */}
                  {(route.driverName || route.vehicleNumber) && (
                    <div className="space-y-1">
                      {route.driverName && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <User className="size-3.5 shrink-0" />
                          <span className="truncate">{route.driverName}</span>
                          {route.driverPhone && (
                            <span className="text-muted-foreground/60 truncate">· {route.driverPhone}</span>
                          )}
                        </div>
                      )}
                      {route.vehicleNumber && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Bus className="size-3.5 shrink-0" />
                          <span className="truncate">{route.vehicleNumber}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick Actions Row */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => handleEdit(route)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                      onClick={() => setDeleteRoute(route)}
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </Button>
                  </div>
                </CardContent>

                {/* Accent line */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400" />
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
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

      {/* Edit Route Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transport Route</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Route Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Route Name <span className="text-destructive">*</span></Label>
                <Input value={editForm.routeName} onChange={e => setEditForm(f => ({ ...f, routeName: e.target.value }))} placeholder="e.g., Route A" />
              </div>
              <div className="space-y-2">
                <Label>Route Number</Label>
                <Input value={editForm.routeNumber} onChange={e => setEditForm(f => ({ ...f, routeNumber: e.target.value }))} placeholder="e.g., R-001" />
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
                <Label>Distance (km)</Label>
                <Input type="number" value={editForm.distance} onChange={e => setEditForm(f => ({ ...f, distance: e.target.value }))} placeholder="e.g., 15.5" />
              </div>
              <div className="space-y-2">
                <Label>Fee (₹) <span className="text-destructive">*</span></Label>
                <Input type="number" value={editForm.fee} onChange={e => setEditForm(f => ({ ...f, fee: e.target.value }))} placeholder="e.g., 1500" />
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

            {/* Stops */}
            <div className="space-y-2">
              <Label>Stops</Label>
              <div className="flex gap-2">
                <Input
                  value={newStop}
                  onChange={e => setNewStop(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddEditStop() } }}
                  placeholder="Add a stop"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddEditStop} className="shrink-0">
                  <PlusCircle className="size-4" />
                </Button>
              </div>
              {editStops.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editStops.map((stop, i) => (
                    <Badge key={i} variant="outline" className="text-xs gap-1 pr-1">
                      {stop}
                      <button onClick={() => handleRemoveEditStop(i)} className="hover:text-destructive">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Driver & Vehicle */}
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
