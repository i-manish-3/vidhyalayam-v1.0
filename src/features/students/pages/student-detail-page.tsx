'use client'

import { useState, useEffect, useMemo, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { usePermissions, PERMISSIONS } from '@/hooks/use-permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
import { ResetUserPasswordDialog } from '@/components/shared'
import {
  WithdrawStudentDialog,
  AddTransportDialog,
  DiscontinueTransportDialog,
  AddHostelDialog,
  DiscontinueHostelDialog,
  ReverseWithdrawalDialog,
  WithdrawalStatusBanner,
  TransportHistorySection,
} from '@/features/students/components/billing-window-dialogs'
import {
  IssueRefundDialog,
  RefundHistorySection,
} from '@/features/students/components/refund-dialog'
import { DiscontinueRefundsSection } from '@/features/students/components/discontinue-refunds-section'
import { SchoolPrintHeader } from '@/lib/print-header'
import {
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
  KeyRound,
  Loader2,
  Upload,
  Trash2,
  ShieldCheck,
  ShieldX,
  X,
  Building2,
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
  verifiedAt?: string | null
  verifiedBy?: string | null
  rejectionReason?: string | null
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
  localVillage: string | null
  localPostOffice: string | null
  localPoliceStation: string | null
  localWardNo: string | null
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
  feesGroup: { id: string; name: string } | null
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
  assignedHouse: { id: string; name: string; color: string } | null
  sibling: SiblingInfo | null // legacy: kept for backwards compatibility
  siblings?: SiblingInfo[]
  academicEnrollments?: Array<{
    id: string
    academicYear: string
    status: string
    source: string
    effectiveFrom: string | null
    effectiveTo: string | null
    class: { id: string; name: string }
    section: { id: string; name: string } | null
  }>
  transportAllocations?: Array<{
    id: string
    studentId: string
    routeId: string
    academicYear: string
    pickupPoint: string | null
    dropPoint: string | null
    stopName: string | null
    fareAmount: number
    isActive: boolean
    route: { id: string; routeName: string; routeNumber: string | null; startPoint: string | null; endPoint: string | null } | null
  }>
  hostelAllocations?: Array<{
    id: string
    studentId: string
    hostelId: string
    roomId: string
    bedId: string
    academicYear: string
    fareAmount: number
    isActive: boolean
    hostel: { id: string; name: string; type: string | null } | null
    room: { id: string; roomNumber: string; roomType: string | null } | null
    bed: { id: string; bedNumber: string } | null
  }>
  academicYearContext?: {
    requestedAcademicYear: string | null
    resolvedAcademicYear: string | null
    availableYears: string[]
    hasEnrollmentForRequestedYear: boolean
    yearScoped: {
      classId: string | null
      className: string | null
      sectionId: string | null
      sectionName: string | null
      rollNumber: string | null
      status: string
      effectiveFrom: string | null
      effectiveTo: string | null
    } | null
  }
  parentLinks?: Array<{
    id: string
    relation: string
    isPrimary: boolean
    parent: {
      id: string
      userId: string | null
      fatherName: string | null
      motherName: string | null
      phone: string | null
    }
  }>
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }
interface FeesGroupOption { id: string; name: string }

type PromotionForm = {
  academicYear: string
  classId: string
  sectionId: string
  feesGroupId: string
  effectiveFrom: string
  remarks: string
  carryForwardTransport: boolean
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
  const isEmpty = value == null || value === ''
  return (
    <div
      className={cn(
        'group min-w-0 space-y-1 rounded-lg border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.035] px-2.5 py-2 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-all',
        'hover:-translate-y-px hover:border-primary/30 hover:shadow-sm',
        isEmpty && 'bg-muted/20 hover:border-border/60 hover:bg-muted/20',
      )}
    >
      <div className="flex items-center gap-1.5">
        {Icon && (
          <span className="flex size-4.5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-primary to-teal-600 text-white shadow-sm">
            <Icon className="size-2.5 text-white" />
          </span>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn('break-words text-sm font-semibold leading-snug text-foreground', isEmpty && 'text-muted-foreground/50 font-normal italic')}>
        {isEmpty ? 'Not provided' : value}
      </p>
    </div>
  )
}

function sectionTone(title: string) {
  const normalized = title.toLowerCase()

  if (normalized.includes('academic') || normalized.includes('identity')) {
    return {
      card: 'border-violet-200/80 bg-gradient-to-br from-violet-50/70 via-card to-purple-50/60 dark:border-violet-500/25 dark:from-violet-500/12 dark:via-card dark:to-purple-500/8',
      header: 'border-violet-200/70 bg-gradient-to-r from-violet-100/75 via-white/80 to-purple-100/60 dark:border-violet-500/20 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10',
      icon: 'from-violet-500 to-purple-600',
    }
  }
  if (normalized.includes('bank') || normalized.includes('fee')) {
    return {
      card: 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-card to-teal-50/60 dark:border-emerald-500/25 dark:from-emerald-500/12 dark:via-card dark:to-teal-500/8',
      header: 'border-emerald-200/70 bg-gradient-to-r from-emerald-100/75 via-white/80 to-teal-100/60 dark:border-emerald-500/20 dark:from-emerald-500/15 dark:via-card dark:to-teal-500/10',
      icon: 'from-emerald-500 to-teal-600',
    }
  }
  if (normalized.includes('transport') || normalized.includes('hostel') || normalized.includes('document')) {
    return {
      card: 'border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-card to-orange-50/60 dark:border-amber-500/25 dark:from-amber-500/12 dark:via-card dark:to-orange-500/8',
      header: 'border-amber-200/70 bg-gradient-to-r from-amber-100/75 via-white/80 to-orange-100/60 dark:border-amber-500/20 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10',
      icon: 'from-amber-500 to-orange-600',
    }
  }
  if (normalized.includes('father') || normalized.includes('mother') || normalized.includes('sibling')) {
    return {
      card: 'border-rose-200/80 bg-gradient-to-br from-rose-50/70 via-card to-pink-50/60 dark:border-rose-500/25 dark:from-rose-500/12 dark:via-card dark:to-pink-500/8',
      header: 'border-rose-200/70 bg-gradient-to-r from-rose-100/75 via-white/80 to-pink-100/60 dark:border-rose-500/20 dark:from-rose-500/15 dark:via-card dark:to-pink-500/10',
      icon: 'from-rose-500 to-pink-600',
    }
  }
  return {
    card: 'border-sky-200/80 bg-gradient-to-br from-sky-50/70 via-card to-cyan-50/60 dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-cyan-500/8',
    header: 'border-sky-200/70 bg-gradient-to-r from-sky-100/75 via-white/80 to-cyan-100/60 dark:border-sky-500/20 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10',
    icon: 'from-sky-500 to-cyan-600',
  }
}

function SectionCard({ title, icon: Icon, children, className = '', headerAction }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string; headerAction?: React.ReactNode }) {
  const tone = sectionTone(title)
  return (
    <Card className={cn('gap-0 overflow-hidden py-0 shadow-sm transition-shadow hover:shadow-md', tone.card, className)}>
      <CardHeader className={cn('border-b px-3 py-2', tone.header)}>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
            <span className={cn('flex size-6 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm', tone.icon)}>
              <Icon className="size-3.5 text-white" />
            </span>
            {title}
          </CardTitle>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

function KeyFact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 py-1">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-cyan-600 text-white shadow-sm">
        <Icon className="size-3 text-white" />
      </span>
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-xs font-semibold text-foreground">
        {value || <span className="text-muted-foreground/60">--</span>}
      </span>
    </div>
  )
}

function HouseHighlight({ house }: { house: { name: string; color: string } }) {
  return (
    <div className="relative mx-auto mt-2.5 w-fit max-w-full">
      <span
        aria-hidden
        className="absolute inset-0 animate-pulse rounded-xl opacity-25 blur-md motion-reduce:animate-none"
        style={{ backgroundColor: house.color }}
      />
      <div
        className="relative flex max-w-full items-center gap-2 rounded-xl border bg-white/95 px-2 py-1.5 text-left shadow-md backdrop-blur-sm dark:bg-card/95"
        style={{ borderColor: house.color, boxShadow: `0 4px 14px color-mix(in oklab, ${house.color} 28%, transparent)` }}
      >
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
          style={{ backgroundColor: house.color }}
        >
          <Home className="size-3.5 text-white" />
        </span>
        <span className="min-w-0">
          <span className="block text-[8px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Student House</span>
          <span className="block truncate text-xs font-bold text-foreground">{house.name}</span>
        </span>
        <span className="relative ml-1 flex size-2.5 shrink-0">
          <span
            aria-hidden
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none"
            style={{ backgroundColor: house.color }}
          />
          <span className="relative inline-flex size-2.5 rounded-full" style={{ backgroundColor: house.color }} />
        </span>
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
// Printable Admission Form
// ============================================

function PfRow({ label, value, span2 = false }: { label: string; value: string | number | null | undefined; span2?: boolean }) {
  return (
    <div className={cn('pf-row flex gap-3 border-b border-gray-300 py-1.5', span2 && 'col-span-2')}>
      <span className="min-w-[150px] text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</span>
      <span className="flex-1 text-[12px] font-medium text-black">{value || '—'}</span>
    </div>
  )
}

function PfHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pf-heading mt-6 mb-3 border-b-2 border-black pb-1 text-[13px] font-bold uppercase tracking-wide">
      {children}
    </h2>
  )
}

// Branded admission form helpers — used when school has a print banner uploaded.
function Cb({ on }: { on?: boolean }) {
  return <span className={cn('bf-cb', on && 'bf-cb-on')} />
}
function eqi(val: string | null | undefined, target: string): boolean {
  return !!val && val.trim().toUpperCase() === target.toUpperCase()
}

function hasPrintValue(value: string | number | boolean | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return true
  return String(value).trim().length > 0
}

function printValue(value: string | number | boolean | null | undefined): string {
  if (!hasPrintValue(value)) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function PrintableAdmissionForm({
  student,
  admission: a,
  school,
  studentPhoto,
  permanentAddressLine,
  localAddressLine,
  className,
  section,
  rollNumber,
  documents,
}: {
  student: StudentData
  admission: AdmissionData | null
  school: { id: string; name: string; printHeader?: string; logo?: string; address?: string; city?: string; state?: string; pincode?: string; country?: string; contactPhone?: string; contactEmail?: string; website?: string; board?: string } | null
  studentPhoto: string | null
  permanentAddressLine: string
  localAddressLine: string
  className: string | null
  section: string | null
  rollNumber: string | null
  documents: AdmissionDocumentData[]
}) {
  const fullName = `${student.firstName} ${student.lastName}`
  const houseName = student.assignedHouse?.name || null
  const photoBox = (
    <div className="h-32 w-28 border border-black bg-white">
      {studentPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={studentPhoto} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-500">PHOTO</div>
      )}
    </div>
  )

  return (
    <div id="print-admission-form" className="hidden print:block text-black">
      {school?.printHeader ? (
        <BrandedAdmissionFormBody
          student={student}
          admission={a}
          school={school}
          studentPhoto={studentPhoto}
          permanentAddressLine={permanentAddressLine}
          localAddressLine={localAddressLine}
          className={className}
          section={section}
          rollNumber={rollNumber}
          documents={documents}
        />
      ) : (
        <>
          <SchoolPrintHeader school={school} rightSlot={photoBox} />
          <h2 className="mt-3 text-center text-base font-bold underline">STUDENT APPLICATION / ADMISSION FORM</h2>

      <div className={cn('mt-3', school?.printHeader && 'flex items-start gap-3')}>
        <div className="grid flex-1 grid-cols-2 gap-x-6">
          <PfRow label="Admission No" value={student.admissionNumber || a?.admissionNumber} />
          <PfRow label="Registration No" value={a?.registrationNumber} />
          <PfRow label="Academic Year" value={a?.academicYear} />
          <PfRow label="Date of Admission" value={formatDate(a?.dateOfAdmission)} />
          <PfRow label="Applied Date" value={formatDate(a?.appliedDate)} />
          <PfRow label="Admission Status" value={student.admissionStatus || a?.status} />
          <PfRow label="Class" value={className} />
          <PfRow label="Section" value={section} />
          <PfRow label="Roll Number" value={rollNumber} />
          <PfRow label="Medium" value={a?.mediumOfInstruction} />
          <PfRow label="House" value={houseName} />
        </div>
        {school?.printHeader && <div className="shrink-0">{photoBox}</div>}
      </div>

      <PfHeading>1. Personal Details</PfHeading>
      <div className="grid grid-cols-2 gap-x-6">
        <PfRow label="Student Name" value={fullName} span2 />
        <PfRow label="Date of Birth" value={formatDate(student.dateOfBirth)} />
        <PfRow label="Gender" value={student.gender} />
        <PfRow label="Blood Group" value={student.bloodGroup || a?.bloodGroup} />
        <PfRow label="Nationality" value={a?.nationality} />
        <PfRow label="Religion" value={a?.religion} />
        <PfRow label="Category" value={a?.category} />
        <PfRow label="House" value={houseName} />
        <PfRow label="Caste" value={a?.caste} />
        <PfRow label="Mother Tongue" value={a?.motherTongue} />
        <PfRow label="Aadhaar No" value={student.aadhaarNumber || a?.aadhaarNumber} />
        <PfRow label="PEN Number" value={a?.penNumber} />
        <PfRow label="APAAR ID" value={a?.apaarId} />
        <PfRow label="UDISE ID" value={a?.udiseId} />
        <PfRow label="Samagra ID" value={a?.samagraId} />
        <PfRow label="Height" value={a?.heightCm ? `${a.heightCm} cm` : null} />
        <PfRow label="Weight" value={a?.weightKg ? `${a.weightKg} kg` : null} />
      </div>
      {a?.medicalConditions && (
        <div className="pf-row mt-2 border border-black px-2 py-1 text-[12px]">
          <span className="font-semibold">Medical Conditions: </span>{a.medicalConditions}
        </div>
      )}
      {(a?.belongsToEws || a?.isSingleGirlChild || a?.isDivyangian) && (
        <p className="pf-row mt-1 text-[11px] italic">
          Special status:{' '}
          {[
            a.belongsToEws && 'EWS',
            a.isSingleGirlChild && 'Single Girl Child',
            a.isDivyangian && 'Divyangian',
          ].filter(Boolean).join(', ')}
        </p>
      )}

      <PfHeading>2. Permanent Address</PfHeading>
      <div className="grid grid-cols-2 gap-x-6">
        <PfRow label="Address" value={permanentAddressLine} span2 />
        <PfRow label="Area / Locality" value={a?.area} />
        <PfRow label="Village" value={a?.village} />
        <PfRow label="Post Office" value={a?.postOffice} />
        <PfRow label="Police Station" value={a?.policeStation} />
        <PfRow label="Ward No" value={a?.wardNo} />
      </div>

      <PfHeading>3. Correspondence Address</PfHeading>
      <div className="grid grid-cols-2 gap-x-6">
        <PfRow label="Same as Permanent" value={a?.sameAsPermanent == null ? null : (a.sameAsPermanent ? 'Yes' : 'No')} />
        <PfRow label="Address" value={localAddressLine || (a?.sameAsPermanent ? permanentAddressLine : null)} span2 />
        <PfRow label="Village" value={a?.localVillage} />
        <PfRow label="Post Office" value={a?.localPostOffice} />
        <PfRow label="Police Station" value={a?.localPoliceStation} />
        <PfRow label="Ward No" value={a?.localWardNo} />
        <PfRow label="City" value={a?.localCity} />
        <PfRow label="State" value={a?.localState} />
        <PfRow label="Pincode" value={a?.localPincode} />
        <PfRow label="Country" value={a?.localCountry} />
      </div>

      <PfHeading>4. Parent / Guardian Details</PfHeading>
      <div className="grid grid-cols-2 gap-x-6">
        <div className="col-span-1 mt-1 text-[12px] font-bold uppercase">Father</div>
        <div className="col-span-1 mt-1 text-[12px] font-bold uppercase">Mother</div>
        <PfRow label="Name" value={a?.fatherName} />
        <PfRow label="Name" value={a?.motherName} />
        <PfRow label="Phone" value={a?.fatherPhone} />
        <PfRow label="Phone" value={a?.motherPhone} />
        <PfRow label="Email" value={a?.fatherEmail} />
        <PfRow label="Email" value={a?.motherEmail} />
        <PfRow label="Occupation" value={a?.fatherOccupation} />
        <PfRow label="Occupation" value={a?.motherOccupation} />
        <PfRow label="Education" value={a?.fatherEducation} />
        <PfRow label="Education" value={a?.motherEducation} />
        <PfRow label="Aadhaar" value={a?.fatherAadhaar} />
        <PfRow label="Aadhaar" value={a?.motherAadhaar} />
        <PfRow label="Annual Income" value={a?.fatherIncome ? formatCurrency(a.fatherIncome) : null} />
        <PfRow label="Annual Income" value={a?.motherIncome ? formatCurrency(a.motherIncome) : null} />
      </div>

      {(() => {
        const sibs = student.siblings && student.siblings.length > 0
          ? student.siblings
          : (student.sibling ? [student.sibling] : [])
        if (sibs.length === 0) return null
        return (
          <>
            <PfHeading>5. Sibling Details</PfHeading>
            <div className="grid grid-cols-2 gap-x-6">
              {sibs.map((s, i) => (
                <PfRow
                  key={s.id}
                  label={`Sibling ${i + 1}`}
                  value={`${s.firstName} ${s.lastName}${s.admissionNumber ? ` (${s.admissionNumber})` : ''}${s.className ? ` – ${s.className}` : ''}`}
                  span2
                />
              ))}
            </div>
          </>
        )
      })()}

      <PfHeading>6. Previous School Details</PfHeading>
      <div className="grid grid-cols-2 gap-x-6">
        <PfRow label="School Name" value={a?.previousSchool} />
        <PfRow label="Affiliated To" value={a?.affiliatedTo} />
        <PfRow label="Address" value={a?.previousSchoolAddress} span2 />
        <PfRow label="Previous Class" value={a?.previousClass} />
        <PfRow label="Result" value={a?.previousResult} />
        <PfRow label="TC Number" value={a?.previousSchoolTC} />
        <PfRow label="TC Date" value={formatDate(a?.tcDate)} />
      </div>

      {(() => {
        const transportAllocation = student.transportAllocations?.find((t) => t.isActive) || student.transportAllocations?.[0] || null
        const hostelAllocation = student.hostelAllocations?.find((h) => h.isActive) || student.hostelAllocations?.[0] || null
        const transportRouteName = transportAllocation?.route?.routeName || null
        const transportStop = transportAllocation?.stopName || a?.transportStop || null
        const hostelName = hostelAllocation?.hostel?.name || a?.hostelName || null
        const hostelRoom = hostelAllocation?.room?.roomNumber || a?.hostelRoomNo || null
        const hostelBed = hostelAllocation?.bed?.bedNumber || a?.hostelBedNo || null
        const hasTransport = !!transportRouteName || !!a?.transportRouteId || !!transportStop
        const hasHostel = !!hostelName || !!hostelRoom || !!hostelBed
        return (
          <>
            <PfHeading>7. Transport / Hostel</PfHeading>
            <div className="grid grid-cols-2 gap-x-6">
              <PfRow label="Transport Required" value={hasTransport ? 'Yes' : 'No'} />
              <PfRow label="Transport Route" value={transportRouteName} />
              <PfRow label="Pickup / Drop Stop" value={transportStop} />
              <PfRow label="Transport Fare" value={transportAllocation?.fareAmount != null ? formatCurrency(transportAllocation.fareAmount) : null} />
              <PfRow label="Hostel Required" value={hasHostel ? 'Yes' : 'No'} />
              <PfRow label="Hostel" value={hostelName} />
              <PfRow label="Room No" value={hostelRoom} />
              <PfRow label="Bed No" value={hostelBed} />
              <PfRow label="Hostel Fare" value={hostelAllocation?.fareAmount != null ? formatCurrency(hostelAllocation.fareAmount) : null} />
            </div>
          </>
        )
      })()}

      <PfHeading>8. Bank / Fee Details</PfHeading>
      <div className="grid grid-cols-2 gap-x-6">
        <PfRow label="Fees Group" value={a?.feesGroup?.name} />
        <PfRow label="Account Number" value={a?.bankAccountNumber} />
        <PfRow label="IFSC Code" value={a?.ifscCode} />
      </div>

      <PfHeading>9. Documents Submitted</PfHeading>
      {documents.length > 0 ? (
        <ol className="ml-5 list-decimal text-[12px]">
          {documents.map((d) => (
            <li key={d.id} className="py-0.5">
              {d.documentName} <span className="text-gray-600">— {d.verificationStatus}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12px] italic">No documents recorded.</p>
      )}

      <PfHeading>10. Remarks / Office Notes</PfHeading>
      <p className="min-h-12 border border-gray-300 px-2 py-1 text-[12px] leading-relaxed">{a?.remarks || ''}</p>

      <PfHeading>11. Declaration</PfHeading>
      <div className="space-y-2 border border-black p-3 text-[12px] leading-relaxed">
        <p>
          I hereby declare that the information furnished in this application form is true and correct to the best of
          my knowledge. I understand that the school may verify the submitted details and documents.
        </p>
        <p>
          I agree to follow the rules, fee schedule, transport/hostel terms, and code of conduct prescribed by the
          school from time to time.
        </p>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-10 text-[11px]">
        <div className="border-t border-black pt-1 text-center">Parent / Guardian Signature</div>
        <div className="border-t border-black pt-1 text-center">Student Signature</div>
        <div className="border-t border-black pt-1 text-center">Principal / Authorized Signatory</div>
      </div>

      <p className="mt-6 text-center text-[10px] text-gray-600">
        Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      </p>
        </>
      )}
    </div>
  )
}

function BrandedAdmissionFormBody({
  student,
  admission: a,
  school,
  studentPhoto,
  permanentAddressLine,
  localAddressLine,
  className,
  section,
  rollNumber,
  documents,
}: {
  student: StudentData
  admission: AdmissionData | null
  school: { id: string; name: string; printHeader?: string; logo?: string; address?: string; city?: string; state?: string; pincode?: string; country?: string; contactPhone?: string; contactEmail?: string; website?: string; board?: string } | null
  studentPhoto: string | null
  permanentAddressLine: string
  localAddressLine: string
  className: string | null
  section: string | null
  rollNumber: string | null
  documents: AdmissionDocumentData[]
}) {
  const fullName = `${student.firstName} ${student.lastName}`.trim()
  const houseName = student.assignedHouse?.name || null
  const dob = student.dateOfBirth ? new Date(student.dateOfBirth) : null
  const dobValid = !!dob && !isNaN(dob.getTime())
  const dobDay = dobValid ? String(dob!.getDate()).padStart(2, '0') : ''
  const dobMonth = dobValid ? String(dob!.getMonth() + 1).padStart(2, '0') : ''
  const dobYear = dobValid ? String(dob!.getFullYear()) : ''

  const aff = (a?.affiliatedTo || '').trim().toUpperCase()
  const affKnown = ['CBSE', 'ICSE', 'IB', 'STATE', 'STATE BOARD']
  const affOther = !!aff && !affKnown.includes(aff)

  const siblings = student.siblings && student.siblings.length > 0
    ? student.siblings
    : (student.sibling ? [student.sibling] : [])
  const sibRowsToShow = Math.max(3, siblings.length)
  const transportAllocation = student.transportAllocations?.find((t) => t.isActive) || student.transportAllocations?.[0] || null
  const hostelAllocation = student.hostelAllocations?.find((h) => h.isActive) || student.hostelAllocations?.[0] || null
  const filledDetails = ([
    ['Admission No.', student.admissionNumber || a?.admissionNumber],
    ['Registration No.', a?.registrationNumber],
    ['Admission Status', student.admissionStatus || a?.status],
    ['Academic Year', a?.academicYear],
    ['Class', className],
    ['Section', section],
    ['Roll No.', rollNumber],
    ['Medium', a?.mediumOfInstruction],
    ['House', houseName],
    ['Applied Date', formatDate(a?.appliedDate)],
    ['Date of Admission', formatDate(a?.dateOfAdmission)],
    ['Blood Group', student.bloodGroup || a?.bloodGroup],
    ['Nationality', a?.nationality],
    ['Mother Tongue', a?.motherTongue],
    ['Caste', a?.caste],
    ['Aadhaar No.', student.aadhaarNumber || a?.aadhaarNumber],
    ['PEN No.', a?.penNumber],
    ['APAAR ID', a?.apaarId],
    ['UDISE ID', a?.udiseId],
    ['Samagra ID', a?.samagraId],
    ['Height', a?.heightCm ? `${a.heightCm} cm` : null],
    ['Weight', a?.weightKg ? `${a.weightKg} kg` : null],
    ['Medical Conditions', a?.medicalConditions],
    ['Fees Group', a?.feesGroup?.name],
    ['Bank Account No.', a?.bankAccountNumber],
    ['IFSC Code', a?.ifscCode],
    ['Transport Route', transportAllocation?.route?.routeName],
    ['Transport Stop', transportAllocation?.stopName || a?.transportStop],
    ['Transport Fare', transportAllocation?.fareAmount ? formatCurrency(transportAllocation.fareAmount) : null],
    ['Hostel', hostelAllocation?.hostel?.name || a?.hostelName],
    ['Hostel Room', hostelAllocation?.room?.roomNumber || a?.hostelRoomNo],
    ['Hostel Bed', hostelAllocation?.bed?.bedNumber || a?.hostelBedNo],
    ['Hostel Fare', hostelAllocation?.fareAmount ? formatCurrency(hostelAllocation.fareAmount) : null],
    ['Remarks', a?.remarks],
  ] satisfies Array<[string, string | number | boolean | null | undefined]>).filter(
    ([, value]) => hasPrintValue(value) && printValue(value) !== '--',
  )
  const filledDetailRows = Array.from({ length: Math.ceil(filledDetails.length / 2) }, (_, i) =>
    filledDetails.slice(i * 2, i * 2 + 2),
  )
  const documentRows = documents.filter((d) => hasPrintValue(d.documentName))

  return (
    <>
      <SchoolPrintHeader school={school} />

      <table className="bf mt-2">
        <tbody>
          <tr>
            <td colSpan={2} className="bf-head bf-head-center">ADMISSION FORM</td>
            <td rowSpan={5} className="bf-photo">
              {studentPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={studentPhoto} alt="" />
              ) : (
                <span className="bf-photo-text">PHOTO</span>
              )}
            </td>
          </tr>
          <tr>
            <td>Sr. No. {student.admissionNumber || a?.admissionNumber || ''}</td>
            <td>Adm. Date : {formatDate(a?.dateOfAdmission)}</td>
          </tr>
          <tr>
            <td colSpan={2}>
              Admission No. {a?.registrationNumber || ''}
              <span className="bf-small" style={{ float: 'right' }}>To be filled by office</span>
            </td>
          </tr>
          <tr>
            <td>CLASS to which admission sought : {[className, section ? `Sec. ${section}` : null].filter(Boolean).join(' - ')}</td>
            <td>Session : {a?.academicYear || ''}</td>
          </tr>
          <tr>
            <td>PEN : {a?.penNumber || ''}{rollNumber ? `    Roll No. : ${rollNumber}` : ''}</td>
            <td>APAAR ID : {a?.apaarId || ''}</td>
          </tr>
        </tbody>
      </table>

      <table className="bf">
        <tbody>
          <tr><td className="bf-head">PERSONAL DETAILS :</td></tr>
          <tr><td>1. Name : {fullName}</td></tr>
          <tr><td>
            2. Gender :{' '}
            <Cb on={eqi(student.gender, 'MALE')} /> Male{'   '}
            <Cb on={eqi(student.gender, 'FEMALE')} /> Female{'   '}
            <Cb on={!!student.gender && !eqi(student.gender, 'MALE') && !eqi(student.gender, 'FEMALE')} /> Any Other
          </td></tr>
          <tr><td>
            3. DOB : Date <span className="bf-pill">{dobDay}</span>
            Month <span className="bf-pill">{dobMonth}</span>
            Year <span className="bf-pill">{dobYear}</span>
            <br />In Words :{' '}
            <span className="bf-small">(Attached Date of Birth Certificate issued competent Authority)</span>
          </td></tr>
        </tbody>
      </table>

      <table className="bf">
        <tbody>
          <tr><td colSpan={4} className="bf-head">4. DETAILS OF PARENTS :</td></tr>
          <tr>
            <th className="bf-col" style={{ width: '20%' }}>Details</th>
            <th className="bf-col">Mother</th>
            <th className="bf-col">Father</th>
            <th className="bf-col">Guardian</th>
          </tr>
          <tr>
            <th className="bf-row-label">Name</th>
            <td>{a?.motherName || ''}</td>
            <td>{a?.fatherName || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Phone No.</th>
            <td>{a?.motherPhone || ''}</td>
            <td>{a?.fatherPhone || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Educational Qualification</th>
            <td>{a?.motherEducation || ''}</td>
            <td>{a?.fatherEducation || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Email :</th>
            <td>{a?.motherEmail || ''}</td>
            <td>{a?.fatherEmail || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Occupation</th>
            <td>{a?.motherOccupation || ''}</td>
            <td>{a?.fatherOccupation || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Local Address</th>
            <td colSpan={2}>{localAddressLine || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Residential Address</th>
            <td colSpan={2}>{permanentAddressLine || ''}</td>
            <td></td>
          </tr>
          <tr>
            <th className="bf-row-label">Annual Income</th>
            <td>{a?.motherIncome ? formatCurrency(a.motherIncome) : ''}</td>
            <td>{a?.fatherIncome ? formatCurrency(a.fatherIncome) : ''}</td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <table className="bf">
        <tbody>
          <tr><td colSpan={3} className="bf-head">5 . WHEATHER THE CANDIDATE IS :</td></tr>
          <tr>
            <td>(i) Single girl child ?</td>
            <td className="bf-yn"><Cb on={a?.isSingleGirlChild === false} /> NO</td>
            <td className="bf-yn"><Cb on={!!a?.isSingleGirlChild} /> YES</td>
          </tr>
          <tr>
            <td>(ii) Specially Abled (Divyangian) ?</td>
            <td className="bf-yn"><Cb on={a?.isDivyangian === false} /> NO</td>
            <td className="bf-yn"><Cb on={!!a?.isDivyangian} /> YES</td>
          </tr>
          <tr>
            <td>
              (iii) Belongs to EWS ?
              <br /><span className="bf-small">Attach proof wherever applicable</span>
            </td>
            <td className="bf-yn"><Cb on={a?.belongsToEws === false} /> NO</td>
            <td className="bf-yn"><Cb on={!!a?.belongsToEws} /> YES</td>
          </tr>
        </tbody>
      </table>

      <table className="bf">
        <tbody>
          <tr><td>
            6. Category (Attach Proof) :{' '}
            <Cb on={eqi(a?.category, 'GENERAL')} /> General{'   '}
            <Cb on={eqi(a?.category, 'SC')} /> SC{'   '}
            <Cb on={eqi(a?.category, 'ST')} /> ST{'   '}
            <Cb on={eqi(a?.category, 'OBC')} /> OBC{'   '}
            <Cb on={eqi(a?.category, 'EWS')} /> EWS
            <br />Religion : {a?.religion || ''}
          </td></tr>
          <tr><td>7. Aadhar No. (Mandatory) (Attach Proof) : {student.aadhaarNumber || a?.aadhaarNumber || ''}</td></tr>
          <tr><td className="bf-tall">
            8. Name and Address of the last attended school :{' '}
            {a?.previousSchool ? `${a.previousSchool}${a.previousSchoolAddress ? `, ${a.previousSchoolAddress}` : ''}` : ''}
          </td></tr>
          <tr><td>9. Class last attended : {a?.previousClass || ''}</td></tr>
          <tr><td>
            10. Last School Affiliated is :
            <br />
            <Cb on={aff === 'CBSE'} /> (i) CBSE{'   '}
            <Cb on={aff === 'ICSE'} /> (ii) ICSE{'   '}
            <Cb on={aff === 'IB'} /> (iii) IB{'   '}
            <Cb on={aff === 'STATE' || aff === 'STATE BOARD'} /> (iv) State Board{'   '}
            <Cb on={affOther} /> (v) Any other (Please Specify) : {affOther ? a?.affiliatedTo : ''}
          </td></tr>
        </tbody>
      </table>

      <table className="bf">
        <tbody>
          <tr><td className="bf-head">11. RESULT OF LAST CLASS :</td></tr>
          <tr><td className="bf-tall">{a?.previousResult || ''}</td></tr>
          <tr><td className="bf-head">12. Transfer certificate details :</td></tr>
          <tr><td>
            Transfer certificate number : {a?.previousSchoolTC || ''}
            <span style={{ float: 'right' }}>Date of issue : {formatDate(a?.tcDate)}</span>
          </td></tr>
        </tbody>
      </table>

      <table className="bf">
        <tbody>
          <tr><td colSpan={4} className="bf-head">13. DETAILS OF SIBLINGS (IF ANY?) :</td></tr>
          <tr>
            <th className="bf-col" style={{ width: '32%' }}>Details</th>
            <th className="bf-col">Brother/Sister</th>
            <th className="bf-col" style={{ width: '12%' }}>Age</th>
            <th className="bf-col">School Studying in</th>
          </tr>
          {Array.from({ length: sibRowsToShow }).map((_, i) => {
            const s = siblings[i]
            return (
              <tr key={s?.id || `sib-${i}`}>
                <td>{s ? `${s.firstName} ${s.lastName}`.trim() : ''}</td>
                <td></td>
                <td></td>
                <td>{s?.className || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {filledDetailRows.length > 0 && (
        <table className="bf bf-avoid-break">
          <tbody>
            <tr><td colSpan={4} className="bf-head">14. FILLED ADMISSION / SCHOOL DETAILS :</td></tr>
            {filledDetailRows.map((row, rowIndex) => (
              <tr key={`filled-${rowIndex}`}>
                {row.map(([label, value]) => (
                  <td key={label} colSpan={row.length === 1 ? 4 : 2}>
                    <span className="bf-label">{label} : </span>
                    <span className="bf-value">{printValue(value)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {documentRows.length > 0 && (
        <table className="bf bf-avoid-break">
          <tbody>
            <tr><td colSpan={3} className="bf-head">15. DOCUMENTS SUBMITTED :</td></tr>
            <tr>
              <th className="bf-col">Document</th>
              <th className="bf-col" style={{ width: '22%' }}>Status</th>
              <th className="bf-col" style={{ width: '24%' }}>Uploaded On</th>
            </tr>
            {documentRows.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.documentName}</td>
                <td>{doc.verificationStatus || ''}</td>
                <td>{formatDate(doc.uploadedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="bf bf-avoid-break">
        <tbody>
          <tr><td className="bf-head">16. DECLARATION :</td></tr>
          <tr>
            <td className="bf-tall">
              I hereby declare that the information furnished in this application form is true and correct to the best
              of my knowledge. I agree to follow the rules, fee schedule, transport/hostel terms, and code of conduct
              prescribed by the school.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="bf-sign">
        <p className="text-[11px]">Date : ....................................</p>
        <p className="mt-1 text-[11px]">Place : ....................................</p>
        <div className="bf-sign-grid">
          <div>Signature of Parent(s) / Guardian</div>
          <div>Relationship with candidate</div>
          <div>Signature of Principal</div>
        </div>
      </div>

      <p className="bf-footer-note">
        Correct entries from the Admission Form to the Admission and Withdrawal Register have been made on page no.
        .................................... on date ............................................
      </p>
    </>
  )
}

// ============================================
// Main Component
// ============================================

export function StudentDetailPage({ studentId }: { studentId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission(PERMISSIONS.STUDENT_UPDATE)
  const canPromote = hasPermission(PERMISSIONS.ADMISSION_UPDATE)
  const canCollectFees = hasPermission(PERMISSIONS.FEES_COLLECT)
  // Mid-year billing actions are gated behind dedicated permissions so they
  // can be granted/revoked independently from generic student/transport edits.
  const canIssueTC = hasPermission(PERMISSIONS.STUDENT_WITHDRAW)
  const canReverseTC = hasPermission(PERMISSIONS.STUDENT_WITHDRAW_REVERSE)
  const canIssueRefund = hasPermission(PERMISSIONS.FEES_REFUND)
  const canManageTransport = hasPermission(PERMISSIONS.TRANSPORT_ALLOCATION_UPDATE)
  const canManageHostel = hasPermission(PERMISSIONS.HOSTEL_ALLOCATION_UPDATE)
  const canVerifyDocs = hasPermission(PERMISSIONS.ADMISSION_APPROVE)
  const canManageDocs = hasPermission(PERMISSIONS.ADMISSION_UPDATE)
  const currentSchool = useAppStore((s) => s.currentSchool)

  const currentSchoolAcademicYear = currentSchool?.academicYear

  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetParentTarget, setResetParentTarget] = useState<{ userId: string; name: string; relation: string } | null>(null)
  const viewYear = useAppStore((s) => s.viewingAcademicYear) || currentSchoolAcademicYear || ''
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [feesGroups, setFeesGroups] = useState<FeesGroupOption[]>([])
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoting, setPromoting] = useState(false)
  // Billing-window dialog state. `billingRefreshKey` bumps after any
  // commit so the banner + history sections refetch.
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [addTransportOpen, setAddTransportOpen] = useState(false)
  const [discontinueTransportOpen, setDiscontinueTransportOpen] = useState(false)
  const [addHostelOpen, setAddHostelOpen] = useState(false)
  const [discontinueHostelOpen, setDiscontinueHostelOpen] = useState(false)
  const [reverseWithdrawOpen, setReverseWithdrawOpen] = useState(false)
  const [refundDialog, setRefundDialog] = useState<{ withdrawalId: string } | null>(null)
  const [billingRefreshKey, setBillingRefreshKey] = useState(0)

  const openWithdrawDialog = (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    setWithdrawOpen(true)
  }

  // Document verify/reject/delete/re-upload state
  const [docActionId, setDocActionId] = useState<string | null>(null) // disables all action buttons for the row being acted on
  const [rejectDialog, setRejectDialog] = useState<{ docId: string; documentName: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [deleteDocDialog, setDeleteDocDialog] = useState<{ admissionId: string; doc: AdmissionDocumentData } | null>(null)
  const [deletingDoc, setDeletingDoc] = useState(false)
  const [promotionForm, setPromotionForm] = useState<PromotionForm>({
    academicYear: currentSchoolAcademicYear || '',
    classId: '',
    sectionId: '',
    feesGroupId: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    remarks: '',
    carryForwardTransport: true,
  })

  const fetchStudent = async (studentId: string, academicYear?: string) => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (academicYear) params.academicYear = academicYear
      const data = await api.get<StudentData>(
        `/api/school/students/${studentId}`,
        Object.keys(params).length > 0 ? params : undefined,
        { skipLogoutOn401: true }
      )
      if (data) {
        setStudent(data)
        // If we didn't request a year, seed the global viewingAcademicYear so
        // the top-bar switcher reflects this student's session context.
        if (!academicYear) {
          const fallback = currentSchoolAcademicYear
            || data.academicYearContext?.availableYears?.[0]
            || ''
          if (fallback) useAppStore.getState().setViewingAcademicYear(fallback)
        }
      } else {
        toast({ title: 'Not Found', description: 'Student not found', variant: 'destructive' })
        router.push('/students')
      }
    } catch {
      toast({ title: "Couldn't Load Student", description: "We couldn't load the student details. Please go back and try again.", variant: 'destructive' })
      router.push('/students')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Pass viewYear on the very first fetch so the API can resolve the
    // enrollment overlay in one trip. Otherwise the response comes back with
    // hasEnrollmentForRequestedYear=false and the "wasn't enrolled" banner
    // flashes (or sticks if a downstream re-fetch never fires).
    fetchStudent(studentId, viewYear || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, toast])

  // ---- Document actions ----------------------------------------------------
  const DOC_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const DOC_ALLOWED_MIME = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ])
  const DOC_MAX_BYTES = 200 * 1024

  const refreshDocs = async () => {
    await fetchStudent(studentId, viewYear || undefined)
  }

  const handleVerifyDoc = async (admissionId: string, doc: AdmissionDocumentData) => {
    setDocActionId(doc.id)
    try {
      await api.patch(`/api/school/admissions/${admissionId}/documents/${doc.id}`, { action: 'verify' })
      toast({ title: 'Verified', description: `${doc.documentName} marked as verified.` })
      await refreshDocs()
    } catch (err) {
      toast({ title: "Couldn't Verify", description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setDocActionId(null)
    }
  }

  const submitReject = async (admissionId: string) => {
    if (!rejectDialog) return
    const reason = rejectReason.trim()
    if (!reason) {
      toast({ title: 'Reason Required', description: 'Please give a reason for rejection.', variant: 'destructive' })
      return
    }
    setRejecting(true)
    try {
      await api.patch(`/api/school/admissions/${admissionId}/documents/${rejectDialog.docId}`, { action: 'reject', reason })
      toast({ title: 'Rejected', description: `${rejectDialog.documentName} marked as rejected.` })
      setRejectDialog(null)
      setRejectReason('')
      await refreshDocs()
    } catch (err) {
      toast({ title: "Couldn't Reject", description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setRejecting(false)
    }
  }

  const confirmDeleteDoc = async () => {
    if (!deleteDocDialog) return
    const { admissionId, doc } = deleteDocDialog
    setDeletingDoc(true)
    setDocActionId(doc.id)
    try {
      await api.delete(`/api/school/admissions/${admissionId}/documents/${doc.id}`)
      toast({ title: 'Deleted', description: `${doc.documentName} has been removed.` })
      setDeleteDocDialog(null)
      await refreshDocs()
    } catch (err) {
      toast({ title: "Couldn't Delete", description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setDeletingDoc(false)
      setDocActionId(null)
    }
  }

  const handleReUploadDoc = async (admissionId: string, doc: AdmissionDocumentData, file: File) => {
    if (!DOC_ALLOWED_MIME.has(file.type)) {
      toast({ title: 'Unsupported File Type', description: 'JPG, PNG, WebP, GIF, PDF, or Word only.', variant: 'destructive' })
      return
    }
    setDocActionId(doc.id)
    try {
      // Image compression for image types — lazy-load so the page bundle stays
      // small for the common case where no re-upload happens.
      let dataUrl: string
      let finalBytes: number
      if (file.type.startsWith('image/')) {
        const { compressImage } = await import('@/lib/image-compress')
        const c = await compressImage(file)
        dataUrl = c.dataUrl
        finalBytes = c.finalBytes
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.onerror = () => reject(r.error || new Error('read failed'))
          r.readAsDataURL(file)
        })
        finalBytes = file.size
      }

      if (finalBytes > DOC_MAX_BYTES) {
        toast({ title: 'File Too Large', description: `Max 200 KB. This file is ${Math.round(finalBytes / 1024)} KB.`, variant: 'destructive' })
        return
      }

      await api.put(`/api/school/admissions/${admissionId}/documents/${doc.id}`, {
        fileUrl: dataUrl,
        fileSize: Math.round(finalBytes / 1024),
        fileType: file.type,
      })
      toast({ title: 'Uploaded', description: `${file.name} uploaded. Pending re-verification.` })
      await refreshDocs()
    } catch (err) {
      toast({ title: "Couldn't Upload", description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setDocActionId(null)
    }
  }
  // ---- end Document actions ------------------------------------------------

  // Re-fetch when the admin picks a different academic year from the selector.
  useEffect(() => {
    if (!student || !viewYear) return
    if (student.academicYearContext?.resolvedAcademicYear === viewYear) return
    if (student.academicYearContext?.requestedAcademicYear === viewYear) return
    fetchStudent(studentId, viewYear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear])

  useEffect(() => {
    const fetchPromotionOptions = async () => {
      try {
        const [classData, sectionData, yearData] = await Promise.all([
          api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true }),
          api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
          api.get<{ academicYears: string[] }>('/api/school/academic-years', undefined, { skipLogoutOn401: true }),
        ])
        setClasses(classData.classes || [])
        setSections(sectionData.sections || [])
        setAcademicYears(yearData.academicYears || [])
      } catch {
        // Promotion can still be unavailable without blocking the detail page.
      }
    }
    fetchPromotionOptions()
  }, [])

  // Fee groups depend on the target class + academic year. Refetch only when
  // both are set so the dropdown shows groups with an active FeesStructure.
  useEffect(() => {
    if (!promotionForm.classId || !promotionForm.academicYear) {
      setFeesGroups([])
      return
    }
    let mounted = true
    const fetchFeesGroups = async () => {
      try {
        const data = await api.get<{ groups: FeesGroupOption[] }>(
          '/api/school/fees/groups',
          { academicYear: promotionForm.academicYear, classId: promotionForm.classId },
          { skipLogoutOn401: true }
        )
        if (!mounted) return
        const list = data?.groups || []
        setFeesGroups(list)
        setPromotionForm((current) => {
          if (!current.feesGroupId) return current
          if (list.some((group) => group.id === current.feesGroupId)) return current
          return { ...current, feesGroupId: '' }
        })
      } catch {
        if (mounted) setFeesGroups([])
      }
    }
    fetchFeesGroups()
    return () => { mounted = false }
  }, [promotionForm.classId, promotionForm.academicYear])

  const filteredPromotionSections = useMemo(
    () => promotionForm.classId ? sections.filter((section) => section.classId === promotionForm.classId) : [],
    [promotionForm.classId, sections]
  )

  const openPromoteDialog = () => {
    setPromotionForm({
      academicYear: currentSchoolAcademicYear || academicYears[0] || student?.admission?.academicYear || '',
      classId: student?.class?.id || '',
      sectionId: '',
      feesGroupId: student?.admission?.feesGroupId || '',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      remarks: '',
      carryForwardTransport: true,
    })
    setPromoteOpen(true)
  }

  const submitPromotion = async () => {
    if (!student) return
    if (!promotionForm.academicYear || !promotionForm.classId) {
      toast({ title: 'Missing Details', description: 'Please select target session and class.', variant: 'destructive' })
      return
    }

    setPromoting(true)
    try {
      const result = await api.post<{ message?: string; previousSessionDue?: number; transport?: { carried: boolean; warning: string | null; newFare: number | null } | null }>(
        `/api/school/students/${studentId}/promote`,
        {
          ...promotionForm,
          feesGroupId: promotionForm.feesGroupId || null,
          sectionId: promotionForm.sectionId || null,
          carryForwardTransport: promotionForm.carryForwardTransport,
        }
      )
      toast({
        title: 'Student Promoted',
        description: result.message || 'New session enrollment has been created.',
      })
      setPromoteOpen(false)
      await fetchStudent(studentId, viewYear || undefined)
    } catch (err) {
      toast({
        title: "Couldn't Promote Student",
        description: err instanceof Error ? err.message : 'Please check promotion details and try again.',
        variant: 'destructive',
      })
    } finally {
      setPromoting(false)
    }
  }

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
  const fatherParentLink = student.parentLinks?.find((link) => link.relation === 'Father') ?? null
  const motherParentLink = student.parentLinks?.find((link) => link.relation === 'Mother') ?? null
  const yearScoped = student.academicYearContext?.yearScoped || null
  const effectiveClassName = yearScoped?.className ?? student.class?.name ?? null
  const effectiveSectionName = yearScoped?.sectionName ?? student.section?.name ?? null
  const effectiveRollNumber = yearScoped?.rollNumber ?? student.rollNumber ?? null
  const effectiveEnrollmentStatus = yearScoped?.status ?? student.admissionStatus ?? null
  const classLabel = [effectiveClassName, effectiveSectionName ? `Section ${effectiveSectionName}` : null].filter(Boolean).join(' - ')
  const admissionLabel = student.admissionNumber || a?.admissionNumber
  const documents = a?.documents || []
  const availableYears = student.academicYearContext?.availableYears || []
  const resolvedAcademicYear = student.academicYearContext?.resolvedAcademicYear || null
  const isViewingPastYear = !!(resolvedAcademicYear && currentSchoolAcademicYear && resolvedAcademicYear !== currentSchoolAcademicYear)
  const requestedYearHasNoEnrollment =
    !!viewYear && !!student.academicYearContext && !student.academicYearContext.hasEnrollmentForRequestedYear

  const studentPhoto = student.profileImage || a?.profileImage || null
  const permanentAddressLine = [a?.address || student.address, a?.city || student.city, a?.state || student.state, a?.pincode || student.pincode, a?.country || student.country].filter(Boolean).join(', ')
  const localAddressLine = a?.localAddress ? [a.localAddress, a.localVillage, a.localPostOffice, a.localPoliceStation, a.localWardNo ? `Ward ${a.localWardNo}` : null, a.localCity, a.localState, a.localPincode, a.localCountry].filter(Boolean).join(', ') : ''

  const viewingYear = resolvedAcademicYear || currentSchoolAcademicYear || a?.academicYear || null
  const yearTransportAlloc = viewingYear
    ? student.transportAllocations?.find((t) => t.isActive && t.academicYear === viewingYear) || null
    : null
  const fallbackTransportAlloc = !yearTransportAlloc
    ? student.transportAllocations?.find((t) => t.isActive) || null
    : null
  const transportAlloc = yearTransportAlloc || fallbackTransportAlloc
  const hasTransport = !!transportAlloc || !!a?.transportRouteId

  const yearHostelAlloc = viewingYear
    ? student.hostelAllocations?.find((h) => h.isActive && h.academicYear === viewingYear) || null
    : null
  const hostelAlloc = yearHostelAlloc || (!yearHostelAlloc ? student.hostelAllocations?.find((h) => h.isActive) || null : null)
  const hasHostel = !!hostelAlloc
  const admissionStatusKey = (student.admissionStatus || '').toLowerCase()
  const isWithdrawnOrTransferred = admissionStatusKey === 'withdrawn' || admissionStatusKey === 'transferred'
  const canUseStudentServices = !isWithdrawnOrTransferred

  return (
    <div className="space-y-4">
      {/* Print stylesheet: visible only at print time. Hides app chrome, shows the form. */}
      <style>{`
        @media print {
          /* @page margin handles continuation pages (page 2+ top) when the
             print dialog honors it. The form's own padding is a fallback so
             the margin band is always visible regardless of what the user
             picks in Chrome's print dialog (None/Default/Custom). */
          @page { size: A4; margin: 8mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #print-admission-form, #print-admission-form * { visibility: visible !important; }
          #print-admission-form {
            display: block !important;
            position: static !important;
            width: auto;
            box-sizing: border-box;
            padding: 0;
            color: #000; background: #fff;
            font-family: ui-sans-serif, system-ui, sans-serif;
            line-height: 1.42;
          }
          #print-admission-form ~ * { display: none !important; }
          #print-admission-form .pf-row {
            page-break-inside: avoid;
            break-inside: avoid;
            min-height: 20px;
          }
          #print-admission-form .pf-heading {
            page-break-after: avoid;
            break-after: avoid;
            background: #f3f4f6;
            border: 1px solid #111;
            border-left: 4px solid #111;
            padding: 4px 7px;
            margin-top: 18px;
            margin-bottom: 6px;
          }
          #print-admission-form h2 { page-break-after: avoid; }
          #print-admission-form ol, #print-admission-form p {
            break-inside: avoid;
          }
        }

        /* Branded admission form (banner uploaded) — table-style layout matching
           the school's printed letterhead admission form: tan section bars,
           bordered cells, visual checkboxes. */
        #print-admission-form { font-size: 11px; }
        #print-admission-form .bf { width: 100%; border-collapse: collapse; font-size: 11px; page-break-inside: auto; }
        #print-admission-form .bf + .bf { margin-top: -1px; }
        #print-admission-form .bf tr { page-break-inside: avoid; }
        #print-admission-form .bf-avoid-break { page-break-inside: avoid; }
        #print-admission-form .bf td, #print-admission-form .bf th { border: 1px solid #000; padding: 5px 7px; vertical-align: middle; color: #000; text-align: left; overflow-wrap: anywhere; }
        #print-admission-form .bf .bf-head { background: #e8c690; font-weight: 700; text-align: left; padding: 6px 8px; letter-spacing: 0.3px; }
        #print-admission-form .bf .bf-head-center { text-align: center; }
        #print-admission-form .bf .bf-col { background: #f4dfba; font-weight: 700; }
        #print-admission-form .bf .bf-row-label { background: #f8edd5; font-weight: 600; width: 26%; }
        #print-admission-form .bf .bf-photo { width: 112px; text-align: center; vertical-align: middle; padding: 0; background: #fff; }
        #print-admission-form .bf .bf-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
        #print-admission-form .bf .bf-photo-text { display: block; color: #6b7280; font-size: 10px; font-weight: 500; }
        #print-admission-form .bf .bf-yn { width: 70px; text-align: center; white-space: nowrap; }
        #print-admission-form .bf .bf-tall { height: 50px; vertical-align: top; }
        #print-admission-form .bf .bf-small { font-size: 9px; color: #444; }
        #print-admission-form .bf-label { font-weight: 700; color: #111; }
        #print-admission-form .bf-value { font-weight: 600; color: #000; }
        #print-admission-form .bf-cb { display: inline-block; width: 11px; height: 11px; border: 1px solid #000; margin-right: 4px; vertical-align: -1px; text-align: center; line-height: 9px; font-size: 10px; background: #fff; }
        #print-admission-form .bf-cb-on::before { content: '✓'; font-weight: 700; }
        #print-admission-form .bf-pill { display: inline-block; min-width: 38px; border-bottom: 1px solid #000; padding: 0 6px; margin: 0 6px; text-align: center; }
        #print-admission-form .bf-sign { margin-top: 28px; }
        #print-admission-form .bf-sign-grid { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; font-size: 11px; }
        #print-admission-form .bf-sign-grid > div { border-top: 1px solid #000; padding-top: 3px; text-align: center; }
        #print-admission-form .bf-footer-note { margin-top: 16px; text-align: center; font-size: 10px; border-top: 1px dashed #444; padding-top: 6px; }
      `}</style>

      <PrintableAdmissionForm
        student={student}
        admission={a}
        school={currentSchool}
        studentPhoto={studentPhoto}
        permanentAddressLine={permanentAddressLine}
        localAddressLine={localAddressLine}
        className={effectiveClassName}
        section={effectiveSectionName}
        rollNumber={effectiveRollNumber}
        documents={documents}
      />

      {requestedYearHasNoEnrollment && (
        <div className="rounded-xl border border-red-200/80 bg-gradient-to-r from-red-50 via-white to-rose-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-500/25 dark:from-red-500/15 dark:via-card dark:to-rose-500/10 dark:text-red-300">
          This student wasn&apos;t enrolled in <strong>{viewYear}</strong>. Showing latest profile info; class &amp; roll
          for that session are unavailable.
        </div>
      )}

      {/* Layout: sticky sidebar (identity + key facts + actions) + main panel. */}
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* ───────── Sidebar ───────── */}
        <aside className="lg:sticky lg:top-2 lg:self-start">
          <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-sky-500/[0.035] py-0 shadow-md shadow-primary/5">
            {/* Identity surface — gradient backing pulls the photo + name out
                of the dense field grid that follows. */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary via-teal-600 to-cyan-600 px-4 pb-4 pt-5 text-white">
              <div aria-hidden className="absolute -right-9 -top-12 size-32 rounded-full border-[16px] border-white/10" />
              <div aria-hidden className="absolute -bottom-10 -left-8 size-24 rounded-full bg-sky-300/10 blur-xl" />
              <div className="relative mx-auto flex size-32 items-center justify-center overflow-hidden rounded-2xl border-4 border-white/70 bg-white/15 shadow-xl shadow-black/15 ring-2 ring-white/20 sm:size-36">
                {studentPhoto ? (
                  <img src={studentPhoto} alt={fullName} className="size-full object-cover" />
                ) : (
                  <User className="size-12 text-white/75" />
                )}
              </div>
              <div className="relative mt-3 text-center">
                <h1 className="break-words text-base font-bold leading-tight tracking-tight text-white sm:text-lg">
                  {fullName}
                </h1>
                {classLabel && (
                  <p className="mt-0.5 text-[11px] font-medium text-white/75">{classLabel}</p>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-2 inline-flex h-5 items-center gap-1 rounded-md !border-white/30 !bg-white/90 px-1.5 text-[10.5px] font-semibold shadow-sm',
                    statusClass(effectiveEnrollmentStatus),
                  )}
                >
                  <BadgeCheck className="size-3" />
                  {effectiveEnrollmentStatus || 'Admitted'}
                </Badge>
                {student.assignedHouse && <HouseHighlight house={student.assignedHouse} />}
              </div>
            </div>

            <div className="px-3 pb-3">
              {/* Key facts — a compact identity card built into the sidebar so
                  the student's anchor info is always on screen. */}
              <div className="rounded-lg border border-sky-200/70 bg-gradient-to-br from-sky-50 via-white to-cyan-50 px-2.5 py-2 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-cyan-500/8">
                <KeyFact icon={Hash} label="Adm No" value={admissionLabel} />
                {effectiveRollNumber && (
                  <KeyFact icon={IdCard} label="Roll" value={String(effectiveRollNumber)} />
                )}
                <KeyFact icon={CalendarDays} label="DOB" value={formatDate(student.dateOfBirth)} />
                {student.gender && (
                  <KeyFact
                    icon={student.gender === 'Male' ? CircleUser : CircleUserRound}
                    label="Gender"
                    value={student.gender}
                  />
                )}
                {(resolvedAcademicYear || currentSchoolAcademicYear || a?.academicYear) && (
                  <KeyFact
                    icon={CalendarDays}
                    label="Session"
                    value={resolvedAcademicYear || currentSchoolAcademicYear || a?.academicYear}
                  />
                )}
              </div>

              <Separator className="my-3" />

              {/* Action stack — primary action gets full-width emphasis;
                  destructive (TC) sits last with hairline separation. */}
              <div className="flex flex-col gap-1.5">
                {canCollectFees && (
                  <Button
                    size="sm"
                    onClick={() => router.push(`/fees/collections?preselect=${student.id}`)}
                    className="h-9 w-full justify-start gap-2 border border-emerald-500 bg-emerald-600 px-2.5 font-semibold text-white shadow-sm [background-image:linear-gradient(to_right,var(--color-emerald-600),var(--color-teal-600))] hover:-translate-y-px hover:shadow-md"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/15"><Banknote className="size-3.5 text-white" /></span>
                    Collect Fees
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/students/${studentId}/edit`)}
                    className="h-9 w-full justify-start gap-2 border-sky-200 bg-gradient-to-r from-sky-50 via-white to-cyan-50 px-2.5 text-sky-800 shadow-sm hover:-translate-y-px hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/15 dark:via-card dark:to-cyan-500/10 dark:text-sky-300"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-600"><Edit className="size-3.5 text-white" /></span>
                    Edit Profile
                  </Button>
                )}
                {canManageTransport && canUseStudentServices && (
                  hasTransport ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDiscontinueTransportOpen(true)}
                      className="h-9 w-full justify-start gap-2 border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-2.5 text-amber-800 shadow-sm hover:-translate-y-px hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10 dark:text-amber-300"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-600"><Bus className="size-3.5 text-white" /></span>
                      Discontinue Transport
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddTransportOpen(true)}
                      className="h-9 w-full justify-start gap-2 border-amber-200 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-2.5 text-amber-800 shadow-sm hover:-translate-y-px hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900 hover:shadow-md dark:border-amber-500/25 dark:from-amber-500/15 dark:via-card dark:to-orange-500/10 dark:text-amber-300"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-amber-500 to-orange-600"><Bus className="size-3.5 text-white" /></span>
                      Add Transport
                    </Button>
                  )
                )}
                {canManageHostel && canUseStudentServices && (
                  hasHostel ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDiscontinueHostelOpen(true)}
                      className="h-9 w-full justify-start gap-2 border-violet-200 bg-gradient-to-r from-violet-50 via-white to-purple-50 px-2.5 text-violet-800 shadow-sm hover:-translate-y-px hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10 dark:text-violet-300"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600"><Building2 className="size-3.5 text-white" /></span>
                      Discontinue Hostel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAddHostelOpen(true)}
                      className="h-9 w-full justify-start gap-2 border-violet-200 bg-gradient-to-r from-violet-50 via-white to-purple-50 px-2.5 text-violet-800 shadow-sm hover:-translate-y-px hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900 hover:shadow-md dark:border-violet-500/25 dark:from-violet-500/15 dark:via-card dark:to-purple-500/10 dark:text-violet-300"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-purple-600"><Building2 className="size-3.5 text-white" /></span>
                      Add Hostel
                    </Button>
                  )
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="h-9 w-full justify-start gap-2 border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-sky-50 px-2.5 text-indigo-800 shadow-sm hover:-translate-y-px hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-900 hover:shadow-md dark:border-indigo-500/25 dark:from-indigo-500/15 dark:via-card dark:to-sky-500/10 dark:text-indigo-300"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-sky-600"><Printer className="size-3.5 text-white" /></span>
                  Print Admission Form
                </Button>
                {canIssueTC && canUseStudentServices && (
                  <>
                    <Separator className="my-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={openWithdrawDialog}
                      className="h-9 w-full justify-start gap-2 border-red-200 bg-gradient-to-r from-red-50 via-white to-rose-50 px-2.5 text-red-700 shadow-sm hover:-translate-y-px hover:border-red-300 hover:bg-red-50 hover:text-red-800 hover:shadow-md dark:border-red-500/25 dark:from-red-500/15 dark:via-card dark:to-rose-500/10 dark:text-red-300"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-red-500 to-rose-600"><FileText className="size-3.5 text-white" /></span>
                      Issue Transfer Certificate
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        </aside>

        {/* ───────── Main panel ───────── */}
        <div className="min-w-0 space-y-3">
          {/* Withdrawal banner (renders only if student has an active withdrawal). */}
          <WithdrawalStatusBanner
            studentId={studentId}
            refreshKey={billingRefreshKey}
            onReverseClick={canReverseTC ? () => setReverseWithdrawOpen(true) : undefined}
            onIssueRefundClick={
              canIssueRefund
                ? ({ withdrawalId }) => setRefundDialog({ withdrawalId })
                : undefined
            }
          />

          {/* Refund history (renders only if there's at least one refund record). */}
          <RefundHistorySection
            studentId={studentId}
            refreshKey={billingRefreshKey}
            canVoid={canIssueRefund}
            onChanged={() => setBillingRefreshKey((n) => n + 1)}
          />

          {/* Transport / hostel discontinue refunds (advance + pending cash). */}
          <DiscontinueRefundsSection
            studentId={studentId}
            refreshKey={billingRefreshKey}
            canSettle={canIssueRefund}
            onChanged={() => setBillingRefreshKey((n) => n + 1)}
          />


      <Tabs defaultValue="personal" className="min-w-0 gap-2">
        <div className="sticky top-0 z-10 -mx-1 flex justify-center overflow-x-auto bg-background/90 px-1 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/75">
          <TabsList className="h-10 w-max rounded-xl border border-primary/15 bg-gradient-to-r from-sky-50 via-white to-violet-50 p-1 shadow-sm dark:from-sky-500/10 dark:via-card dark:to-violet-500/10">
            <TabsTrigger value="personal" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-sm [&[data-state=active]_svg]:text-white">
              <User className="size-3.5" />
              Personal
            </TabsTrigger>
            <TabsTrigger value="contact" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-sm [&[data-state=active]_svg]:text-white">
              <Phone className="size-3.5" />
              Contact
            </TabsTrigger>
            <TabsTrigger value="general" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-violet-500 data-[state=active]:text-white data-[state=active]:shadow-sm [&[data-state=active]_svg]:text-white">
              <GraduationCap className="size-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="accounts" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-sm [&[data-state=active]_svg]:text-white">
              <Banknote className="size-3.5" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="documents" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm [&[data-state=active]_svg]:text-white">
              <FileText className="size-3.5" />
              Documents
            </TabsTrigger>
            {(student.siblings?.length || 0) > 0 && (
              <TabsTrigger value="sibling" className="h-8 gap-1.5 rounded-lg px-2.5 text-xs data-[state=active]:bg-rose-500 data-[state=active]:text-white data-[state=active]:shadow-sm [&[data-state=active]_svg]:text-white">
                <Heart className="size-3.5" />
                Siblings
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="personal" className="mt-0">
          <div className="grid gap-3 xl:grid-cols-2">
            <SectionCard title="Personal Information" icon={User}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoRow label="Date of Birth" value={formatDate(student.dateOfBirth)} icon={CalendarDays} />
                <InfoRow label="Gender" value={student.gender} />
                <InfoRow label="Blood Group" value={student.bloodGroup || a?.bloodGroup} icon={Stethoscope} />
                <InfoRow label="Category" value={a?.category} />
                <InfoRow label="House" value={student.assignedHouse?.name} icon={BadgeCheck} />
                <InfoRow label="Caste" value={a?.caste} />
                <InfoRow label="Nationality" value={a?.nationality} />
                <InfoRow label="Religion" value={a?.religion} />
                <InfoRow label="Mother Tongue" value={a?.motherTongue} />
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

            <SectionCard title="Identity Numbers" icon={IdCard}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoRow label="Aadhaar" value={student.aadhaarNumber || a?.aadhaarNumber} icon={IdCard} />
                <InfoRow label="Registration No" value={a?.registrationNumber} icon={Hash} />
                <InfoRow label="PEN Number" value={a?.penNumber} icon={Hash} />
                <InfoRow label="Samagra ID" value={a?.samagraId} icon={Hash} />
                <InfoRow label="APAAR ID" value={a?.apaarId} icon={Hash} />
                <InfoRow label="UDISE ID" value={a?.udiseId} icon={Hash} />
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="general" className="mt-0">
          <div className="grid gap-3 xl:grid-cols-2">
            <SectionCard title="Academic Information" icon={GraduationCap}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoRow label="Admission No" value={student.admissionNumber || a?.admissionNumber} icon={IdCard} />
                <InfoRow label="Roll Number" value={effectiveRollNumber} />
                <InfoRow label="Class" value={effectiveClassName} />
                <InfoRow label="Section" value={effectiveSectionName} />
                <InfoRow label="Academic Year" value={resolvedAcademicYear || a?.academicYear} />
                <InfoRow label="Date of Admission" value={formatDate(a?.dateOfAdmission)} icon={CalendarDays} />
                <InfoRow label="Admitted On" value={formatDate(a?.admittedAt)} />
                <InfoRow label="Medium" value={a?.mediumOfInstruction} />
                <InfoRow label="Area" value={a?.area} />
              </div>
              {student.academicEnrollments && student.academicEnrollments.length > 0 && (
                <div className="mt-4 space-y-3">
                  <Separator />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session History</p>
                  <div className="space-y-2">
                    {student.academicEnrollments.map((enrollment) => (
                      <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                        <div>
                          <span className="font-semibold">{enrollment.academicYear}</span>
                          <span className="text-muted-foreground"> - {enrollment.class.name}{enrollment.section ? ` / ${enrollment.section.name}` : ''}</span>
                        </div>
                        <Badge variant="outline" className="rounded-md capitalize">{enrollment.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {a?.previousSchool && (
                <div className="mt-4 space-y-3">
                  <Separator />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous School</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

            {(hasTransport || hasHostel || a?.hostelName) && (
              <SectionCard title="Transport & Hostel" icon={Bus}>
                <div className="space-y-4">
                  {hasTransport && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transport</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <InfoRow label="Route" value={transportAlloc?.route?.routeName} icon={Bus} />
                        <InfoRow label="Route No" value={transportAlloc?.route?.routeNumber} icon={Hash} />
                        <InfoRow label="Stop" value={transportAlloc?.stopName || a?.transportStop} icon={MapPin} />
                        {transportAlloc?.fareAmount != null && (
                          <InfoRow label="Fare" value={formatCurrency(transportAlloc.fareAmount)} icon={Banknote} />
                        )}
                        {transportAlloc?.route?.startPoint && <InfoRow label="Start Point" value={transportAlloc.route.startPoint} icon={MapPin} />}
                        {transportAlloc?.route?.endPoint && <InfoRow label="End Point" value={transportAlloc.route.endPoint} icon={MapPin} />}
                        {transportAlloc?.academicYear && (
                          <InfoRow label="Session" value={transportAlloc.academicYear} icon={CalendarDays} />
                        )}
                      </div>
                      {transportAlloc && viewingYear && transportAlloc.academicYear !== viewingYear && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          No transport allocation for <strong>{viewingYear}</strong>. Showing latest active allocation from <strong>{transportAlloc.academicYear}</strong>.
                        </p>
                      )}
                    </div>
                  )}
                  {hasHostel ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hostel</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <InfoRow label="Hostel" value={hostelAlloc?.hostel?.name} icon={Home} />
                        <InfoRow label="Room No" value={hostelAlloc?.room?.roomNumber} />
                        <InfoRow label="Bed No" value={hostelAlloc?.bed?.bedNumber} />
                        {hostelAlloc?.room?.roomType && <InfoRow label="Room Type" value={hostelAlloc.room.roomType} />}
                        {hostelAlloc?.fareAmount != null && <InfoRow label="Fare" value={formatCurrency(hostelAlloc.fareAmount)} icon={Banknote} />}
                        {hostelAlloc?.academicYear && <InfoRow label="Session" value={hostelAlloc.academicYear} icon={CalendarDays} />}
                      </div>
                      {hostelAlloc && viewingYear && hostelAlloc.academicYear !== viewingYear && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          No hostel allocation for <strong>{viewingYear}</strong>. Showing latest active allocation from <strong>{hostelAlloc.academicYear}</strong>.
                        </p>
                      )}
                    </div>
                  ) : a?.hostelName && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hostel</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <InfoRow label="Hostel" value={a.hostelName} icon={Home} />
                        <InfoRow label="Room No" value={a.hostelRoomNo} />
                        <InfoRow label="Bed No" value={a.hostelBedNo} />
                      </div>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
            <TransportHistorySection
              studentId={studentId}
              academicYear={viewingYear || undefined}
              refreshKey={billingRefreshKey}
            />
          </div>
        </TabsContent>

        <TabsContent value="contact" className="mt-0">
          <div className="grid gap-3 xl:grid-cols-2">
            <SectionCard
              title="Father's Details"
              icon={CircleUser}
              headerAction={canEdit && fatherParentLink?.parent.userId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() =>
                    setResetParentTarget({
                      userId: fatherParentLink.parent.userId!,
                      name: a?.fatherName || 'Father',
                      relation: 'Father',
                    })
                  }
                >
                  <KeyRound className="size-3.5" />
                  Reset Password
                </Button>
              ) : undefined}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoRow label="Name" value={a?.fatherName} />
                <InfoRow label="Phone" value={a?.fatherPhone} icon={Phone} />
                <InfoRow label="Email" value={a?.fatherEmail} icon={Mail} />
                <InfoRow label="Occupation" value={a?.fatherOccupation} icon={Briefcase} />
                <InfoRow label="Aadhaar" value={a?.fatherAadhaar} icon={IdCard} />
                <InfoRow label="Education" value={a?.fatherEducation} icon={GraduationCap} />
                <InfoRow label="Annual Income" value={a?.fatherIncome ? formatCurrency(a.fatherIncome) : undefined} icon={Banknote} />
              </div>
            </SectionCard>

            <SectionCard
              title="Mother's Details"
              icon={CircleUserRound}
              headerAction={canEdit && motherParentLink?.parent.userId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() =>
                    setResetParentTarget({
                      userId: motherParentLink.parent.userId!,
                      name: a?.motherName || 'Mother',
                      relation: 'Mother',
                    })
                  }
                >
                  <KeyRound className="size-3.5" />
                  Reset Password
                </Button>
              ) : undefined}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                      {[a.localAddress, a.localVillage, a.localPostOffice, a.localPoliceStation, a.localWardNo ? `Ward ${a.localWardNo}` : null, a.localCity, a.localState, a.localPincode, a.localCountry].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="mt-0">
          <div className="grid gap-3 xl:grid-cols-2">
            <SectionCard title="Bank Details" icon={CreditCard}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoRow label="Account Number" value={a?.bankAccountNumber} icon={Banknote} />
                <InfoRow label="IFSC Code" value={a?.ifscCode} icon={CreditCard} />
              </div>
            </SectionCard>
            <SectionCard title="Fees Group" icon={BookOpenCheck}>
              {a?.feesGroup?.name ? (
                <div className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <BookOpenCheck className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">Assigned Group</p>
                    <p className="truncate text-sm font-semibold text-foreground">{a.feesGroup.name}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No fees group assigned.</p>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <SectionCard title="Admission Documents" icon={FileText}>
            {documents.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {documents.map((doc) => {
                  const busy = docActionId === doc.id
                  const isVerified = doc.verificationStatus === 'verified'
                  const isRejected = doc.verificationStatus === 'rejected'
                  const showVerify = canVerifyDocs && !isVerified && !!doc.fileUrl
                  const showReject = canVerifyDocs && !isRejected && !!doc.fileUrl
                  return (
                    <div key={doc.id} className="min-w-0 rounded-md border border-border/70 bg-muted/20 p-2.5">
                      <div className="flex min-w-0 items-start gap-2">
                        <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-xs font-semibold leading-tight">{doc.documentName}</p>
                          <p className="mt-0.5 capitalize text-[10.5px] text-muted-foreground">{doc.documentType.replace(/_/g, ' ')}</p>
                        </div>
                        <Badge variant="outline" className={cn('shrink-0 rounded gap-0.5 h-5 px-1.5 text-[10px]', documentStatusClass(doc.verificationStatus))}>
                          <DocumentStatusIcon status={doc.verificationStatus} />
                          {doc.verificationStatus}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>·</span>
                        <span>{formatDate(doc.uploadedAt)}</span>
                        {doc.isRequired && <><span>·</span><span className="text-amber-600">Required</span></>}
                        {doc.fileUrl && (
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-primary hover:underline">
                            View
                          </a>
                        )}
                      </div>
                      {isRejected && doc.rejectionReason && (
                        <p className="mt-1.5 rounded border border-red-200 bg-red-50 px-1.5 py-1 text-[10.5px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                          <span className="font-semibold">Reason: </span>{doc.rejectionReason}
                        </p>
                      )}
                      {isVerified && doc.verifiedAt && (
                        <p className="mt-1.5 text-[10.5px] text-emerald-700 dark:text-emerald-400">
                          Verified {formatDate(doc.verifiedAt)}
                        </p>
                      )}
                      {a?.id && (canVerifyDocs || canManageDocs) && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {showVerify && (
                            <Button size="sm" variant="outline" disabled={busy} className="h-6 gap-1 px-2 text-[10.5px]"
                              onClick={() => handleVerifyDoc(a.id, doc)}>
                              <ShieldCheck className="size-3" /> Verify
                            </Button>
                          )}
                          {showReject && (
                            <Button size="sm" variant="outline" disabled={busy} className="h-6 gap-1 px-2 text-[10.5px] text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => { setRejectDialog({ docId: doc.id, documentName: doc.documentName }); setRejectReason('') }}>
                              <ShieldX className="size-3" /> Reject
                            </Button>
                          )}
                          {canManageDocs && (
                            <>
                              <input
                                id={`profile-doc-input-${doc.id}`}
                                type="file"
                                accept={DOC_ACCEPT_ATTR}
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  e.target.value = ''
                                  if (file) await handleReUploadDoc(a.id, doc, file)
                                }}
                              />
                              <Button size="sm" variant="ghost" disabled={busy} className="h-6 gap-1 px-2 text-[10.5px]"
                                onClick={() => (document.getElementById(`profile-doc-input-${doc.id}`) as HTMLInputElement)?.click()}>
                                <Upload className="size-3" /> {doc.fileUrl ? 'Re-upload' : 'Upload'}
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy} className="h-6 gap-1 px-2 text-[10.5px] text-destructive"
                                onClick={() => setDeleteDocDialog({ admissionId: a.id, doc })}>
                                <Trash2 className="size-3" /> Delete
                              </Button>
                            </>
                          )}
                          {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No documents uploaded for this admission.</p>
            )}
          </SectionCard>
        </TabsContent>

        {(student.siblings?.length || 0) > 0 && (
          <TabsContent value="sibling" className="mt-0">
            <SectionCard title={student.siblings!.length === 1 ? 'Sibling' : 'Siblings'} icon={Heart}>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {student.siblings!.map(sib => (
                  <div key={sib.id} className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Users className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{sib.firstName} {sib.lastName}</p>
                      <p className="truncate text-[10.5px] text-muted-foreground">
                        {sib.admissionNumber && <span className="font-mono">{sib.admissionNumber}</span>}
                        {sib.admissionNumber && sib.className && <span> · </span>}
                        {sib.className && <span>{sib.className}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>
        </div>
      </div>

      {/* Billing-window dialogs (TC, transport add/discontinue, TC reversal). */}
      <WithdrawStudentDialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        studentId={studentId}
        studentName={fullName}
        onSuccess={() => {
          setBillingRefreshKey((k) => k + 1)
          fetchStudent(studentId, viewYear || undefined)
        }}
      />
      <AddTransportDialog
        open={addTransportOpen}
        onOpenChange={setAddTransportOpen}
        studentId={studentId}
        studentName={fullName}
        academicYear={viewingYear || ''}
        onSuccess={() => {
          setBillingRefreshKey((k) => k + 1)
          fetchStudent(studentId, viewYear || undefined)
        }}
      />
      <DiscontinueTransportDialog
        open={discontinueTransportOpen}
        onOpenChange={setDiscontinueTransportOpen}
        studentId={studentId}
        studentName={fullName}
        onSuccess={() => {
          setBillingRefreshKey((k) => k + 1)
          fetchStudent(studentId, viewYear || undefined)
        }}
      />
      <AddHostelDialog
        open={addHostelOpen}
        onOpenChange={setAddHostelOpen}
        studentId={studentId}
        studentName={fullName}
        academicYear={viewingYear || ''}
        onSuccess={() => {
          setBillingRefreshKey((k) => k + 1)
          fetchStudent(studentId, viewYear || undefined)
        }}
      />
      <DiscontinueHostelDialog
        open={discontinueHostelOpen}
        onOpenChange={setDiscontinueHostelOpen}
        studentId={studentId}
        studentName={fullName}
        onSuccess={() => {
          setBillingRefreshKey((k) => k + 1)
          fetchStudent(studentId, viewYear || undefined)
        }}
      />
      <ReverseWithdrawalDialog
        open={reverseWithdrawOpen}
        onOpenChange={setReverseWithdrawOpen}
        studentId={studentId}
        studentName={fullName}
        onSuccess={() => {
          setBillingRefreshKey((k) => k + 1)
          fetchStudent(studentId, viewYear || undefined)
        }}
      />
      {refundDialog && (
        <IssueRefundDialog
          open={!!refundDialog}
          onOpenChange={(v) => {
            if (!v) setRefundDialog(null)
          }}
          studentId={studentId}
          studentName={fullName}
          withdrawalId={refundDialog.withdrawalId}
          onSuccess={() => {
            setBillingRefreshKey((k) => k + 1)
            setRefundDialog(null)
          }}
        />
      )}

      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Promote Student</DialogTitle>
            <DialogDescription>
              Create a new session enrollment and fee assignment. Any old unpaid dues remain in the previous session ledger.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Target Session</Label>
                <Select value={promotionForm.academicYear} onValueChange={(value) => setPromotionForm((current) => ({ ...current, academicYear: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select session" /></SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Effective From</Label>
                <DatePicker
                  value={promotionForm.effectiveFrom}
                  onChange={(v) => setPromotionForm((current) => ({ ...current, effectiveFrom: v }))}
                  placeholder="Select effective date"
                  triggerClassName="w-full"
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Promote To Class</Label>
                <Select
                  value={promotionForm.classId}
                  onValueChange={(value) => setPromotionForm((current) => ({ ...current, classId: value, sectionId: '' }))}
                >
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select
                  value={promotionForm.sectionId || 'none'}
                  onValueChange={(value) => setPromotionForm((current) => ({ ...current, sectionId: value === 'none' ? '' : value }))}
                  disabled={!promotionForm.classId}
                >
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Section</SelectItem>
                    {filteredPromotionSections.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fees Group For New Session <span className="text-destructive">*</span></Label>
              <Select value={promotionForm.feesGroupId} onValueChange={(value) => setPromotionForm((current) => ({ ...current, feesGroupId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select fees group" /></SelectTrigger>
                <SelectContent>
                  {feesGroups.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const activeAlloc = student.transportAllocations?.find(
                (alloc) => alloc.isActive && alloc.academicYear !== promotionForm.academicYear
              )
              if (!activeAlloc) return null
              return (
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="single-carry-forward-transport"
                      checked={promotionForm.carryForwardTransport}
                      onCheckedChange={(value) => setPromotionForm((current) => ({ ...current, carryForwardTransport: value === true }))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="single-carry-forward-transport" className="cursor-pointer text-sm font-medium">
                        Carry forward transport
                      </Label>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p>
                          Current: <strong>{activeAlloc.route?.routeName || 'Route'}</strong>
                          {activeAlloc.route?.routeNumber ? ` (${activeAlloc.route.routeNumber})` : ''}
                          {activeAlloc.stopName ? ` · Stop: ${activeAlloc.stopName}` : ''}
                          {` · ₹${activeAlloc.fareAmount.toFixed(2)} in ${activeAlloc.academicYear}`}
                        </p>
                        <p>
                          New fare will be read from {promotionForm.academicYear || 'target session'}&apos;s stop fare. If no matching stop fare exists, you&apos;ll need to allocate manually.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                value={promotionForm.remarks}
                onChange={(event) => setPromotionForm((current) => ({ ...current, remarks: event.target.value }))}
                placeholder="Optional promotion note"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)} disabled={promoting}>Cancel</Button>
            <Button onClick={submitPromotion} disabled={promoting}>
              {promoting ? <Loader2 className="size-4 animate-spin" /> : <GraduationCap className="size-4" />}
              Promote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResetUserPasswordDialog
        open={!!resetParentTarget}
        onOpenChange={(open) => {
          if (!open) setResetParentTarget(null)
        }}
        userId={resetParentTarget?.userId ?? null}
        userName={resetParentTarget?.name ?? ''}
        roleLabel={resetParentTarget ? `parent (${resetParentTarget.relation.toLowerCase()} of ${fullName})` : 'parent'}
      />

      <Dialog open={!!rejectDialog} onOpenChange={(open) => { if (!open) { setRejectDialog(null); setRejectReason('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Document</DialogTitle>
            <DialogDescription>
              Please give a reason for rejecting <span className="font-medium">{rejectDialog?.documentName}</span>. The reason is shown to whoever re-uploads the document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Image is blurred — please upload a clearer scan."
              rows={3}
              maxLength={500}
            />
            <p className="text-[10.5px] text-muted-foreground">{rejectReason.length}/500</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRejectDialog(null); setRejectReason('') }} disabled={rejecting}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejecting || !rejectReason.trim() || !a?.id}
              onClick={() => a?.id && submitReject(a.id)}
            >
              {rejecting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Reject Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDocDialog} onOpenChange={(open) => { if (!open && !deletingDoc) setDeleteDocDialog(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>&ldquo;{deleteDocDialog?.doc.documentName}&rdquo;</strong>? The file will be removed from storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingDoc}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteDoc}
              disabled={deletingDoc}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingDoc && <Loader2 className="mr-2 size-4 animate-spin" />}
              {deletingDoc ? 'Deleting...' : 'Yes, Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
