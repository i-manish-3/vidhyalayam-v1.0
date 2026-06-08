/**
 * Shared row parsing + validation for bulk student admission.
 *
 * Used by:
 *   - POST /api/school/admissions/bulk/validate  → pure validation, no DB writes
 *   - POST /api/school/admissions/bulk/commit    → re-validates each row before insert
 *
 * The same shape (`RawRow`) is accepted by both — the validate endpoint is just
 * a dry-run of what commit would do, returning the same per-row diagnostics.
 *
 * Validators here mirror the rules in src/app/api/school/admissions/route.ts
 * (single-admission POST). When tightening one, tighten the other.
 */

/**
 * Columns split into two sets so the UI can offer a "Quick" template (just the
 * essentials — what 95% of onboarding schools need) and an "Advanced" template
 * with the full set. The validator accepts any subset; columns omitted from
 * the CSV are treated as blank.
 *
 * Column ORDER matters — it's the order they appear in the downloaded CSV.
 * Required columns first, then commonly-used optional, then rarely-used.
 */
export const QUICK_TEMPLATE_COLUMNS = [
  // Required basics
  'firstName',
  'lastName',
  'dateOfBirth',
  'gender',
  // Placement
  'className',
  'sectionName',
  'feesGroupName',
  // Parents
  'fatherName',
  'fatherPhone',
  'motherName',
  'motherPhone',
  // Numbering
  'rollNumber',
  'admissionNumber',
] as const

export const ADVANCED_EXTRA_COLUMNS = [
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
  // Sibling linking — paste an already-enrolled student's admission number to
  // attach this new student to that family (shared familyId + parent login).
  'siblingAdmissionNumber',
  // Transport — both must be filled together (or both blank). Must match an
  // active route + a stop with a configured fare for the year.
  'routeName',
  'stopName',
] as const

export const BULK_TEMPLATE_COLUMNS = [
  ...QUICK_TEMPLATE_COLUMNS,
  ...ADVANCED_EXTRA_COLUMNS,
] as const

export type BulkTemplateColumn = (typeof BULK_TEMPLATE_COLUMNS)[number]

export type RawRow = Partial<Record<BulkTemplateColumn, string>>

export type RowStatus = 'valid' | 'warning' | 'invalid'

export interface NormalizedRow {
  firstName: string
  lastName: string
  dateOfBirth: string // ISO YYYY-MM-DD
  gender: string // Boy | Girl | Other
  classId: string
  className: string
  sectionId: string | null
  sectionName: string | null
  feesGroupId: string
  feesGroupName: string
  hasFeesStructure: boolean
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
  // Sibling linking to an existing enrolled student (null when not linked).
  siblingStudentId: string | null
  siblingFamilyId: string | null
  // Transport (null when the row has no transport).
  transportRouteId: string | null
  transportRouteName: string | null
  transportStopName: string | null
  transportFare: number | null
  transportFeeMonths: string[]
}

export interface RowDiagnostic {
  index: number // 0-based index in the original CSV (header is not row 0)
  status: RowStatus
  errors: string[]
  warnings: string[]
  parsed: NormalizedRow | null
}

/** Resolved transport stop fare for a route+stop in the active year. */
export interface TransportStopInfo {
  routeId: string
  routeName: string
  stopName: string
  fare: number
  /** Billable month labels (e.g. ["Apr","May",…]) — JSON-decoded. */
  feeMonths: string[]
}

/** Minimal existing-student shape needed to link a new admission to a sibling. */
export interface SiblingStudentInfo {
  studentId: string
  familyId: string | null
}

export interface BulkLookups {
  /** lower(name) → classId. Inactive/deleted classes excluded. */
  classByName: Map<string, string>
  /** "classId|lower(name)" → sectionId. */
  sectionByClassAndName: Map<string, string>
  /** lower(name) → feesGroupId. */
  feesGroupByName: Map<string, string>
  /** "classId|feesGroupId" present ⇒ a FeesStructure exists for the active year. */
  feesStructureKeys: Set<string>
  /** Existing Student.admissionNumber values for collision check on overrides. */
  existingAdmissionNumbers: Set<string>
  /** "lower(routeName)|lower(stopName)" → resolved fare info for the active year. */
  transportStopByRouteAndName: Map<string, TransportStopInfo>
  /** lower(routeName) present ⇒ an active route with that name exists (for error messages). */
  transportRouteNames: Set<string>
  /** Student.admissionNumber → { studentId, familyId } for sibling linking. */
  studentByAdmissionNumber: Map<string, SiblingStudentInfo>
  /** Admission-window open instant (ms) or null when no window configured. */
  admissionOpenAt: number | null
  /** Admission-window close instant (ms) or null when no window configured. */
  admissionCloseAt: number | null
  /** Per-class application cap for the active year, or null when uncapped. */
  maxApplicationsPerClass: number | null
  /** classId → existing (non-deleted) admission count for the active year. */
  admissionCountByClassId: Map<string, number>
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex / predicates — kept in sync with src/app/api/school/admissions/route.ts
// ─────────────────────────────────────────────────────────────────────────────

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
  const v = raw.toLowerCase()
  if (!GENDER_VALUES.has(v)) return null
  if (v === 'boy' || v === 'male') return 'Boy'
  if (v === 'girl' || v === 'female') return 'Girl'
  return 'Other'
}

