'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DatePicker } from '@/components/date-picker'
import { ArrowLeft, Bus, IdCard, Loader2, Phone, Upload, UserCheck, UserPlus } from 'lucide-react'

interface CreatedDriver {
  name: string
  phone: string
}

export function AddDriverPage() {
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)
  const navigateTo = useAppStore((s) => s.navigateTo)

  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isFormValid = name.trim() && dob && drivingLicenseNumber.trim() && phone.trim() && !submitting

  const handlePhotoChange = (file: File | undefined) => {
    if (!file) return
    setPhotoError('')

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setPhotoError('Please upload a JPG, PNG, or WebP image.')
      return
    }

    if (file.size >= 1024 * 1024) {
      setPhoto('')
      setPhotoError('Photo must be smaller than 1MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => setPhoto(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isFormValid) return

    try {
      setSubmitting(true)
      const res = await api.post<CreatedDriver>('/api/school/transport/drivers', {
        name: name.trim(),
        dob,
        drivingLicenseNumber: drivingLicenseNumber.trim(),
        phone: phone.trim(),
        photo: photo || undefined,
      })

      toast({
        title: 'Driver Added',
        description: `"${res.name}" has been created successfully.`,
      })

      setName('')
      setDob('')
      setDrivingLicenseNumber('')
      setPhone('')
      setPhoto('')
      setPhotoError('')
      navigateTo('drivers')
    } catch (err) {
      toast({
        title: "Couldn't Add Driver",
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
            variant="outline"
            size="icon"
            className="mt-0.5 size-9 shrink-0"
            onClick={() => goBack('transport')}
            disabled={submitting}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Add Driver</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Create a transport driver account</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2 self-start sm:self-auto"
          onClick={() => navigateTo('drivers')}
          disabled={submitting}
        >
          <UserCheck className="size-4" />
          Driver Directory
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bus className="size-4" />
            Driver Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="size-20">
                {photo ? <AvatarImage src={photo} alt={name || 'Driver photo'} /> : null}
                <AvatarFallback>{name.trim() ? name.trim().slice(0, 2).toUpperCase() : 'DR'}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <Label htmlFor="driver-photo" className="text-xs font-medium">
                  Photo
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="driver-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handlePhotoChange(event.target.files?.[0])}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => document.getElementById('driver-photo')?.click()}
                  >
                    <Upload className="size-4" />
                    {photo ? 'Change Photo' : 'Upload Photo'}
                  </Button>
                  {photo && (
                    <Button type="button" variant="ghost" onClick={() => setPhoto('')}>
                      Remove
                    </Button>
                  )}
                </div>
                {photoError ? (
                  <p className="text-xs text-destructive">{photoError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Upload a JPG, PNG, or WebP photo smaller than 1MB.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver-name" className="text-xs font-medium">
                  Driver Name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-name"
                    placeholder="e.g., Ramesh Kumar"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-dob" className="text-xs font-medium">
                  DOB <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  value={dob}
                  onChange={setDob}
                  disableFuture
                  showQuickActions={false}
                  yearDropdown
                  yearsBack={70}
                  placeholder="Select date of birth"
                  triggerClassName="w-full h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-license" className="text-xs font-medium">
                  Driving License Number <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-license"
                    placeholder="e.g., DL0420110012345"
                    value={drivingLicenseNumber}
                    onChange={(event) => setDrivingLicenseNumber(event.target.value.toUpperCase())}
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-phone" className="text-xs font-medium">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-phone"
                    placeholder="e.g., 9876543210"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!isFormValid} className="gap-2 min-w-[130px]">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    Add Driver
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
