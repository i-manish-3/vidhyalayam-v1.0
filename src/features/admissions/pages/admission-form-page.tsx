'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { getCurrentAcademicYear } from '@/lib/academic-years'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { DatePicker } from '@/components/date-picker'
import { cn } from '@/lib/utils'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import {
  UserPlus, ChevronLeft, ChevronRight, Check, Upload, X, ArrowLeft, Plus,
  MapPin, Phone, Mail, CalendarDays, GraduationCap, Building, Bus,
  Home, Banknote, FileText, Camera, AlertTriangle, Info, Save, Send,
  ShieldCheck, Edit, User, Heart, Search, CircleUser, CircleUserRound
} from 'lucide-react'

// ============================================
// Constants
// ============================================

const WIZARD_STEPS = [
  { number: 1, label: 'Personal Details', icon: User },
  { number: 2, label: 'Contact Info', icon: Phone },
  { number: 3, label: 'General Details', icon: GraduationCap },
  { number: 4, label: 'Accounts Info', icon: Banknote },
  { number: 5, label: 'Documents', icon: FileText },
  { number: 6, label: 'Review & Submit', icon: ShieldCheck },
]

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
]

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const CATEGORY_OPTIONS = [
  { value: 'General', label: 'General' },
  { value: 'OBC', label: 'OBC' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
  { value: 'EWS', label: 'EWS' },
]

const RELIGION_OPTIONS = [
  { value: 'Hindu', label: 'Hindu' },
  { value: 'Muslim', label: 'Muslim' },
  { value: 'Christian', label: 'Christian' },
  { value: 'Sikh', label: 'Sikh' },
  { value: 'Buddhist', label: 'Buddhist' },
  { value: 'Jain', label: 'Jain' },
  { value: 'Other', label: 'Other' },
]

const MEDIUM_OPTIONS = [
  { value: 'Hindi', label: 'Hindi' },
  { value: 'English', label: 'English' },
  { value: 'Urdu', label: 'Urdu' },
  { value: 'Bengali', label: 'Bengali' },
  { value: 'Tamil', label: 'Tamil' },
  { value: 'Telugu', label: 'Telugu' },
  { value: 'Kannada', label: 'Kannada' },
  { value: 'Malayalam', label: 'Malayalam' },
  { value: 'Marathi', label: 'Marathi' },
  { value: 'Gujarati', label: 'Gujarati' },
  { value: 'Other', label: 'Other' },
]

// Admission type removed — all admissions are direct (type: 'new')

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

const REQUIRED_DOCUMENTS = [
  { type: 'birth_certificate', name: 'Birth Certificate' },
  { type: 'aadhaar', name: 'Aadhaar Card' },
  { type: 'transfer_cert', name: 'Transfer Certificate' },
  { type: 'marksheet', name: 'Previous Marksheet' },
  { type: 'passport_photo', name: 'Passport Photo' },
  { type: 'caste_cert', name: 'Caste Certificate' },
  { type: 'income_cert', name: 'Income Certificate' },
  { type: 'migration_cert', name: 'Migration Certificate' },
  { type: 'character_cert', name: 'Character Certificate' },
  { type: 'medical_cert', name: 'Medical Certificate' },
]

// ============================================
// Form Interface
// ============================================

interface WizardForm {
  // Step 1: Personal Details
  profileImage: string // base64 data URL
  academicYear: string
  registrationNumber: string
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  bloodGroup: string
  aadhaarNumber: string
  penNumber: string
  samagraId: string
  apaarId: string
  udiseId: string
  heightCm: string
  weightKg: string
  // Step 2: Contact Info
  motherName: string
  motherPhone: string
  motherEmail: string
  motherOccupation: string
  motherAadhaar: string
  motherEducation: string
  motherIncome: string
  fatherName: string
  fatherPhone: string
  fatherEmail: string
  fatherOccupation: string
  fatherAadhaar: string
  fatherEducation: string
  fatherIncome: string
  // Permanent Address
  address: string
  village: string
  postOffice: string
  policeStation: string
  wardNo: string
  city: string
  state: string
  pincode: string
  country: string
  // Local Address
  sameAsPermanent: boolean
  localAddress: string
  localVillage: string
  localPostOffice: string
  localCity: string
  localState: string
  localPincode: string
  localCountry: string
  // Other
  belongsToEws: boolean
  isSingleGirlChild: boolean
  isDivyangian: boolean
  // Step 3: General Details
  classId: string
  sectionId: string
  // admissionType and admissionSession removed
  mediumOfInstruction: string
  religion: string
  category: string
  caste: string
  // Last Institution
  previousSchool: string
  previousSchoolAddress: string
  previousClass: string
  previousResult: string
  affiliatedTo: string
  previousSchoolTC: string
  tcDate: string
  // Transport
  transportRouteId: string
  transportStop: string
  // Hostel
  hostelName: string
  hostelRoomNo: string
  hostelBedNo: string
  // Step 3: Sibling
  siblingId: string
  // Step 4: Accounts Info
  bankAccountNumber: string
  ifscCode: string
  feesGroupId: string
  // Step 6
  remarks: string
  termsAccepted: boolean
}

const DEFAULT_FORM: WizardForm = {
  profileImage: '',
  academicYear: getCurrentAcademicYear(),
  registrationNumber: '',
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  bloodGroup: '',
  aadhaarNumber: '',
  penNumber: '',
  samagraId: '',
  apaarId: '',
  udiseId: '',
  heightCm: '',
  weightKg: '',
  motherName: '',
  motherPhone: '',
  motherEmail: '',
  motherOccupation: '',
  motherAadhaar: '',
  motherEducation: '',
  motherIncome: '',
  fatherName: '',
  fatherPhone: '',
  fatherEmail: '',
  fatherOccupation: '',
  fatherAadhaar: '',
  fatherEducation: '',
  fatherIncome: '',
  address: '',
  village: '',
  postOffice: '',
  policeStation: '',
  wardNo: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  sameAsPermanent: true,
  localAddress: '',
  localVillage: '',
  localPostOffice: '',
  localCity: '',
  localState: '',
  localPincode: '',
  localCountry: 'India',
  belongsToEws: false,
  isSingleGirlChild: false,
  isDivyangian: false,
  classId: '',
  sectionId: '',
  // admissionType defaults to 'new', admissionSession removed
  mediumOfInstruction: '',
  religion: '',
  category: '',
  caste: '',
  previousSchool: '',
  previousSchoolAddress: '',
  previousClass: '',
  previousResult: '',
  affiliatedTo: '',
  previousSchoolTC: '',
  tcDate: '',
  transportRouteId: '',
  transportStop: '',
  hostelName: '',
  hostelRoomNo: '',
  hostelBedNo: '',
  siblingId: '',
  bankAccountNumber: '',
  ifscCode: '',
  feesGroupId: '',
  remarks: '',
  termsAccepted: false,
}

// ============================================
// Helpers
// ============================================

// Inline field error component
function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

// Check if a field has a visible error (touched + has error)
function fieldHasError(field: string, touched: Record<string, boolean>, errors: Record<string, string>): boolean {
  return !!(touched[field] && errors[field])
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }
interface TransportRouteStopOption { name: string; fare?: number }
interface TransportRouteOption { id: string; routeName: string; stops?: string | null; feeMonths?: string | null }
interface FeesGroupOption { id: string; name: string }

function parseTransportStops(value: string | null | undefined): TransportRouteStopOption[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((stop) => {
        if (typeof stop === 'string') return { name: stop }
        if (stop && typeof stop === 'object' && typeof stop.name === 'string') {
          return {
            name: stop.name,
            fare: typeof stop.fare === 'number' ? stop.fare : undefined,
          }
        }
        return null
      })
      .filter((stop): stop is TransportRouteStopOption => !!stop && !!stop.name)
  } catch {
    return []
  }
}

function calculateAge(dob: string): string {
  if (!dob) return ''
  try {
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const m = today.getMonth() - birthDate.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
    return age >= 0 ? `${age} years` : ''
  } catch { return '' }
}

function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '--' }
}

// ============================================
// Main Component
// ============================================

