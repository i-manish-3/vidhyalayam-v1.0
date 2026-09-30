import { Prisma } from '@prisma/client'

// ============================================
// Certificates module — shared types & helpers
// ============================================
// The certificate catalog, placeholder tokens, default template bodies, the
// student/school snapshot builder, and atomic certificate-number allocation.

export interface CertificateTypeDef {
  value: string
  label: string
  shortLabel: string
  numberPrefix: string
  description: string
}

export const CERTIFICATE_TYPES: CertificateTypeDef[] = [
  { value: 'tc', label: 'Transfer Certificate (TC)', shortLabel: 'TC', numberPrefix: 'TC', description: 'Issued when a student transfers / leaves the school. Temporary TC keeps the student on the rolls.' },
  { value: 'bonafide', label: 'Bonafide Certificate', shortLabel: 'Bonafide', numberPrefix: 'BONAFIDE', description: 'Confirms the student is a bonafide student of the school.' },
  { value: 'character', label: 'Character Certificate', shortLabel: 'Character', numberPrefix: 'CHAR', description: 'Certifies the conduct and character of the student.' },
  { value: 'study', label: 'Study Certificate', shortLabel: 'Study', numberPrefix: 'STUDY', description: 'Confirms the period of study / course pursued by the student.' },
  { value: 'school_leaving', label: 'School Leaving Certificate', shortLabel: 'SLC', numberPrefix: 'SLC', description: 'Issued on leaving the school after completing the course.' },
  { value: 'migration', label: 'Migration Certificate', shortLabel: 'Migration', numberPrefix: 'MIG', description: 'Issued when a student migrates to a board outside the state.' },
  { value: 'conduct', label: 'Conduct Certificate', shortLabel: 'Conduct', numberPrefix: 'CONDUCT', description: 'Certifies good conduct of the student.' },
  { value: 'other', label: 'Other / Custom Certificate', shortLabel: 'Certificate', numberPrefix: 'CERT', description: 'Any other certificate (medical, income, community, etc.).' },
]

export function certificateTypeDef(value: string): CertificateTypeDef {
  return CERTIFICATE_TYPES.find((t) => t.value === value) || CERTIFICATE_TYPES[CERTIFICATE_TYPES.length - 1]
}

export const CERTIFICATE_TYPE_VALUES = CERTIFICATE_TYPES.map((t) => t.value)

// ── Placeholder tokens ──

export interface PlaceholderDef {
  token: string
  label: string
}

