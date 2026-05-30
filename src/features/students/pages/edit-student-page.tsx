'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/date-picker'
import {
  Save, User, Phone, MapPin, GraduationCap, Banknote,
  Home, Shield, FileText, Camera, Upload, X,
  CircleUser, CircleUserRound, CalendarDays, IdCard,
  Ruler, Weight, Briefcase, Mail, CreditCard, Building, Heart,
  Check, Bus, Plus, Info, Clock,
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

interface AdmissionData {
  id: string
  admissionNumber: string | null
  academicYear: string | null
  status: string | null
  dateOfAdmission: string | null
  admittedAt: string | null
  nationality: string | null
  religion: string | null
  category: string | null
  caste: string | null
  motherTongue: string | null
  gender: string | null
  aadhaarNumber: string | null
  bloodGroup: string | null
  medicalConditions: string | null
  profileImage: string | null
  classId: string | null
  sectionId: string | null
  registrationNumber: string | null
  penNumber: string | null
  samagraId: string | null
  apaarId: string | null
  udiseId: string | null
  heightCm: number | null
  weightKg: number | null
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
  localVillage: string | null
  localPostOffice: string | null
  localPoliceStation: string | null
  localWardNo: string | null
  sameAsPermanent: boolean | null
  fatherName: string | null
  fatherPhone: string | null
  fatherEmail: string | null
  fatherOccupation: string | null
  fatherAadhaar: string | null
  fatherEducation: string | null
  fatherIncome: number | null
  motherName: string | null
  motherPhone: string | null
  motherEmail: string | null
  motherOccupation: string | null
  motherAadhaar: string | null
  motherEducation: string | null
  motherIncome: number | null
  belongsToEws: boolean | null
  isSingleGirlChild: boolean | null
  isDivyangian: boolean | null
  mediumOfInstruction: string | null
  area: string | null
  previousSchool: string | null
  previousSchoolAddress: string | null
  previousClass: string | null
  previousResult: string | null
  affiliatedTo: string | null
  previousSchoolTC: string | null
  tcDate: string | null
  transportRouteId: string | null
  transportStop: string | null
  hostelName: string | null
  hostelRoomNo: string | null
  hostelBedNo: string | null
  bankAccountNumber: string | null
  ifscCode: string | null
  feesGroupId: string | null
  siblingId: string | null
  appliedDate: string | null
  remarks: string | null
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

interface TransportRouteOption { id: string; routeName: string; routeNumber: string | null; academicYear: string; stops: string | null }
interface FeesGroupOption { id: string; name: string }

interface AdmissionDocument {
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

// ============================================
// Constants
// ============================================

const EDIT_TABS = [
  { number: 1, label: 'Personal Details', icon: User },
  { number: 2, label: 'Contact Info', icon: Phone },
  { number: 3, label: 'General Details', icon: GraduationCap },
  { number: 4, label: 'Accounts Info', icon: Banknote },
  { number: 5, label: 'Documents', icon: FileText },
]

const GENDER_OPTIONS = ['Male', 'Female']

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

const CATEGORY_OPTIONS = ['General', 'OBC', 'SC', 'ST', 'EWS']

const RELIGION_OPTIONS = ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other']

const MEDIUM_OPTIONS = ['Hindi', 'English', 'Urdu', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Gujarati', 'Other']

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

function formatAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 12)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

interface ClassOption { id: string; name: string }
interface SectionOption { id: string; name: string; classId: string }

// ============================================
// Form Interface
// ============================================

interface EditForm {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  bloodGroup: string
  aadhaarNumber: string
  classId: string
  sectionId: string
  profileImage: string
  religion: string
  category: string
  caste: string
  registrationNumber: string
  penNumber: string
  samagraId: string
  apaarId: string
  udiseId: string
  heightCm: string
  weightKg: string
  academicYear: string
  transportRouteId: string
  transportStop: string
  feesGroupId: string
  siblingId: string
  address: string
  village: string
  postOffice: string
  policeStation: string
  wardNo: string
  city: string
  state: string
  pincode: string
  country: string
  sameAsPermanent: boolean
  localAddress: string
  localVillage: string
  localPostOffice: string
  localPoliceStation: string
  localWardNo: string
  localCity: string
  localState: string
  localPincode: string
  localCountry: string
  fatherName: string
  fatherPhone: string
  fatherEmail: string
  fatherOccupation: string
  fatherAadhaar: string
  fatherEducation: string
  fatherIncome: string
  motherName: string
  motherPhone: string
  motherEmail: string
  motherOccupation: string
  motherAadhaar: string
  motherEducation: string
  motherIncome: string
  belongsToEws: boolean
  isSingleGirlChild: boolean
  isDivyangian: boolean
  mediumOfInstruction: string
  previousSchool: string
  previousSchoolAddress: string
  previousClass: string
  previousResult: string
  affiliatedTo: string
  previousSchoolTC: string
  tcDate: string
  hostelName: string
  hostelRoomNo: string
  hostelBedNo: string
  bankAccountNumber: string
  ifscCode: string
  remarks: string
}

// ============================================
// Main Component
// ============================================

export function EditStudentPage({ studentId }: { studentId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const viewingAcademicYear = useAppStore((s) => s.viewingAcademicYear)
  const currentSchoolAcademicYear = useAppStore((s) => s.currentSchool?.academicYear)
  const resolvedYear = viewingAcademicYear || currentSchoolAcademicYear || ''

  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentTab, setCurrentTab] = useState(1)

  // Dropdown data
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [sections, setSections] = useState<SectionOption[]>([])
  const [transportRoutes, setTransportRoutes] = useState<TransportRouteOption[]>([])
  const [feesGroups, setFeesGroups] = useState<FeesGroupOption[]>([])

  // Form state
  const [form, setForm] = useState<EditForm | null>(null)

  // Document state
  const [documents, setDocuments] = useState<AdmissionDocument[]>([])
  const [documentUploads, setDocumentUploads] = useState<Record<string, { uploaded: boolean; verificationStatus: string }>>({})
  const [customDocName, setCustomDocName] = useState('')
  const [customDocs, setCustomDocs] = useState<{ type: string; name: string }[]>([])

  // Sibling search state
  const [siblingSearch, setSiblingSearch] = useState('')
  const [siblingResults, setSiblingResults] = useState<Array<{ id: string; firstName: string; lastName: string; admissionNumber: string | null; className: string | null }>>([])
  const [siblingSearching, setSiblingSearching] = useState(false)

  // ============================================
  // Data Fetching
  // ============================================

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [studentData, clsData, secData, feesGroupData] = await Promise.allSettled([
          api.get<StudentData>(`/api/school/students/${studentId}`, undefined, { skipLogoutOn401: true }),
          api.get<{ classes: ClassOption[] }>('/api/school/classes', undefined, { skipLogoutOn401: true }),
          api.get<{ sections: SectionOption[] }>('/api/school/sections', undefined, { skipLogoutOn401: true }),
          api.get<{ groups: FeesGroupOption[] }>('/api/school/fees/groups', undefined, { skipLogoutOn401: true }),
        ])
        if (studentData.status === 'fulfilled' && studentData.value) {
          const s = studentData.value
          setStudent(s)
          const a = s.admission
          setForm({
            firstName: s.firstName || '',
            lastName: s.lastName || '',
            dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth).toISOString().split('T')[0] : '',
            gender: s.gender || a?.gender || '',
            bloodGroup: s.bloodGroup || a?.bloodGroup || '',
            aadhaarNumber: s.aadhaarNumber || a?.aadhaarNumber || '',
            classId: s.class?.id || a?.classId || '',
            sectionId: s.section?.id || a?.sectionId || '',
            profileImage: s.profileImage || a?.profileImage || '',
            religion: a?.religion || '',
            category: a?.category || '',
            caste: a?.caste || '',
            registrationNumber: a?.registrationNumber || '',
            penNumber: a?.penNumber || '',
            samagraId: a?.samagraId || '',
            apaarId: a?.apaarId || '',
            udiseId: a?.udiseId || '',
            heightCm: a?.heightCm ? String(a.heightCm) : '',
            weightKg: a?.weightKg ? String(a.weightKg) : '',
            academicYear: a?.academicYear || '',
            transportRouteId: a?.transportRouteId || '',
            transportStop: a?.transportStop || '',
            feesGroupId: a?.feesGroupId || '',
            siblingId: s.siblingId || a?.siblingId || '',
            address: a?.address || s.address || '',
            village: a?.village || '',
            postOffice: a?.postOffice || '',
            policeStation: a?.policeStation || '',
            wardNo: a?.wardNo || '',
            city: a?.city || s.city || '',
            state: a?.state || s.state || '',
            pincode: a?.pincode || s.pincode || '',
            country: a?.country || s.country || 'India',
            sameAsPermanent: a?.sameAsPermanent ?? true,
            localAddress: a?.localAddress || '',
            localVillage: a?.localVillage || '',
            localPostOffice: a?.localPostOffice || '',
            localPoliceStation: a?.localPoliceStation || '',
            localWardNo: a?.localWardNo || '',
            localCity: a?.localCity || '',
            localState: a?.localState || '',
            localPincode: a?.localPincode || '',
            localCountry: a?.localCountry || 'India',
            fatherName: a?.fatherName || '',
            fatherPhone: a?.fatherPhone || '',
            fatherEmail: a?.fatherEmail || '',
            fatherOccupation: a?.fatherOccupation || '',
            fatherAadhaar: a?.fatherAadhaar ? formatAadhaar(a.fatherAadhaar) : '',
            fatherEducation: a?.fatherEducation || '',
            fatherIncome: a?.fatherIncome ? String(a.fatherIncome) : '',
            motherName: a?.motherName || '',
            motherPhone: a?.motherPhone || '',
            motherEmail: a?.motherEmail || '',
            motherOccupation: a?.motherOccupation || '',
            motherAadhaar: a?.motherAadhaar ? formatAadhaar(a.motherAadhaar) : '',
            motherEducation: a?.motherEducation || '',
            motherIncome: a?.motherIncome ? String(a.motherIncome) : '',
            belongsToEws: a?.belongsToEws || false,
            isSingleGirlChild: a?.isSingleGirlChild || false,
            isDivyangian: a?.isDivyangian || false,
            mediumOfInstruction: a?.mediumOfInstruction || '',
            previousSchool: a?.previousSchool || '',
            previousSchoolAddress: a?.previousSchoolAddress || '',
            previousClass: a?.previousClass || '',
            previousResult: a?.previousResult || '',
            affiliatedTo: a?.affiliatedTo || '',
            previousSchoolTC: a?.previousSchoolTC || '',
            tcDate: a?.tcDate ? new Date(a.tcDate).toISOString().split('T')[0] : '',
            hostelName: a?.hostelName || '',
            hostelRoomNo: a?.hostelRoomNo || '',
            hostelBedNo: a?.hostelBedNo || '',
            bankAccountNumber: a?.bankAccountNumber || '',
            ifscCode: a?.ifscCode || '',
            remarks: a?.remarks || '',
          })

          // Fetch documents if there's an admission record
          if (a?.id) {
            try {
              const docData = await api.get<{ documents: AdmissionDocument[] }>(`/api/school/admissions/${a.id}/documents`, undefined, { skipLogoutOn401: true })
              if (docData?.documents) {
                setDocuments(docData.documents)
                // Initialize documentUploads from existing docs
                const uploads: Record<string, { uploaded: boolean; verificationStatus: string }> = {}
                docData.documents.forEach(doc => {
                  uploads[doc.documentType] = { uploaded: !!doc.fileUrl, verificationStatus: doc.verificationStatus }
                })
                setDocumentUploads(uploads)
                // Initialize custom docs from any non-standard document types
                const standardTypes = REQUIRED_DOCUMENTS.map(d => d.type)
                const customDocsList: { type: string; name: string }[] = []
                docData.documents.forEach(doc => {
                  if (!standardTypes.includes(doc.documentType)) {
                    customDocsList.push({ type: doc.documentType, name: doc.documentName })
                  }
                })
                if (customDocsList.length > 0) setCustomDocs(customDocsList)
              }
            } catch {
              // Silently ignore - documents may not exist yet
            }
          }
        } else {
          toast({ title: 'Not Found', description: 'Student not found', variant: 'destructive' })
          router.push('/students')
        }
        if (clsData.status === 'fulfilled' && clsData.value?.classes) setClasses(clsData.value.classes)
        if (secData.status === 'fulfilled' && secData.value?.sections) setSections(secData.value.sections)
        if (feesGroupData.status === 'fulfilled' && feesGroupData.value?.groups) setFeesGroups(feesGroupData.value.groups)
      } catch {
        toast({ title: "Couldn't Load Student Data", description: "We couldn't load the student data. Please refresh the page.", variant: 'destructive' })
        router.push('/students')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  const filteredSections = useMemo(
    () => form?.classId ? sections.filter(s => s.classId === form.classId) : [],
    [form?.classId, sections]
  )

  // Year-scoped transport routes. Refetches whenever the viewing academic year
  // changes so the Route dropdown matches the session the user is editing for.
  useEffect(() => {
    let cancelled = false
    const fetchRoutes = async () => {
      try {
        const params = resolvedYear ? { academicYear: resolvedYear } : undefined
        const data = await api.get<{ routes: TransportRouteOption[] }>(
          '/api/school/transport/routes',
          params,
          { skipLogoutOn401: true }
        )
        if (!cancelled && data?.routes) setTransportRoutes(data.routes)
      } catch {
        if (!cancelled) setTransportRoutes([])
      }
    }
    fetchRoutes()
    return () => { cancelled = true }
  }, [resolvedYear])

  // Parse stops for the currently-selected route. Routes returned by the API
  // already have their stops overridden to the year-scoped TransportStopFare
  // rows, so this naturally honours the academic-year scope.
  const selectedRoute = useMemo(
    () => transportRoutes.find(r => r.id === form?.transportRouteId) || null,
    [transportRoutes, form?.transportRouteId]
  )

  const routeStops = useMemo<Array<{ name: string; fare: number }>>(() => {
    if (!selectedRoute?.stops) return []
    try {
      const parsed = JSON.parse(selectedRoute.stops)
      if (!Array.isArray(parsed)) return []
      const out: Array<{ name: string; fare: number }> = []
      for (const s of parsed) {
        if (typeof s === 'string' && s.trim()) {
          out.push({ name: s.trim(), fare: 0 })
        } else if (s && typeof s === 'object') {
          const r = s as Record<string, unknown>
          const name = typeof r.name === 'string' ? r.name.trim() : ''
          const fare = typeof r.fare === 'number' ? r.fare : Number(r.fare) || 0
          if (name) out.push({ name, fare })
        }
      }
      return out
    } catch {
      return []
    }
  }, [selectedRoute?.stops])

  // When the user changes route, drop any stop that doesn't exist on the new
  // route — otherwise the Select shows a stale value that nobody picked.
  // Guarded on `selectedRoute` so we don't wipe the stop while routes are
  // still loading, or when the saved route isn't in the current year's list.
  useEffect(() => {
    if (!form?.transportRouteId) {
      if (form?.transportStop) {
        setForm(prev => prev ? { ...prev, transportStop: '' } : prev)
      }
      return
    }
    if (!form.transportStop) return
    if (!selectedRoute) return
    const stopExists = routeStops.some(s => s.name === form.transportStop)
    if (!stopExists) {
      setForm(prev => prev ? { ...prev, transportStop: '' } : prev)
    }
  }, [form?.transportRouteId, form?.transportStop, routeStops, selectedRoute])

  // ============================================
  // Form Handlers
  // ============================================

  const updateForm = (field: keyof EditForm, value: string | boolean) => {
    setForm(prev => {
      if (!prev) return prev
      const updated = { ...prev, [field]: value }
      if (field === 'classId') updated.sectionId = ''
      if (field === 'sameAsPermanent' && value === true) {
        updated.localAddress = prev.address
        updated.localVillage = prev.village
        updated.localPostOffice = prev.postOffice
        updated.localPoliceStation = prev.policeStation
        updated.localWardNo = prev.wardNo
        updated.localCity = prev.city
        updated.localState = prev.state
        updated.localPincode = prev.pincode
        updated.localCountry = prev.country
      }
      return updated
    })
  }

  const calculateAge = (dob: string): string => {
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

  const selectSibling = (sibling: typeof siblingResults[0]) => {
    updateForm('siblingId', sibling.id)
    setSiblingSearch('')
    setSiblingResults([])
    toast({ title: 'Sibling Linked', description: `Linked to ${sibling.firstName} ${sibling.lastName}` })
  }

  // Document handlers
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

  const handleSave = async () => {
    if (!form || !student) return

    if (!form.firstName.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the first name.', variant: 'destructive' })
      setCurrentTab(1)
      return
    }
    if (!form.lastName.trim()) {
      toast({ title: 'Missing Information', description: 'Please enter the last name.', variant: 'destructive' })
      setCurrentTab(1)
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        dateOfBirth: form.dateOfBirth || null,
        gender: form.gender || null,
        bloodGroup: form.bloodGroup || null,
        aadhaarNumber: form.aadhaarNumber ? form.aadhaarNumber.replace(/\D/g, '') : null,
        classId: form.classId || null,
        sectionId: form.sectionId || null,
        profileImage: form.profileImage || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        siblingId: form.siblingId || null,
        admission: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          dateOfBirth: form.dateOfBirth || null,
          gender: form.gender || null,
          bloodGroup: form.bloodGroup || null,
          aadhaarNumber: form.aadhaarNumber ? form.aadhaarNumber.replace(/\D/g, '') : null,
          religion: form.religion || null,
          category: form.category || null,
          caste: form.caste || null,
          registrationNumber: form.registrationNumber || null,
          penNumber: form.penNumber || null,
          samagraId: form.samagraId || null,
          apaarId: form.apaarId || null,
          udiseId: form.udiseId || null,
          heightCm: form.heightCm || null,
          weightKg: form.weightKg || null,
          classId: form.classId || null,
          sectionId: form.sectionId || null,
          mediumOfInstruction: form.mediumOfInstruction || null,
          address: form.address || null,
          city: form.city || null,
          state: form.state || null,
          pincode: form.pincode || null,
          country: form.country || null,
          village: form.village || null,
          postOffice: form.postOffice || null,
          policeStation: form.policeStation || null,
          wardNo: form.wardNo || null,
          localAddress: form.localAddress || null,
          localVillage: form.localVillage || null,
          localPostOffice: form.localPostOffice || null,
          localPoliceStation: form.localPoliceStation || null,
          localWardNo: form.localWardNo || null,
          localCity: form.localCity || null,
          localState: form.localState || null,
          localPincode: form.localPincode || null,
          localCountry: form.localCountry || null,
          sameAsPermanent: form.sameAsPermanent,
          fatherName: form.fatherName || null,
          fatherPhone: form.fatherPhone || null,
          fatherEmail: form.fatherEmail || null,
          fatherOccupation: form.fatherOccupation || null,
          fatherAadhaar: form.fatherAadhaar ? form.fatherAadhaar.replace(/\D/g, '') : null,
          fatherEducation: form.fatherEducation || null,
          fatherIncome: form.fatherIncome || null,
          motherName: form.motherName || null,
          motherPhone: form.motherPhone || null,
          motherEmail: form.motherEmail || null,
          motherOccupation: form.motherOccupation || null,
          motherAadhaar: form.motherAadhaar ? form.motherAadhaar.replace(/\D/g, '') : null,
          motherEducation: form.motherEducation || null,
          motherIncome: form.motherIncome || null,
          belongsToEws: form.belongsToEws,
          isSingleGirlChild: form.isSingleGirlChild,
          isDivyangian: form.isDivyangian,
          previousSchool: form.previousSchool || null,
          previousSchoolAddress: form.previousSchoolAddress || null,
          previousClass: form.previousClass || null,
          previousResult: form.previousResult || null,
          affiliatedTo: form.affiliatedTo || null,
          previousSchoolTC: form.previousSchoolTC || null,
          tcDate: form.tcDate || null,
          // transportRouteId / transportStop deliberately omitted — those are
          // billing events handled by the dedicated transport dialogs on the
          // student detail page (POST /api/school/students/[id]/transport).
          // The PATCH endpoint also rejects them for defense-in-depth.
          hostelName: form.hostelName || null,
          hostelRoomNo: form.hostelRoomNo || null,
          hostelBedNo: form.hostelBedNo || null,
          bankAccountNumber: form.bankAccountNumber || null,
          ifscCode: form.ifscCode || null,
          feesGroupId: form.feesGroupId || null,
          siblingId: form.siblingId || null,
          remarks: form.remarks || null,
          documents: Object.entries(documentUploads)
            .filter(([, v]) => v.uploaded)
            .map(([type]) => ({
              documentType: type,
              documentName: REQUIRED_DOCUMENTS.find(d => d.type === type)?.name || customDocs.find(d => d.type === type)?.name || type,
            })),
        },
      }

      await api.patch(`/api/school/students/${student.id}`, payload)
      toast({ title: 'Student Updated', description: `${form.firstName} ${form.lastName}'s details have been saved` })
      router.push(`/students/${studentId}`)
    } catch (err) {
      toast({ title: "Couldn't Update Student", description: err instanceof Error ? err.message : "We couldn't update the student. Please try again.", variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // Loading State
  // ============================================

  if (loading || !form || !student) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="size-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
      </div>
    )
  }

  const fullName = `${student.firstName} ${student.lastName}`
  const age = calculateAge(form.dateOfBirth)

  // ============================================
  // Tab Renderers
  // ============================================

  const renderTab1PersonalDetails = () => (
    <div className="space-y-6">
      {/* Photo Upload */}
      <div className="flex items-center gap-4">
        <div
          className="size-20 rounded-full bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/30 shrink-0 overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => (document.getElementById('edit-photo-input') as HTMLInputElement)?.click()}
        >
          {form.profileImage ? (
            <img src={form.profileImage} alt="Student photo" className="size-full object-cover" />
          ) : (
            <Camera className="size-8 text-muted-foreground/50" />
          )}
        </div>
        <div>
          <input
            id="edit-photo-input"
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
          <Button variant="outline" size="sm" onClick={() => (document.getElementById('edit-photo-input') as HTMLInputElement)?.click()} className="gap-1">
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

      {/* Admission Number & Academic Year — Read Only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Shield className="size-3.5" /> Admission Number
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={student.admissionNumber || 'N/A'}
              readOnly
              className="bg-muted/50 font-mono text-base font-semibold tracking-wide cursor-not-allowed border-dashed"
            />
            <Badge variant="outline" className="shrink-0 text-xs">Read Only</Badge>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" /> Academic Year
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={form.academicYear || 'N/A'}
              readOnly
              className="bg-muted/50 font-mono text-base font-semibold tracking-wide cursor-not-allowed border-dashed"
            />
            <Badge variant="outline" className="shrink-0 text-xs">Read Only</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <IdCard className="size-3.5" /> Registration Number
          </Label>
          <div className="flex items-center gap-2">
            <Input
              value={form.registrationNumber || 'N/A'}
              readOnly
              className="bg-muted/50 font-mono text-base font-semibold tracking-wide cursor-not-allowed border-dashed"
            />
            <Badge variant="outline" className="shrink-0 text-xs">Read Only</Badge>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>First Name <span className="text-destructive">*</span></Label>
          <Input value={form.firstName} onChange={e => updateForm('firstName', e.target.value.toUpperCase())} placeholder="Enter first name" className="uppercase" />
        </div>
        <div className="space-y-2">
          <Label>Last Name <span className="text-destructive">*</span></Label>
          <Input value={form.lastName} onChange={e => updateForm('lastName', e.target.value.toUpperCase())} placeholder="Enter last name" className="uppercase" />
        </div>
      </div>

      {/* DOB & Gender */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date of Birth</Label>
          <DatePicker
            value={form.dateOfBirth}
            onChange={(v) => updateForm('dateOfBirth', v)}
            disableFuture
            showQuickActions={false}
            yearDropdown
            yearsBack={30}
            placeholder="Select date of birth"
            triggerClassName="w-full"
          />
          {age && <p className="text-xs text-muted-foreground">Age: {age}</p>}
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <div className="flex gap-2">
            {GENDER_OPTIONS.map(g => {
              const IconComp = g === 'Male' ? CircleUser : g === 'Female' ? CircleUserRound : User
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => updateForm('gender', g)}
                  className={`flex items-center gap-1.5 rounded-md border-2 px-3 py-1.5 transition-all ${
                    form.gender === g
                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                      : 'border-muted bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5'
                  }`}
                >
                  <IconComp className="size-4" />
                  <span className="text-xs font-medium">{g}</span>
                </button>
              )
            })}
          </div>
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
          <Input value={form.aadhaarNumber} onChange={e => updateForm('aadhaarNumber', formatAadhaar(e.target.value))} placeholder="XXXX XXXX XXXX" maxLength={14} inputMode="numeric" />
        </div>
      </div>

      {/* Government IDs */}
      <Separator />
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Shield className="size-4" /> Government IDs & Physical Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>PEN Number</Label>
          <Input value={form.penNumber} onChange={e => updateForm('penNumber', e.target.value)} placeholder="PEN / Government ID" />
        </div>
        <div className="space-y-2">
          <Label>Samagra ID</Label>
          <Input value={form.samagraId} onChange={e => updateForm('samagraId', e.target.value)} placeholder="Samagra ID" />
        </div>
        <div className="space-y-2">
          <Label>Apaar ID</Label>
          <Input value={form.apaarId} onChange={e => updateForm('apaarId', e.target.value)} placeholder="Apaar ID" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Udise ID</Label>
          <Input value={form.udiseId} onChange={e => updateForm('udiseId', e.target.value)} placeholder="Udise ID" />
        </div>
        <div className="space-y-2">
          <Label>Height (cm)</Label>
          <Input type="number" value={form.heightCm} onChange={e => updateForm('heightCm', e.target.value)} placeholder="e.g., 140" />
        </div>
        <div className="space-y-2">
          <Label>Weight (kg)</Label>
          <Input type="number" value={form.weightKg} onChange={e => updateForm('weightKg', e.target.value)} placeholder="e.g., 35" />
        </div>
      </div>


    </div>
  )

  const renderTab2ContactInfo = () => (
    <div className="space-y-6">
      {/* Mother's Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Heart className="size-4" /> Mother&apos;s Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Mother&apos;s Name</Label>
          <Input value={form.motherName} onChange={e => updateForm('motherName', e.target.value.toUpperCase())} placeholder="Full name" className="uppercase" />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={form.motherPhone} onChange={e => updateForm('motherPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone" maxLength={10} inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={form.motherEmail} onChange={e => updateForm('motherEmail', e.target.value)} placeholder="Email address" />
        </div>
        <div className="space-y-2">
          <Label>Occupation</Label>
          <Input value={form.motherOccupation} onChange={e => updateForm('motherOccupation', e.target.value)} placeholder="Occupation" />
        </div>
        <div className="space-y-2">
          <Label>Aadhaar</Label>
          <Input value={form.motherAadhaar} onChange={e => updateForm('motherAadhaar', formatAadhaar(e.target.value))} placeholder="XXXX XXXX XXXX" maxLength={14} inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Education Qualification</Label>
          <Input value={form.motherEducation} onChange={e => updateForm('motherEducation', e.target.value)} placeholder="e.g., B.Com, M.A." />
        </div>
        <div className="space-y-2">
          <Label>Yearly Income (₹)</Label>
          <Input type="number" value={form.motherIncome} onChange={e => updateForm('motherIncome', e.target.value)} placeholder="e.g., 300000" />
        </div>
      </div>

      <Separator />

      {/* Father's Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <User className="size-4" /> Father&apos;s Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Father&apos;s Name</Label>
          <Input value={form.fatherName} onChange={e => updateForm('fatherName', e.target.value.toUpperCase())} placeholder="Full name" className="uppercase" />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={form.fatherPhone} onChange={e => updateForm('fatherPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone" maxLength={10} inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={form.fatherEmail} onChange={e => updateForm('fatherEmail', e.target.value)} placeholder="Email address" />
        </div>
        <div className="space-y-2">
          <Label>Occupation</Label>
          <Input value={form.fatherOccupation} onChange={e => updateForm('fatherOccupation', e.target.value)} placeholder="Occupation" />
        </div>
        <div className="space-y-2">
          <Label>Aadhaar</Label>
          <Input value={form.fatherAadhaar} onChange={e => updateForm('fatherAadhaar', formatAadhaar(e.target.value))} placeholder="XXXX XXXX XXXX" maxLength={14} inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Education Qualification</Label>
          <Input value={form.fatherEducation} onChange={e => updateForm('fatherEducation', e.target.value)} placeholder="e.g., B.Sc, M.B.A." />
        </div>
        <div className="space-y-2">
          <Label>Yearly Income (₹)</Label>
          <Input type="number" value={form.fatherIncome} onChange={e => updateForm('fatherIncome', e.target.value)} placeholder="e.g., 500000" />
        </div>
      </div>

      <Separator />

      {/* EWS / Single Girl Child / Divyangian */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <User className="size-4" /> Special Categories
      </p>
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Checkbox checked={form.belongsToEws} onCheckedChange={v => updateForm('belongsToEws', !!v)} id="ews" />
          <Label htmlFor="ews" className="text-sm cursor-pointer">EWS</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked={form.isSingleGirlChild} onCheckedChange={v => updateForm('isSingleGirlChild', !!v)} id="sgc" />
          <Label htmlFor="sgc" className="text-sm cursor-pointer">Single Girl Child</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox checked={form.isDivyangian} onCheckedChange={v => updateForm('isDivyangian', !!v)} id="dvy" />
          <Label htmlFor="dvy" className="text-sm cursor-pointer">Divyangian</Label>
        </div>
      </div>

      <Separator />

      {/* Permanent ADDRESS */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <MapPin className="size-4" /> Permanent Address
      </p>
      <div className="space-y-2">
        <Label>Street / Landmark / Area</Label>
        <Textarea value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="House No., Street, Landmark, Area..." rows={2} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Village / Post</Label>
          <Input value={form.village} onChange={e => updateForm('village', e.target.value)} placeholder="Village" />
        </div>
        <div className="space-y-2">
          <Label>Post Office</Label>
          <Input value={form.postOffice} onChange={e => updateForm('postOffice', e.target.value)} placeholder="Post office" />
        </div>
        <div className="space-y-2">
          <Label>Police Station</Label>
          <Input value={form.policeStation} onChange={e => updateForm('policeStation', e.target.value)} placeholder="Police station" />
        </div>
        <div className="space-y-2">
          <Label>Ward No</Label>
          <Input value={form.wardNo} onChange={e => updateForm('wardNo', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ward no" maxLength={3} inputMode="numeric" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>City / District</Label>
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
          <Input value={form.pincode} onChange={e => updateForm('pincode', e.target.value.replace(/\D/g, ''))} placeholder="6-digit pincode" maxLength={6} inputMode="numeric" />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Input value={form.country} onChange={e => updateForm('country', e.target.value)} placeholder="Country" />
        </div>
      </div>

      {/* Same as Permanent */}
      <div className="flex items-center gap-2">
        <Checkbox checked={form.sameAsPermanent} onCheckedChange={v => updateForm('sameAsPermanent', !!v)} id="sameAsPerm" />
        <Label htmlFor="sameAsPerm" className="text-sm cursor-pointer">Local address same as permanent</Label>
      </div>

      {/* Local Address */}
      {!form.sameAsPermanent && (
        <>
          <Separator />
          <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Home className="size-4" /> Local Address
          </p>
          <div className="space-y-2">
            <Label>Street / Landmark / Area</Label>
            <Input value={form.localAddress} onChange={e => updateForm('localAddress', e.target.value)} placeholder="Local address" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Village</Label>
              <Input value={form.localVillage} onChange={e => updateForm('localVillage', e.target.value)} placeholder="Village" />
            </div>
            <div className="space-y-2">
              <Label>Post Office</Label>
              <Input value={form.localPostOffice} onChange={e => updateForm('localPostOffice', e.target.value)} placeholder="Post office" />
            </div>
            <div className="space-y-2">
              <Label>Police Station</Label>
              <Input value={form.localPoliceStation} onChange={e => updateForm('localPoliceStation', e.target.value)} placeholder="Police station" />
            </div>
            <div className="space-y-2">
              <Label>Ward No</Label>
              <Input value={form.localWardNo} onChange={e => updateForm('localWardNo', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ward No" maxLength={3} inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.localCity} onChange={e => updateForm('localCity', e.target.value)} placeholder="City" />
            </div>
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
              <Input value={form.localPincode} onChange={e => updateForm('localPincode', e.target.value.replace(/\D/g, ''))} placeholder="Pincode" maxLength={6} inputMode="numeric" />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={form.localCountry} onChange={e => updateForm('localCountry', e.target.value)} placeholder="Country" />
            </div>
          </div>
        </>
      )}
    </div>
  )

  const renderTab3GeneralDetails = () => (
    <div className="space-y-6">
      {/* Class & Section */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <GraduationCap className="size-4" /> Academic Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Class</Label>
          <Select value={form.classId} onValueChange={v => updateForm('classId', v)}>
            <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
            <SelectContent>
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Section</Label>
          <Select value={form.sectionId} onValueChange={v => updateForm('sectionId', v)}>
            <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
            <SelectContent>
              {filteredSections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              {filteredSections.length === 0 && <SelectItem value="_none" disabled>No sections available</SelectItem>}
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
              {MEDIUM_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Religion & Category */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <User className="size-4" /> Religion & Category
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Religion</Label>
          <Select value={form.religion} onValueChange={v => updateForm('religion', v)}>
            <SelectTrigger><SelectValue placeholder="Select religion" /></SelectTrigger>
            <SelectContent>
              {RELIGION_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={form.category} onValueChange={v => updateForm('category', v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Caste</Label>
          <Input value={form.caste} onChange={e => updateForm('caste', e.target.value)} placeholder="Caste" />
        </div>
      </div>

      <Separator />

      {/* Previous School */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Building className="size-4" /> Last Institution Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>School Name</Label>
          <Input value={form.previousSchool} onChange={e => updateForm('previousSchool', e.target.value)} placeholder="Previous school name" />
        </div>
        <div className="space-y-2">
          <Label>Address</Label>
          <Input value={form.previousSchoolAddress} onChange={e => updateForm('previousSchoolAddress', e.target.value)} placeholder="School address" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Previous Class</Label>
          <Input value={form.previousClass} onChange={e => updateForm('previousClass', e.target.value)} placeholder="Class last attended" />
        </div>
        <div className="space-y-2">
          <Label>Result</Label>
          <Input value={form.previousResult} onChange={e => updateForm('previousResult', e.target.value)} placeholder="Result" />
        </div>
        <div className="space-y-2">
          <Label>Affiliated To</Label>
          <Input value={form.affiliatedTo} onChange={e => updateForm('affiliatedTo', e.target.value)} placeholder="e.g., CBSE, State Board" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>TC Number</Label>
          <Input value={form.previousSchoolTC} onChange={e => updateForm('previousSchoolTC', e.target.value)} placeholder="Transfer certificate number" />
        </div>
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

      <Separator />

      {/* Transport Details — read-only.
          Mid-year transport changes (add/withdraw/change route) are billing
          events that touch fee ledgers. They live in the dedicated transport
          dialogs on the student detail page, not in this generic edit form.
          See developer-documentation/mid-year-billing-window-changes.md. */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Bus className="size-4" /> Transport Details
        {resolvedYear && (
          <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px] font-mono">
            {resolvedYear}
          </Badge>
        )}
      </p>
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        {form.transportRouteId ? (
          <>
            <div className="text-sm">
              <span className="text-muted-foreground">Route:</span>{' '}
              <span className="font-medium">
                {transportRoutes.find(r => r.id === form.transportRouteId)?.routeName || '—'}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Stop:</span>{' '}
              <span className="font-medium">{form.transportStop || '—'}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No active transport allocation.</p>
        )}
        <p className="text-xs text-muted-foreground pt-1 border-t mt-2">
          To change transport, use the <strong>Add / Discontinue Transport</strong> actions on
          the student profile page. Those flows handle pro-rated fees, ledger entries, and the
          allocation history correctly.
        </p>
      </div>

      <Separator />

      {/* Sibling */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Heart className="size-4" /> Sibling
      </p>
      {student.sibling ? (
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
          <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="size-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{student.sibling.firstName} {student.sibling.lastName}</p>
            <p className="text-xs text-muted-foreground">{student.sibling.admissionNumber || 'No adm. no'} {student.sibling.className ? `• ${student.sibling.className}` : ''}</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => updateForm('siblingId', '')}>
            <X className="size-3 mr-1" /> Unlink
          </Button>
        </div>
      ) : form.siblingId ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-emerald-600" /> Sibling linked
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => updateForm('siblingId', '')}>
            <X className="size-3 mr-1" /> Unlink
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input placeholder="Search sibling by name..." value={siblingSearch} onChange={e => handleSiblingSearch(e.target.value)} />
            {siblingSearching && <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent shrink-0" />}
          </div>
          {siblingResults.length > 0 && (
            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
              {siblingResults.map(s => (
                <button key={s.id} className="flex items-center gap-3 w-full p-2 hover:bg-muted/50 text-left" onClick={() => selectSibling(s)}>
                  <User className="size-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-muted-foreground">{s.admissionNumber || 'No adm. no'} {s.className ? `• ${s.className}` : ''}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderTab4AccountsOther = () => (
    <div className="space-y-6">
      {/* Bank Details */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <Banknote className="size-4" /> Bank Details
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Account Number</Label>
          <Input value={form.bankAccountNumber} onChange={e => updateForm('bankAccountNumber', e.target.value)} placeholder="Bank account number" />
        </div>
        <div className="space-y-2">
          <Label>IFSC Code</Label>
          <Input value={form.ifscCode} onChange={e => updateForm('ifscCode', e.target.value)} placeholder="e.g., SBIN0001234" />
        </div>
      </div>

      <Separator />

      {/* Fees Group */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <CreditCard className="size-4" /> Fees Group
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Fees Group</Label>
          <Select value={form.feesGroupId} disabled>
            <SelectTrigger className="bg-muted/40 cursor-not-allowed">
              <SelectValue placeholder="No Fees Group" />
            </SelectTrigger>
            <SelectContent>
              {feesGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">View only — use “Change Fee Group” to switch a student to a different group.</p>
        </div>
      </div>

      <Separator />

      {/* Remarks */}
      <p className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
        <FileText className="size-4" /> Remarks
      </p>
      <Textarea value={form.remarks} onChange={e => updateForm('remarks', e.target.value)} placeholder="Any additional remarks or notes..." rows={3} />
    </div>
  )

  const renderTab5Documents = () => (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3">
        <Info className="size-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-300">Upload required documents for the student record. All documents will be verified by the school administration.</p>
      </div>

      {/* Required Documents */}
      <div className="space-y-2">
        {REQUIRED_DOCUMENTS.map(doc => {
          const uploadState = documentUploads[doc.type]
          const existingDoc = documents.find(d => d.documentType === doc.type)
          const isVerified = existingDoc?.verificationStatus === 'verified'
          const isRejected = existingDoc?.verificationStatus === 'rejected'
          return (
            <div key={doc.type} className="flex items-center justify-between rounded-lg border p-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex size-9 items-center justify-center rounded-lg shrink-0 ${
                  isVerified ? 'bg-emerald-50 dark:bg-emerald-950' :
                  isRejected ? 'bg-red-50 dark:bg-red-950' :
                  uploadState?.uploaded ? 'bg-amber-50 dark:bg-amber-950' :
                  'bg-muted'
                }`}>
                  {isVerified ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : isRejected ? (
                    <X className="size-4 text-red-600" />
                  ) : uploadState?.uploaded ? (
                    <FileText className="size-4 text-amber-600" />
                  ) : (
                    <Upload className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  {isVerified ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      Verified
                    </Badge>
                  ) : isRejected ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                      Rejected
                    </Badge>
                  ) : uploadState?.uploaded ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      Pending Verification
                    </Badge>
                  ) : existingDoc?.uploadedAt ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                      Pending Verification
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not uploaded</span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                {!uploadState?.uploaded && !existingDoc?.fileUrl && (
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                    <Upload className="size-3" /> Upload
                  </Button>
                )}
                {(uploadState?.uploaded || existingDoc?.fileUrl) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                    <Upload className="size-3" /> Re-upload
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
        const existingDoc = documents.find(d => d.documentType === doc.type)
        const isVerified = existingDoc?.verificationStatus === 'verified'
        const isRejected = existingDoc?.verificationStatus === 'rejected'
        return (
          <div key={doc.type} className="flex items-center justify-between rounded-lg border p-3 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex size-9 items-center justify-center rounded-lg shrink-0 ${
                isVerified ? 'bg-emerald-50 dark:bg-emerald-950' :
                isRejected ? 'bg-red-50 dark:bg-red-950' :
                uploadState?.uploaded ? 'bg-amber-50 dark:bg-amber-950' :
                'bg-muted'
              }`}>
                {isVerified ? <Check className="size-4 text-emerald-600" /> :
                 isRejected ? <X className="size-4 text-red-600" /> :
                 uploadState?.uploaded ? <FileText className="size-4 text-amber-600" /> :
                 <Upload className="size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{doc.name}</p>
                {isVerified ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                    Verified
                  </Badge>
                ) : isRejected ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                    Rejected
                  </Badge>
                ) : uploadState?.uploaded ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700">Pending</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">Not uploaded</span>
                )}
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              {!uploadState?.uploaded && !existingDoc?.fileUrl ? (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                  <Upload className="size-3" /> Upload
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleDocumentUpload(doc.type)}>
                  <Upload className="size-3" /> Re-upload
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => {
                setCustomDocs(prev => prev.filter(d => d.type !== doc.type))
                setDocumentUploads(prev => {
                  const next = { ...prev }
                  delete next[doc.type]
                  return next
                })
              }}>
                <X className="size-3" />
              </Button>
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

      {/* Document stats */}
      {documents.length > 0 && (
        <>
          <Separator />
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{documents.filter(d => d.verificationStatus === 'verified').length}</p>
              <p className="text-xs text-muted-foreground">Verified</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{documents.filter(d => d.verificationStatus === 'pending' || d.verificationStatus === 'uploaded').length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-red-600">{documents.filter(d => d.verificationStatus === 'rejected').length}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
          </div>
        </>
      )}
    </div>
  )

  const renderTabContent = () => {
    switch (currentTab) {
      case 1: return renderTab1PersonalDetails()
      case 2: return renderTab2ContactInfo()
      case 3: return renderTab3GeneralDetails()
      case 4: return renderTab4AccountsOther()
      case 5: return renderTab5Documents()
      default: return null
    }
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-[calc(100vh-10rem)] flex flex-col">
      {/* Header — matches admission page style */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
              {form.profileImage ? (
                <img src={form.profileImage} alt={fullName} className="size-full object-cover" />
              ) : (
                <User className="size-5 text-primary" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold">Edit Student</h1>
              <p className="text-sm text-muted-foreground">
                {fullName}
                {student.admissionNumber && <span className="ml-2 font-mono text-xs">({student.admissionNumber})</span>}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => router.push(`/students/${studentId}`)} className="gap-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? (
              <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <Save className="size-4" />
            )}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Tab Indicator — matches admission page step tracker style */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          {EDIT_TABS.map((tab, index) => {
            const isCurrent = currentTab === tab.number
            const Icon = tab.icon

            return (
              <div key={tab.number} className="flex items-start flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => setCurrentTab(tab.number)}
                  className="flex flex-col items-center gap-1.5 group cursor-pointer"
                >
                  <div
                    className={`flex size-10 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                      isCurrent
                        ? 'border-primary bg-primary text-primary-foreground shadow-md scale-110'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5'
                    }`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <span
                    className={`text-[10px] sm:text-xs font-medium transition-colors text-center leading-tight ${
                      isCurrent ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.number}</span>
                  </span>
                </button>
                {index < EDIT_TABS.length - 1 && (
                  <div className="flex-1 mx-1 mt-4">
                    <div className={`h-0.5 w-full transition-colors ${
                      currentTab > tab.number ? 'bg-primary' : 'bg-muted-foreground/20'
                    }`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tab Content — matches admission page card style */}
      <Card className="flex-1">
        <CardContent className="p-4 sm:p-6">
          {renderTabContent()}
        </CardContent>
      </Card>

      {/* Bottom Navigation — matches admission page */}
      <div className="flex items-center justify-between mt-6 pb-4">
        <div>
          {currentTab > 1 && (
            <Button variant="outline" onClick={() => setCurrentTab(prev => prev - 1)} className="gap-1">
              ← Previous
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentTab < 5 && (
            <Button onClick={() => setCurrentTab(prev => prev + 1)} className="gap-1">
              Next →
            </Button>
          )}
          {currentTab === 5 && (
            <Button onClick={handleSave} disabled={saving} className="gap-1">
              {saving ? (
                <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Save className="size-4" />
              )}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
