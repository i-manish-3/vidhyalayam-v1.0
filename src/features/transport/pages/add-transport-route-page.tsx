'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { getCurrentAcademicYear, toAcademicYearOptions } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Bus, CalendarDays, Eye, Loader2, MapPin, PlusCircle, User, X } from 'lucide-react'

interface DriverOption {
  id: string
  name: string
  phone: string | null
}

interface RouteStop {
  name: string
  fare: string
}

const FEE_MONTH_OPTIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function AddTransportRoutePage() {
  const { toast } = useToast()
  const navigateTo = useAppStore((s) => s.navigateTo)
  const goBack = useAppStore((s) => s.goBack)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)

  const [routeName, setRouteName] = useState('')
  const [routeCode, setRouteCode] = useState('')
  const [academicYear, setAcademicYear] = useState(currentSchoolAcademicYear || getCurrentAcademicYear())
  const [feeMonths, setFeeMonths] = useState<string[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const [driverId, setDriverId] = useState('')
  const [stops, setStops] = useState<RouteStop[]>([])
  const [stopName, setStopName] = useState('')
  const [stopFare, setStopFare] = useState('')
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const academicYearOptions = useMemo(
    () => toAcademicYearOptions(availableAcademicYears, currentSchoolAcademicYear),
    [availableAcademicYears, currentSchoolAcademicYear]
  )

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === academicYear)) {
      setAcademicYear(academicYearOptions[0]?.value || currentSchoolAcademicYear || getCurrentAcademicYear())
    }
  }, [academicYear, academicYearOptions, currentSchoolAcademicYear])

  useEffect(() => {
    let mounted = true

    const fetchAcademicYears = async () => {
      try {
        const res = await api.get<{ academicYears: string[] }>('/api/school/academic-years')
        if (mounted) {
          setAvailableAcademicYears(res.academicYears || [])
        }
      } catch {
        if (mounted) {
          setAvailableAcademicYears(currentSchoolAcademicYear ? [currentSchoolAcademicYear] : [])
        }
      }
    }

    fetchAcademicYears()

    return () => {
      mounted = false
    }
  }, [currentSchoolAcademicYear])

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
        : [...current, month]
    )
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

    try {
      setSubmitting(true)

      await api.post('/api/school/transport/routes', {
        routeName: routeName.trim(),
        routeNumber: routeCode.trim(),
        academicYear,
        feeMonths,
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

      navigateTo('transport')
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => goBack('transport')}
            disabled={submitting}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create Route</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Set the route name, route code, fee months, stop fares, and optional driver</p>
          </div>
        </div>
        <Button type="button" variant="outline" className="gap-2 self-start sm:self-auto" onClick={() => navigateTo('transport')} disabled={submitting}>
          <Eye className="size-4" />
          View Routes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bus className="size-4" />
            Route Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

              <div className="space-y-2">
                <Label htmlFor="academic-year" className="text-xs font-medium">
                  Academic Year <span className="text-destructive">*</span>
                </Label>
                <Select value={academicYear} onValueChange={setAcademicYear}>
                  <SelectTrigger id="academic-year" className="h-10">
                    <SelectValue placeholder="Select academic year" />
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
            </div>

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

            <div className="space-y-2">
              <Label htmlFor="driver" className="text-xs font-medium">
                Driver
              </Label>
              <Select value={driverId} onValueChange={setDriverId} disabled={loadingDrivers || submitting}>
                <SelectTrigger id="driver" className="h-10">
                  <SelectValue placeholder={loadingDrivers ? 'Loading drivers...' : 'Choose driver later or now'} />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
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

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!canSubmit} className="min-w-[140px] gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <User className="size-4" />
                    Create Route
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => goBack('transport')} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
