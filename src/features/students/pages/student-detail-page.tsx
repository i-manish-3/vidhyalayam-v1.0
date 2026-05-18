'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  User,
  Users,
  GraduationCap,
  Phone,
  MapPin,
  Heart,
  Building,
  Bus,
  Home,
  Banknote,
  FileText,
  Printer,
  CalendarDays,
  CircleUser,
  CircleUserRound,
  AlertTriangle,
  Mail,
  Briefcase,
  CreditCard,
  IdCard,
  Ruler,
  Weight,
  Stethoscope,
  Edit,
  Hash,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  XCircle,
  BookOpenCheck,
} from 'lucide-react'

// ============================================
// Types
// ============================================

interface SiblingInfo {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string | null
  className: string | null
}

interface AdmissionDocumentData {
  id: string
  documentType: string
  documentName: string
  fileUrl: string | null
  fileSize: number | null
  fileType: string | null
  uploadedAt: string | null
  verificationStatus: string
  isRequired: boolean
}

interface AdmissionData {
  id: string
  admissionNumber: string | null
  academicYear: string | null
  status: string | null
  dateOfAdmission: string | null
  admittedAt: string | null
  // Personal
  nationality: string | null
  religion: string | null
  category: string | null
  caste: string | null
  motherTongue: string | null
  aadhaarNumber: string | null
  bloodGroup: string | null
  medicalConditions: string | null
  profileImage: string | null
  registrationNumber: string | null
  penNumber: string | null
  samagraId: string | null
  apaarId: string | null
  udiseId: string | null
  heightCm: number | null
  weightKg: number | null
  // Address
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  country: string | null
  village: string | null
  postOffice: string | null
  policeStation: string | null
  wardNo: string | null
  localAddress: string | null
  localCity: string | null
  localState: string | null
  localPincode: string | null
  localCountry: string | null
  sameAsPermanent: boolean | null
  // Father
  fatherName: string | null
  fatherPhone: string | null
  fatherEmail: string | null
  fatherOccupation: string | null
  fatherAadhaar: string | null
  fatherEducation: string | null
  fatherIncome: number | null
  // Mother
  motherName: string | null
  motherPhone: string | null
  motherEmail: string | null
  motherOccupation: string | null
  motherAadhaar: string | null
  motherEducation: string | null
  motherIncome: number | null
  // Flags
  belongsToEws: boolean | null
  isSingleGirlChild: boolean | null
  isDivyangian: boolean | null
  // General
  mediumOfInstruction: string | null
  area: string | null
  // Previous School
  previousSchool: string | null
  previousSchoolAddress: string | null
  previousClass: string | null
  previousResult: string | null
  affiliatedTo: string | null
  previousSchoolTC: string | null
  tcDate: string | null
  // Transport & Hostel
  transportRouteId: string | null
  transportStop: string | null
  hostelName: string | null
  hostelRoomNo: string | null
  hostelBedNo: string | null
  // Accounts
  bankAccountNumber: string | null
  ifscCode: string | null
  feesGroupId: string | null
  // Sibling
  siblingId: string | null
  // Other
  appliedDate: string | null
  remarks: string | null
  documents: AdmissionDocumentData[]
}

interface StudentData {
  id: string
  schoolId: string
  admissionNumber: string | null
  rollNumber: string | null
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  country: string | null
  aadhaarNumber: string | null
  bloodGroup: string | null
  profileImage: string | null
  admissionStatus: string | null
  siblingId: string | null
  class: { id: string; name: string } | null
  section: { id: string; name: string } | null
  admission: AdmissionData | null
  sibling: SiblingInfo | null
}

// ============================================
// Helpers
// ============================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '--'
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '--'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

