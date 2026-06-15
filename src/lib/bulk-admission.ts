/**
 * Shared row parsing and validation for bulk student admission.
 *
 * Bulk import intentionally handles only admission/student/family data.
 * Fee groups, tuition fee assignment, and transport/hostel fee allocation are
 * handled manually after import.
 */

export const BULK_TEMPLATE_COLUMNS = [
  'firstName',
  'lastName',
  'dateOfBirth',
  'gender',
  'className',
  'sectionName',
  'fatherName',
  'fatherPhone',
  'motherName',
  'motherPhone',
  'rollNumber',
  'admissionNumber',
  'address',
  'city',
  'state',
  'pincode',
  'aadhaarNumber',
  'bloodGroup',
  'religion',
  'category',
  'nationality',
  'previousSchool',
] as const

export type BulkTemplateColumn = (typeof BULK_TEMPLATE_COLUMNS)[number]

export type RawRow = Partial<Record<BulkTemplateColumn, string>>

export type RowStatus = 'valid' | 'warning' | 'invalid'

export interface NormalizedRow {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  admissionNumberOverride: string | null
  rollNumber: string | null
  fatherName: string
  fatherPhone: string
  motherName: string | null
  motherPhone: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  aadhaarNumber: string | null
  bloodGroup: string | null
  religion: string | null
  category: string | null
  nationality: string
  previousSchool: string | null
}

export interface RowDiagnostic {
  index: number
  status: RowStatus
  errors: string[]
  warnings: string[]
  parsed: NormalizedRow | null
}

export interface BulkLookups {
  classByName: Map<string, string>
  sectionByClassAndName: Map<string, string>
  existingAdmissionNumbers: Set<string>
  admissionOpenAt: number | null
  admissionCloseAt: number | null
  maxApplicationsPerClass: number | null
  admissionCountByClassId: Map<string, number>
}

const NAME_RE = /^[a-zA-Z\s]+$/
const PHONE_RE = /^[6-9]\d{9}$/
const AADHAAR_RE = /^\d{12}$/
const PINCODE_RE = /^\d{6}$/
const GENDER_VALUES = new Set(['boy', 'girl', 'male', 'female', 'other'])
const BLOOD_GROUPS = new Set(['a+', 'a-', 'b+', 'b-', 'ab+', 'ab-', 'o+', 'o-'])

function s(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeGender(raw: string): string | null {
  const value = raw.toLowerCase()
  if (!GENDER_VALUES.has(value)) return null
  if (value === 'boy' || value === 'male') return 'Boy'
  if (value === 'girl' || value === 'female') return 'Girl'
  return 'Other'
}

function normalizeDate(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  let year: number
  let month: number
  let day: number

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ;[year, month, day] = value.split('-').map(Number)
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(value)) {
    ;[day, month, year] = value.split(/[/-]/).map(Number) as [number, number, number]
  } else {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null
  }
  if (date.getTime() > Date.now()) return null

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').slice(-10)
  return PHONE_RE.test(digits) ? digits : null
}

export function checkAdmissionWindow(lookups: BulkLookups, now: number = Date.now()): string | null {
  if (lookups.admissionOpenAt !== null && lookups.admissionCloseAt !== null) {
    if (now < lookups.admissionOpenAt || now > lookups.admissionCloseAt) {
      return 'Admissions are currently closed. Please check the admission schedule or contact the school office.'
    }
  }
  return null
}

export interface ValidateRowOptions {
  row: RawRow
  index: number
  lookups: BulkLookups
  seenOverrides: Set<string>
  classTally: Map<string, number>
}