export const CERTIFICATE_PLACEHOLDERS: PlaceholderDef[] = [
  { token: '{{student_name}}', label: 'Student full name' },
  { token: '{{student_first_name}}', label: 'Student first name' },
  { token: '{{student_last_name}}', label: 'Student last name' },
  { token: '{{admission_number}}', label: 'Admission number' },
  { token: '{{roll_number}}', label: 'Roll number' },
  { token: '{{class_name}}', label: 'Class' },
  { token: '{{class_name_words}}', label: 'Class in words' },
  { token: '{{section_name}}', label: 'Section' },
  { token: '{{academic_year}}', label: 'Academic year' },
  { token: '{{date_of_birth}}', label: 'Date of birth' },
  { token: '{{date_of_birth_words}}', label: 'Date of birth in words' },
  { token: '{{gender}}', label: 'Gender' },
  { token: '{{nationality}}', label: 'Nationality' },
  { token: '{{religion}}', label: 'Religion' },
  { token: '{{category}}', label: 'Category / Caste' },
  { token: '{{mother_tongue}}', label: 'Mother tongue' },
  { token: '{{blood_group}}', label: 'Blood group' },
  { token: '{{address}}', label: 'Student address' },
  { token: '{{city}}', label: 'City' },
  { token: '{{state}}', label: 'State' },
  { token: '{{pincode}}', label: 'Pincode' },
  { token: '{{date_of_admission}}', label: 'Date of admission' },
  { token: '{{admission_class}}', label: 'Class admitted in' },
  { token: '{{previous_school}}', label: 'Previous school' },
  { token: '{{previous_class}}', label: 'Previous class' },
  { token: '{{father_name}}', label: 'Father name' },
  { token: '{{mother_name}}', label: 'Mother name' },
  { token: '{{parent_phone}}', label: 'Parent phone' },
  { token: '{{student_pen}}', label: 'Student PEN number' },
  { token: '{{apaar_id}}', label: 'Student APAAR ID' },
  { token: '{{exam_result_status}}', label: 'Annual exam result status' },
  { token: '{{failed_status}}', label: 'Whether failed once/twice' },
  { token: '{{subjects_studied}}', label: 'Subjects studied' },
  { token: '{{promotion_status}}', label: 'Qualified for promotion status' },
  { token: '{{dues_paid}}', label: 'School dues paid status' },
  { token: '{{working_days}}', label: 'Total working days' },
  { token: '{{present_days}}', label: 'Total present days' },
  { token: '{{attendance_ratio}}', label: 'Working days / Present days' },
  { token: '{{ncc_scout}}', label: 'NCC Cadet / Scout Guide' },
  { token: '{{application_date}}', label: 'Date of application' },
  { token: '{{conduct}}', label: 'General conduct' },
  { token: '{{school_name}}', label: 'School name' },
  { token: '{{school_address}}', label: 'School address' },
  { token: '{{school_phone}}', label: 'School phone' },
  { token: '{{school_email}}', label: 'School email' },
  { token: '{{school_website}}', label: 'School website' },
  { token: '{{school_board}}', label: 'School board' },
  { token: '{{school_registration_number}}', label: 'School registration number' },
  { token: '{{school_affiliation_number}}', label: 'School affiliation number' },
  { token: '{{school_udise_number}}', label: 'School UDISE number' },
  { token: '{{principal_name}}', label: 'Principal name' },
  { token: '{{trust_name}}', label: 'Trust / society name' },
  { token: '{{certificate_number}}', label: 'Certificate number' },
  { token: '{{issue_date}}', label: 'Issue date' },
  { token: '{{effective_date}}', label: 'Effective / leaving date' },
  { token: '{{purpose}}', label: 'Purpose / reason for leaving' },
  { token: '{{reason_for_leaving}}', label: 'Reason for leaving' },
  { token: '{{remarks}}', label: 'Remarks' },
]

// ── Snapshot shape ──

export interface CertificateSnapshot {
  issuedAt: string
  student: {
    id: string
    firstName: string
    lastName: string | null
    fullName: string
    admissionNumber: string | null
    rollNumber: string | null
    className: string
    sectionName: string
    academicYear: string
    dateOfBirth: string
    gender: string
    nationality: string
    religion: string
    category: string
    motherTongue: string
    bloodGroup: string
    address: string
    city: string
    state: string
    pincode: string
    dateOfAdmission: string
    previousSchool: string
    previousClass: string
    fatherName: string
    motherName: string
    parentPhone: string
    penNumber?: string | null
    apaarId?: string | null
    admissionClass?: string | null
    subjectsStudied?: string | null
    workingDays?: string | null
    presentDays?: string | null
  }
  school: {
    id: string
    name: string
    logo?: string | null
    printHeader?: string | null
    address: string
    city: string
    state: string
    pincode: string
    phone: string
    email: string
    website: string
    board: string
    registrationNumber: string
    affiliationNumber: string
    udiseNumber: string
    principalName: string
    principalSignature?: string | null
    trustName: string
    academicYear: string
  }
}

