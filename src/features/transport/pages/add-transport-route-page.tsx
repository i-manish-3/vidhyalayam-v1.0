'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Bus, CalendarDays, Eye, Loader2, MapPin, PlusCircle, User, X } from 'lucide-react'

interface DriverOption {
  id: string
  name: string
  phone: string | null
  isActive?: boolean
}

interface RouteStop {
  name: string
  fare: string
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

export function AddTransportRoutePage() {
  const { toast } = useToast()
  const router = useRouter()
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)

  // Year is implicit: whatever the user is currently viewing on the routes
  // list (top-bar session switcher). Falls back to the school's active session,
  // and finally to the computed current academic year. No dropdown on this
  // page — switching sessions happens in the global top-bar.
  const academicYear = viewingAcademicYear || currentSchoolAcademicYear || getCurrentAcademicYear()

  const [routeName, setRouteName] = useState('')
  const [routeCode, setRouteCode] = useState('')
  const [startPoint, setStartPoint] = useState('')
  const [endPoint, setEndPoint] = useState('')
  const [distance, setDistance] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [feeMonths, setFeeMonths] = useState<string[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [driverId, setDriverId] = useState('')
  const [stops, setStops] = useState<RouteStop[]>([])
  const [stopName, setStopName] = useState('')
  const [stopFare, setStopFare] = useState('')
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fetchDrivers = useCallback(async () => {
    try {
      setLoadingDrivers(true)
      const res = await api.get<{ drivers: DriverOption[] }>('/api/school/transport/drivers')
      setDrivers(res.drivers || [])
    } catch {
      toast({
        title: "Couldn't Load Drivers",
        description: 'Please add staff with the Transport role, then try again.',
        variant: 'destructive',
      })
    } finally {
      setLoadingDrivers(false)
    }
  }, [toast])

  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

  const toggleFeeMonth = (month: string) => {
    setFeeMonths((current) =>
      current.includes(month)
        ? current.filter((item) => item !== month)
        : sortAcademicMonths([...current, month])
    )
  }

  const setAllFeeMonths = (checked: boolean) => {
    setFeeMonths(checked ? [...FEE_MONTH_OPTIONS] : [])
  }

  const addStop = () => {
    const name = stopName.trim()
    const fare = Number(stopFare)

    if (!name) {
      toast({ title: 'Stop Name Required', description: 'Please enter the stop name.', variant: 'destructive' })
      return
    }

    if (!Number.isFinite(fare) || fare < 0) {
      toast({ title: 'Invalid Stop Fare', description: 'Please enter a valid stop fare.', variant: 'destructive' })
      return
    }

    if (stops.some((stop) => stop.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: 'Duplicate Stop', description: `"${name}" has already been added.`, variant: 'destructive' })
      return
    }

    setStops((current) => [...current, { name, fare: stopFare }])
    setStopName('')
    setStopFare('')
  }

  const removeStop = (index: number) => {
    setStops((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleStopKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addStop()
    }
  }

  const canSubmit = useMemo(() =>
    routeName.trim().length >= 2 &&
    routeCode.trim().length >= 2 &&
    academicYear &&
    feeMonths.length > 0 &&
    stops.length > 0 &&
    !submitting
  , [academicYear, feeMonths.length, routeCode, routeName, stops.length, submitting])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!routeName.trim()) {
      toast({ title: 'Route Name Required', description: 'Please enter the route name.', variant: 'destructive' })
      return
    }

    if (!routeCode.trim()) {
      toast({ title: 'Route Code Required', description: 'Please enter the route code.', variant: 'destructive' })
      return
    }

    if (!academicYear) {
      toast({ title: 'Academic Year Required', description: 'Please choose the academic year.', variant: 'destructive' })
      return
    }

    if (feeMonths.length === 0) {
      toast({ title: 'Fee Months Required', description: 'Please select at least one month for the route fee.', variant: 'destructive' })
      return
    }

    if (stops.length === 0) {
      toast({ title: 'Stop Required', description: 'Please add at least one stop with fare.', variant: 'destructive' })
      return
    }

    const trimmedDistance = distance.trim()
    const distanceValue = trimmedDistance ? Number(trimmedDistance) : null
    if (distanceValue !== null && (!Number.isFinite(distanceValue) || distanceValue < 0)) {
      toast({ title: 'Invalid Distance', description: 'Please enter a valid distance in km.', variant: 'destructive' })
      return
    }