function formatFileSize(sizeKb: number | null | undefined): string {
  if (!sizeKb) return '--'
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`
  return `${sizeKb} KB`
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5">
      {Icon && (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{value || '--'}</p>
      </div>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, className = '' }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden border-border/70 shadow-sm', className)}>
      <CardHeader className="border-b border-border/70 bg-muted/25 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  )
}

function DetailPill({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 shadow-sm">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value || '--'}</p>
      </div>
    </div>
  )
}

function statusClass(status: string | null | undefined) {
  const normalized = status?.toLowerCase()
  if (normalized?.includes('inactive') || normalized?.includes('left')) return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (normalized?.includes('pending')) return 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-300'
  return 'border-primary/30 bg-primary/10 text-primary'
}

function documentStatusClass(status: string | null | undefined) {
  const normalized = status?.toLowerCase()
  if (normalized === 'verified') return 'border-primary/30 bg-primary/10 text-primary'
  if (normalized === 'rejected') return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-warning/30 bg-warning/10 text-amber-700 dark:text-amber-300'
}

function DocumentStatusIcon({ status }: { status: string | null | undefined }) {
  const normalized = status?.toLowerCase()
  if (normalized === 'verified') return <CheckCircle2 className="size-3.5" />
  if (normalized === 'rejected') return <XCircle className="size-3.5" />
  return <Clock3 className="size-3.5" />
}

// ============================================
// Main Component
// ============================================

export function StudentDetailPage() {
  const { toast } = useToast()
  const goBack = useAppStore((s) => s.goBack)
  const selectedStudentId = useAppStore((s) => s.selectedStudentId)

  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedStudentId) {
      goBack('students')
      return
    }
    const fetchStudent = async () => {
      setLoading(true)
      try {
        const data = await api.get<StudentData>(`/api/school/students/${selectedStudentId}`, undefined, { skipLogoutOn401: true })
        if (data) {
          setStudent(data)
        } else {
          toast({ title: 'Not Found', description: 'Student not found', variant: 'destructive' })
          goBack('students')
        }
      } catch {
        toast({ title: "Couldn't Load Student", description: "We couldn't load the student details. Please go back and try again.", variant: 'destructive' })
        goBack('students')
      } finally {
        setLoading(false)
      }
    }
    fetchStudent()
  }, [selectedStudentId, goBack, toast])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!student) return null

  const a = student.admission
  const fullName = `${student.firstName} ${student.lastName}`
  const classLabel = [student.class?.name, student.section?.name ? `Section ${student.section.name}` : null].filter(Boolean).join(' - ')
  const admissionLabel = student.admissionNumber || a?.admissionNumber
  const primaryContact = a?.fatherPhone || a?.motherPhone
  const documents = a?.documents || []

  return (
    <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden border-border/70 shadow-sm">
        <CardContent className="p-0">
          <div className="border-b border-border/70 bg-muted/25 p-5">
            <Button variant="outline" size="icon" onClick={() => goBack('students')} className="size-10 shrink-0">
              <ArrowLeft className="size-4" />
            </Button>

            <div className="mt-5 flex flex-col items-center text-center">
              <div className="flex size-36 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-primary/10 shadow-sm">
                {(student.profileImage || a?.profileImage) ? (
                  <img src={(student.profileImage || a?.profileImage) as string} alt={fullName} className="size-full object-cover" />
                ) : (
                  <User className="size-12 text-primary" />
                )}
              </div>

              <div className="mt-4 min-w-0">
                <h1 className="break-words text-2xl font-bold tracking-tight text-foreground">{fullName}</h1>
                {classLabel && (
                  <p className="mt-1 text-sm font-medium text-muted-foreground">{classLabel}</p>
                )}
                <Badge variant="outline" className={cn('mt-2 rounded-md font-semibold', statusClass(student.admissionStatus))}>
                  <BadgeCheck className="mr-1 size-3" />
                  {student.admissionStatus || 'Admitted'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <DetailPill label="Admission No" value={admissionLabel} icon={Hash} />
            <DetailPill label="Class & Section" value={classLabel || undefined} icon={BookOpenCheck} />
            <DetailPill label="Date of Birth" value={formatDate(student.dateOfBirth)} icon={CalendarDays} />
            <DetailPill label="Primary Contact" value={primaryContact} icon={Phone} />

            <div className="flex flex-wrap gap-2 pt-1">
              {student.rollNumber && (
                <Badge variant="outline" className="rounded-md font-mono">
                  Roll {student.rollNumber}
                </Badge>
              )}
              {student.gender && (
                <Badge variant="outline" className="rounded-md gap-1">
                  {student.gender === 'Male' ? <CircleUser className="size-3" /> : <CircleUserRound className="size-3" />}
                  {student.gender}
                </Badge>
              )}
              {a?.academicYear && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-sm text-muted-foreground">
                  <CalendarDays className="size-3.5 text-primary" />
                  {a.academicYear}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" onClick={() => { useAppStore.getState().navigateTo('edit-student') }} className="gap-1.5">
                <Edit className="size-4" /> Edit
              </Button>
              <Button variant="outline" onClick={() => toast({ title: 'Print', description: 'Print feature coming soon' })} className="gap-1.5">
                <Printer className="size-4" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal" className="min-w-0 gap-4">
        <div className="flex justify-center overflow-x-auto pb-1">
          <TabsList className="h-auto w-max rounded-md border border-border/70 bg-muted/50 p-1">
            <TabsTrigger value="personal" className="rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <User className="size-4" />
              Personal Details
            </TabsTrigger>
            <TabsTrigger value="contact" className="rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Phone className="size-4" />
              Contact Info
            </TabsTrigger>
            <TabsTrigger value="general" className="rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <GraduationCap className="size-4" />
              General Details
            </TabsTrigger>
            <TabsTrigger value="accounts" className="rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Banknote className="size-4" />
              Accounts Info
            </TabsTrigger>
            <TabsTrigger value="documents" className="rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="size-4" />
              Documents
            </TabsTrigger>
            {student.sibling && (
              <TabsTrigger value="sibling" className="rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Heart className="size-4" />
                Sibling
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="personal" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Personal Information" icon={User}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Date of Birth" value={formatDate(student.dateOfBirth)} icon={CalendarDays} />
                <InfoRow label="Gender" value={student.gender} />
                <InfoRow label="Blood Group" value={student.bloodGroup || a?.bloodGroup} icon={Stethoscope} />
                <InfoRow label="Category" value={a?.category} />
                <InfoRow label="Caste" value={a?.caste} />
                <InfoRow label="Nationality" value={a?.nationality} />
                <InfoRow label="Religion" value={a?.religion} />
                <InfoRow label="Mother Tongue" value={a?.motherTongue} />
                <InfoRow label="Aadhaar" value={student.aadhaarNumber || a?.aadhaarNumber} icon={IdCard} />
                <InfoRow label="Registration No" value={a?.registrationNumber} />
                <InfoRow label="PEN Number" value={a?.penNumber} />
                <InfoRow label="Samagra ID" value={a?.samagraId} />
                <InfoRow label="APAAR ID" value={a?.apaarId} />
                <InfoRow label="UDISE ID" value={a?.udiseId} />
                <InfoRow label="Height" value={a?.heightCm ? `${a.heightCm} cm` : undefined} icon={Ruler} />
                <InfoRow label="Weight" value={a?.weightKg ? `${a.weightKg} kg` : undefined} icon={Weight} />
              </div>
              {(a?.belongsToEws || a?.isSingleGirlChild || a?.isDivyangian) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.belongsToEws && <Badge variant="outline" className="border-warning/30 bg-warning/10 text-xs text-amber-700 dark:text-amber-300">EWS</Badge>}
                  {a.isSingleGirlChild && <Badge variant="outline" className="border-primary/30 bg-primary/10 text-xs text-primary">Single Girl Child</Badge>}
                  {a.isDivyangian && <Badge variant="outline" className="border-teal/30 bg-teal/10 text-xs text-teal">Divyangian</Badge>}
                </div>
              )}
              {a?.medicalConditions && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 dark:border-red-800 dark:bg-red-950/30">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <div>
                    <p className="text-xs font-medium text-red-700 dark:text-red-400">Medical Conditions</p>
                    <p className="text-sm text-red-600 dark:text-red-300">{a.medicalConditions}</p>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="general" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Academic Information" icon={GraduationCap}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Admission No" value={student.admissionNumber || a?.admissionNumber} icon={IdCard} />
                <InfoRow label="Roll Number" value={student.rollNumber} />
                <InfoRow label="Class" value={student.class?.name} />
                <InfoRow label="Section" value={student.section?.name} />
                <InfoRow label="Academic Year" value={a?.academicYear} />
                <InfoRow label="Date of Admission" value={formatDate(a?.dateOfAdmission)} icon={CalendarDays} />
                <InfoRow label="Admitted On" value={formatDate(a?.admittedAt)} />
                <InfoRow label="Medium" value={a?.mediumOfInstruction} />
                <InfoRow label="Area" value={a?.area} />
              </div>
              {a?.previousSchool && (
                <div className="mt-4 space-y-3">
                  <Separator />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous School</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InfoRow label="School Name" value={a.previousSchool} icon={Building} />
                    <InfoRow label="Address" value={a.previousSchoolAddress} icon={MapPin} />
                    <InfoRow label="Previous Class" value={a.previousClass} />
                    <InfoRow label="Result" value={a.previousResult} />
                    <InfoRow label="Affiliated To" value={a.affiliatedTo} />
                    <InfoRow label="TC Number" value={a.previousSchoolTC} icon={FileText} />
                    <InfoRow label="TC Date" value={formatDate(a.tcDate)} />
                  </div>
                </div>
              )}
            </SectionCard>

            {(a?.transportRouteId || a?.hostelName) && (
              <SectionCard title="Transport & Hostel" icon={Bus}>
                <div className="space-y-4">
                  {a.transportRouteId && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transport</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoRow label="Route ID" value={a.transportRouteId} icon={Bus} />
                        <InfoRow label="Stop" value={a.transportStop} icon={MapPin} />
                      </div>
                    </div>
                  )}
                  {a.hostelName && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hostel</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <InfoRow label="Hostel" value={a.hostelName} icon={Home} />
                        <InfoRow label="Room No" value={a.hostelRoomNo} />
                        <InfoRow label="Bed No" value={a.hostelBedNo} />
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
          </div>
        </TabsContent>

        <TabsContent value="contact" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Father's Details" icon={CircleUser}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Name" value={a?.fatherName} />
                <InfoRow label="Phone" value={a?.fatherPhone} icon={Phone} />
                <InfoRow label="Email" value={a?.fatherEmail} icon={Mail} />
                <InfoRow label="Occupation" value={a?.fatherOccupation} icon={Briefcase} />
                <InfoRow label="Aadhaar" value={a?.fatherAadhaar} icon={IdCard} />
                <InfoRow label="Education" value={a?.fatherEducation} icon={GraduationCap} />
                <InfoRow label="Annual Income" value={a?.fatherIncome ? formatCurrency(a.fatherIncome) : undefined} icon={Banknote} />
              </div>
            </SectionCard>

            <SectionCard title="Mother's Details" icon={CircleUserRound}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Name" value={a?.motherName} />
                <InfoRow label="Phone" value={a?.motherPhone} icon={Phone} />
                <InfoRow label="Email" value={a?.motherEmail} icon={Mail} />
                <InfoRow label="Occupation" value={a?.motherOccupation} icon={Briefcase} />
                <InfoRow label="Aadhaar" value={a?.motherAadhaar} icon={IdCard} />
                <InfoRow label="Education" value={a?.motherEducation} icon={GraduationCap} />
                <InfoRow label="Annual Income" value={a?.motherIncome ? formatCurrency(a.motherIncome) : undefined} icon={Banknote} />
              </div>
            </SectionCard>

            <SectionCard title="Permanent Address" icon={MapPin}>
              <div className="space-y-3">
                {(a?.address || a?.city || student.address || student.city) ? (
                  <>
                    <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 p-3">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                      <p className="break-words text-sm font-medium">
                        {[a?.address || student.address, a?.city || student.city, a?.state || student.state, a?.pincode || student.pincode, a?.country || student.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoRow label="Village" value={a?.village} />
                      <InfoRow label="Post Office" value={a?.postOffice} />
                      <InfoRow label="Police Station" value={a?.policeStation} />
                      <InfoRow label="Ward No" value={a?.wardNo} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No address on file</p>
                )}
              </div>
            </SectionCard>

            {a?.localAddress && !a.sameAsPermanent && (
              <SectionCard title="Local Address" icon={Home}>
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 p-3">
                    <Home className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p className="break-words text-sm font-medium">
                      {[a.localAddress, a.localCity, a.localState, a.localPincode, a.localCountry].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Bank Details" icon={CreditCard}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoRow label="Account Number" value={a?.bankAccountNumber} icon={Banknote} />
                <InfoRow label="IFSC Code" value={a?.ifscCode} />
                <InfoRow label="Fees Group" value={a?.feesGroupId} />
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <SectionCard title="Admission Documents" icon={FileText}>
            {documents.length > 0 ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="min-w-0 rounded-md border border-border/70 bg-muted/20 p-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FileText className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">{doc.documentName}</p>
                        <p className="mt-0.5 capitalize text-xs text-muted-foreground">{doc.documentType.replace(/_/g, ' ')}</p>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 rounded-md gap-1 text-xs', documentStatusClass(doc.verificationStatus))}>
                        <DocumentStatusIcon status={doc.verificationStatus} />
                        {doc.verificationStatus}
                      </Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <span>Size: {formatFileSize(doc.fileSize)}</span>
                      <span>Uploaded: {formatDate(doc.uploadedAt)}</span>
                      <span>{doc.isRequired ? 'Required document' : 'Optional document'}</span>
                      <span className="truncate">{doc.fileType || '--'}</span>
                    </div>
                    {doc.fileUrl && (
                      <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">
                        View document
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No documents uploaded for this admission.</p>
            )}
          </SectionCard>
        </TabsContent>

        {student.sibling && (
          <TabsContent value="sibling" className="mt-0">
            <SectionCard title="Sibling" icon={Heart}>
              <div className="flex items-center gap-3 rounded-md border border-primary/20 bg-primary/10 p-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-card text-primary shadow-sm">
                  <Users className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{student.sibling.firstName} {student.sibling.lastName}</p>
                  <p className="text-xs text-muted-foreground">
                    {student.sibling.admissionNumber && <span className="font-mono mr-2">{student.sibling.admissionNumber}</span>}
                    {student.sibling.className && <span>Class: {student.sibling.className}</span>}
                  </p>
                </div>
              </div>
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