export function numberToWords(num: number): string {
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ]
  const tens = [
    '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  ]

  if (num === 0) return 'zero'
  if (num < 20) return ones[num]
  if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 !== 0 ? ' ' + ones[num % 10] : ''}`
  if (num < 1000) {
    const rem = num % 100
    return `${ones[Math.floor(num / 100)]} hundred${rem ? ' ' + numberToWords(rem) : ''}`
  }
  if (num < 100000) {
    const rem = num % 1000
    return `${numberToWords(Math.floor(num / 1000))} thousand${rem ? ' ' + numberToWords(rem) : ''}`
  }
  return String(num)
}

export function formatDateInWords(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''

  const dayNames = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty',
    'Twenty one', 'Twenty two', 'Twenty three', 'Twenty four', 'Twenty five', 'Twenty six', 'Twenty seven', 'Twenty eight', 'Twenty nine', 'Thirty', 'Thirty one',
  ]
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  const day = date.getDate()
  const month = date.getMonth()
  const year = date.getFullYear()

  const dayWord = dayNames[day] || String(day)
  const monthWord = monthNames[month] || ''

  let yearWord = ''
  if (year >= 2000 && year < 2100) {
    const rem = year - 2000
    yearWord = rem === 0 ? 'two thousand' : `two thousand ${numberToWords(rem)}`
  } else if (year >= 1900 && year < 2000) {
    const rem = year - 1900
    yearWord = `nineteen ${numberToWords(rem)}`
  } else {
    yearWord = numberToWords(year)
  }

  return `${dayWord} ${monthWord} ${yearWord}`
}

export function formatClassInWords(className: string | null | undefined): string {
  if (!className) return ''
  const clean = className.trim()
  if (/\(.*\)/.test(clean)) return clean

  const map: Record<string, string> = {
    '1': 'I (One)',
    'class 1': 'I (One)',
    'i': 'I (One)',
    '2': 'II (Two)',
    'class 2': 'II (Two)',
    'ii': 'II (Two)',
    '3': 'III (Three)',
    'class 3': 'III (Three)',
    'iii': 'III (Three)',
    '4': 'IV (Four)',
    'class 4': 'IV (Four)',
    'iv': 'IV (Four)',
    '5': 'V (Five)',
    'class 5': 'V (Five)',
    'v': 'V (Five)',
    '6': 'VI (Six)',
    'class 6': 'VI (Six)',
    'vi': 'VI (Six)',
    '7': 'VII (Seven)',
    'class 7': 'VII (Seven)',
    'vii': 'VII (Seven)',
    '8': 'VIII (Eight)',
    'class 8': 'VIII (Eight)',
    'viii': 'VIII (Eight)',
    '9': 'IX (Nine)',
    'class 9': 'IX (Nine)',
    'ix': 'IX (Nine)',
    '10': 'X (Ten)',
    'class 10': 'X (Ten)',
    'x': 'X (Ten)',
    '11': 'XI (Eleven)',
    'class 11': 'XI (Eleven)',
    'xi': 'XI (Eleven)',
    '12': 'XII (Twelve)',
    'class 12': 'XII (Twelve)',
    'xii': 'XII (Twelve)',
  }

  const lookup = clean.toLowerCase()
  return map[lookup] || clean
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Build the flat token map used to replace {{placeholders}} in a template body.
export function buildPlaceholderMap(
  snapshot: CertificateSnapshot,
  extras: { certificateNumber: string; issueDate: Date; effectiveDate?: Date | null; purpose?: string | null; remarks?: string | null },
): Record<string, string> {
  const s = snapshot.student
  const sch = snapshot.school
  const classWords = formatClassInWords(s.className) || s.className || ''
  const admClassWords = formatClassInWords(s.admissionClass || s.previousClass || s.className) || s.admissionClass || s.className || ''
  const dobWords = formatDateInWords(s.dateOfBirth)
  const appDate = fmtDate(extras.effectiveDate || extras.issueDate)
  const issueDateFormatted = fmtDate(extras.issueDate)
  const reason = extras.purpose || 'Due to change of residence.'

  return {
    student_name: s.fullName,
    student_first_name: s.firstName,
    student_last_name: s.lastName || '',
    admission_number: s.admissionNumber || '',
    roll_number: s.rollNumber || '',
    class_name: classWords || s.className,
    class_name_words: classWords,
    section_name: s.sectionName,
    academic_year: s.academicYear || sch.academicYear,
    date_of_birth: s.dateOfBirth,
    date_of_birth_words: dobWords,
    gender: s.gender,
    nationality: s.nationality || 'Indian',
    religion: s.religion || '',
    category: s.category || '',
    mother_tongue: s.motherTongue || '',
    blood_group: s.bloodGroup || '',
    address: s.address,
    city: s.city,
    state: s.state,
    pincode: s.pincode,
    date_of_admission: s.dateOfAdmission,
    admission_class: admClassWords,
    previous_school: s.previousSchool,
    previous_class: s.previousClass,
    father_name: s.fatherName,
    mother_name: s.motherName,
    parent_phone: s.parentPhone,
    student_pen: s.penNumber || '—',
    apaar_id: s.apaarId || '—',
    exam_result_status: `${classWords} Passed`.trim(),
    failed_status: 'No',
    subjects_studied: s.subjectsStudied || 'English, Hindi, Maths, Science, Social, G.K., Moral and Computer.',
    promotion_status: 'Yes',
    dues_paid: 'Yes',
    working_days: s.workingDays || '222',
    present_days: s.presentDays || '183',
    attendance_ratio: `${s.workingDays || '222'}/${s.presentDays || '183'}`,
    ncc_scout: 'None',
    application_date: appDate,
    conduct: 'Good',
    school_name: sch.name,
    school_address: [sch.address, sch.city, sch.state, sch.pincode].filter(Boolean).join(', '),
    school_phone: sch.phone,
    school_email: sch.email,
    school_website: sch.website,
    school_board: sch.board,
    school_registration_number: sch.registrationNumber,
    school_affiliation_number: sch.affiliationNumber,
    school_udise_number: sch.udiseNumber,
    principal_name: sch.principalName,
    trust_name: sch.trustName,
    certificate_number: extras.certificateNumber,
    issue_date: issueDateFormatted,
    effective_date: fmtDate(extras.effectiveDate),
    purpose: reason,
    reason_for_leaving: reason,
    remarks: extras.remarks || '',
  }
}

// Replace {{tokens}} in the template body with HTML-escaped values so a
// student name containing markup can never inject into the printed page.
export function renderCertificateBody(
  bodyHtml: string,
  snapshot: CertificateSnapshot,
  extras: { certificateNumber: string; issueDate: Date; effectiveDate?: Date | null; purpose?: string | null; remarks?: string | null },
): string {
  const map = buildPlaceholderMap(snapshot, extras)
  return bodyHtml.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, key: string) => {
    const value = map[key]
    return value === undefined ? match : escapeHtml(value)
  })
}

// ── Default template bodies per type ──

const DEFAULT_BODY_TC = `<div style="font-family: inherit; color: #1e293b; font-size: 11px; line-height: 1.5;">
  <!-- Metadata Box -->
  <div style="border: 1.5px solid #0a4d8c; border-radius: 6px; padding: 6px 12px; margin-bottom: 8px; background: rgba(240, 249, 255, 0.4);">
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <tr>
        <td style="padding: 2px 0;"><strong>Student's PEN:</strong> {{student_pen}}</td>
        <td style="padding: 2px 0; text-align: right;"><strong>APAAR ID:</strong> {{apaar_id}}</td>
      </tr>
      <tr>
        <td style="padding: 2px 0;"><strong>TC No.</strong> {{certificate_number}}</td>
        <td style="padding: 2px 0; text-align: right;"><strong>Admission No.</strong> {{admission_number}}</td>
      </tr>
    </table>
  </div>

  <!-- 21 Dynamic Numbered Items -->
  <div style="border: 1.5px solid #0a4d8c; border-radius: 6px; padding: 8px 12px; background: #ffffff;">
    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
      <tbody>
        <tr>
          <td style="width: 24px; vertical-align: top; padding: 3px 0;">1.</td>
          <td style="width: 320px; vertical-align: top; padding: 3px 0;">Name of Pupil in full (In block letters)</td>
          <td style="width: 16px; vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0; font-weight: bold; text-transform: uppercase;">{{student_name}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">2.</td>
          <td style="vertical-align: top; padding: 3px 0;">Father's name</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{father_name}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">3.</td>
          <td style="vertical-align: top; padding: 3px 0;">Mother's name</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{mother_name}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">4.</td>
          <td style="vertical-align: top; padding: 3px 0;">Gender</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{gender}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">5.</td>
          <td style="vertical-align: top; padding: 3px 0;">Nationality</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{nationality}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">6.</td>
          <td style="vertical-align: top; padding: 3px 0;">Whether the pupil belongs to (Schedule Caste/Tribe/OBC)</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{category}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">7.</td>
          <td style="vertical-align: top; padding: 3px 0;">Date of Birth (According to the Admission Register (In Figure: __))</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">
            <div>{{date_of_birth}}</div>
            <div style="font-style: italic; color: #475569; margin-top: 2px;">{{date_of_birth_words}}</div>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">8.</td>
          <td style="vertical-align: top; padding: 3px 0;">Date of First admission in the school</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{date_of_admission}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">9.</td>
          <td style="vertical-align: top; padding: 3px 0;">Admission was sought in class</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{admission_class}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">10.</td>
          <td style="vertical-align: top; padding: 3px 0;">Class in which the pupil last studied (In Figure)</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{class_name}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">11.</td>
          <td style="vertical-align: top; padding: 3px 0;">School Annual Examination last taken with result</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{exam_result_status}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">12.</td>
          <td style="vertical-align: top; padding: 3px 0;">Whether failed, if so once/twice in the same class</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{failed_status}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">13.</td>
          <td style="vertical-align: top; padding: 3px 0;">Subject studied</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0; font-style: italic;">{{subjects_studied}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">14.</td>
          <td style="vertical-align: top; padding: 3px 0;">Whether qualified for promotion to the higher class</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{promotion_status}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">15.</td>
          <td style="vertical-align: top; padding: 3px 0;">Whether the pupil has paid all dues to the school</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{dues_paid}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">16.</td>
          <td style="vertical-align: top; padding: 3px 0;">Total No. of Working days/Present days</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{attendance_ratio}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">17.</td>
          <td style="vertical-align: top; padding: 3px 0;">Whether NCC Cadet/Boy Scout/Girl Guide</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{ncc_scout}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">18.</td>
          <td style="vertical-align: top; padding: 3px 0;">Date of Application for certificate</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{application_date}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">19.</td>
          <td style="vertical-align: top; padding: 3px 0;">Date of Issue of Certificate</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{issue_date}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">20.</td>
          <td style="vertical-align: top; padding: 3px 0;">General Conduct</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{conduct}}</td>
        </tr>
        <tr>
          <td style="vertical-align: top; padding: 3px 0;">21.</td>
          <td style="vertical-align: top; padding: 3px 0;">Reasons for leaving the school</td>
          <td style="vertical-align: top; padding: 3px 0; text-align: center;">:</td>
          <td style="border-bottom: 1px dotted #cbd5e1; padding: 3px 0;">{{purpose}}</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`

const DEFAULT_BODY_TC_TEMP = DEFAULT_BODY_TC

const DEFAULT_BODY_BONAFIDE = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">BONAFIDE CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, is a bonafide student of <strong>{{school_name}}</strong> studying in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is being issued for the purpose of <strong>{{purpose}}</strong>.</p>`