export function AdmissionFormPage() {
  const { currentSchool, setCurrentPage, goBack } = useAppStore()
  const schoolId = currentSchool?.id
  const { toast } = useToast()

  // Step state
  const [currentStep, setCurrentStep] = useState(1)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // Form state
  const [form, setForm] = useState<WizardForm>({ ...DEFAULT_FORM })

  // Document uploads
  const [documentUploads, setDocumentUploads] = useState<Record<string, { uploaded: boolean; verificationStatus: string }>>({})
  const [customDocName, setCustomDocName] = useState('')
  const [customDocs, setCustomDocs] = useState<{ type: string; name: string }[]>([])

  // Data from API
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [transportRoutes, setTransportRoutes] = useState<TransportRouteOption[]>([])
  const [feesGroups, setFeesGroups] = useState<FeesGroupOption[]>([])
  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>([])
  const academicYearOptions = useMemo(
    () => availableAcademicYears
      .filter((year) => /^\d{4}-\d{4}$/.test(year))
      .sort((a, b) => b.localeCompare(a))
      .map((year) => ({ value: year, label: year })),
    [availableAcademicYears]
  )

  // Validation state
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  // Sibling search state
  const [siblingSearch, setSiblingSearch] = useState('')
  const [siblingResults, setSiblingResults] = useState<Array<{ id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null }>>([])
  const [siblingSearching, setSiblingSearching] = useState(false)
  const [selectedSibling, setSelectedSibling] = useState<typeof siblingResults[0] | null>(null)
  const [siblingAutoFilled, setSiblingAutoFilled] = useState(false) // Track if parent details were auto-filled from sibling

  // Parent phone match state
  const [showParentMatchDialog, setShowParentMatchDialog] = useState(false)
  const [parentMatchData, setParentMatchData] = useState<Array<{ source: string; parentId: string | null; fatherName: string | null; fatherPhone: string | null; motherName: string | null; motherPhone: string | null; children: Array<{ id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null; sectionName: string | null }> }> | null>(null)
  const [parentMatchField, setParentMatchField] = useState<'father' | 'mother' | null>(null)
  const [phoneLookupLoading, setPhoneLookupLoading] = useState(false)

  // Submitting state
  const [submitting, setSubmitting] = useState(false)

  // Admission number preview
  const [nextAdmissionNumber, setNextAdmissionNumber] = useState<string>('')
  const [nextRegistrationNumber, setNextRegistrationNumber] = useState<string>('')
  // Success dialog
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [assignedAdmissionNumber, setAssignedAdmissionNumber] = useState('')
  const [assignedRegistrationNumber, setAssignedRegistrationNumber] = useState('')

  // ============================================
  // Data Fetching
  // ============================================

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [secData, admNumData, academicYearData] = await Promise.allSettled([
          api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
          api.get<{ nextAdmissionNumber: string; nextRegistrationNumber: string }>('/api/school/admissions/next-number', undefined, { skipLogoutOn401: true }),
          api.get<{ academicYears: string[] }>('/api/school/academic-years', undefined, { skipLogoutOn401: true }),
        ])
        if (secData.status === 'fulfilled' && secData.value?.sections) setSections(secData.value.sections)
        if (admNumData.status === 'fulfilled') {
          if (admNumData.value?.nextAdmissionNumber) setNextAdmissionNumber(admNumData.value.nextAdmissionNumber)
          if (admNumData.value?.nextRegistrationNumber) setNextRegistrationNumber(admNumData.value.nextRegistrationNumber)
        }
        if (academicYearData.status === 'fulfilled' && academicYearData.value?.academicYears) {
          setAvailableAcademicYears(academicYearData.value.academicYears)
        }
      } catch {
        // Silently handle - use empty arrays
      }
    }
    fetchData()
  }, [])

  // Classes available for the selected academic year
  // (restricted to classes that have an active FeesStructure for that year).
  useEffect(() => {
    if (!form.academicYear) {
      setClasses([])
      return
    }
    let mounted = true
    const fetchClasses = async () => {
      try {
        const data = await api.get<{ classes: ClassOption[] }>(
          '/api/school/classes',
          { academicYear: form.academicYear },
          { skipLogoutOn401: true }
        )
        if (!mounted) return
        const list = data?.classes || []
        setClasses(list)
        setForm(prev => {
          if (!prev.classId) return prev
          if (list.some(c => c.id === prev.classId)) return prev
          return { ...prev, classId: '', sectionId: '', feesGroupId: '' }
        })
      } catch {
        if (mounted) setClasses([])
      }
    }
    fetchClasses()
    return () => { mounted = false }
  }, [form.academicYear])

  // Fees groups available for the selected (class, academic year)
  // (restricted to groups with an active FeesStructure for that pair).
  useEffect(() => {
    if (!form.academicYear || !form.classId) {
      setFeesGroups([])
      return
    }
    let mounted = true
    const fetchFeesGroups = async () => {
      try {
        const data = await api.get<{ groups: FeesGroupOption[] }>(
          '/api/school/fees/groups',
          { academicYear: form.academicYear, classId: form.classId },
          { skipLogoutOn401: true }
        )
        if (!mounted) return
        const list = data?.groups || []
        setFeesGroups(list)
        setForm(prev => {
          if (!prev.feesGroupId) return prev
          if (list.some(g => g.id === prev.feesGroupId)) return prev
          return { ...prev, feesGroupId: '' }
        })
      } catch {
        if (mounted) setFeesGroups([])
      }
    }
    fetchFeesGroups()
    return () => { mounted = false }
  }, [form.academicYear, form.classId])

  useEffect(() => {
    let mounted = true

    const fetchNextNumbers = async () => {
      try {
        const data = await api.get<{ nextAdmissionNumber: string; nextRegistrationNumber: string }>(
          '/api/school/admissions/next-number',
          form.classId ? { classId: form.classId } : undefined,
          { skipLogoutOn401: true }
        )
        if (!mounted) return
        if (data.nextAdmissionNumber) setNextAdmissionNumber(data.nextAdmissionNumber)
        if (data.nextRegistrationNumber) setNextRegistrationNumber(data.nextRegistrationNumber)
      } catch {
        // Keep the last preview; the server still assigns final numbers on submit.
      }
    }

    fetchNextNumbers()
    return () => {
      mounted = false
    }
  }, [form.classId])

  useEffect(() => {
    if (!academicYearOptions.some((year) => year.value === form.academicYear)) {
      setForm((prev) => ({
        ...prev,
        academicYear: academicYearOptions[0]?.value || '',
      }))
    }
  }, [academicYearOptions, form.academicYear])

  useEffect(() => {
    let mounted = true

    const fetchTransportRoutes = async () => {
      if (!form.academicYear) {
        setTransportRoutes([])
        return
      }

      try {
        const data = await api.get<{ routes: TransportRouteOption[] }>(
          '/api/school/transport/routes',
          { academicYear: form.academicYear },
          { skipLogoutOn401: true }
        )
        if (!mounted) return
        const routes = data.routes || []
        setTransportRoutes(routes)
        setForm((prev) => {
          if (!prev.transportRouteId || prev.transportRouteId === 'none') return prev
          if (routes.some((route) => route.id === prev.transportRouteId)) return prev
          return { ...prev, transportRouteId: '', transportStop: '' }
        })
      } catch {
        if (mounted) setTransportRoutes([])
      }
    }

    fetchTransportRoutes()

    return () => {
      mounted = false
    }
  }, [form.academicYear])

  const filteredSections = useMemo(
    () => form.classId ? sections.filter(s => s.classId === form.classId) : [],
    [form.classId, sections]
  )

  const selectedTransportRoute = useMemo(
    () => transportRoutes.find((route) => route.id === form.transportRouteId),
    [form.transportRouteId, transportRoutes]
  )

  const selectedTransportStops = useMemo(
    () => parseTransportStops(selectedTransportRoute?.stops),
    [selectedTransportRoute?.stops]
  )

  // Sibling search handler
  const handleSiblingSearch = useCallback(async (query: string) => {
    setSiblingSearch(query)
    if (query.trim().length < 2) {
      setSiblingResults([])
      return
    }
    setSiblingSearching(true)
    try {
      const data = await api.get<{ students: Array<{ id: string; firstName: string; lastName: string; admissionNumber: string | null; class: { name: string } | null }> }>('/api/school/students', { search: query.trim(), limit: '10' }, { skipLogoutOn401: true })
      if (data?.students) {
        setSiblingResults(data.students.map(s => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          admissionNumber: s.admissionNumber,
          className: s.class?.name || null,
        })))
      }
    } catch {
      setSiblingResults([])
    } finally {
      setSiblingSearching(false)
    }
  }, [])

  const selectSibling = async (sibling: typeof siblingResults[0]) => {
    setSelectedSibling(sibling)
    setForm(prev => ({ ...prev, siblingId: sibling.id }))
    setSiblingSearch('')
    setSiblingResults([])

    // Fetch parent details from the sibling's records and auto-fill
    try {
      const data = await api.get<{
        student: { id: string; address: string | null; city: string | null; state: string | null; pincode: string | null; country: string | null; village: string | null; postOffice: string | null; policeStation: string | null; wardNo: string | null }
        father: { name: string | null; phone: string | null; email: string | null; occupation: string | null; aadhaar: string | null; education: string | null; income: number | null }
        mother: { name: string | null; phone: string | null; email: string | null; occupation: string | null; aadhaar: string | null; education: string | null; income: number | null }
      }>(`/api/school/students/${sibling.id}/parent-details`, undefined, { skipLogoutOn401: true })

      if (data) {
        const { father, mother, student: siblingStudent } = data
        // Auto-fill parent details
        setForm(prev => ({
          ...prev,
          siblingId: sibling.id,
          // Father details
          fatherName: father?.name || prev.fatherName,
          fatherPhone: father?.phone || prev.fatherPhone,
          fatherEmail: father?.email || prev.fatherEmail,
          fatherOccupation: father?.occupation || prev.fatherOccupation,
          fatherAadhaar: father?.aadhaar || prev.fatherAadhaar,
          fatherEducation: father?.education || prev.fatherEducation,
          fatherIncome: father?.income ? String(father.income) : prev.fatherIncome,
          // Mother details
          motherName: mother?.name || prev.motherName,
          motherPhone: mother?.phone || prev.motherPhone,
          motherEmail: mother?.email || prev.motherEmail,
          motherOccupation: mother?.occupation || prev.motherOccupation,
          motherAadhaar: mother?.aadhaar || prev.motherAadhaar,
          motherEducation: mother?.education || prev.motherEducation,
          motherIncome: mother?.income ? String(mother.income) : prev.motherIncome,
          // Address (from sibling student record)
          address: siblingStudent?.address || prev.address,
          city: siblingStudent?.city || prev.city,
          state: siblingStudent?.state || prev.state,
          pincode: siblingStudent?.pincode || prev.pincode,
          country: siblingStudent?.country || prev.country,
          village: siblingStudent?.village || prev.village,
          postOffice: siblingStudent?.postOffice || prev.postOffice,
          policeStation: siblingStudent?.policeStation || prev.policeStation,
          wardNo: siblingStudent?.wardNo || prev.wardNo,
        }))
        setSiblingAutoFilled(true)
        toast({ title: 'Sibling Linked', description: `Parent details auto-filled from ${sibling.firstName}'s records` })
      }
    } catch {
      // Failed to fetch parent details - sibling is still linked, just no auto-fill
      toast({ title: 'Sibling Linked', description: 'Could not auto-fill parent details. Please fill them manually.' })
    }
  }

  const removeSibling = () => {
    setSelectedSibling(null)
    setForm(prev => ({ ...prev, siblingId: '' }))
    // If parent details were auto-filled from sibling, clear them
    if (siblingAutoFilled) {
      setForm(prev => ({
        ...prev,
        siblingId: '',
        fatherName: '', fatherPhone: '', fatherEmail: '', fatherOccupation: '', fatherAadhaar: '', fatherEducation: '', fatherIncome: '',
        motherName: '', motherPhone: '', motherEmail: '', motherOccupation: '', motherAadhaar: '', motherEducation: '', motherIncome: '',
        address: '', city: '', state: '', pincode: '', country: 'India',
        village: '', postOffice: '', policeStation: '', wardNo: '',
      }))
      setSiblingAutoFilled(false)
    }
  }

  // Phone number matching — check if parent already exists
  const handlePhoneLookup = useCallback(async (phone: string, field: 'father' | 'mother') => {
    const cleanPhone = phone.trim().replace(/\D/g, '')
    if (cleanPhone.length < 10) return

    // Don't lookup if sibling is already selected (auto-filled)
    if (selectedSibling) return

    setPhoneLookupLoading(true)
    setParentMatchField(field)
    try {
      const data = await api.get<{ matches: Array<{ source: string; parentId: string | null; fatherName: string | null; fatherPhone: string | null; motherName: string | null; motherPhone: string | null; children: Array<{ id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null; sectionName: string | null }> }> }>('/api/school/parents/lookup', { phone: cleanPhone }, { skipLogoutOn401: true })
      if (data?.matches && data.matches.length > 0) {
        // Filter out matches with no children
        const matchesWithChildren = data.matches.filter(m => m.children && m.children.length > 0)
        if (matchesWithChildren.length > 0) {
          setParentMatchData(matchesWithChildren)
          setShowParentMatchDialog(true)
        }
      }
    } catch {
      // Silently ignore lookup failures
    } finally {
      setPhoneLookupLoading(false)
    }
  }, [selectedSibling])

  // Handle linking a sibling from the parent match dialog
  const linkSiblingFromMatch = async (child: { id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null }) => {
    setSelectedSibling({
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      admissionNumber: child.admissionNumber,
      className: child.className,
    })
    setForm(prev => ({ ...prev, siblingId: child.id }))
    setShowParentMatchDialog(false)
    setParentMatchData(null)

    // Fetch parent details from the sibling's records and auto-fill (same as selectSibling)
    try {
      const data = await api.get<{
        student: { id: string; address: string | null; city: string | null; state: string | null; pincode: string | null; country: string | null; village: string | null; postOffice: string | null; policeStation: string | null; wardNo: string | null }
        father: { name: string | null; phone: string | null; email: string | null; occupation: string | null; aadhaar: string | null; education: string | null; income: number | null }
        mother: { name: string | null; phone: string | null; email: string | null; occupation: string | null; aadhaar: string | null; education: string | null; income: number | null }
      }>(`/api/school/students/${child.id}/parent-details`, undefined, { skipLogoutOn401: true })

      if (data) {
        const { father, mother, student: siblingStudent } = data
        setForm(prev => ({
          ...prev,
          siblingId: child.id,
          // Father details
          fatherName: father?.name || prev.fatherName,
          fatherPhone: father?.phone || prev.fatherPhone,
          fatherEmail: father?.email || prev.fatherEmail,
          fatherOccupation: father?.occupation || prev.fatherOccupation,
          fatherAadhaar: father?.aadhaar || prev.fatherAadhaar,
          fatherEducation: father?.education || prev.fatherEducation,
          fatherIncome: father?.income ? String(father.income) : prev.fatherIncome,
          // Mother details
          motherName: mother?.name || prev.motherName,
          motherPhone: mother?.phone || prev.motherPhone,
          motherEmail: mother?.email || prev.motherEmail,
          motherOccupation: mother?.occupation || prev.motherOccupation,
          motherAadhaar: mother?.aadhaar || prev.motherAadhaar,
          motherEducation: mother?.education || prev.motherEducation,
          motherIncome: mother?.income ? String(mother.income) : prev.motherIncome,
          // Address
          address: siblingStudent?.address || prev.address,
          city: siblingStudent?.city || prev.city,
          state: siblingStudent?.state || prev.state,
          pincode: siblingStudent?.pincode || prev.pincode,
          country: siblingStudent?.country || prev.country,
          village: siblingStudent?.village || prev.village,
          postOffice: siblingStudent?.postOffice || prev.postOffice,
          policeStation: siblingStudent?.policeStation || prev.policeStation,
          wardNo: siblingStudent?.wardNo || prev.wardNo,
        }))
        setSiblingAutoFilled(true)
        toast({ title: 'Sibling Linked', description: `Parent details auto-filled from ${child.firstName}'s records` })
      }
    } catch {
      setSiblingAutoFilled(true)
      toast({ title: 'Sibling Linked', description: 'Could not auto-fill parent details. Please fill them manually.' })
    }
  }

  // ============================================
  // Form Handlers
  // ============================================

  const updateForm = (field: keyof WizardForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'classId') {
      setForm(prev => ({ ...prev, sectionId: '' }))
    }
    // Real-time validation: if field was touched, validate on change
    if (touched[field]) {
      const error = validateField(field, value)
      setFieldErrors(prev => {
        const next = { ...prev }
        if (error) next[field] = error
        else delete next[field]
        return next
      })
    }
  }

  const handleBlur = (field: keyof WizardForm, overrideValue?: string | boolean) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    // Allow callers (e.g. Select.onValueChange) to pass the new value directly so
    // we don't validate against stale React state — setForm hasn't flushed yet
    // when this runs synchronously after updateForm.
    const value = overrideValue !== undefined ? overrideValue : form[field]
    const error = validateField(field, value)
    setFieldErrors(prev => {
      const next = { ...prev }
      if (error) next[field] = error
      else delete next[field]
      return next
    })
  }

  // Validate a single field
  const validateField = (field: string, value: string | boolean): string | null => {
    const v = typeof value === 'string' ? value.trim() : value
    switch (field) {
      // Step 1
      case 'academicYear':
        if (!v) return 'Academic year is required'
        if (!/^\d{4}-\d{4}$/.test(v as string)) return 'Invalid academic year format'
        return null
      case 'firstName':
        if (!v) return 'First name is required'
        if ((v as string).length < 2) return 'Must be at least 2 characters'
        if (!/^[a-zA-Z\s]+$/.test(v as string)) return 'Only letters and spaces allowed'
        return null
      case 'lastName':
        if (!v) return 'Last name is required'
        if ((v as string).length < 2) return 'Must be at least 2 characters'
        if (!/^[a-zA-Z\s]+$/.test(v as string)) return 'Only letters and spaces allowed'
        return null
      case 'dateOfBirth':
        if (!v) return 'Date of birth is required'
        const dob = new Date(v as string)
        if (isNaN(dob.getTime())) return 'Invalid date'
        if (dob > new Date()) return 'Date cannot be in the future'
        const age = new Date().getFullYear() - dob.getFullYear()
        if (age < 3) return 'Student must be at least 3 years old'
        return null
      case 'gender':
        if (!v) return 'Gender is required'
        return null
      case 'aadhaarNumber': {
        if (!v) return null
        const digits = (v as string).replace(/\D/g, '')
        if (digits.length !== 12) return 'Aadhaar must be exactly 12 digits'
        return null
      }
      case 'penNumber':
        if (!v) return null
        if ((v as string).length < 5) return 'PEN number must be at least 5 characters'
        if (!/^[a-zA-Z0-9]+$/.test(v as string)) return 'Only alphanumeric characters allowed'
        return null
      case 'samagraId':
        if (!v) return null
        if (!/^\d+$/.test(v as string)) return 'Samagra ID must be numeric'
        if ((v as string).length < 8) return 'Must be at least 8 digits'
        return null
      case 'apaarId':
        if (!v) return null
        if ((v as string).length < 5) return 'Must be at least 5 characters'
        return null
      case 'udiseId':
        if (!v) return null
        if (!/^\d+$/.test(v as string)) return 'Udise ID must be numeric'
        if ((v as string).length !== 11) return 'Udise ID must be exactly 11 digits'
        return null
      case 'heightCm':
        if (!v) return null
        const h = parseFloat(v as string)
        if (isNaN(h) || h <= 0) return 'Must be a positive number'
        if (h < 30 || h > 250) return 'Must be between 30-250 cm'
        return null
      case 'weightKg':
        if (!v) return null
        const w = parseFloat(v as string)
        if (isNaN(w) || w <= 0) return 'Must be a positive number'
        if (w < 2 || w > 200) return 'Must be between 2-200 kg'
        return null
      // Step 2 — Mother
      case 'motherName':
        if (!v) return null
        if ((v as string).length < 2) return 'Must be at least 2 characters'
        if (!/^[a-zA-Z\s]+$/.test(v as string)) return 'Only letters and spaces allowed'
        return null
      case 'motherPhone':
        if (!v) return null
        if (!/^[6-9]\d{9}$/.test(v as string)) return 'Must be a valid 10-digit Indian phone number'
        return null
      case 'motherEmail':
        if (!v) return null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v as string)) return 'Invalid email format'
        return null
      case 'motherAadhaar': {
        if (!v) return null
        const mDigits = (v as string).replace(/\D/g, '')
        if (mDigits.length !== 12) return 'Aadhaar must be exactly 12 digits'
        return null
      }
      case 'motherIncome':
        if (!v) return null
        if (isNaN(parseFloat(v as string)) || parseFloat(v as string) < 0) return 'Must be a positive number'
        return null
      // Step 2 — Father
      case 'fatherName':
        if (!v) return "Father's name is required"
        if ((v as string).length < 2) return 'Must be at least 2 characters'
        if (!/^[a-zA-Z\s]+$/.test(v as string)) return 'Only letters and spaces allowed'
        return null
      case 'fatherPhone':
        if (!v) return "Father's phone is required"
        if (!/^[6-9]\d{9}$/.test(v as string)) return 'Must be a valid 10-digit Indian phone number'
        return null
      case 'fatherEmail':
        if (!v) return null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v as string)) return 'Invalid email format'
        return null
      case 'fatherAadhaar': {
        if (!v) return null
        const fDigits = (v as string).replace(/\D/g, '')
        if (fDigits.length !== 12) return 'Aadhaar must be exactly 12 digits'
        return null
      }
      case 'fatherIncome':
        if (!v) return null
        if (isNaN(parseFloat(v as string)) || parseFloat(v as string) < 0) return 'Must be a positive number'
        return null
      // Step 2 — Address
      case 'address':
        if (!v) return null
        if ((v as string).length < 5) return 'Must be at least 5 characters'
        return null
      case 'pincode':
        if (!v) return null
        if (!/^\d{6}$/.test(v as string)) return 'Pincode must be exactly 6 digits'
        return null
      case 'localPincode':
        if (!v) return null
        if (!/^\d{6}$/.test(v as string)) return 'Pincode must be exactly 6 digits'
        return null
      // Step 3
      case 'classId':
        if (!v) return 'Please select a class'
        return null
      // Step 4
      case 'feesGroupId':
        if (!v) return 'Please select a fee group'
        return null
      case 'bankAccountNumber':
        if (!v) return null
        if (!/^\d{8,18}$/.test(v as string)) return 'Must be 8-18 digits'
        return null
      case 'ifscCode':
        if (!v) return null
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v as string)) return 'Invalid IFSC format (e.g., SBIN0001234)'
        return null
      // Step 6
      case 'termsAccepted':
        if (!v) return 'Please check the declaration box to confirm all information is correct before submitting.'
        return null
      default:
        return null
    }
  }

  // Validate all fields in a step and return errors
  const validateStepFields = (step: number): Record<string, string> => {
    const errors: Record<string, string> = {}
    const fieldsPerStep: Record<number, (keyof WizardForm)[]> = {
      1: ['academicYear', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'aadhaarNumber', 'penNumber', 'samagraId', 'apaarId', 'udiseId', 'heightCm', 'weightKg'],
      2: ['motherName', 'motherPhone', 'motherEmail', 'motherAadhaar', 'motherIncome', 'fatherName', 'fatherPhone', 'fatherEmail', 'fatherAadhaar', 'fatherIncome', 'address', 'pincode', 'localPincode'],
      3: ['classId'],
      4: ['bankAccountNumber', 'ifscCode', 'feesGroupId'],
      5: [],
      6: ['termsAccepted'],
    }
    const fields = fieldsPerStep[step] || []
    for (const field of fields) {
      const error = validateField(field, form[field])
      if (error) errors[field] = error
    }
    return errors
  }

  // Touch all fields in a step
  const touchStepFields = (step: number) => {
    const fieldsPerStep: Record<number, (keyof WizardForm)[]> = {
      1: ['academicYear', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'aadhaarNumber', 'penNumber', 'samagraId', 'apaarId', 'udiseId', 'heightCm', 'weightKg'],
      2: ['motherName', 'motherPhone', 'motherEmail', 'motherAadhaar', 'motherIncome', 'fatherName', 'fatherPhone', 'fatherEmail', 'fatherAadhaar', 'fatherIncome', 'address', 'pincode', 'localPincode'],
      3: ['classId'],
      4: ['bankAccountNumber', 'ifscCode', 'feesGroupId'],
      5: [],
      6: ['termsAccepted'],
    }
    const fields = fieldsPerStep[step] || []
    const newTouched: Record<string, boolean> = {}
    for (const field of fields) newTouched[field] = true
    setTouched(prev => ({ ...prev, ...newTouched }))
  }

  const validateStep = (step: number): string | null => {
    const errors = validateStepFields(step)
    // Touch all fields so errors show
    touchStepFields(step)
    setFieldErrors(prev => ({ ...prev, ...errors }))
    // Return first error message for toast
    const firstError = Object.values(errors)[0]
    return firstError || null
  }

  const handleNext = () => {
    const errors = validateStepFields(currentStep)
    touchStepFields(currentStep)
    setFieldErrors(prev => ({ ...prev, ...errors }))
    if (Object.keys(errors).length > 0) {
      toast({ title: 'Check Your Input', description: Object.values(errors)[0], variant: 'destructive' })
      return
    }
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps(prev => [...prev, currentStep])
    }
    setCurrentStep(prev => Math.min(prev + 1, 6))
  }

  const handlePrev = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleStepClick = (step: number) => {
    // Allow clicking on completed steps or the next available step
    const maxAccessible = completedSteps.length > 0 ? Math.max(...completedSteps) + 1 : 1
    if (step <= maxAccessible || completedSteps.includes(step)) {
      setCurrentStep(step)
    }
  }

  const buildPayload = () => ({
    ...form,
    schoolId,
    aadhaarNumber: form.aadhaarNumber ? form.aadhaarNumber.replace(/\D/g, '') : null,
    heightCm: form.heightCm ? parseFloat(form.heightCm) : null,
    weightKg: form.weightKg ? parseFloat(form.weightKg) : null,
    motherIncome: form.motherIncome ? parseFloat(form.motherIncome) : null,
    fatherIncome: form.fatherIncome ? parseFloat(form.fatherIncome) : null,
    siblingId: form.siblingId || null,
    annualIncome: form.fatherIncome ? parseFloat(form.fatherIncome) : null,
    documents: Object.entries(documentUploads)
      .filter(([, v]) => v.uploaded)
      .map(([type]) => ({ documentType: type, documentName: REQUIRED_DOCUMENTS.find(d => d.type === type)?.name || customDocs.find(d => d.type === type)?.name || type })),
  })

  const handleSubmit = async () => {
    // Validate ALL steps before submit
    const allErrors: Record<string, string> = {}
    for (let s = 1; s <= 6; s++) {
      const stepErrors = validateStepFields(s)
      Object.assign(allErrors, stepErrors)
    }
    // Touch all fields across all steps
    setTouched(() => {
      const all: Record<string, boolean> = {}
      Object.keys(form).forEach(k => { all[k] = true })
      return all
    })
    setFieldErrors(allErrors)
    if (Object.keys(allErrors).length > 0) {
      const firstErrorStep = [1, 2, 3, 4, 6].find(s => Object.keys(validateStepFields(s)).length > 0) || 1
      toast({ title: 'Missing Information', description: Object.values(allErrors)[0], variant: 'destructive' })
      setCurrentStep(firstErrorStep)
      return
    }

    setSubmitting(true)
    try {
      const payload = buildPayload()
      const result = await api.post<{ admissionNumber?: string; registrationNumber?: string }>('/api/school/admissions', payload)
      const assignedNum = result?.admissionNumber || nextAdmissionNumber || ''
      setAssignedAdmissionNumber(assignedNum)
      setAssignedRegistrationNumber(result?.registrationNumber || nextRegistrationNumber || '')
      setShowSuccessDialog(true)
    } catch (err) {
      toast({ title: "Couldn't Submit Application", description: err instanceof Error ? err.message : "We couldn't submit the application. Please try again.", variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDocumentUpload = (docType: string) => {
    setDocumentUploads(prev => ({
      ...prev,
      [docType]: { uploaded: true, verificationStatus: 'pending' },
    }))
    toast({ title: 'Uploaded', description: 'Document uploaded successfully (simulated)' })
  }

  const addCustomDocument = () => {
    if (!customDocName.trim()) return
    const customType = `custom_${customDocName.toLowerCase().replace(/\s+/g, '_')}`
    setCustomDocs(prev => [...prev, { type: customType, name: customDocName }])
    setDocumentUploads(prev => ({ ...prev, [customType]: { uploaded: false, verificationStatus: 'pending' } }))
    setCustomDocName('')
  }

  // ============================================
  // Step Renderers
  // ============================================

  const renderStep1PersonalDetails = () => {
    const age = calculateAge(form.dateOfBirth)
    const ec = (f: string) => fieldHasError(f, touched, fieldErrors) ? 'border-destructive focus-visible:ring-destructive' : ''
    return (
      <div className="space-y-6">
        {/* Photo Upload */}
        <div className="flex items-center gap-4">
          <div
            className="size-20 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30 shrink-0 overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => (document.getElementById('photo-input') as HTMLInputElement)?.click()}
          >
            {form.profileImage ? (
              <img src={form.profileImage} alt="Student photo" className="size-full object-cover" />
            ) : (
              <Camera className="size-8 text-muted-foreground/50" />
            )}
          </div>
          <div>
            <input
              id="photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const { dataUrl, finalBytes, compressed } = await compressImage(file)
                  if (finalBytes > 200 * 1024) {
                    toast({ title: 'Photo Too Large', description: 'This image format cannot be compressed under 200 KB. Please upload a JPG, PNG, or WebP.', variant: 'destructive' })
                    return
                  }
                  updateForm('profileImage', dataUrl)
                  if (compressed) {
                    toast({ title: 'Photo Compressed', description: `Resized to ${Math.round(finalBytes / 1024)} KB for upload.` })
                  }
                } catch {
                  toast({ title: 'Could Not Read Photo', description: 'Please try a different image.', variant: 'destructive' })
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={() => (document.getElementById('photo-input') as HTMLInputElement)?.click()} className="gap-1">
              <Upload className="size-3" /> {form.profileImage ? 'Change Photo' : 'Upload Photo'}
            </Button>
            {form.profileImage && (
              <Button variant="ghost" size="sm" onClick={() => updateForm('profileImage', '')} className="gap-1 ml-1 text-destructive">
                <X className="size-3" /> Remove
              </Button>
            )}
            <p className="text-xs text-muted-foreground mt-1">JPG/PNG/WebP — auto-compressed to 200 KB</p>
          </div>
        </div>

        <Separator />

        {/* Admission Number - Auto Generated */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Admission Number
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={nextAdmissionNumber || 'Auto-generated on submit'}
                readOnly
                className="bg-muted/50 font-mono text-base font-semibold tracking-wide cursor-not-allowed border-dashed"
              />
              <Badge variant="outline" className="shrink-0 text-xs">Auto</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Assigned automatically in serial order</p>
          </div>
        </div>

        {/* Academic Year & Registration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Academic Year <span className="text-destructive">*</span></Label>
            <Select value={form.academicYear} onValueChange={v => updateForm('academicYear', v)} disabled={academicYearOptions.length === 0}>
              <SelectTrigger className={ec('academicYear')}><SelectValue placeholder="Select active year" /></SelectTrigger>
              <SelectContent>
                {academicYearOptions.map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {academicYearOptions.length === 0 && (
              <p className="mt-1 text-xs text-destructive">No active academic year is available. Reactivate or create a year before creating admissions.</p>
            )}
            <FieldError message={touched.academicYear ? fieldErrors.academicYear : null} />
          </div>
          <div className="space-y-2">
            <Label>Registration Number</Label>
            <div className="flex items-center gap-2">
              <Input
                value={nextRegistrationNumber || 'Auto-generated on submit'}
                readOnly
                className="bg-muted/50 font-mono text-base font-semibold tracking-wide cursor-not-allowed border-dashed"
              />
              <Badge variant="outline" className="shrink-0 text-xs">Auto</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Uses the school registration format</p>
          </div>
        </div>

        {/* Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First Name <span className="text-destructive">*</span></Label>
            <Input value={form.firstName} onChange={e => updateForm('firstName', e.target.value)} onBlur={() => handleBlur('firstName')} placeholder="Enter first name" className={ec('firstName')} />
            <FieldError message={touched.firstName ? fieldErrors.firstName : null} />
          </div>
          <div className="space-y-2">
            <Label>Last Name <span className="text-destructive">*</span></Label>
            <Input value={form.lastName} onChange={e => updateForm('lastName', e.target.value)} onBlur={() => handleBlur('lastName')} placeholder="Enter last name" className={ec('lastName')} />
            <FieldError message={touched.lastName ? fieldErrors.lastName : null} />
          </div>
        </div>

        {/* DOB & Gender */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Date of Birth <span className="text-destructive">*</span></Label>
            <DatePicker
              value={form.dateOfBirth}
              onChange={(v) => {
                updateForm('dateOfBirth', v)
                setTouched(prev => ({ ...prev, dateOfBirth: true }))
                const error = validateField('dateOfBirth', v)
                setFieldErrors(prev => {
                  const next = { ...prev }
                  if (error) next.dateOfBirth = error
                  else delete next.dateOfBirth
                  return next
                })
              }}
              disableFuture
              showQuickActions={false}
              yearDropdown
              yearsBack={30}
              placeholder="Select date of birth"
              triggerClassName={cn('w-full', ec('dateOfBirth'))}
            />
            {age && <p className="text-xs text-muted-foreground">Age: {age}</p>}
            <FieldError message={touched.dateOfBirth ? fieldErrors.dateOfBirth : null} />
          </div>
          <div className="space-y-2">
            <Label>Gender <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateForm('gender', 'Male')}
                className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 transition-all ${
                  form.gender === 'Male'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-muted bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <CircleUser className="size-4" />
                <span className="text-xs font-medium">Male</span>
              </button>
              <button
                type="button"
                onClick={() => updateForm('gender', 'Female')}
                className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 transition-all ${
                  form.gender === 'Female'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-muted bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <CircleUserRound className="size-4" />
                <span className="text-xs font-medium">Female</span>
              </button>
            </div>
            <FieldError message={touched.gender ? fieldErrors.gender : null} />
          </div>
        </div>

        {/* Blood Group & Aadhaar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Blood Group</Label>
            <Select value={form.bloodGroup} onValueChange={v => updateForm('bloodGroup', v)}>
              <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
              <SelectContent>
                {BLOOD_GROUP_OPTIONS.map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Aadhaar Number</Label>
            <Input
              value={form.aadhaarNumber}
              onChange={e => updateForm('aadhaarNumber', formatAadhaar(e.target.value))}
              onBlur={() => handleBlur('aadhaarNumber')}
              placeholder="XXXX XXXX XXXX"
              maxLength={14}
              className={ec('aadhaarNumber')}
            />
            <FieldError message={touched.aadhaarNumber ? fieldErrors.aadhaarNumber : null} />
          </div>
        </div>

        {/* Government IDs */}
        <Separator />
        <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="size-4" /> Government IDs
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>PEN Number</Label>
            <Input value={form.penNumber} onChange={e => updateForm('penNumber', e.target.value)} onBlur={() => handleBlur('penNumber')} placeholder="PEN / Government ID" className={ec('penNumber')} />
            <FieldError message={touched.penNumber ? fieldErrors.penNumber : null} />
          </div>
          <div className="space-y-2">
            <Label>Samagra ID</Label>
            <Input value={form.samagraId} onChange={e => updateForm('samagraId', e.target.value)} onBlur={() => handleBlur('samagraId')} placeholder="Samagra ID" className={ec('samagraId')} />
            <FieldError message={touched.samagraId ? fieldErrors.samagraId : null} />
          </div>
          <div className="space-y-2">
            <Label>Apaar ID</Label>
            <Input value={form.apaarId} onChange={e => updateForm('apaarId', e.target.value)} onBlur={() => handleBlur('apaarId')} placeholder="Apaar ID" className={ec('apaarId')} />
            <FieldError message={touched.apaarId ? fieldErrors.apaarId : null} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Udise ID</Label>
            <Input value={form.udiseId} onChange={e => updateForm('udiseId', e.target.value)} onBlur={() => handleBlur('udiseId')} placeholder="Udise ID" className={ec('udiseId')} />
            <FieldError message={touched.udiseId ? fieldErrors.udiseId : null} />
          </div>
          <div className="space-y-2">
            <Label>Height (cm)</Label>
            <Input type="number" value={form.heightCm} onChange={e => updateForm('heightCm', e.target.value)} onBlur={() => handleBlur('heightCm')} placeholder="e.g., 140" className={ec('heightCm')} />
            <FieldError message={touched.heightCm ? fieldErrors.heightCm : null} />
          </div>
          <div className="space-y-2">
            <Label>Weight (kg)</Label>
            <Input type="number" value={form.weightKg} onChange={e => updateForm('weightKg', e.target.value)} onBlur={() => handleBlur('weightKg')} placeholder="e.g., 35" className={ec('weightKg')} />
            <FieldError message={touched.weightKg ? fieldErrors.weightKg : null} />
          </div>
        </div>
      </div>
    )
  }

  const renderStep2ContactInfo = () => {
    const ec = (f: string) => fieldHasError(f, touched, fieldErrors) ? 'border-destructive focus-visible:ring-destructive' : ''
    return (
    <div className="space-y-6">
      {/* Sibling Search — at the top of Contact Info */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Heart className="size-5 text-primary" />
          <p className="text-sm font-semibold text-primary">Has a sibling already in this school?</p>
        </div>
        <p className="text-xs text-muted-foreground">Search and select a sibling to auto-fill parent details. If the parent phone number matches an existing record, we'll notify you.</p>

        {selectedSibling ? (
          <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{selectedSibling.firstName} {selectedSibling.lastName}</p>
              <p className="text-xs text-muted-foreground">
                {selectedSibling.admissionNumber && <span className="font-mono mr-2">{selectedSibling.admissionNumber}</span>}
                {selectedSibling.className && <span>Class: {selectedSibling.className}</span>}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive shrink-0" onClick={removeSibling}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={siblingSearch}
              onChange={e => handleSiblingSearch(e.target.value)}
              placeholder="Search by name or admission number..."
              className="pl-9 pr-9"
            />
            {siblingSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
            {siblingResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-lg border bg-popover shadow-lg max-h-48 overflow-y-auto">
                {siblingResults.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                    onClick={() => selectSibling(s)}
                  >
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.admissionNumber && <span className="font-mono mr-2">{s.admissionNumber}</span>}
                        {s.className && <span>Class: {s.className}</span>}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {siblingAutoFilled && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-2.5">
            <Info className="size-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300">Parent details have been auto-filled from the sibling's records. You can still edit any field if needed.</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Mother's Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Heart className="size-4" /> Mother&apos;s Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mother&apos;s Name</Label>
          <Input value={form.motherName} onChange={e => updateForm('motherName', e.target.value)} onBlur={() => handleBlur('motherName')} placeholder="Full name" className={ec('motherName')} />
          <FieldError message={touched.motherName ? fieldErrors.motherName : null} />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <div className="relative">
            <Input value={form.motherPhone} onChange={e => updateForm('motherPhone', e.target.value)} onBlur={() => { handleBlur('motherPhone'); handlePhoneLookup(form.motherPhone, 'mother') }} placeholder="Phone number" className={ec('motherPhone')} />
            {phoneLookupLoading && parentMatchField === 'mother' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
          <FieldError message={touched.motherPhone ? fieldErrors.motherPhone : null} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={form.motherEmail} onChange={e => updateForm('motherEmail', e.target.value)} onBlur={() => handleBlur('motherEmail')} placeholder="Email address" className={ec('motherEmail')} />
          <FieldError message={touched.motherEmail ? fieldErrors.motherEmail : null} />
        </div>
        <div className="space-y-2">
          <Label>Occupation</Label>
          <Input value={form.motherOccupation} onChange={e => updateForm('motherOccupation', e.target.value)} placeholder="Occupation" />
        </div>
        <div className="space-y-2">
          <Label>Aadhaar</Label>
          <Input value={form.motherAadhaar} onChange={e => updateForm('motherAadhaar', e.target.value)} onBlur={() => handleBlur('motherAadhaar')} placeholder="Aadhaar number" className={ec('motherAadhaar')} />
          <FieldError message={touched.motherAadhaar ? fieldErrors.motherAadhaar : null} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Education Qualification</Label>
          <Input value={form.motherEducation} onChange={e => updateForm('motherEducation', e.target.value)} placeholder="e.g., B.Com, M.A." />
        </div>
        <div className="space-y-2">
          <Label>Yearly Income (₹)</Label>
          <Input type="number" value={form.motherIncome} onChange={e => updateForm('motherIncome', e.target.value)} onBlur={() => handleBlur('motherIncome')} placeholder="e.g., 300000" className={ec('motherIncome')} />
          <FieldError message={touched.motherIncome ? fieldErrors.motherIncome : null} />
        </div>
      </div>

      <Separator />

      {/* Father's Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <User className="size-4" /> Father&apos;s Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Father&apos;s Name <span className="text-destructive">*</span></Label>
          <Input value={form.fatherName} onChange={e => updateForm('fatherName', e.target.value)} onBlur={() => handleBlur('fatherName')} placeholder="Full name" className={ec('fatherName')} />
          <FieldError message={touched.fatherName ? fieldErrors.fatherName : null} />
        </div>
        <div className="space-y-2">
          <Label>Phone <span className="text-destructive">*</span></Label>
          <div className="relative">
            <Input value={form.fatherPhone} onChange={e => updateForm('fatherPhone', e.target.value)} onBlur={() => { handleBlur('fatherPhone'); handlePhoneLookup(form.fatherPhone, 'father') }} placeholder="Phone number" className={ec('fatherPhone')} />
            {phoneLookupLoading && parentMatchField === 'father' && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
          <FieldError message={touched.fatherPhone ? fieldErrors.fatherPhone : null} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={form.fatherEmail} onChange={e => updateForm('fatherEmail', e.target.value)} onBlur={() => handleBlur('fatherEmail')} placeholder="Email address" className={ec('fatherEmail')} />
          <FieldError message={touched.fatherEmail ? fieldErrors.fatherEmail : null} />
        </div>
        <div className="space-y-2">
          <Label>Occupation</Label>
          <Input value={form.fatherOccupation} onChange={e => updateForm('fatherOccupation', e.target.value)} placeholder="Occupation" />
        </div>
        <div className="space-y-2">
          <Label>Aadhaar</Label>
          <Input value={form.fatherAadhaar} onChange={e => updateForm('fatherAadhaar', e.target.value)} onBlur={() => handleBlur('fatherAadhaar')} placeholder="Aadhaar number" className={ec('fatherAadhaar')} />
          <FieldError message={touched.fatherAadhaar ? fieldErrors.fatherAadhaar : null} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Education Qualification</Label>
          <Input value={form.fatherEducation} onChange={e => updateForm('fatherEducation', e.target.value)} placeholder="e.g., B.Sc, M.B.A." />
        </div>
        <div className="space-y-2">
          <Label>Yearly Income (₹)</Label>
          <Input type="number" value={form.fatherIncome} onChange={e => updateForm('fatherIncome', e.target.value)} onBlur={() => handleBlur('fatherIncome')} placeholder="e.g., 500000" className={ec('fatherIncome')} />
          <FieldError message={touched.fatherIncome ? fieldErrors.fatherIncome : null} />
        </div>
      </div>

      <Separator />

      {/* Permanent Address */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <MapPin className="size-4" /> Permanent Address
      </p>
      <div className="space-y-2">
        <Label>Street / Landmark / Area</Label>
        <Textarea value={form.address} onChange={e => updateForm('address', e.target.value)} onBlur={() => handleBlur('address')} placeholder="House No., Street, Landmark, Area..." rows={2} className={ec('address')} />
        <FieldError message={touched.address ? fieldErrors.address : null} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Village / Post</Label>
          <Input value={form.village} onChange={e => updateForm('village', e.target.value)} placeholder="Village / Post" />
        </div>
        <div className="space-y-2">
          <Label>Post Office</Label>
          <Input value={form.postOffice} onChange={e => updateForm('postOffice', e.target.value)} placeholder="Post Office" />
        </div>
        <div className="space-y-2">
          <Label>Police Station</Label>
          <Input value={form.policeStation} onChange={e => updateForm('policeStation', e.target.value)} placeholder="Police Station" />
        </div>
        <div className="space-y-2">
          <Label>Ward No</Label>
          <Input value={form.wardNo} onChange={e => updateForm('wardNo', e.target.value)} placeholder="Ward No" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>City</Label>
          <Input value={form.city} onChange={e => updateForm('city', e.target.value)} placeholder="City" />
        </div>
        <div className="space-y-2">
          <Label>State</Label>
          <Select value={form.state} onValueChange={v => updateForm('state', v)}>
            <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Pincode</Label>
          <Input value={form.pincode} onChange={e => updateForm('pincode', e.target.value)} onBlur={() => handleBlur('pincode')} placeholder="6-digit" maxLength={6} className={ec('pincode')} />
          <FieldError message={touched.pincode ? fieldErrors.pincode : null} />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Input value={form.country} onChange={e => updateForm('country', e.target.value)} placeholder="Country" />
        </div>
      </div>

      <Separator />

      {/* Local Address */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Home className="size-4" /> Local / Residential Address
      </p>
      <div className="flex items-center gap-2">
        <Checkbox id="sameAsPermanent" checked={form.sameAsPermanent} onCheckedChange={v => updateForm('sameAsPermanent', v === true)} />
        <Label htmlFor="sameAsPermanent" className="text-sm">Same as Permanent Address</Label>
      </div>
      {!form.sameAsPermanent && (
        <div className="space-y-4 pl-1">
          <div className="space-y-2">
            <Label>Street / Landmark / Area</Label>
            <Textarea value={form.localAddress} onChange={e => updateForm('localAddress', e.target.value)} placeholder="House No., Street, Landmark..." rows={2} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Village / Post</Label>
              <Input value={form.localVillage} onChange={e => updateForm('localVillage', e.target.value)} placeholder="Village / Post" />
            </div>
            <div className="space-y-2">
              <Label>Post Office</Label>
              <Input value={form.localPostOffice} onChange={e => updateForm('localPostOffice', e.target.value)} placeholder="Post Office" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.localCity} onChange={e => updateForm('localCity', e.target.value)} placeholder="City" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>State</Label>
              <Select value={form.localState} onValueChange={v => updateForm('localState', v)}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pincode</Label>
              <Input value={form.localPincode} onChange={e => updateForm('localPincode', e.target.value)} onBlur={() => handleBlur('localPincode')} placeholder="6-digit" maxLength={6} className={ec('localPincode')} />
              <FieldError message={touched.localPincode ? fieldErrors.localPincode : null} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={form.localCountry} onChange={e => updateForm('localCountry', e.target.value)} placeholder="Country" />
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* Other Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <AlertTriangle className="size-4" /> Special Categories
      </p>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Checkbox id="belongsToEws" checked={form.belongsToEws} onCheckedChange={v => updateForm('belongsToEws', v === true)} />
          <Label htmlFor="belongsToEws" className="text-sm">Belongs to EWS</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="isSingleGirlChild" checked={form.isSingleGirlChild} onCheckedChange={v => updateForm('isSingleGirlChild', v === true)} />
          <Label htmlFor="isSingleGirlChild" className="text-sm">Single Girl Child</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="isDivyangian" checked={form.isDivyangian} onCheckedChange={v => updateForm('isDivyangian', v === true)} />
          <Label htmlFor="isDivyangian" className="text-sm">Divyangian (Differently Abled)</Label>
        </div>
      </div>
    </div>
    )
  }

  const renderStep3GeneralDetails = () => {
    const ec = (f: string) => fieldHasError(f, touched, fieldErrors) ? 'border-destructive focus-visible:ring-destructive' : ''
    return (
    <div className="space-y-6">
      {/* Academic Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <GraduationCap className="size-4" /> Academic Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Class Admitted <span className="text-destructive">*</span></Label>
          <Select
            value={form.classId}
            onValueChange={v => updateForm('classId', v)}
            disabled={!form.academicYear || classes.length === 0}
          >
            <SelectTrigger className={ec('classId')}>
              <SelectValue placeholder={
                !form.academicYear
                  ? 'Select academic year first'
                  : classes.length === 0
                    ? 'No classes configured for this year'
                    : 'Select class'
              } />
            </SelectTrigger>
            <SelectContent>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {form.academicYear && classes.length === 0 && (
            <p className="text-xs text-amber-600">
              Set up fee structures for {form.academicYear} before admitting students.
            </p>
          )}
          <FieldError message={touched.classId ? fieldErrors.classId : null} />
        </div>
        <div className="space-y-2">
          <Label>Section</Label>
          <Select value={form.sectionId} onValueChange={v => updateForm('sectionId', v)}>
            <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
            <SelectContent>
              {filteredSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Medium of Instruction</Label>
          <Select value={form.mediumOfInstruction} onValueChange={v => updateForm('mediumOfInstruction', v)}>
            <SelectTrigger><SelectValue placeholder="Select medium" /></SelectTrigger>
            <SelectContent>
              {MEDIUM_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Religion</Label>
          <Select value={form.religion} onValueChange={v => updateForm('religion', v)}>
            <SelectTrigger><SelectValue placeholder="Select religion" /></SelectTrigger>
            <SelectContent>
              {RELIGION_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={v => updateForm('category', v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Caste</Label>
          <Input value={form.caste} onChange={e => updateForm('caste', e.target.value)} placeholder="Sub-caste" />
        </div>
      </div>

      <Separator />

      {/* Last Institution */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Building className="size-4" /> Last Institution Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Institution Name</Label>
          <Input value={form.previousSchool} onChange={e => updateForm('previousSchool', e.target.value)} placeholder="Previous school name" />
        </div>
        <div className="space-y-2">
          <Label>Institution Address</Label>
          <Input value={form.previousSchoolAddress} onChange={e => updateForm('previousSchoolAddress', e.target.value)} placeholder="School address" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Class Last Attended</Label>
          <Input value={form.previousClass} onChange={e => updateForm('previousClass', e.target.value)} placeholder="e.g., Class 5" />
        </div>
        <div className="space-y-2">
          <Label>Result of Last Class</Label>
          <Input value={form.previousResult} onChange={e => updateForm('previousResult', e.target.value)} placeholder="e.g., 85% or Pass" />
        </div>
        <div className="space-y-2">
          <Label>Affiliated To</Label>
          <Input value={form.affiliatedTo} onChange={e => updateForm('affiliatedTo', e.target.value)} placeholder="e.g., CBSE, State Board" />
        </div>
        <div className="space-y-2">
          <Label>TC Number</Label>
          <Input value={form.previousSchoolTC} onChange={e => updateForm('previousSchoolTC', e.target.value)} placeholder="TC number" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>TC Date</Label>
          <DatePicker
            value={form.tcDate}
            onChange={(v) => updateForm('tcDate', v)}
            disableFuture
            placeholder="Select TC date"
            triggerClassName="w-full"
          />
        </div>
      </div>

      <Separator />

      {/* Transport */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Bus className="size-4" /> Transport Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Transport Route</Label>
          <Select value={form.transportRouteId} onValueChange={v => setForm(prev => ({ ...prev, transportRouteId: v === 'none' ? '' : v, transportStop: '' }))}>
            <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Transport</SelectItem>
              {transportRoutes.map(r => <SelectItem key={r.id} value={r.id}>{r.routeName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Transport Stop</Label>
          <Select
            value={form.transportStop}
            onValueChange={v => updateForm('transportStop', v)}
            disabled={!form.transportRouteId || form.transportRouteId === 'none' || selectedTransportStops.length === 0}
          >
            <SelectTrigger><SelectValue placeholder={form.transportRouteId ? 'Select stop' : 'Select route first'} /></SelectTrigger>
            <SelectContent>
              {selectedTransportStops.map((stop) => (
                <SelectItem key={stop.name} value={stop.name}>
                  {stop.name}{stop.fare != null ? ` - Rs. ${stop.fare.toLocaleString('en-IN')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Hostel */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Home className="size-4" /> Hostel Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Hostel Name</Label>
          <Input value={form.hostelName} onChange={e => updateForm('hostelName', e.target.value)} placeholder="Hostel name" />
        </div>
        <div className="space-y-2">
          <Label>Room No</Label>
          <Input value={form.hostelRoomNo} onChange={e => updateForm('hostelRoomNo', e.target.value)} placeholder="Room number" />
        </div>
        <div className="space-y-2">
          <Label>Bed No</Label>
          <Input value={form.hostelBedNo} onChange={e => updateForm('hostelBedNo', e.target.value)} placeholder="Bed number" />
        </div>
      </div>
    </div>
    )
  }

  const renderStep4AccountsInfo = () => {
    const ec = (f: string) => fieldHasError(f, touched, fieldErrors) ? 'border-destructive focus-visible:ring-destructive' : ''
    return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Banknote className="size-4" /> Bank Account Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Bank Account Number</Label>
          <Input value={form.bankAccountNumber} onChange={e => updateForm('bankAccountNumber', e.target.value)} onBlur={() => handleBlur('bankAccountNumber')} placeholder="Account number" className={ec('bankAccountNumber')} />
          <FieldError message={touched.bankAccountNumber ? fieldErrors.bankAccountNumber : null} />
        </div>
        <div className="space-y-2">
          <Label>IFSC Code</Label>
          <Input value={form.ifscCode} onChange={e => updateForm('ifscCode', e.target.value.toUpperCase())} onBlur={() => handleBlur('ifscCode')} placeholder="e.g., SBIN0001234" maxLength={11} className={ec('ifscCode')} />
          <FieldError message={touched.ifscCode ? fieldErrors.ifscCode : null} />
        </div>
      </div>

      <Separator />

      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Banknote className="size-4" /> Fee Group
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Fee Group <span className="text-destructive">*</span></Label>
          <Select
            value={form.feesGroupId}
            onValueChange={v => { updateForm('feesGroupId', v); handleBlur('feesGroupId', v) }}
            disabled={!form.classId || feesGroups.length === 0}
          >
            <SelectTrigger className={ec('feesGroupId')}>
              <SelectValue placeholder={
                !form.classId
                  ? 'Select class first'
                  : feesGroups.length === 0
                    ? 'No fee groups for this class & year'
                    : 'Select fee group'
              } />
            </SelectTrigger>
            <SelectContent>
              {feesGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <FieldError message={touched.feesGroupId ? fieldErrors.feesGroupId : null} />
          {form.classId && feesGroups.length === 0 && (
            <p className="text-xs text-amber-600">
              No fee structures defined for this class in {form.academicYear}. Configure one in Fees &gt; Structures.
            </p>
          )}
        </div>
      </div>
    </div>
    )
  }

  const renderStep5Documents = () => (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
        <Info className="size-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300">Upload required documents for the admission application. All documents will be verified by the school administration.</p>
      </div>

      <div className="space-y-2">
        {REQUIRED_DOCUMENTS.map(doc => {
          const uploadState = documentUploads[doc.type]
          return (
            <div key={doc.type} className="flex items-center justify-between rounded-lg border p-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex size-9 items-center justify-center rounded-lg shrink-0 ${uploadState?.uploaded ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-muted'}`}>
                  {uploadState?.uploaded ? (
                    <FileText className="size-4 text-emerald-600" />
                  ) : (
                    <Upload className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  {uploadState?.uploaded ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      Pending Verification
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not uploaded</span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {!uploadState?.uploaded && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                    <Upload className="size-3" /> Upload
                  </Button>
                )}
                {uploadState?.uploaded && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                    <Check className="size-3 text-emerald-600" /> Re-upload
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Custom Documents */}
      {customDocs.map(doc => {
        const uploadState = documentUploads[doc.type]
        return (
          <div key={doc.type} className="flex items-center justify-between rounded-lg border p-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex size-9 items-center justify-center rounded-lg shrink-0 ${uploadState?.uploaded ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-muted'}`}>
                {uploadState?.uploaded ? <FileText className="size-4 text-emerald-600" /> : <Upload className="size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{doc.name}</p>
                {uploadState?.uploaded ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700">Pending</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Not uploaded</span>
                )}
              </div>
            </div>
            <div className="shrink-0">
              {!uploadState?.uploaded ? (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                  <Upload className="size-3" /> Upload
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                  <Check className="size-3 text-emerald-600" /> Re-upload
                </Button>
              )}
            </div>
          </div>
        )
      })}

      <Separator />

      <p className="text-sm font-medium text-muted-foreground">Add Custom Document</p>
      <div className="flex items-center gap-2">
        <Input value={customDocName} onChange={e => setCustomDocName(e.target.value)} placeholder="Custom document name" className="flex-1" />
        <Button variant="outline" size="sm" disabled={!customDocName.trim()} onClick={addCustomDocument}>
          <Plus className="size-4 mr-1" /> Add
        </Button>
      </div>
    </div>
  )

  const renderStep6Review = () => {
    const selectedClass = classes.find(c => c.id === form.classId)
    const selectedSection = sections.find(s => s.id === form.sectionId)
    const selectedRoute = transportRoutes.find(r => r.id === form.transportRouteId)
    const selectedGroup = feesGroups.find(g => g.id === form.feesGroupId)

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 p-3">
          <Info className="size-4 text-sky-600 mt-0.5 shrink-0" />
          <p className="text-sm text-sky-800 dark:text-sky-300">Please review all the information before submitting. You can go back to any step to make changes.</p>
        </div>

        {/* Personal Details Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Personal Details</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentStep(1)}>
              <Edit className="size-3 mr-1" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="flex items-start gap-4 mb-3">
              {form.profileImage ? (
                <div className="size-14 rounded-full overflow-hidden border shrink-0">
                  <img src={form.profileImage} alt="Student" className="size-full object-cover" />
                </div>
              ) : (
                <div className="size-14 rounded-full bg-muted flex items-center justify-center border shrink-0">
                  <Camera className="size-5 text-muted-foreground/50" />
                </div>
              )}
              <div>
                <p className="font-semibold">{form.firstName} {form.lastName}</p>
                <p className="text-muted-foreground">{form.academicYear} • {form.gender || '--'} • {formatDate(form.dateOfBirth)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
              <div><span className="text-muted-foreground">Name:</span> {form.firstName} {form.lastName}</div>
              <div><span className="text-muted-foreground">DOB:</span> {formatDate(form.dateOfBirth)} {calculateAge(form.dateOfBirth) && `(${calculateAge(form.dateOfBirth)})`}</div>
              <div><span className="text-muted-foreground">Gender:</span> {form.gender || '--'}</div>
              <div><span className="text-muted-foreground">Blood Group:</span> {form.bloodGroup || '--'}</div>
              <div><span className="text-muted-foreground">Aadhaar:</span> {form.aadhaarNumber || '--'}</div>
              <div><span className="text-muted-foreground">Academic Year:</span> {form.academicYear || '--'}</div>
              <div><span className="text-muted-foreground">Reg. No:</span> {nextRegistrationNumber || '--'}</div>
              <div><span className="text-muted-foreground">PEN:</span> {form.penNumber || '--'}</div>
              <div><span className="text-muted-foreground">Samagra ID:</span> {form.samagraId || '--'}</div>
              <div><span className="text-muted-foreground">Apaar ID:</span> {form.apaarId || '--'}</div>
              <div><span className="text-muted-foreground">Udise ID:</span> {form.udiseId || '--'}</div>
              <div><span className="text-muted-foreground">Height:</span> {form.heightCm ? `${form.heightCm} cm` : '--'}</div>
              <div><span className="text-muted-foreground">Weight:</span> {form.weightKg ? `${form.weightKg} kg` : '--'}</div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Info Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Contact Information</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentStep(2)}>
              <Edit className="size-3 mr-1" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Father</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1 gap-x-4">
                <div><span className="text-muted-foreground">Name:</span> {form.fatherName || '--'}</div>
                <div><span className="text-muted-foreground">Phone:</span> {form.fatherPhone || '--'}</div>
                <div><span className="text-muted-foreground">Occupation:</span> {form.fatherOccupation || '--'}</div>
                <div><span className="text-muted-foreground">Education:</span> {form.fatherEducation || '--'}</div>
                <div><span className="text-muted-foreground">Income:</span> {form.fatherIncome ? `₹${form.fatherIncome}` : '--'}</div>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Mother</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1 gap-x-4">
                <div><span className="text-muted-foreground">Name:</span> {form.motherName || '--'}</div>
                <div><span className="text-muted-foreground">Phone:</span> {form.motherPhone || '--'}</div>
                <div><span className="text-muted-foreground">Occupation:</span> {form.motherOccupation || '--'}</div>
                <div><span className="text-muted-foreground">Education:</span> {form.motherEducation || '--'}</div>
                <div><span className="text-muted-foreground">Income:</span> {form.motherIncome ? `₹${form.motherIncome}` : '--'}</div>
              </div>
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Address</p>
              <div className="grid grid-cols-1 gap-y-1">
                <div><span className="text-muted-foreground">Permanent:</span> {[form.address, form.village, form.city, form.state, form.pincode].filter(Boolean).join(', ') || '--'}</div>
                {!form.sameAsPermanent && (
                  <div><span className="text-muted-foreground">Local:</span> {[form.localAddress, form.localCity, form.localState, form.localPincode].filter(Boolean).join(', ') || '--'}</div>
                )}
                {form.sameAsPermanent && <div><span className="text-muted-foreground">Local:</span> Same as permanent</div>}
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-4">
              {form.belongsToEws && <Badge variant="outline" className="bg-amber-50 text-amber-700">EWS</Badge>}
              {form.isSingleGirlChild && <Badge variant="outline" className="bg-pink-50 text-pink-700">Single Girl Child</Badge>}
              {form.isDivyangian && <Badge variant="outline" className="bg-purple-50 text-purple-700">Divyangian</Badge>}
              {!form.belongsToEws && !form.isSingleGirlChild && !form.isDivyangian && <span className="text-muted-foreground text-xs">No special categories</span>}
            </div>
          </CardContent>
        </Card>

        {/* General Details Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">General Details</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentStep(3)}>
              <Edit className="size-3 mr-1" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
              <div><span className="text-muted-foreground">Class:</span> {selectedClass?.name || '--'}</div>
              <div><span className="text-muted-foreground">Section:</span> {selectedSection?.name || '--'}</div>
              <div><span className="text-muted-foreground">Medium:</span> {form.mediumOfInstruction || '--'}</div>
              <div><span className="text-muted-foreground">Religion:</span> {form.religion || '--'}</div>
              <div><span className="text-muted-foreground">Category:</span> {form.category || '--'}</div>
              {form.caste && <div><span className="text-muted-foreground">Caste:</span> {form.caste}</div>}
            </div>
            {form.previousSchool && (
              <>
                <Separator />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
                  <div><span className="text-muted-foreground">Previous School:</span> {form.previousSchool}</div>
                  <div><span className="text-muted-foreground">Last Class:</span> {form.previousClass || '--'}</div>
                  <div><span className="text-muted-foreground">Result:</span> {form.previousResult || '--'}</div>
                  <div><span className="text-muted-foreground">TC No:</span> {form.previousSchoolTC || '--'}</div>
                  <div><span className="text-muted-foreground">TC Date:</span> {formatDate(form.tcDate)}</div>
                </div>
              </>
            )}
            {(selectedRoute || form.hostelName) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
                  {selectedRoute && <div><span className="text-muted-foreground">Transport:</span> {selectedRoute.routeName}</div>}
                  {form.hostelName && <div><span className="text-muted-foreground">Hostel:</span> {form.hostelName} {form.hostelRoomNo && `(Room ${form.hostelRoomNo})`}</div>}
                </div>
              </>
            )}
            {selectedSibling && (
              <>
                <Separator />
                <div className="flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2">
                  <Heart className="size-4 text-blue-600 shrink-0" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Sibling:</span> <span className="font-medium">{selectedSibling.firstName} {selectedSibling.lastName}</span>
                    {selectedSibling.admissionNumber && <span className="font-mono text-xs ml-2">({selectedSibling.admissionNumber})</span>}

                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Accounts Info Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Accounts Information</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentStep(4)}>
              <Edit className="size-3 mr-1" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4">
              <div><span className="text-muted-foreground">Bank Account:</span> {form.bankAccountNumber || '--'}</div>
              <div><span className="text-muted-foreground">IFSC:</span> {form.ifscCode || '--'}</div>
              <div><span className="text-muted-foreground">Fee Group:</span> {selectedGroup?.name || '--'}</div>
            </div>
          </CardContent>
        </Card>

        {/* Documents Summary */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Documents</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentStep(5)}>
              <Edit className="size-3 mr-1" /> Edit
            </Button>
          </CardHeader>
          <CardContent className="text-sm">
            {Object.keys(documentUploads).filter(k => documentUploads[k].uploaded).length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(documentUploads).filter(([, v]) => v.uploaded).map(([type]) => (
                  <Badge key={type} variant="secondary" className="bg-emerald-50 text-emerald-700">
                    <Check className="size-3 mr-1" />
                    {REQUIRED_DOCUMENTS.find(d => d.type === type)?.name || customDocs.find(d => d.type === type)?.name || type}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No documents uploaded</p>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Declaration */}
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-semibold">Declaration</p>
          <p className="text-xs text-muted-foreground">
            I hereby declare that all the information provided in this admission form is correct and complete to the best of my knowledge.
            I understand that any false information may lead to cancellation of admission.
          </p>
          <div className="flex items-center gap-2">
            <Checkbox
              id="termsAccepted"
              checked={form.termsAccepted}
              onCheckedChange={v => updateForm('termsAccepted', v === true)}
            />
            <Label htmlFor="termsAccepted" className="text-sm">
              I accept the declaration and confirm all information is correct <span className="text-destructive">*</span>
            </Label>
          </div>
        </div>
      </div>
    )
  }

  // ============================================
  // Step Content Router
  // ============================================

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return renderStep1PersonalDetails()
      case 2: return renderStep2ContactInfo()
      case 3: return renderStep3GeneralDetails()
      case 4: return renderStep4AccountsInfo()
      case 5: return renderStep5Documents()
      case 6: return renderStep6Review()
      default: return null
    }
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-[calc(100vh-10rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => goBack('students')} className="shrink-0">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Admit New Student</h1>
            <p className="text-sm text-muted-foreground">Fill in the details to register a new student admission</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          Step {currentStep} of {WIZARD_STEPS.length}
        </Badge>
      </div>

      {/* Step Indicator */}
      <div className="mb-6">
        {/* Step circles */}
        <div className="flex items-start justify-between">
          {WIZARD_STEPS.map((step, index) => {
            const isCompleted = completedSteps.includes(step.number)
            const isCurrent = currentStep === step.number
            const maxAccessible = completedSteps.length > 0 ? Math.max(...completedSteps) + 1 : 1
            const isClickable = isCompleted || step.number <= maxAccessible
            const Icon = step.icon

            return (
              <div key={step.number} className="flex items-start flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => isClickable && handleStepClick(step.number)}
                  disabled={!isClickable}
                  className={`flex flex-col items-center gap-1.5 group ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                >
                  <div
                    className={`flex size-10 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                      isCompleted
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : isCurrent
                        ? 'border-[var(--button-primary,var(--primary))] bg-[var(--button-primary,var(--primary))] text-[var(--button-primary-foreground,var(--primary-foreground))] shadow-md scale-110'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? <Check className="size-5" /> : <Icon className="size-4" />}
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs font-medium transition-colors text-center leading-tight ${
                      isCurrent ? 'text-[var(--button-primary,var(--primary))]' : isCompleted ? 'text-emerald-600' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{step.number}</span>
                  </span>
                </button>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className="flex-1 mx-1 mt-4">
                    <div
                      className={`h-0.5 w-full transition-colors ${
                        isCompleted || currentStep > step.number ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                      }`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card className="flex-1">
        <CardContent className="p-4 sm:p-6">
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between mt-6 pb-4">
        <div>
          {currentStep > 1 && (
            <Button variant="outline" onClick={handlePrev} className="gap-1">
              <ChevronLeft className="size-4" /> Previous
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentStep < 6 && (
            <Button onClick={handleNext} className="gap-1">
              Next <ChevronRight className="size-4" />
            </Button>
          )}
          {currentStep === 6 && (
            <>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-1">
                {submitting ? (
                  <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Send className="size-4" />
                )}
                Admit Student
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Parent Match Dialog — shown when phone number matches an existing parent */}
      <Dialog open={showParentMatchDialog} onOpenChange={(open) => { setShowParentMatchDialog(open); if (!open) setParentMatchData(null) }}>
        <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <VisuallyHidden>
            <DialogTitle>Parent Details Found</DialogTitle>
          </VisuallyHidden>
          <DialogDescription className="sr-only">A parent with this phone number already exists in the system.</DialogDescription>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                <Phone className="size-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Parent Details Already Exist!</h3>
                <p className="text-sm text-muted-foreground">
                  {parentMatchField === 'father' ? "Father's" : "Mother's"} phone number matches an existing parent record.
                </p>
              </div>
            </div>

            {parentMatchData && parentMatchData.map((match, idx) => (
              <div key={idx} className="rounded-lg border bg-muted/30 p-4 space-y-3">
                {/* Parent Info */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {match.fatherName && (
                    <div><span className="text-muted-foreground">Father:</span> <span className="font-medium">{match.fatherName}</span></div>
                  )}
                  {match.fatherPhone && (
                    <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{match.fatherPhone}</span></div>
                  )}
                  {match.motherName && (
                    <div><span className="text-muted-foreground">Mother:</span> <span className="font-medium">{match.motherName}</span></div>
                  )}
                  {match.motherPhone && (
                    <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{match.motherPhone}</span></div>
                  )}
                </div>

                {/* Children / Siblings */}
                {match.children.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Children already enrolled:</p>
                    {match.children.map(child => (
                      <div key={child.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="size-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{child.firstName} {child.lastName}</p>
                            <p className="text-xs text-muted-foreground">
                              {child.admissionNumber && <span className="font-mono mr-2">{child.admissionNumber}</span>}
                              {child.className && <span>Class: {child.className}</span>}
                              {child.sectionName && <span> - {child.sectionName}</span>}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1"
                          onClick={() => linkSiblingFromMatch(child)}
                        >
                          <Heart className="size-3" /> Link as Sibling
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowParentMatchDialog(false); setParentMatchData(null) }}>
                Skip — Continue Without Linking
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={(open) => {
          if (!open) {
            setShowSuccessDialog(false)
            goBack('students')
          }
        }}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
          <VisuallyHidden>
            <DialogTitle>Student Admitted Successfully</DialogTitle>
          </VisuallyHidden>
          <div className="flex flex-col items-center text-center py-6 space-y-4">
            <div className="size-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <Check className="size-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Student Admitted Successfully!</h3>
              <p className="text-sm text-muted-foreground mt-1">Student record has been created</p>
            </div>
            {assignedAdmissionNumber && (
              <div className="grid gap-2 rounded-lg bg-muted px-6 py-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Admission Number</p>
                  <p className="text-2xl font-bold font-mono tracking-wider text-primary">{assignedAdmissionNumber}</p>
                </div>
                {assignedRegistrationNumber && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Registration Number</p>
                    <p className="text-lg font-bold font-mono tracking-wider">{assignedRegistrationNumber}</p>
                  </div>
                )}
              </div>
            )}
            <p className="text-sm font-medium">{form.firstName} {form.lastName}</p>

            {/* Parent Login Credentials */}
            {(form.fatherPhone || form.motherPhone) && (
              <div className="w-full rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4 text-left space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="size-4 text-blue-600" />
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">Parent Login Credentials</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Login ID (Phone)</p>
                    <p className="font-mono font-semibold">{form.fatherPhone || form.motherPhone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Default Password</p>
                    <p className="font-mono font-semibold">parent123</p>
                  </div>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">Parents can log in using their phone number and change the password after first login.</p>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <Button variant="outline" onClick={() => {
                setShowSuccessDialog(false)
                setForm({ ...DEFAULT_FORM })
                setCompletedSteps([])
                setCurrentStep(1)
                setFieldErrors({})
                setTouched({})
                setDocumentUploads({})
                setCustomDocs([])
                setSelectedSibling(null)
                setSiblingSearch('')
                setSiblingResults([])
                setSiblingAutoFilled(false)
                setShowParentMatchDialog(false)
                setParentMatchData(null)
                setParentMatchField(null)
                // Refresh next admission number
                api.get<{ nextAdmissionNumber: string }>('/api/school/admissions/next-number', undefined, { skipLogoutOn401: true })
                  .then(d => { if (d?.nextAdmissionNumber) setNextAdmissionNumber(d.nextAdmissionNumber) })
                  .catch(() => {})
              }}>
                Admit Another
              </Button>
              <Button onClick={() => goBack('students')}>
                Go to Student List
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
