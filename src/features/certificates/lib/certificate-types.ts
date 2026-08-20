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
  { token: '{{section_name}}', label: 'Section' },
  { token: '{{academic_year}}', label: 'Academic year' },
  { token: '{{date_of_birth}}', label: 'Date of birth' },
  { token: '{{gender}}', label: 'Gender' },
  { token: '{{nationality}}', label: 'Nationality' },
  { token: '{{religion}}', label: 'Religion' },
  { token: '{{category}}', label: 'Category' },
  { token: '{{mother_tongue}}', label: 'Mother tongue' },
  { token: '{{blood_group}}', label: 'Blood group' },
  { token: '{{address}}', label: 'Student address' },
  { token: '{{city}}', label: 'City' },
  { token: '{{state}}', label: 'State' },
  { token: '{{pincode}}', label: 'Pincode' },
  { token: '{{date_of_admission}}', label: 'Date of admission' },
  { token: '{{previous_school}}', label: 'Previous school' },
  { token: '{{previous_class}}', label: 'Previous class' },
  { token: '{{father_name}}', label: 'Father name' },
  { token: '{{mother_name}}', label: 'Mother name' },
  { token: '{{parent_phone}}', label: 'Parent phone' },
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
  { token: '{{purpose}}', label: 'Purpose of certificate' },
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
  }
  school: {
    id: string
    name: string
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
    trustName: string
    academicYear: string
  }
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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
  return {
    student_name: s.fullName,
    student_first_name: s.firstName,
    student_last_name: s.lastName || '',
    admission_number: s.admissionNumber || '',
    roll_number: s.rollNumber || '',
    class_name: s.className,
    section_name: s.sectionName,
    academic_year: s.academicYear || sch.academicYear,
    date_of_birth: s.dateOfBirth,
    gender: s.gender,
    nationality: s.nationality,
    religion: s.religion,
    category: s.category,
    mother_tongue: s.motherTongue,
    blood_group: s.bloodGroup,
    address: s.address,
    city: s.city,
    state: s.state,
    pincode: s.pincode,
    date_of_admission: s.dateOfAdmission,
    previous_school: s.previousSchool,
    previous_class: s.previousClass,
    father_name: s.fatherName,
    mother_name: s.motherName,
    parent_phone: s.parentPhone,
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
    issue_date: fmtDate(extras.issueDate),
    effective_date: fmtDate(extras.effectiveDate),
    purpose: extras.purpose || '',
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

const DEFAULT_BODY_TC = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">TRANSFER CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, {{gender}}, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, was a bonafide student of <strong>{{school_name}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">His/Her date of birth as per school records is <strong>{{date_of_birth}}</strong>. He/She bears a good moral character and there is nothing against his/her conduct in the school.</p>
<p style="margin:0 0 8px 0;text-align:justify;"><strong>Reason for leaving:</strong> {{purpose}}</p>
<p style="margin:0 0 8px 0;text-align:justify;">This certificate is issued as per the request of the parent/guardian. All school dues, if any, have been settled / will be settled as per school policy.</p>`

const DEFAULT_BODY_TC_TEMP = `<p style="margin:0 0 10px 0;text-align:center;font-size:15px;font-weight:bold;letter-spacing:1px;">TEMPORARY TRANSFER CERTIFICATE</p>
<p style="margin:0 0 8px 0;">Certificate No. : <strong>{{certificate_number}}</strong> &nbsp;&nbsp;&nbsp; Date of Issue : <strong>{{issue_date}}</strong></p>
<p style="margin:0 0 8px 0;text-align:justify;">This is to certify that <strong>{{student_name}}</strong>, {{gender}}, S/D of <strong>{{father_name}}</strong> and <strong>{{mother_name}}</strong>, is a bonafide student of <strong>{{school_name}}</strong>, bearing Admission No. <strong>{{admission_number}}</strong> in Class <strong>{{class_name}}</strong>{{section_name}} during the academic year <strong>{{academic_year}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;">His/Her date of birth as per school records is <strong>{{date_of_birth}}</strong>. He/She bears a good moral character and there is nothing against his/her conduct in the school.</p>
<p style="margin:0 0 8px 0;text-align:justify;">This Temporary TC is issued for the purpose of <strong>{{purpose}}</strong>.</p>
<p style="margin:0 0 8px 0;text-align:justify;"><strong>Note:</strong> This is a temporary certificate. The student continues to remain on the rolls of the school and this certificate does not terminate or affect the student's enrollment, attendance, fees or any other record of the school in any manner.</p>`

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