const DEFAULT_BODY_CHARACTER = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">CHARACTER CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, was / is a student of <strong>{{school_name}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">To the best of our knowledge his/her character and conduct during his/her stay in the school have been <strong>good</strong>. We wish him/her all success in his/her future endeavours.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is being issued for the purpose of <strong>{{purpose}}</strong>.</p>`

const DEFAULT_BODY_STUDY = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">STUDY CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, studied at <strong>{{school_name}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">His/Her date of admission to the school was <strong>{{date_of_admission}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is being issued for the purpose of <strong>{{purpose}}</strong>.</p>`

const DEFAULT_BODY_SCHOOL_LEAVING = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">SCHOOL LEAVING CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, was a bonafide student of <strong>{{school_name}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">He/She left the school with effect from <strong>{{effective_date}}</strong>. To the best of our knowledge his/her character and conduct have been good.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is being issued for the purpose of <strong>{{purpose}}</strong>.</p>`

const DEFAULT_BODY_MIGRATION = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">MIGRATION CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, was a bonafide student of <strong>{{school_name}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">He/She left the school with effect from <strong>{{effective_date}}</strong> and is hereby granted this Migration Certificate to enable him/her to pursue studies in another institution / board.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is being issued for the purpose of <strong>{{purpose}}</strong>.</p>`