function normalizeDate(raw: string): string | null {
  // Accept YYYY-MM-DD and DD/MM/YYYY (Indian schools often paste from Excel).
  const t = raw.trim()
  if (!t) return null
  let y: number, m: number, d: number
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    ;[y, m, d] = t.split('-').map(Number)
  } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(t)) {
    const parts = t.split(/[/-]/).map(Number)
    ;[d, m, y] = parts as [number, number, number]
  } else {
    return null
  }
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  if (dt.getTime() > Date.now()) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '').slice(-10)
  return PHONE_RE.test(digits) ? digits : null
}

/**
 * Batch-level admission-window check. Returns an error message when admissions
 * are currently closed, or null when open / no window configured. Both the
 * validate and commit routes call this before processing any rows.
 *
 * `now` is injectable for testing; defaults to the current time.
 */
export function checkAdmissionWindow(lookups: BulkLookups, now: number = Date.now()): string | null {
  if (lookups.admissionOpenAt !== null && lookups.admissionCloseAt !== null) {
    if (now < lookups.admissionOpenAt || now > lookups.admissionCloseAt) {
      return 'Admissions are currently closed. Please check the admission schedule or contact the school office.'
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Row validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidateRowOptions {
  row: RawRow
  index: number
  lookups: BulkLookups
  /** admissionNumbers already seen earlier in the same upload — used to detect duplicates inside the CSV. */
  seenOverrides: Set<string>
  /**
   * Running count of how many rows EARLIER in this upload were placed into each
   * class (keyed by classId). Used so the per-class application cap accounts for
   * the batch itself, not just rows already in the DB. validateRow mutates this:
   * a row that passes class validation increments its class's tally.
   */
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
  const feesGroupNameRaw = s(row.feesGroupName)
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
  const siblingAdmNumber = s(row.siblingAdmissionNumber)
  const routeNameRaw = s(row.routeName)
  const stopNameRaw = s(row.stopName)

  // firstName
  if (!firstName) errors.push('firstName is required')
  else if (firstName.length < 2) errors.push('firstName must be at least 2 characters')
  else if (!NAME_RE.test(firstName)) errors.push('firstName: only letters and spaces allowed')

  // lastName
  if (!lastName) errors.push('lastName is required')
  else if (lastName.length < 2) errors.push('lastName must be at least 2 characters')
  else if (!NAME_RE.test(lastName)) errors.push('lastName: only letters and spaces allowed')

  // dateOfBirth
  const dob = normalizeDate(dobRaw)
  if (!dobRaw) errors.push('dateOfBirth is required')
  else if (!dob) errors.push('dateOfBirth: use YYYY-MM-DD or DD/MM/YYYY (and not in the future)')

  // gender
  const gender = normalizeGender(genderRaw)
  if (!genderRaw) errors.push('gender is required')
  else if (!gender) errors.push('gender must be Boy, Girl, or Other')

  // className
  const classId = classNameRaw ? lookups.classByName.get(classNameRaw.toLowerCase()) : undefined
  if (!classNameRaw) errors.push('className is required')
  else if (!classId) errors.push(`className "${classNameRaw}" does not exist in this school`)

  // sectionName — optional only if the class has no sections; otherwise required
  let sectionId: string | null = null
  if (classId) {
    if (sectionNameRaw) {
      sectionId = lookups.sectionByClassAndName.get(`${classId}|${sectionNameRaw.toLowerCase()}`) ?? null
      if (!sectionId) errors.push(`sectionName "${sectionNameRaw}" does not exist under class "${classNameRaw}"`)
    }
    // sectionName blank is allowed — single-admission route also treats it as optional.
  }

  // Per-class application cap — counts existing DB admissions for the year PLUS
  // rows earlier in this same upload that target the class. Matches the
  // single-admission route's maxApplicationsPerClass guard.
  if (classId && lookups.maxApplicationsPerClass !== null) {
    const already = (lookups.admissionCountByClassId.get(classId) ?? 0) + (classTally.get(classId) ?? 0)
    if (already >= lookups.maxApplicationsPerClass) {
      errors.push(
        `Class "${classNameRaw}" has reached its application limit (${lookups.maxApplicationsPerClass}).`,
      )
    }
  }

  // feesGroupName
  const feesGroupId = feesGroupNameRaw ? lookups.feesGroupByName.get(feesGroupNameRaw.toLowerCase()) : undefined
  if (!feesGroupNameRaw) errors.push('feesGroupName is required')
  else if (!feesGroupId) errors.push(`feesGroupName "${feesGroupNameRaw}" does not exist in this school`)

  // Fees structure availability (warning, not error — per "best-effort" decision)
  let hasFeesStructure = false
  if (classId && feesGroupId) {
    hasFeesStructure = lookups.feesStructureKeys.has(`${classId}|${feesGroupId}`)
    if (!hasFeesStructure) {
      warnings.push(
        `No active fee structure for "${classNameRaw}" + "${feesGroupNameRaw}" in this year — student will be admitted without fees.`,
      )
    }
  }

  // admissionNumber override
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

  // fatherName
  if (!fatherName) errors.push('fatherName is required')
  else if (fatherName.length < 2) errors.push('fatherName must be at least 2 characters')
  else if (!NAME_RE.test(fatherName)) errors.push('fatherName: only letters and spaces allowed')

  // fatherPhone
  const fatherPhone = normalizePhone(fatherPhoneRaw)
  if (!fatherPhoneRaw) errors.push('fatherPhone is required')
  else if (!fatherPhone) errors.push('fatherPhone must be a valid 10-digit Indian number (starts 6–9)')

  // motherName (optional)
  if (motherName && (motherName.length < 2 || !NAME_RE.test(motherName))) {
    errors.push('motherName: only letters and spaces allowed (min 2 chars)')
  }

  // motherPhone (optional)
  let motherPhone: string | null = null
  if (motherPhoneRaw) {
    motherPhone = normalizePhone(motherPhoneRaw)
    if (!motherPhone) errors.push('motherPhone must be a valid 10-digit Indian number')
  }

  // pincode (optional)
  if (pincode && !PINCODE_RE.test(pincode)) {
    errors.push('pincode must be exactly 6 digits')
  }

  // aadhaar (optional)
  let aadhaarNumber: string | null = null
  if (aadhaar) {
    const digits = aadhaar.replace(/\D/g, '')
    if (!AADHAAR_RE.test(digits)) errors.push('aadhaarNumber must be exactly 12 digits')
    else aadhaarNumber = digits
  }

  // bloodGroup (optional)
  if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup.toLowerCase())) {
    errors.push('bloodGroup must be one of A+/A-/B+/B-/AB+/AB-/O+/O-')
  }

  // siblingAdmissionNumber (optional) — must resolve to an existing student.
  let siblingStudentId: string | null = null
  let siblingFamilyId: string | null = null
  if (siblingAdmNumber) {
    const sibling = lookups.studentByAdmissionNumber.get(siblingAdmNumber)
    if (!sibling) {
      errors.push(`siblingAdmissionNumber "${siblingAdmNumber}" does not match any enrolled student`)
    } else {
      siblingStudentId = sibling.studentId
      siblingFamilyId = sibling.familyId
    }
  }

  // Transport (optional) — both routeName and stopName required together, and
  // the stop must have a configured fare for the active year.
  let transportRouteId: string | null = null
  let transportRouteName: string | null = null
  let transportStopName: string | null = null
  let transportFare: number | null = null
  let transportFeeMonths: string[] = []
  if (routeNameRaw || stopNameRaw) {
    if (!routeNameRaw || !stopNameRaw) {
      errors.push('Transport needs both routeName and stopName, or leave both blank')
    } else if (!lookups.transportRouteNames.has(routeNameRaw.toLowerCase())) {
      errors.push(`routeName "${routeNameRaw}" does not exist in this school for this year`)
    } else {
      const info = lookups.transportStopByRouteAndName.get(
        `${routeNameRaw.toLowerCase()}|${stopNameRaw.toLowerCase()}`,
      )
      if (!info) {
        errors.push(
          `stopName "${stopNameRaw}" has no fare configured on route "${routeNameRaw}" for this year`,
        )
      } else {
        transportRouteId = info.routeId
        transportRouteName = info.routeName
        transportStopName = info.stopName
        transportFare = info.fare
        transportFeeMonths = info.feeMonths
      }
    }
  }

  if (errors.length > 0) {
    return { index, status: 'invalid', errors, warnings, parsed: null }
  }

  // Row is valid — reserve its class slot so later rows in this batch see the
  // updated tally for the per-class cap. (classId is guaranteed set here.)
  if (classId) classTally.set(classId, (classTally.get(classId) ?? 0) + 1)

  const parsed: NormalizedRow = {
    firstName: firstName.toUpperCase(),
    lastName: lastName.toUpperCase(),
    dateOfBirth: dob!,
    gender: gender!,
    classId: classId!,
    className: classNameRaw,
    sectionId,
    sectionName: sectionNameRaw || null,
    feesGroupId: feesGroupId!,
    feesGroupName: feesGroupNameRaw,
    hasFeesStructure,
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
    siblingStudentId,
    siblingFamilyId,
    transportRouteId,
    transportRouteName,
    transportStopName,
    transportFare,
    transportFeeMonths,
  }

  return {
    index,
    status: warnings.length > 0 ? 'warning' : 'valid',
    errors,
    warnings,
    parsed,
  }
}
