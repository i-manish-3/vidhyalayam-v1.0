'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { DatePicker } from '@/components/date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Upload, UserPlus, X } from 'lucide-react'

export function AddTeacherPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    employeeId: '',
    gender: 'Male',
    qualification: '',
    specialization: '',
    experience: 0,
    joinDate: '',
    phone: '',
    address: '',
  })
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const isValid = form.firstName.trim() && form.lastName.trim()

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const { dataUrl, finalBytes, compressed } = await compressImage(file)
      if (finalBytes > 200 * 1024) {
        toast({ title: 'Photo Too Large', description: 'This image format cannot be compressed under 200 KB. Please upload a JPG, PNG, or WebP.', variant: 'destructive' })
        if (photoInputRef.current) photoInputRef.current.value = ''
        return
      }
      setProfileImage(dataUrl)
      if (compressed) {
        toast({ title: 'Photo Compressed', description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.` })
      }
    } catch {
      toast({ title: 'Could Not Read Photo', description: 'Please try a different image.', variant: 'destructive' })
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || submitting) return
    try {
      setSubmitting(true)
      await api.post('/api/school/teachers', { ...form, profileImage })
      toast({ title: 'Teacher Added', description: `${form.firstName} ${form.lastName} has been added successfully.` })
      router.push('/teachers')
    } catch (err) {
      toast({
        title: "Couldn't Add Teacher",
        description: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Add Teacher</h1>
          <p className="text-xs text-muted-foreground">
            Create a new teacher profile with personal and professional details
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="size-4" />
            Teacher Information
          </CardTitle>
          <CardDescription className="text-xs">Fill in the details below to add a new teacher</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                Personal Details
              </h3>

              <div className="mb-3 flex items-center gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted">
                  {profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImage} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <UserPlus className="size-6" />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <Upload className="size-4" />
                      {profileImage ? 'Change Photo' : 'Upload Photo'}
                    </Button>
                    {profileImage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProfileImage(null)
                          if (photoInputRef.current) photoInputRef.current.value = ''
                        }}
                      >
                        <X className="size-4" />
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">JPG/PNG/WebP — auto-compressed to 200 KB.</p>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Enter first name"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="h-9"
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
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Employee ID</Label>
                  <Input
                    placeholder="EMP001"
                    value={form.employeeId}
                    onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Gender</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm((f) => ({ ...f, gender: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Phone</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit phone number"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Address</Label>
                  <Input
                    placeholder="Residential address"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-primary" />
                Professional Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Qualification</Label>
                  <Input
                    placeholder="M.Sc, B.Ed"
                    value={form.qualification}
                    onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Specialization</Label>
                  <Input
                    placeholder="Mathematics"
                    value={form.specialization}
                    onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
                    className="h-9"
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
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Join Date</Label>
                  <DatePicker
                    value={form.joinDate}
                    onChange={(v) => setForm((f) => ({ ...f, joinDate: v }))}
                    disableFuture
                    placeholder="Select join date"
                    triggerClassName="w-full"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!isValid || submitting}
                className="gap-2 min-w-[140px]"
              >
                {submitting ? (
                  <>
                    <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Saving...
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    Add Teacher
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/teachers')}
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
