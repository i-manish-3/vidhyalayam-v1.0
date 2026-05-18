'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Loader2, Bus, MapPin, PlusCircle, X } from 'lucide-react'

export function AddTransportRoutePage() {
  const { toast } = useToast()
  const navigateTo = useAppStore((s) => s.navigateTo)
  const goBack = useAppStore((s) => s.goBack)

  // Section 1: Route Information
  const [routeName, setRouteName] = useState('')
  const [routeNumber, setRouteNumber] = useState('')
  const [startPoint, setStartPoint] = useState('')
  const [endPoint, setEndPoint] = useState('')
  const [distance, setDistance] = useState('')
  const [fee, setFee] = useState('')
  const [capacity, setCapacity] = useState('40')
  const [isActive, setIsActive] = useState(true)

  // Section 2: Stops
  const [stops, setStops] = useState<string[]>([])
  const [stopInput, setStopInput] = useState('')

  // Section 3: Driver & Vehicle Details
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState('')
  const [feeError, setFeeError] = useState('')

  // Validate the route name field
  const validateName = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setNameError('Route name is required. Please enter a name like Route A - City Center.')
      return false
    }
    if (trimmed.length < 2) {
      setNameError('Route name must be at least 2 characters long.')
      return false
    }
    setNameError('')
    return true
  }

  // Validate the fee field
  const validateFee = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setFeeError('Transport fee is required.')
      return false
    }
    const num = parseFloat(trimmed)
    if (isNaN(num) || num < 0) {
      setFeeError('Please enter a valid fee amount.')
      return false
    }
    setFeeError('')
    return true
  }

  // Handle name change with live validation
  const handleNameChange = (value: string) => {
    setRouteName(value)
    if (nameError && value.trim().length >= 2) {
      setNameError('')
    }
  }

  // Handle fee change with live validation
  const handleFeeChange = (value: string) => {
    setFee(value)
    if (feeError) {
      const num = parseFloat(value.trim())
      if (!isNaN(num) && num >= 0) {
        setFeeError('')
      }
    }
  }

  // Add a stop
  const addStop = () => {
    const trimmed = stopInput.trim()
    if (!trimmed) return
    if (stops.includes(trimmed)) {
      toast({
        title: 'Duplicate Stop',
        description: `"${trimmed}" has already been added.`,
        variant: 'destructive',
      })
      return
    }
    setStops(prev => [...prev, trimmed])
    setStopInput('')
  }

  // Remove a stop
  const removeStop = (index: number) => {
    setStops(prev => prev.filter((_, i) => i !== index))
  }

  // Handle stop input key press (Enter to add)
  const handleStopKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addStop()
    }
  }

  // Form validity check
  const isFormValid = routeName.trim().length >= 2 && fee.trim() !== '' && !submitting

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateName(routeName)) return
    if (!validateFee(fee)) return
    if (submitting) return

    try {
      setSubmitting(true)

      await api.post('/api/school/transport/routes', {
        routeName: routeName.trim(),
        routeNumber: routeNumber.trim() || undefined,
        startPoint: startPoint.trim() || undefined,
        endPoint: endPoint.trim() || undefined,
        distance: distance ? parseFloat(distance) : undefined,
        fee: parseFloat(fee.trim()),
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        isActive,
        stops: stops.length > 0 ? stops : undefined,
        driverName: driverName.trim() || undefined,
        driverPhone: driverPhone.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
      })

      toast({
        title: 'Route Added Successfully',
        description: `"${routeName.trim()}" has been added to your transport routes.`,
      })

      navigateTo('transport')
    } catch (err) {
      toast({
        title: 'Failed to Add Route',
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
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
          <p className="text-sm text-muted-foreground mt-0.5">
            Add a new transport route for your school
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bus className="size-4" />
            Route Details
          </CardTitle>
          <CardDescription>
            Fill in the details below to add a new transport route
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Route Information */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                Route Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Route Name */}
                <div className="space-y-2">
                  <Label htmlFor="route-name" className="text-xs font-medium">
                    Route Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="route-name"
                    placeholder="e.g., Route A - City Center"
                    value={routeName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    onBlur={() => validateName(routeName)}
                    className="h-10"
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'route-name-error' : undefined}
                  />
                  {nameError && (
                    <p id="route-name-error" className="text-xs text-destructive mt-1">
                      {nameError}
                    </p>
                  )}
                </div>

                {/* Route Number */}
                <div className="space-y-2">
                  <Label htmlFor="route-number" className="text-xs font-medium">
                    Route Number
                  </Label>
                  <Input
                    id="route-number"
                    placeholder="e.g., R-001"
                    value={routeNumber}
                    onChange={(e) => setRouteNumber(e.target.value)}
                    className="h-10"
                  />
                </div>

                {/* Start Point */}
                <div className="space-y-2">
                  <Label htmlFor="start-point" className="text-xs font-medium">
                    Start Point
                  </Label>
                  <Input
                    id="start-point"
                    placeholder="e.g., School Campus"
                    value={startPoint}
                    onChange={(e) => setStartPoint(e.target.value)}
                    className="h-10"
                  />
                </div>

                {/* End Point */}
                <div className="space-y-2">
                  <Label htmlFor="end-point" className="text-xs font-medium">
                    End Point
                  </Label>
                  <Input
                    id="end-point"
                    placeholder="e.g., City Bus Stand"
                    value={endPoint}
                    onChange={(e) => setEndPoint(e.target.value)}
                    className="h-10"
                  />
                </div>

                {/* Distance */}
                <div className="space-y-2">
                  <Label htmlFor="distance" className="text-xs font-medium">
                    Distance
                  </Label>
                  <Input
                    id="distance"
                    type="number"
                    placeholder="e.g., 15.5"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    min="0"
                    step="0.1"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Distance in kilometers
                  </p>
                </div>

                {/* Fee */}
                <div className="space-y-2">
                  <Label htmlFor="route-fee" className="text-xs font-medium">
                    Fee <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="route-fee"
                    type="number"
                    placeholder="e.g., 1500"
                    value={fee}
                    onChange={(e) => handleFeeChange(e.target.value)}
                    onBlur={() => validateFee(fee)}
                    min="0"
                    className="h-10"
                    aria-invalid={!!feeError}
                    aria-describedby={feeError ? 'route-fee-error' : undefined}
                  />
                  {feeError && (
                    <p id="route-fee-error" className="text-xs text-destructive mt-1">
                      {feeError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Monthly transport fee in ₹
                  </p>
                </div>

                {/* Capacity */}
                <div className="space-y-2">
                  <Label htmlFor="capacity" className="text-xs font-medium">
                    Capacity
                  </Label>
                  <Input
                    id="capacity"
                    type="number"
                    placeholder="e.g., 40"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    min="1"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum students per trip
                  </p>
                </div>

                {/* Status Toggle */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Status</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Switch
                      id="route-status"
                      checked={isActive}
                      onCheckedChange={setIsActive}
                    />
                    <Label htmlFor="route-status" className="text-sm cursor-pointer">
                      {isActive ? 'Active' : 'Inactive'}
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Stops */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                <MapPin className="size-4" />
                Stops
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Enter a stop name"
                    value={stopInput}
                    onChange={(e) => setStopInput(e.target.value)}
                    onKeyDown={handleStopKeyDown}
                    className="h-10"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5 shrink-0"
                    onClick={addStop}
                    disabled={!stopInput.trim()}
                  >
                    <PlusCircle className="size-4" />
                    Add Stop
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add pickup/drop-off points along the route
                </p>
                {stops.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {stops.map((stop, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="gap-1.5 py-1.5 px-3 text-sm"
                      >
                        <MapPin className="size-3" />
                        {stop}
                        <button
                          type="button"
                          className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                          onClick={() => removeStop(index)}
                          aria-label={`Remove stop ${stop}`}
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Driver & Vehicle Details */}
            <div>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                <Bus className="size-4" />
                Driver & Vehicle Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Driver Name */}
                <div className="space-y-2">
                  <Label htmlFor="driver-name" className="text-xs font-medium">
                    Driver Name
                  </Label>
                  <Input
                    id="driver-name"
                    placeholder="e.g., Ramesh Kumar"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    className="h-10"
                  />
                </div>

                {/* Driver Phone */}
                <div className="space-y-2">
                  <Label htmlFor="driver-phone" className="text-xs font-medium">
                    Driver Phone
                  </Label>
                  <Input
                    id="driver-phone"
                    placeholder="e.g., +91 98765 43210"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="h-10"
                  />
                </div>

                {/* Vehicle Number */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="vehicle-number" className="text-xs font-medium">
                    Vehicle Number
                  </Label>
                  <Input
                    id="vehicle-number"
                    placeholder="e.g., KA-01-AB-1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!isFormValid}
                className="gap-2 min-w-[140px]"
              >
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
              <Button
                type="button"
                variant="outline"
                onClick={() => goBack('transport')}
                disabled={submitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
