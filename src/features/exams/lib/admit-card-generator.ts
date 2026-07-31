/**
 * Pure admit-card (hall ticket) builder. Takes the inputs an API/print page has
 * already loaded (school, student, exam, the student's datesheet rows, a signed
 * QR token) and produces a flat renderable JSON shape that
 * `admit-card-renderer.tsx` consumes. No DB calls, no I/O — deterministic for
 * snapshot testing.
 *
 * Mirrors the report-card-generator split: this file decides *what* to show;
 * the renderer decides *how* it looks.
 */

// ---------- Inputs ----------

export interface AdmitCardSchoolDef {
  name: string
  logo: string | null
  printHeader: string | null
  address: string
  phone: string | null
  email: string | null
  website: string | null
  affiliationNumber: string | null
  udiseNumber: string | null
  principalSignature: string | null
  academicYear: string
  board: string | null
  registrationNumber: string | null
  establishedYear: string | null
  trustName: string | null
  principalName: string | null
}

export interface AdmitCardStudentDef {
  id: string
  firstName: string
  lastName: string | null
  admissionNumber: string | null
  rollNumber: string | null
  dateOfBirth: Date | null
  gender: string | null
  className: string | null
  sectionName: string | null
  fatherName: string | null
  motherName: string | null
  profileImage: string | null
}

export interface AdmitCardExamDef {
  id: string
  name: string
  examGroupName: string | null
  paradigmName: string | null
  academicYear: string
  startDate: Date | null
  endDate: Date | null
}

export interface AdmitCardScheduleRowDef {
  subjectName: string
  examDate: Date
  startTime: string // "10:00"
  endTime: string // "13:00"
  roomNumber: string | null
  durationMinutes: number | null
}

export interface BuildAdmitCardInput {
  school: AdmitCardSchoolDef
  student: AdmitCardStudentDef
  exam: AdmitCardExamDef
  schedule: ReadonlyArray<AdmitCardScheduleRowDef>
  qrPayload: string
  instructions?: ReadonlyArray<string>
}

// ---------- Output shape ----------

export interface AdmitCardData {
  title: string
  school: {
    name: string
    logo: string | null
    printHeader: string | null
    address: string
    contact: string | null // "Ph: ... · email · website" collapsed
    affiliationNumber: string | null
    udiseNumber: string | null
    principalSignature: string | null
    board: string | null
    registrationNumber: string | null
    establishedYear: string | null
    trustName: string | null
    principalName: string | null
  }
  examMeta: {
    name: string
    group: string | null
    paradigm: string | null
    academicYear: string
    dateRange: string | null // "01 Mar 2026 – 15 Mar 2026"
  }
  student: {
    fullName: string
    admissionNumber: string
    rollNumber: string
    className: string
    sectionName: string
    fatherName: string
    motherName: string
    dateOfBirth: string
    gender: string
    profileImage: string | null
  }
  datesheet: ReadonlyArray<{
    subjectName: string
    date: string // "05 Mar 2026 (Thu)"
    dateShort: string // "05 Mar 2026"
    day: string // "Thursday"
    time: string // "10:00 – 13:00"
    room: string
    duration: string // "3h" / "90m"
  }>
  instructions: ReadonlyArray<string>
  qrPayload: string
}

// ---------- Defaults ----------

const DASH = '—'

export const DEFAULT_ADMIT_CARD_INSTRUCTIONS: ReadonlyArray<string> = [
  'Carry this admit card to every examination. No candidate is allowed into the hall without it.',
  'Reach the examination centre at least 30 minutes before the reporting time.',
  'Electronic devices, study material, and unfair means of any kind are strictly prohibited.',
  'Verify your name, roll number, and subjects below; report any discrepancy to the school office.',
]

// ---------- Helpers ----------

function fullName(first: string, last: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim()
}

function formatDate(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return DASH
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateWithDay(d: Date): string {
  if (Number.isNaN(d.getTime())) return DASH
  const base = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  return `${base} (${day})`
}

function formatWeekday(d: Date): string {
  if (Number.isNaN(d.getTime())) return DASH
  return d.toLocaleDateString('en-GB', { weekday: 'long' })
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return DASH
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function collapseContact(school: AdmitCardSchoolDef): string | null {
  const parts = [
    school.phone ? `Ph: ${school.phone}` : null,
    school.email,
    school.website,
  ].filter((p): p is string => Boolean(p))
  return parts.length > 0 ? parts.join(' · ') : null
}

// `startTime`/`endTime` are "HH:MM" strings; sort numerically so 09:00 < 10:00.
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10))
  if (Number.isNaN(h)) return 0
  return h * 60 + (Number.isNaN(m) ? 0 : m)
}

export function buildAdmitCard(input: BuildAdmitCardInput): AdmitCardData {
  const { school, student, exam, schedule, qrPayload } = input

  const dateRange =
    exam.startDate && exam.endDate
      ? exam.startDate.getTime() === exam.endDate.getTime()
        ? formatDate(exam.startDate)
        : `${formatDate(exam.startDate)} – ${formatDate(exam.endDate)}`
      : exam.startDate
        ? formatDate(exam.startDate)
        : null

  const datesheet = [...schedule]
    .sort((a, b) => {
      const byDate = a.examDate.getTime() - b.examDate.getTime()
      if (byDate !== 0) return byDate
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    })
    .map((row) => ({
      subjectName: row.subjectName,
      date: formatDateWithDay(row.examDate),
      dateShort: formatDate(row.examDate),
      day: formatWeekday(row.examDate),
      time: `${row.startTime} – ${row.endTime}`,
      room: row.roomNumber || DASH,
      duration: formatDuration(row.durationMinutes),
    }))

  return {
    title: 'ADMIT CARD',
    school: {
      name: school.name,
      logo: school.logo,
      printHeader: school.printHeader,
      address: school.address || '',
      contact: collapseContact(school),
      affiliationNumber: school.affiliationNumber,
      udiseNumber: school.udiseNumber,
      principalSignature: school.principalSignature,
      board: school.board,
      registrationNumber: school.registrationNumber,
      establishedYear: school.establishedYear,
      trustName: school.trustName,
      principalName: school.principalName,
    },
    examMeta: {
      name: exam.name,
      group: exam.examGroupName,
      paradigm: exam.paradigmName,
      academicYear: exam.academicYear || school.academicYear,
      dateRange,
    },
    student: {
      fullName: fullName(student.firstName, student.lastName),
      admissionNumber: student.admissionNumber || DASH,
      rollNumber: student.rollNumber || DASH,
      className: student.className || DASH,
      sectionName: student.sectionName || DASH,
      fatherName: student.fatherName || DASH,
      motherName: student.motherName || DASH,
      dateOfBirth: formatDate(student.dateOfBirth),
      gender: student.gender || DASH,
      profileImage: student.profileImage,
    },
    datesheet,
    instructions:
      input.instructions && input.instructions.length > 0
        ? input.instructions
        : DEFAULT_ADMIT_CARD_INSTRUCTIONS,
    qrPayload,
  }
}
