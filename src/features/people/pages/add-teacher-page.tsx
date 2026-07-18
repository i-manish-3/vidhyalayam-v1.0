'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BriefcaseBusiness, List, Loader2, Upload, UserPlus, X, GraduationCap, Phone, Mail, MapPin, Cake, Hash, BadgeAlert } from 'lucide-react'

interface TeacherDetail {
  firstName: string
  lastName: string
  employeeId: string | null
  gender: string | null
  dateOfBirth: string | null
  qualification: string | null
  specialization: string | null
  experience: number
  joinDate: string | null
  phone: string | null
  email: string | null
  address: string | null
  profileImage: string | null
}

function toDateValue(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

export function AddTeacherPage({ teacherId }: { teacherId?: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const isEditMode = Boolean(teacherId)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    employeeId: '',
    gender: 'Male',
    dateOfBirth: '',
    qualification: '',
    specialization: '',
    experience: 0,
    joinDate: '',
    phone: '',
    email: '',
    address: '',
  })
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingTeacher, setLoadingTeacher] = useState(isEditMode)
  const [processingPhoto, setProcessingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const phoneIsValid = /^[6-9]\d{9}$/.test(form.phone)
  const phoneHasError = form.phone.length > 0 && !phoneIsValid
  const emailIsValid = form.email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  const emailHasError = form.email.trim().length > 0 && !emailIsValid
  const isValid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.gender &&
    form.dateOfBirth &&
    form.joinDate &&
    phoneIsValid &&
    emailIsValid

  useEffect(() => {
    if (isEditMode) return

    let mounted = true
    api.get<{ employeeId: string }>('/api/school/employees/next-number', undefined, { skipLogoutOn401: true })
      .then((res) => {
        if (!mounted) return
        setForm((current) => current.employeeId ? current : { ...current, employeeId: res.employeeId || '' })
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [isEditMode])

  useEffect(() => {
    if (!teacherId) return

    let mounted = true
    setLoadingTeacher(true)
    api.get<TeacherDetail>(`/api/school/teachers/${teacherId}`)
      .then((teacher) => {
        if (!mounted) return
        setForm({
          firstName: teacher.firstName || '',
          lastName: teacher.lastName || '',
          employeeId: teacher.employeeId || '',
          gender: teacher.gender || 'Male',
          dateOfBirth: toDateValue(teacher.dateOfBirth),
          qualification: teacher.qualification || '',
          specialization: teacher.specialization || '',
          experience: teacher.experience || 0,
          joinDate: toDateValue(teacher.joinDate),
          phone: teacher.phone || '',
          email: teacher.email && !teacher.email.endsWith('@teacher.local') ? teacher.email : '',
          address: teacher.address || '',
        })
        setProfileImage(teacher.profileImage || null)
      })
      .catch((err) => {
        toast({
          title: "Couldn't Load Teacher",
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        })
        router.push('/teachers')
      })
      .finally(() => {
        if (mounted) setLoadingTeacher(false)
      })

    return () => {
      mounted = false
    }
  }, [router, teacherId, toast])

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clear the input value immediately so picking the same file again still fires onChange.
    if (event.target) event.target.value = ''
    if (!file) return
    try {
      setProcessingPhoto(true)
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        toast({ title: 'Photo Too Large', description: 'This image format cannot be compressed under 200 KB. Please upload a JPG, PNG, or WebP.', variant: 'destructive' })
        return
      }
      setProfileImage(dataUrl)
      if (compressed) {
        toast({ title: 'Photo Compressed', description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.` })
      }
    } catch {
      toast({ title: 'Could Not Read Photo', description: 'Please try a different image.', variant: 'destructive' })
    } finally {
      setProcessingPhoto(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || submitting || processingPhoto) return
    try {
      setSubmitting(true)
      const payload = { ...form, employeeId: undefined }
      if (teacherId) {
        // Only send `profileImage` when the user actually changed it (uploaded a new
        // data URL or explicitly cleared it). Sending `undefined` means "leave as-is"
        // on the server; sending the existing URL is a no-op upload. Both are safe,
        // but we explicitly include it so the new photo is persisted.
        await api.patch(`/api/school/teachers/${teacherId}`, { ...payload, profileImage })
        toast({ title: 'Teacher Updated', description: `${form.firstName} ${form.lastName} has been updated successfully.` })
      } else {
        const teacher = await api.post<{ employeeId?: string }>('/api/school/teachers', { ...payload, profileImage })
        toast({
          title: 'Teacher Added',
          description: `${teacher.employeeId ? `${teacher.employeeId} - ` : ''}${form.firstName} ${form.lastName} can sign in with phone ${form.phone} and password "teacher123".`,
        })
      }
      router.push('/teachers')
    } catch (err) {
      toast({
        title: teacherId ? "Couldn't Update Teacher" : "Couldn't Add Teacher",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingTeacher) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-primary/50" />
      </div>
    )
  }

  const reqFields = ['First Name', 'Last Name', 'Gender', 'Date of Birth', 'Phone', 'Join Date']
  const filledFields = [
    form.firstName.trim(), form.lastName.trim(), form.gender,
    form.dateOfBirth, phoneIsValid, form.joinDate
  ].filter(Boolean).length
  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary via-teal-600 to-cyan-600 px-4 py-3 text-white shadow-lg shadow-primary/15 sm:flex-row sm:items-center sm:justify-between">
        <div aria-hidden className="absolute -right-8 -top-14 size-36 rounded-full border-[18px] border-cyan-200/15" />
        <div aria-hidden className="absolute bottom-0 right-1/4 h-px w-48 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div aria-hidden className="absolute -bottom-14 right-28 size-24 rounded-full bg-sky-300/10" />
        <div aria-hidden className="absolute left-1/4 top-0 size-16 rounded-full bg-teal-300/8 blur-sm" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-md shadow-black/10 backdrop-blur-sm">
            <GraduationCap className="size-5.5 text-white" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">{teacherId ? 'Edit Teacher' : 'Add Teacher'}</h1>
            <p className="mt-0.5 text-xs text-white/80">
              {teacherId ? 'Update teacher profile, contact, and professional details.' : 'Create a teacher profile with personal and professional details.'}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/teachers')}
          className="relative shrink-0 gap-2 border border-white/60 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: 'white', color: 'var(--primary)' }}
        >
          <List className="size-4" strokeWidth={2.2} />
          <span className="font-semibold">Teacher List</span>
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Photo Upload — full-bleed banner */}
        <div className="relative overflow-hidden rounded-xl border border-sky-500/15 bg-gradient-to-br from-sky-500/[0.06] via-violet-500/[0.03] to-primary/[0.02] p-0 shadow-sm">
          <div aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full border-[22px] border-sky-500/5" />
          <div aria-hidden className="absolute -bottom-8 left-1/3 size-24 rounded-full bg-violet-500/5 blur-xl" />
          <div className="relative flex flex-col items-center gap-4 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/[0.06] via-primary/[0.03] to-violet-500/[0.06] px-5 py-4 text-center sm:flex-row sm:text-left">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-full border-[3px] border-sky-500/30 bg-gradient-to-br from-sky-500/[0.10] to-violet-500/[0.10] shadow-md shadow-sky-500/10">
              {profileImage ? (
                <img src={profileImage} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <GraduationCap className="size-8 text-sky-400/60" />
                </div>
              )}
              {processingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Teacher Photo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">JPG, PNG, or WebP &middot; Auto-compressed to 200 KB</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-sky-500/30 text-xs text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/20"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={submitting || loadingTeacher || processingPhoto}
                >
                  {processingPhoto ? (
                    <><Loader2 className="size-3.5 animate-spin" /> Processing...</>
                  ) : (
                    <><Upload className="size-3.5" /> {profileImage ? 'Change Photo' : 'Upload Photo'}</>
                  )}
                </Button>
                {profileImage && !processingPhoto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => { setProfileImage(null); if (photoInputRef.current) photoInputRef.current.value = '' }}
                    disabled={submitting || loadingTeacher}
                  >
                    <X className="size-3.5" /> Remove
                  </Button>
                )}
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>
        </div>

        {/* Personal Details */}
        <Card className="relative gap-0 overflow-hidden border-sky-500/15 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-sm transition-all hover:shadow-md">
          <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full border-[16px] border-sky-500/5" />
          <div aria-hidden className="absolute -bottom-6 left-12 size-20 rounded-full bg-sky-500/5 blur-lg" />
          <CardHeader className="relative border-b border-sky-500/15 bg-gradient-to-r from-sky-500/[0.10] via-primary/[0.05] to-violet-500/[0.08] px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-primary text-white shadow-sm shadow-sky-500/20">
                <UserPlus className="size-4" />
              </span>
              Personal Details
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">Basic identity, contact, and profile photo</CardDescription>
          </CardHeader>
          <CardContent className="relative px-4 pb-4 pt-3 sm:px-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-sky-500/10 text-[10px] text-sky-600">1</span>
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input placeholder="Enter first name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="h-10 transition-all focus-visible:ring-sky-500/30" disabled={submitting || loadingTeacher} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-sky-500/10 text-[10px] text-sky-600">2</span>
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input placeholder="Enter last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="h-10 transition-all focus-visible:ring-sky-500/30" disabled={submitting || loadingTeacher} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <Hash className="size-3 text-sky-500/70" />
                  Employee ID
                </Label>
                <Input placeholder="Auto generated from settings" value={form.employeeId} className="h-10 bg-gradient-to-r from-muted/30 to-muted/10 font-mono text-xs text-muted-foreground/70" disabled />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-sky-500/10 text-[10px] text-sky-600">3</span>
                  Gender <span className="text-destructive">*</span>
                </Label>
                <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                  <SelectTrigger className="h-10" disabled={submitting || loadingTeacher}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">
                      <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-blue-500" />Male</span>
                    </SelectItem>
                    <SelectItem value="Female">
                      <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-rose-500" />Female</span>
                    </SelectItem>
                    <SelectItem value="Other">
                      <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-violet-500" />Other</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-sky-500/10 text-[10px] text-sky-600">4</span>
                  <Cake className="size-3 text-sky-500/70" /> Date of Birth <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={form.dateOfBirth} onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))} disableFuture yearDropdown yearsBack={80} showQuickActions={false} placeholder="Select date of birth" triggerClassName="w-full" />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-sky-500/10 text-[10px] text-sky-600">5</span>
                  <Phone className="size-3 text-sky-500/70" /> Phone <span className="text-destructive">*</span>
                </Label>
                <Input inputMode="numeric" maxLength={10} placeholder="10-digit phone number" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} aria-invalid={phoneHasError} className={cn('h-10 transition-all', phoneHasError && 'border-destructive ring-destructive/20')} disabled={submitting || loadingTeacher} />
                {phoneHasError ? (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-destructive"><BadgeAlert className="size-3" /> Phone must be 10 digits starting with 6, 7, 8 or 9</p>
                ) : (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">Login ID will be this phone number. Default password is <span className="rounded bg-amber-100 px-1 font-mono text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">teacher123</span>; password change is required on first login.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <Mail className="size-3 text-sky-500/70" /> Email
                </Label>
                <Input type="email" inputMode="email" placeholder="teacher@example.com (optional)" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} aria-invalid={emailHasError} className={cn('h-10 transition-all', emailHasError && 'border-destructive ring-destructive/20')} disabled={submitting || loadingTeacher} />
                {emailHasError ? (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-destructive"><BadgeAlert className="size-3" /> Please enter a valid email address.</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Optional. Used for notifications and password recovery.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <MapPin className="size-3 text-sky-500/70" /> Address
                </Label>
                <Input placeholder="Residential address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="h-10 transition-all" disabled={submitting || loadingTeacher} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Professional Details */}
        <Card className="relative gap-0 overflow-hidden border-amber-500/15 bg-gradient-to-br from-card via-card to-amber-500/[0.035] py-0 shadow-sm transition-all hover:shadow-md">
          <div aria-hidden className="absolute -right-8 -top-8 size-28 rounded-full border-[16px] border-amber-500/5" />
          <div aria-hidden className="absolute -bottom-6 left-12 size-20 rounded-full bg-amber-500/5 blur-lg" />
          <CardHeader className="relative border-b border-amber-500/15 bg-gradient-to-r from-amber-500/[0.10] via-primary/[0.05] to-rose-500/[0.08] px-4 py-3 sm:px-5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-sm shadow-amber-500/20">
                <BriefcaseBusiness className="size-4" />
              </span>
              Professional Details
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground/80">Qualification, subject focus, experience, and joining date</CardDescription>
          </CardHeader>
          <CardContent className="relative px-4 pb-4 pt-3 sm:px-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-amber-500/10 text-[10px] text-amber-600">i</span>
                  Qualification
                </Label>
                <Input placeholder="M.Sc, B.Ed" value={form.qualification} onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))} className="h-10 transition-all focus-visible:ring-amber-500/30" disabled={submitting || loadingTeacher} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-amber-500/10 text-[10px] text-amber-600">ii</span>
                  Specialization
                </Label>
                <Input placeholder="Mathematics" value={form.specialization} onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))} className="h-10 transition-all focus-visible:ring-amber-500/30" disabled={submitting || loadingTeacher} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <BriefcaseBusiness className="size-3 text-amber-500/70" />
                  Experience (Years)
                </Label>
                <Input type="number" min={0} value={form.experience} onChange={(e) => setForm((f) => ({ ...f, experience: Number(e.target.value) }))} className="h-10 transition-all" disabled={submitting || loadingTeacher} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex size-4 items-center justify-center rounded bg-amber-500/10 text-[10px] text-amber-600">6</span>
                  Join Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker value={form.joinDate} onChange={(v) => setForm((f) => ({ ...f, joinDate: v }))} disableFuture placeholder="Select join date" triggerClassName="w-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="-mx-4 border-t border-primary/10 bg-gradient-to-br from-primary/[0.03] via-background to-cyan-500/[0.04] px-4 py-3 sm:mx-0 sm:rounded-lg sm:border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white',
                  isValid ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                )}>
                  {isValid ? '✓' : filledFields}
                </span>
                {isValid ? 'All required fields complete' : `${reqFields.length - filledFields} fields remaining`}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!isValid || submitting || loadingTeacher || processingPhoto} className="min-w-[160px] gap-2 shadow-sm">
                {submitting ? (
                  <><Loader2 className="size-4 animate-spin" /> {teacherId ? 'Updating...' : 'Saving...'}</>
                ) : (
                  <><GraduationCap className="size-4" /> {teacherId ? 'Save Changes' : 'Add Teacher'}</>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/teachers')} disabled={submitting || loadingTeacher}>Cancel</Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