const DEFAULT_BODY_CONDUCT = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">CONDUCT CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, was a student of <strong>{{school_name}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">His/Her conduct and behaviour have been found to be <strong>satisfactory</strong> throughout his/her stay in the school.</p>`

const DEFAULT_BODY_OTHER = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, is a student of <strong>{{school_name}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is being issued for the purpose of <strong>{{purpose}}</strong>.</p>`

export function defaultBodyForType(type: string, isTemporary: boolean): string {
  if (type === 'tc' && isTemporary) return DEFAULT_BODY_TC_TEMP
  switch (type) {
    case 'tc': return DEFAULT_BODY_TC
    case 'bonafide': return DEFAULT_BODY_BONAFIDE
    case 'character': return DEFAULT_BODY_CHARACTER
    case 'study': return DEFAULT_BODY_STUDY
    case 'school_leaving': return DEFAULT_BODY_SCHOOL_LEAVING
    case 'migration': return DEFAULT_BODY_MIGRATION
    case 'conduct': return DEFAULT_BODY_CONDUCT
    default: return DEFAULT_BODY_OTHER
  }
}

// ── Certificate number allocation ──
// Atomic per-school sequence via NumberCounter (kind 'certificate', keyed by
// calendar year so each year restarts at 0001). MUST run inside $transaction.

