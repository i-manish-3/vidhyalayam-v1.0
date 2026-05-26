'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared'
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
import { BriefcaseBusiness, List, Loader2, Upload, UserPlus, X } from 'lucide-react'

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

  return (
    <div className="space-y-3">
      <PageHeader
        title={teacherId ? 'Edit Teacher' : 'Add Teacher'}
        description={teacherId ? 'Update teacher profile, contact, and professional details.' : 'Create a teacher profile with personal and professional details.'}
        action={{ label: 'Teacher List', icon: List, onClick: () => router.push('/teachers') }}
      />

      <form onSubmit={handleSubmit} className="space-y-3">
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/20 px-4 py-2.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserPlus className="size-4" />
              Personal Details
            </CardTitle>
            <CardDescription className="text-xs">Basic identity, contact, and profile photo</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted">
                  {profileImage ? (
                    <img src={profileImage} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <UserPlus className="size-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={submitting || loadingTeacher || processingPhoto}
                    >
                      {processingPhoto ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Upload className="size-3.5" />
                          {profileImage ? 'Change Photo' : 'Upload Photo'}
                        </>
                      )}
                    </Button>
                    {profileImage && !processingPhoto && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setProfileImage(null)
                          if (photoInputRef.current) photoInputRef.current.value = ''
                        }}
                        disabled={submitting || loadingTeacher}
                      >
                        <X className="size-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">JPG, PNG, or WebP. Auto-compressed to 200 KB.</p>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Enter first name"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="h-9"
                    disabled={submitting || loadingTeacher}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Last Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Enter last name"
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="h-9"
                    disabled={submitting || loadingTeacher}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Employee ID</Label>
                  <Input
                    placeholder="Auto generated from settings"
                    value={form.employeeId}
                    className="h-9 bg-muted/40 font-mono text-muted-foreground"
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Gender <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                    <SelectTrigger className="h-9" disabled={submitting || loadingTeacher}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Date of Birth <span className="text-destructive">*</span>
                  </Label>
                  <DatePicker
                    value={form.dateOfBirth}
                    onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                    disableFuture
                    yearDropdown
                    yearsBack={80}
                    showQuickActions={false}
                    placeholder="Select date of birth"
                    triggerClassName="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit phone number"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    aria-invalid={phoneHasError}
                    className={`h-9 ${phoneHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`}
                    disabled={submitting || loadingTeacher}
                  />
                  {phoneHasError ? (
                    <p className="text-[11px] font-medium text-destructive">
                      Phone must be 10 digits starting with 6, 7, 8 or 9
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Login ID will be this phone number. Default password is <span className="font-mono font-semibold">teacher123</span>; password change is required on first login.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Email</Label>
                  <Input
                    type="email"
                    inputMode="email"
                    placeholder="teacher@example.com (optional)"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    aria-invalid={emailHasError}
                    className={`h-9 ${emailHasError ? 'border-destructive focus-visible:ring-destructive/40' : ''}`}
                    disabled={submitting || loadingTeacher}
                  />
                  {emailHasError ? (
                    <p className="text-[11px] font-medium text-destructive">
                      Please enter a valid email address.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Optional. Used for notifications and password recovery.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Address</Label>
                  <Input
                    placeholder="Residential address"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="h-9"
                    disabled={submitting || loadingTeacher}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b bg-muted/20 px-4 py-2.5">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BriefcaseBusiness className="size-4" />
              Professional Details
            </CardTitle>
            <CardDescription className="text-xs">Qualification, subject focus, experience, and joining date</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Qualification</Label>
                <Input
                  placeholder="M.Sc, B.Ed"
                  value={form.qualification}
                  onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
                  className="h-9"
                  disabled={submitting || loadingTeacher}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Specialization</Label>
                <Input
                  placeholder="Mathematics"
                  value={form.specialization}
                  onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
                  className="h-9"
                  disabled={submitting || loadingTeacher}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Experience (Years)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.experience}
                  onChange={(e) => setForm((f) => ({ ...f, experience: Number(e.target.value) }))}
                  className="h-9"
                  disabled={submitting || loadingTeacher}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Join Date <span className="text-destructive">*</span>
                </Label>
                <DatePicker
                  value={form.joinDate}
                  onChange={(v) => setForm((f) => ({ ...f, joinDate: v }))}
                  disableFuture
                  placeholder="Select join date"
                  triggerClassName="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            disabled={!isValid || submitting || loadingTeacher || processingPhoto}
            className="gap-2 sm:min-w-[140px]"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {teacherId ? 'Updating...' : 'Saving...'}
              </>
            ) : (
              <>
                <UserPlus className="size-4" />
                {teacherId ? 'Save Changes' : 'Add Teacher'}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/teachers')}
            disabled={submitting || loadingTeacher}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