export function validateRow({ row, index, lookups, seenOverrides, classTally }: ValidateRowOptions): RowDiagnostic {
  const errors: string[] = []
  const warnings: string[] = []

  const firstName = s(row.firstName)
  const lastName = s(row.lastName)
  const dobRaw = s(row.dateOfBirth)
  const genderRaw = s(row.gender)
  const classNameRaw = s(row.className)
  const sectionNameRaw = s(row.sectionName)
  const admNumOverride = s(row.admissionNumber)
  const rollNumber = s(row.rollNumber)
  const fatherName = s(row.fatherName)
  const fatherPhoneRaw = s(row.fatherPhone)
  const motherName = s(row.motherName)
  const motherPhoneRaw = s(row.motherPhone)
  const address = s(row.address)
  const city = s(row.city)
  const state = s(row.state)
  const pincode = s(row.pincode)
  const aadhaar = s(row.aadhaarNumber)
  const bloodGroup = s(row.bloodGroup)
  const religion = s(row.religion)
  const category = s(row.category)
  const nationality = s(row.nationality) || 'Indian'
  const previousSchool = s(row.previousSchool)

  if (!firstName) errors.push('firstName is required')
  else if (firstName.length < 2) errors.push('firstName must be at least 2 characters')
  else if (!NAME_RE.test(firstName)) errors.push('firstName: only letters and spaces allowed')

  if (lastName && lastName.length < 2) errors.push('lastName must be at least 2 characters')
  if (lastName && !NAME_RE.test(lastName)) errors.push('lastName: only letters and spaces allowed')

  const dob = normalizeDate(dobRaw)
  if (!dobRaw) errors.push('dateOfBirth is required')
  else if (!dob) errors.push('dateOfBirth: use YYYY-MM-DD or DD/MM/YYYY and not a future date')

  const gender = normalizeGender(genderRaw)
  if (!genderRaw) errors.push('gender is required')
  else if (!gender) errors.push('gender must be Boy, Girl, or Other')

  const classId = classNameRaw ? lookups.classByName.get(classNameRaw.toLowerCase()) : undefined
  if (!classNameRaw) errors.push('className is required')
  else if (!classId) errors.push(`className "${classNameRaw}" does not exist in this school`)

  let sectionId: string | null = null
  if (classId && sectionNameRaw) {
    sectionId = lookups.sectionByClassAndName.get(`${classId}|${sectionNameRaw.toLowerCase()}`) ?? null
    if (!sectionId) errors.push(`sectionName "${sectionNameRaw}" does not exist under class "${classNameRaw}"`)
  }

  if (classId && lookups.maxApplicationsPerClass !== null) {
    const already = (lookups.admissionCountByClassId.get(classId) ?? 0) + (classTally.get(classId) ?? 0)
    if (already >= lookups.maxApplicationsPerClass) {
      errors.push(`Class "${classNameRaw}" has reached its application limit (${lookups.maxApplicationsPerClass}).`)
    }
  }

  let admissionNumberOverride: string | null = null
  if (admNumOverride) {
    if (lookups.existingAdmissionNumbers.has(admNumOverride)) {
      errors.push(`admissionNumber "${admNumOverride}" is already in use`)
    } else if (seenOverrides.has(admNumOverride)) {
      errors.push(`admissionNumber "${admNumOverride}" is duplicated within this upload`)
    } else {
      seenOverrides.add(admNumOverride)
      admissionNumberOverride = admNumOverride
    }
  }

  if (!fatherName) errors.push('fatherName is required')
  else if (fatherName.length < 2) errors.push('fatherName must be at least 2 characters')
  else if (!NAME_RE.test(fatherName)) errors.push('fatherName: only letters and spaces allowed')

  const fatherPhone = normalizePhone(fatherPhoneRaw)
  if (!fatherPhoneRaw) errors.push('fatherPhone is required')
  else if (!fatherPhone) errors.push('fatherPhone must be a valid 10-digit Indian number starting with 6-9')

  if (motherName && (motherName.length < 2 || !NAME_RE.test(motherName))) {
    errors.push('motherName: only letters and spaces allowed (min 2 chars)')
  }

  let motherPhone: string | null = null
  if (motherPhoneRaw) {
    motherPhone = normalizePhone(motherPhoneRaw)
    if (!motherPhone) errors.push('motherPhone must be a valid 10-digit Indian number')
  }

  if (pincode && !PINCODE_RE.test(pincode)) errors.push('pincode must be exactly 6 digits')

  let aadhaarNumber: string | null = null
  if (aadhaar) {
    const digits = aadhaar.replace(/\D/g, '')
    if (!AADHAAR_RE.test(digits)) errors.push('aadhaarNumber must be exactly 12 digits')
    else aadhaarNumber = digits
  }

  if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup.toLowerCase())) {
    errors.push('bloodGroup must be one of A+/A-/B+/B-/AB+/AB-/O+/O-')
  }

  if (errors.length > 0) {
    return { index, status: 'invalid', errors, warnings, parsed: null }
  }

  if (classId) classTally.set(classId, (classTally.get(classId) ?? 0) + 1)

  return {
    index,
    status: warnings.length > 0 ? 'warning' : 'valid',
    errors,
    warnings,
    parsed: {
      firstName: firstName.toUpperCase(),
      lastName: lastName.toUpperCase(),
      dateOfBirth: dob!,
      gender: gender!,
      classId: classId!,
      className: classNameRaw,
      sectionId,
      sectionName: sectionNameRaw || null,
      admissionNumberOverride,
      rollNumber: rollNumber || null,
      fatherName: fatherName.toUpperCase(),
      fatherPhone: fatherPhone!,
      motherName: motherName ? motherName.toUpperCase() : null,
      motherPhone,
      address: address || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      aadhaarNumber,
      bloodGroup: bloodGroup ? bloodGroup.toUpperCase() : null,
      religion: religion || null,
      category: category || null,
      nationality,
      previousSchool: previousSchool || null,
    },
  }
}