    try {
      setSubmitting(true)

      await api.post('/api/school/transport/routes', {
        routeName: routeName.trim(),
        routeNumber: routeCode.trim(),
        academicYear,
        feeMonths,
        startPoint: startPoint.trim() || null,
        endPoint: endPoint.trim() || null,
        distance: distanceValue,
        vehicleNumber: vehicleNumber.trim() || null,
        driverId: driverId || null,
        stops: stops.map((stop) => ({
          name: stop.name,
          fare: Number(stop.fare),
        })),
      })

      toast({
        title: 'Route Created',
        description: `"${routeName.trim()}" has been added successfully.`,
      })

      router.push('/transport/routes')
    } catch (err) {
      toast({
        title: 'Failed to Create Route',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Create Route"
        description="Set the route name, route code, fee months, stop fares, and optional driver"
        secondaryAction={{
          label: 'View Routes',
          icon: Eye,
          onClick: () => router.push('/transport/routes'),
        }}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                <Bus className="size-3.5" />
              </span>
              Basic Route Info
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3 sm:px-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="route-name" className="text-xs font-medium">
                  Route Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="route-name"
                  placeholder="e.g., City Center Route"
                  value={routeName}
                  onChange={(event) => setRouteName(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="route-code" className="text-xs font-medium">
                  Route Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="route-code"
                  placeholder="e.g., TR-001"
                  value={routeCode}
                  onChange={(event) => setRouteCode(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              Creating in session <Badge variant="secondary" className="font-mono text-[11px]">{academicYear}</Badge>
              <span>— switch session from the top-bar to create in a different year.</span>
            </p>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                <MapPin className="size-3.5" />
              </span>
              Route Path & Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3 sm:px-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="start-point" className="text-xs font-medium">
                  Start Point
                </Label>
                <Input
                  id="start-point"
                  placeholder="e.g., City Center"
                  value={startPoint}
                  onChange={(event) => setStartPoint(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-point" className="text-xs font-medium">
                  End Point
                </Label>
                <Input
                  id="end-point"
                  placeholder="e.g., School Gate"
                  value={endPoint}
                  onChange={(event) => setEndPoint(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="distance" className="text-xs font-medium">
                  Distance (km)
                </Label>
                <Input
                  id="distance"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="e.g., 12.5"
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vehicle-number" className="text-xs font-medium">
                  Vehicle Number
                </Label>
                <Input
                  id="vehicle-number"
                  placeholder="e.g., DL 1A 1234"
                  value={vehicleNumber}
                  onChange={(event) => setVehicleNumber(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="flex flex-col gap-2 border-b bg-muted/30 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                <CalendarDays className="size-3.5" />
              </span>
              Fee Months
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Checkbox
                  checked={
                    feeMonths.length === FEE_MONTH_OPTIONS.length
                      ? true
                      : feeMonths.length > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) => setAllFeeMonths(checked === true)}
                  aria-label="Select all fee months"
                />
                All months
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFeeMonths([])}
                disabled={feeMonths.length === 0}
                className="h-7 px-2 text-xs"
              >
                Clear all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-3 sm:px-5">
            <div className="space-y-3">
              <Label className="text-xs font-medium">
                Fees Applied Months <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {FEE_MONTH_OPTIONS.map((month) => {
                  const checked = feeMonths.includes(month)
                  return (
                    <label
                      key={month}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleFeeMonth(month)} />
                      <span>{month}</span>
                    </label>
                  )
                })}
              </div>
              {feeMonths.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {feeMonths.map((month) => (
                    <Badge key={month} variant="secondary" className="gap-1.5 py-1.5 px-3 text-sm">
                      <CalendarDays className="size-3" />
                      {month}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-muted-foreground/20"
                        onClick={() => toggleFeeMonth(month)}
                        aria-label={`Remove month ${month}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                <PlusCircle className="size-3.5" />
              </span>
              Stops & Fares
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3 sm:px-5">
            <div className="space-y-3">
              <Label className="text-xs font-medium">
                Stops <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_auto]">
                <Input
                  placeholder="Stop name"
                  value={stopName}
                  onChange={(event) => setStopName(event.target.value)}
                  onKeyDown={handleStopKeyDown}
                  className="h-10"
                />
                <Input
                  type="number"
                  min="0"
                  placeholder="Stop fare"
                  value={stopFare}
                  onChange={(event) => setStopFare(event.target.value)}
                  onKeyDown={handleStopKeyDown}
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-1.5"
                  onClick={addStop}
                  disabled={!stopName.trim() || !stopFare.trim()}
                >
                  <PlusCircle className="size-4" />
                  Add Stop
                </Button>
              </div>

              {stops.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {stops.map((stop, index) => (
                    <Badge key={`${stop.name}-${index}`} variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
                      <MapPin className="size-3" />
                      {stop.name}: {stop.fare}
                      <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-muted-foreground/20"
                        onClick={() => removeStop(index)}
                        aria-label={`Remove stop ${stop.name}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="bg-brand-soft flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm">
                <User className="size-3.5" />
              </span>
              Driver Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-3 sm:px-5">
            <div className="space-y-2">
              <Label htmlFor="driver" className="text-xs font-medium">
                Driver
              </Label>
              <Select value={driverId} onValueChange={setDriverId} disabled={loadingDrivers || submitting}>
                <SelectTrigger id="driver" className="h-10">
                  <SelectValue placeholder={loadingDrivers ? 'Loading drivers...' : 'Choose driver later or now'} />
                </SelectTrigger>
                <SelectContent>
                  {drivers.filter((driver) => driver.isActive !== false).map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.name}{driver.phone ? ` - ${driver.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!loadingDrivers && drivers.length === 0 && (
                <p className="text-xs text-muted-foreground">No drivers found. You can create the route now and assign a driver later.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Route name, code, fee months, and at least one stop are required.
            </p>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!canSubmit} className="min-w-[140px] gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Bus className="size-4" />
                    Create Route
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/transport/routes')} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
