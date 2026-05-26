'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
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
  Loader2,
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
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="size-3 text-primary/70" />}
        {label}
      </p>
      <p className="break-words text-sm font-medium text-foreground">{value || <span className="text-muted-foreground/60">--</span>}</p>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, className = '' }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('overflow-hidden border-border/70 shadow-sm gap-0 py-0', className)}>
      <CardHeader className="bg-muted/30 px-3 py-2">
        <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

function DetailPill({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1">
      <Icon className="size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}: </span>
        <span className="truncate text-xs font-semibold">{value || '--'}</span>
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
    <h2 className="mt-6 mb-3 border-b-2 border-black pb-1 text-[13px] font-bold uppercase tracking-wide">
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
        />
      ) : (
        <>
          <SchoolPrintHeader school={school} rightSlot={photoBox} />
          <h2 className="mt-3 text-center text-base font-bold underline">STUDENT ADMISSION FORM</h2>

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

      {a?.localAddress && !a.sameAsPermanent && (
        <>
          <PfHeading>3. Correspondence Address</PfHeading>
          <div className="grid grid-cols-2 gap-x-6">
            <PfRow label="Address" value={localAddressLine} span2 />
          </div>
        </>
      )}

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

      {a?.previousSchool && (
        <>
          <PfHeading>6. Previous School Details</PfHeading>
          <div className="grid grid-cols-2 gap-x-6">
            <PfRow label="School Name" value={a.previousSchool} />
            <PfRow label="Affiliated To" value={a.affiliatedTo} />
            <PfRow label="Address" value={a.previousSchoolAddress} span2 />
            <PfRow label="Previous Class" value={a.previousClass} />
            <PfRow label="Result" value={a.previousResult} />
            <PfRow label="TC Number" value={a.previousSchoolTC} />
            <PfRow label="TC Date" value={formatDate(a.tcDate)} />
          </div>
        </>
      )}

      {(() => {
        const transportRouteName = student.transportAllocations?.find((t) => t.isActive)?.route?.routeName
          || student.transportAllocations?.[0]?.route?.routeName
          || null
        const hasTransport = !!transportRouteName || !!a?.transportRouteId || !!a?.transportStop
        const hasHostel = !!a?.hostelName
        if (!hasTransport && !hasHostel) return null
        return (
          <>
            <PfHeading>7. Transport / Hostel</PfHeading>
            <div className="grid grid-cols-2 gap-x-6">
              {hasTransport && <PfRow label="Transport Route" value={transportRouteName} />}
              {a?.transportStop && <PfRow label="Pickup / Drop Stop" value={a.transportStop} />}
              {a?.hostelName && <PfRow label="Hostel" value={a.hostelName} />}
              {a?.hostelRoomNo && <PfRow label="Room No" value={a.hostelRoomNo} />}
              {a?.hostelBedNo && <PfRow label="Bed No" value={a.hostelBedNo} />}
            </div>
          </>
        )
      })()}

      {(a?.bankAccountNumber || a?.ifscCode) && (
        <>
          <PfHeading>8. Bank Details</PfHeading>
          <div className="grid grid-cols-2 gap-x-6">
            <PfRow label="Account Number" value={a?.bankAccountNumber} />
            <PfRow label="IFSC Code" value={a?.ifscCode} />
          </div>
        </>
      )}

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

      {a?.remarks && (
        <>
          <PfHeading>10. Remarks</PfHeading>
          <p className="text-[12px] leading-relaxed">{a.remarks}</p>
        </>
      )}

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
}: {
  student: StudentData
  admission: AdmissionData | null
  school: { id: string; name: string; printHeader?: string; logo?: string; address?: string; city?: string; state?: string; pincode?: string; country?: string; contactPhone?: string; contactEmail?: string; website?: string; board?: string } | null
  studentPhoto: string | null
  permanentAddressLine: string
  localAddressLine: string
  className: string | null
}) {
  const fullName = `${student.firstName} ${student.lastName}`.trim()
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
            <td>CLASS to which admission sought : {className || ''}</td>
            <td>Session : {a?.academicYear || ''}</td>
          </tr>
          <tr>
            <td>PEN : {a?.penNumber || ''}</td>
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
  const currentSchool = useAppStore((s) => s.currentSchool)

  const currentSchoolAcademicYear = currentSchool?.academicYear

  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const viewYear = useAppStore((s) => s.viewingAcademicYear) || currentSchoolAcademicYear || ''
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [feesGroups, setFeesGroups] = useState<FeesGroupOption[]>([])
  const [academicYears, setAcademicYears] = useState<string[]>([])
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoting, setPromoting] = useState(false)
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
      await fetchStudent(studentId)
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
  const yearScoped = student.academicYearContext?.yearScoped || null
  const effectiveClassName = yearScoped?.className ?? student.class?.name ?? null
  const effectiveSectionName = yearScoped?.sectionName ?? student.section?.name ?? null
  const effectiveRollNumber = yearScoped?.rollNumber ?? student.rollNumber ?? null
  const effectiveEnrollmentStatus = yearScoped?.status ?? student.admissionStatus ?? null
  const classLabel = [effectiveClassName, effectiveSectionName ? `Section ${effectiveSectionName}` : null].filter(Boolean).join(' - ')
  const admissionLabel = student.admissionNumber || a?.admissionNumber
  const primaryContact = a?.fatherPhone || a?.motherPhone
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

  return (
    <div className="space-y-3">
      {/* Print stylesheet: visible only at print time. Hides app chrome, shows the form. */}
      <style>{`
        @media print {
          /* @page margin handles continuation pages (page 2+ top) when the
             print dialog honors it. The form's own padding is a fallback so
             the margin band is always visible regardless of what the user
             picks in Chrome's print dialog (None/Default/Custom). */
          @page { size: A4; margin: 6mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #print-admission-form, #print-admission-form * { visibility: visible !important; }
          #print-admission-form {
            position: absolute; left: 0; top: 0; width: 100%;
            box-sizing: border-box;
            padding: 6mm;
            color: #000; background: #fff;
            font-family: ui-sans-serif, system-ui, sans-serif;
            line-height: 1.45;
          }
          #print-admission-form .pf-row { page-break-inside: avoid; }
          #print-admission-form h2 { page-break-after: avoid; }
        }

        /* Branded admission form (banner uploaded) — table-style layout matching
           the school's printed letterhead admission form: tan section bars,
           bordered cells, visual checkboxes. */
        #print-admission-form .bf { width: 100%; border-collapse: collapse; font-size: 11px; }
        #print-admission-form .bf + .bf { margin-top: -1px; }
        #print-admission-form .bf td, #print-admission-form .bf th { border: 1px solid #000; padding: 5px 7px; vertical-align: middle; color: #000; text-align: left; }
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
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          This student wasn&apos;t enrolled in <strong>{viewYear}</strong>. Showing latest profile info; class &amp; roll
          for that session are unavailable.
        </div>
      )}

      {/* Hero strip — replaces left sidebar. Photo + name + quick stats + actions. */}
      <Card className="overflow-hidden border-border/70 shadow-sm py-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-primary/20 bg-primary/10 shadow-sm sm:size-24">
                {(student.profileImage || a?.profileImage) ? (
                  <img src={(student.profileImage || a?.profileImage) as string} alt={fullName} className="size-full object-cover" />
                ) : (
                  <User className="size-8 text-primary sm:size-10" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-lg font-bold tracking-tight text-foreground sm:text-xl">{fullName}</h1>
                  <Badge variant="outline" className={cn('rounded-md font-semibold gap-1 h-5 px-1.5 text-[10.5px]', statusClass(effectiveEnrollmentStatus))}>
                    <BadgeCheck className="size-3" />
                    {effectiveEnrollmentStatus || 'Admitted'}
                  </Badge>
                </div>
                {classLabel && (
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">{classLabel}</p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <DetailPill label="Adm No" value={admissionLabel} icon={Hash} />
                  {effectiveRollNumber && <DetailPill label="Roll" value={String(effectiveRollNumber)} icon={IdCard} />}
                  <DetailPill label="DOB" value={formatDate(student.dateOfBirth)} icon={CalendarDays} />
                  {student.gender && <DetailPill label="Gender" value={student.gender} icon={student.gender === 'Male' ? CircleUser : CircleUserRound} />}
                  {primaryContact && <DetailPill label="Contact" value={primaryContact} icon={Phone} />}
                  {(resolvedAcademicYear || currentSchoolAcademicYear || a?.academicYear) && (
                    <DetailPill
                      label="Session"
                      value={resolvedAcademicYear || currentSchoolAcademicYear || a?.academicYear}
                      icon={CalendarDays}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-1.5 sm:ml-auto">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => router.push(`/students/${studentId}/edit`)} className="h-8 gap-1.5">
                  <Edit className="size-3.5" /> Edit
                </Button>
              )}
              {canCollectFees && (
                <Button variant="default" size="sm" onClick={() => router.push(`/fees/collections?preselect=${student.id}`)} className="h-8 gap-1.5">
                  <Banknote className="size-3.5" /> Collect Fees
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 gap-1.5">
                <Printer className="size-3.5" /> Admission Form
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal" className="min-w-0 gap-2">
        <div className="sticky top-0 z-10 -mx-1 flex justify-center overflow-x-auto bg-background/95 px-1 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <TabsList className="h-9 w-max rounded-md border border-border/70 bg-muted/50 p-0.5">
            <TabsTrigger value="personal" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <User className="size-3.5" />
              Personal
            </TabsTrigger>
            <TabsTrigger value="contact" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Phone className="size-3.5" />
              Contact
            </TabsTrigger>
            <TabsTrigger value="general" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <GraduationCap className="size-3.5" />
              General
            </TabsTrigger>
            <TabsTrigger value="accounts" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Banknote className="size-3.5" />
              Accounts
            </TabsTrigger>
            <TabsTrigger value="documents" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="size-3.5" />
              Documents
            </TabsTrigger>
            {(student.siblings?.length || 0) > 0 && (
              <TabsTrigger value="sibling" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Heart className="size-3.5" />
                Siblings
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="personal" className="mt-0">
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Personal Information" icon={User}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Academic Information" icon={GraduationCap}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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

            {(hasTransport || a?.hostelName) && (
              <SectionCard title="Transport & Hostel" icon={Bus}>
                <div className="space-y-4">
                  {hasTransport && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transport</p>
                      <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  {a?.hostelName && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hostel</p>
                      <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
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
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Father's Details" icon={CircleUser}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Bank Details" icon={CreditCard}>
              <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow label="Account Number" value={a?.bankAccountNumber} icon={Banknote} />
                <InfoRow label="IFSC Code" value={a?.ifscCode} />
                <InfoRow label="Fees Group" value={a?.feesGroup?.name} />
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <SectionCard title="Admission Documents" icon={FileText}>
            {documents.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {documents.map((doc) => (
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
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No documents uploaded for this admission.</p>
            )}
          </SectionCard>
        </TabsContent>

        {(student.siblings?.length || 0) > 0 && (
          <TabsContent value="sibling" className="mt-0">
            <SectionCard title={student.siblings!.length === 1 ? 'Sibling' : 'Siblings'} icon={Heart}>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  )
}
