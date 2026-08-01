'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
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
  const { hasPermission } = usePermissions()
  const canCreate = hasPermission(PERMISSIONS.TRANSPORT_CREATE)

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
            <h1 className="text-xl font-bold tracking-tight">Add Driver</h1>
            <p className="mt-0.5 text-xs text-white/80">Create a transport driver account.</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/transport/drivers')}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <UserCheck className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Driver Directory</span>
        </Button>
      </div>

      <Card className="gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm">
        <CardHeader className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3 sm:px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
              <Bus className="size-4" />
            </span>
            Driver Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="space-y-0">
            {/* Photo Upload — full-bleed banner */}
            <div className="relative overflow-hidden border-b border-sky-500/15 bg-gradient-to-br from-sky-500/[0.08] via-card to-violet-500/[0.06] px-4 py-5 sm:px-5">
              <div aria-hidden className="absolute -right-8 -top-12 size-32 rounded-full bg-sky-200/25 blur-2xl dark:bg-sky-500/10" />
              <div aria-hidden className="absolute -bottom-8 left-1/3 size-24 rounded-full bg-violet-200/20 blur-2xl dark:bg-violet-500/10" />
              <div className="relative flex flex-col items-center gap-4 sm:flex-row">
                <span className="relative shrink-0">
                  <Avatar className="size-22 border-[3px] border-white shadow-lg">
                    {photo ? <AvatarImage src={photo} alt={displayName || 'Driver photo'} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-sky-500/20 to-primary/20 text-xl font-bold text-primary">{initials ? initials.toUpperCase() : 'DR'}</AvatarFallback>
                  </Avatar>
                  {!photo && (
                    <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-sky-400 to-primary text-[10px] text-white shadow-sm">
                      <Upload className="size-3" />
                    </span>
                  )}
                </span>
                <div className="text-center sm:text-left">
                  <p className="text-sm font-semibold">{displayName || 'Driver Photo'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG, or WebP — auto-compressed to 200 KB</p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <Input id="driver-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handlePhotoChange(event.target.files?.[0])} className="hidden" />
                    <Button type="button" size="sm" className="h-7 gap-1.5 text-xs shadow-sm" onClick={() => document.getElementById('driver-photo')?.click()}>
                      <Upload className="size-3.5" />
                      {photo ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    {photo && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20" onClick={() => setPhoto('')}>
                        Remove
                      </Button>
                    )}
                  </div>
                  {photoError && <p className="mt-1 text-xs text-destructive">{photoError}</p>}
                </div>
              </div>
            </div>

            {/* Form sections */}
            <div className="themed-scrollbar space-y-4 px-4 pb-4 pt-4 sm:px-5">
              {/* Personal Information */}
              <div className="relative overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-4 shadow-sm dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-violet-500/10">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-sky-200/35 blur-xl dark:bg-sky-500/15" />
                <div className="relative">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                      <UserPlus className="size-4" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal Information</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="driver-employee-id" className="text-xs font-medium">Employee ID</Label>
                      <div className="relative">
                        <IdCard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="driver-employee-id" placeholder="Auto generated" value={employeeId} className="h-10 bg-muted/40 pl-9 font-mono text-muted-foreground" disabled />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driver-first-name" className="text-xs font-medium">First Name <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <UserPlus className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="driver-first-name" placeholder="e.g., Ramesh" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="h-10 pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driver-last-name" className="text-xs font-medium">Last Name <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <UserPlus className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="driver-last-name" placeholder="e.g., Kumar" value={lastName} onChange={(event) => setLastName(event.target.value)} className="h-10 pl-9" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driver-gender" className="text-xs font-medium">Gender <span className="text-destructive">*</span></Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger id="driver-gender" className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm dark:border-emerald-500/25 dark:from-emerald-500/15 dark:via-card dark:to-cyan-500/10">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-emerald-200/35 blur-xl dark:bg-emerald-500/15" />
                <div aria-hidden className="absolute -bottom-10 left-12 size-24 rounded-full bg-cyan-200/30 blur-xl dark:bg-cyan-500/10" />
                <div className="relative">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-sm shadow-emerald-500/20">
                      <CalendarDays className="size-4" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dates</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="driver-dob" className="text-xs font-medium">Date of Birth <span className="text-destructive">*</span></Label>
                      <DatePicker value={dob} onChange={setDob} disableFuture showQuickActions={false} yearDropdown yearsBack={70} placeholder="Select date of birth" triggerClassName="w-full h-10" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driver-join-date" className="text-xs font-medium">Join Date <span className="text-destructive">*</span></Label>
                      <DatePicker value={joinDate} onChange={setJoinDate} disableFuture yearDropdown yearsBack={10} placeholder="Select join date" triggerClassName="w-full h-10" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact & License */}
              <div className="relative overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-4 shadow-sm dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-rose-500/10">
                <div aria-hidden className="absolute -right-7 -top-10 size-28 rounded-full bg-amber-200/35 blur-xl dark:bg-amber-500/15" />
                <div aria-hidden className="absolute -bottom-10 right-16 size-24 rounded-full bg-rose-200/30 blur-xl dark:bg-rose-500/10" />
                <div className="relative">
                  <div className="mb-3 flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                      <IdCard className="size-4" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact &amp; License</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="driver-email" className="text-xs font-medium">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="driver-email" type="email" inputMode="email" placeholder="driver@example.com (optional)" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={emailHasError} className={`h-10 pl-9 ${emailHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`} />
                      </div>
                      {emailHasError && <p className="text-[11px] font-medium text-destructive">Please enter a valid email address.</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="driver-phone" className="text-xs font-medium">Phone Number <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="driver-phone" inputMode="numeric" maxLength={10} placeholder="10-digit phone number" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} aria-invalid={phoneHasError} className={`h-10 pl-9 ${phoneHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`} />
                      </div>
                      {phoneHasError && <p className="text-[11px] font-medium text-destructive">Phone must be 10 digits starting with 6, 7, 8 or 9</p>}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="driver-license" className="text-xs font-medium">Driving License Number <span className="text-destructive">*</span></Label>
                      <div className="relative">
                        <IdCard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input id="driver-license" placeholder="e.g., DL0420110012345" value={drivingLicenseNumber} onChange={(event) => setDrivingLicenseNumber(event.target.value.toUpperCase())} className="h-10 pl-9" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 border-t border-primary/10 bg-gradient-to-br from-primary/[0.02] via-background to-cyan-500/[0.03] px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  All fields marked with <span className="text-destructive">*</span> are required.
                </p>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={!isFormValid || !canCreate} className="min-w-[130px] gap-2">
                    {submitting ? (
                      <><Loader2 className="size-4 animate-spin" /> Saving...</>
                    ) : (
                      <><UserPlus className="size-4" /> Add Driver</>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push('/transport/routes')} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