type Tx = Prisma.TransactionClient

export async function allocateCertificateNumber(tx: Tx, schoolId: string, prefix: string): Promise<string> {
  const numbers = await allocateCertificateNumbers(tx, schoolId, prefix, 1)
  return numbers[0]
}

/**
 * Atomic per-school sequence allocation for a batch of certificates. Allocates
 * `count` consecutive numbers in a single NumberCounter update so a bulk issue
 * never double-allocates. MUST run inside $transaction.
 */
export async function allocateCertificateNumbers(tx: Tx, schoolId: string, prefix: string, count: number): Promise<string[]> {
  if (count < 1) return []
  const year = new Date().getFullYear()
  const kind = 'certificate'
  const key = { schoolId_kind_year: { schoolId, kind, year } }

  const formatNumber = (seq: number) => `${prefix}-${year}-${String(seq).padStart(4, '0')}`
  const range = (start: number) => Array.from({ length: count }, (_, i) => formatNumber(start + i))

  try {
    const updated = await tx.numberCounter.update({
      where: key,
      data: { lastValue: { increment: count } },
      select: { lastValue: true },
    })
    return range(updated.lastValue - count + 1)
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2025') throw err
  }

  // Seed path — count existing certificates so the series continues from
  // where it stopped for schools that already have records.
  const existingCount = await tx.certificate.count({ where: { schoolId, deletedAt: null } })
  const seedValue = existingCount + count
  try {
    await tx.numberCounter.create({ data: { schoolId, kind, year, lastValue: seedValue } })
    return range(existingCount + 1)
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err
    const updated = await tx.numberCounter.update({
      where: key,
      data: { lastValue: { increment: count } },
      select: { lastValue: true },
    })
    return range(updated.lastValue - count + 1)
  }
}