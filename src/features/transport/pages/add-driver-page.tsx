'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DatePicker } from '@/components/date-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Bus, CalendarDays, IdCard, Loader2, Mail, Phone, Upload, UserCheck, UserPlus } from 'lucide-react'

interface CreatedDriver {
  employeeId?: string
  name: string
  phone: string
}

export function AddDriverPage() {
  const { toast } = useToast()
  const router = useRouter()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [gender, setGender] = useState('Male')
  const [dob, setDob] = useState('')
  const [joinDate, setJoinDate] = useState('')
  const [email, setEmail] = useState('')
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const phoneIsValid = /^[6-9]\d{9}$/.test(phone)
  const phoneHasError = phone.length > 0 && !phoneIsValid
  const emailIsValid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const emailHasError = email.trim().length > 0 && !emailIsValid
  const isFormValid =
    firstName.trim() &&
    lastName.trim() &&
    gender &&
    dob &&
    joinDate &&
    drivingLicenseNumber.trim() &&
    phoneIsValid &&
    emailIsValid &&
    !submitting

  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
  const initials = (firstName.trim()[0] || '') + (lastName.trim()[0] || '')

  useEffect(() => {
    let mounted = true
    api.get<{ employeeId: string }>('/api/school/employees/next-number', undefined, { skipLogoutOn401: true })
      .then((res) => {
        if (mounted) setEmployeeId((current) => current || res.employeeId || '')
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [])

  const handlePhotoChange = async (file: File | undefined) => {
    if (!file) return
    setPhotoError('')

    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setPhotoError('Please upload a JPG, PNG, or WebP image.')
      return
    }

    try {
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        setPhoto('')
        setPhotoError('Photo must be smaller than 200 KB.')
        return
      }
      setPhoto(dataUrl)
      if (compressed) {
        toast({ title: 'Photo Compressed', description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.` })
      }
    } catch {
      setPhotoError('Could not read this image. Please try a different file.')
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isFormValid) return

    try {
      setSubmitting(true)
      const res = await api.post<CreatedDriver>('/api/school/transport/drivers', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        dob,
        joinDate: joinDate || undefined,
        email: email.trim() || undefined,
        drivingLicenseNumber: drivingLicenseNumber.trim(),
        phone: phone.trim(),
        photo: photo || undefined,
      })

      toast({
        title: 'Driver Added',
        description: `${res.employeeId ? `${res.employeeId} - ` : ''}${res.name} can sign in with phone ${res.phone} and password "driver123". Password change is required on first login.`,
      })

      setFirstName('')
      setLastName('')
      setEmployeeId('')
      setGender('Male')
      setDob('')
      setJoinDate('')
      setEmail('')
      setDrivingLicenseNumber('')
      setPhone('')
      setPhoto('')
      setPhotoError('')
      router.push('/transport/drivers')
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
      <PageHeader
        title="Add Driver"
        description="Create a transport driver account"
        secondaryAction={{
          label: 'Driver Directory',
          icon: UserCheck,
          onClick: () => router.push('/transport/drivers'),
        }}
      />

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b bg-muted/30 px-4 py-2.5 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bus className="size-4 text-muted-foreground" />
            Driver Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-3 sm:px-5">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <Avatar className="size-20">
                {photo ? <AvatarImage src={photo} alt={displayName || 'Driver photo'} /> : null}
                <AvatarFallback>{initials ? initials.toUpperCase() : 'DR'}</AvatarFallback>
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
                  <p className="text-xs text-muted-foreground">JPG, PNG, or WebP — auto-compressed to 200 KB.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="driver-employee-id" className="text-xs font-medium">
                  Employee ID
                </Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-employee-id"
                    placeholder="Auto generated from settings"
                    value={employeeId}
                    className="h-10 bg-muted/40 pl-9 font-mono text-muted-foreground"
                    disabled
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-first-name" className="text-xs font-medium">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-first-name"
                    placeholder="e.g., Ramesh"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-last-name" className="text-xs font-medium">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-last-name"
                    placeholder="e.g., Kumar"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-gender" className="text-xs font-medium">
                  Gender <span className="text-destructive">*</span>
                </Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger id="driver-gender" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label htmlFor="driver-join-date" className="text-xs font-medium">
                  Join Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  value={joinDate}
                  onChange={setJoinDate}
                  disableFuture
                  yearDropdown
                  yearsBack={10}
                  placeholder="Select join date"
                  triggerClassName="w-full h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="driver-email" className="text-xs font-medium">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="driver-email"
                    type="email"
                    inputMode="email"
                    placeholder="driver@example.com (optional)"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={emailHasError}
                    className={`h-10 pl-9 ${emailHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`}
                  />
                </div>
                {emailHasError && (
                  <p className="text-[11px] font-medium text-destructive">Please enter a valid email address.</p>
                )}
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
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit phone number"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                    aria-invalid={phoneHasError}
                    className={`h-10 pl-9 ${phoneHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`}
                  />
                </div>
                {phoneHasError && (
                  <p className="text-[11px] font-medium text-destructive">
                    Phone must be 10 digits starting with 6, 7, 8 or 9
                  </p>
                )}
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
              <Button type="button" variant="outline" onClick={() => router.push('/transport/routes')} disabled={submitting}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
