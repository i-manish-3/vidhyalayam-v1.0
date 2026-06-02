/**
 * Pure report-card builder. Takes the inputs an API/print page has already
 * loaded (template, result row + subject summaries, student, school) and
 * produces a flat renderable JSON shape that `report-card-renderer.tsx`
 * consumes. No DB calls, no I/O — deterministic for snapshot testing.
 *
 * Two layouts of result are supported:
 *  - `exam` — one ExamResult + its ResultSubjectSummary rows (single-exam card)
 *  - `final` — one FinalResult + an array of per-group/per-exam summaries
 *    (annual paradigm-level card)
 *
 * Template layout JSON drives which sections render — we DON'T encode every
 * visual decision here. The component reads booleans/strings off the shape
 * and decides what to show.
 */

// ---------- Template layout shape ----------

export interface TemplateLayout {
  header: {
    showLogo: boolean
    showAddress: boolean
    showAffiliation?: boolean
    title?: string // override the default "Report Card"
  }
  studentBlock: ReadonlyArray<StudentFieldKey>
  subjectTable: {
    showComponents: boolean
    showGrade: boolean
    showRank: boolean
    showMaxMarks?: boolean
    showPercentage?: boolean
  }
  footer: {
    showAttendance: boolean
    showRemarks: boolean
    signatures: ReadonlyArray<string> // ['Class Teacher', 'Principal']
  }
}

export type StudentFieldKey =
  | 'name'
  | 'admissionNumber'
  | 'rollNumber'
  | 'class'
  | 'section'
  | 'fatherName'
  | 'motherName'
  | 'dateOfBirth'
  | 'gender'
  | 'academicYear'
  | 'admissionDate'
  | 'parentPhone'

const DEFAULT_STUDENT_BLOCK: ReadonlyArray<StudentFieldKey> = [
  'name',
  'admissionNumber',
  'rollNumber',
  'class',
  'section',
  'fatherName',
  'motherName',
]

const DEFAULT_LAYOUT: TemplateLayout = {
  header: { showLogo: true, showAddress: true },
  studentBlock: DEFAULT_STUDENT_BLOCK,
  subjectTable: { showComponents: true, showGrade: true, showRank: false, showMaxMarks: true, showPercentage: true },
  footer: { showAttendance: true, showRemarks: true, signatures: ['Class Teacher', 'Principal'] },
}

/**
 * Parse the template's layoutJson. Falls back to a sane default if the row
 * is malformed (defensive — admin UI may produce partial JSON during edits).
 */
export function parseTemplateLayout(json: string | null | undefined): TemplateLayout {
  if (!json) return DEFAULT_LAYOUT
  try {
    const parsed = JSON.parse(json) as Partial<TemplateLayout>
    return {
      header: {
        showLogo: parsed.header?.showLogo ?? true,
        showAddress: parsed.header?.showAddress ?? true,
        showAffiliation: parsed.header?.showAffiliation ?? false,
        title: parsed.header?.title ?? undefined,
      },
      studentBlock: Array.isArray(parsed.studentBlock) && parsed.studentBlock.length > 0
        ? (parsed.studentBlock as StudentFieldKey[])
        : DEFAULT_STUDENT_BLOCK,
      subjectTable: {
        showComponents: parsed.subjectTable?.showComponents ?? true,
        showGrade: parsed.subjectTable?.showGrade ?? true,
        showRank: parsed.subjectTable?.showRank ?? false,
        showMaxMarks: parsed.subjectTable?.showMaxMarks ?? true,
        showPercentage: parsed.subjectTable?.showPercentage ?? true,
      },
      footer: {
        showAttendance: parsed.footer?.showAttendance ?? true,
        showRemarks: parsed.footer?.showRemarks ?? true,
        signatures: Array.isArray(parsed.footer?.signatures) && parsed.footer.signatures.length > 0
          ? (parsed.footer.signatures as string[])
          : ['Class Teacher', 'Principal'],
      },
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

// ---------- Inputs ----------

export interface TemplateDef {
  id: string
  name: string
  format: string // cbse | simple | coaching | term_wise | grade_only
  layoutJson: string
  includeAttendance: boolean
  includeRank: boolean
  includeCoScholastic: boolean
  showPrincipalRemarks: boolean
  showTeacherRemarks: boolean
}

export interface SchoolDef {
  name: string
  logo: string | null
  address: string
  phone: string | null
  email: string | null
  website: string | null
  affiliationNumber: string | null
  registrationNumber: string | null
  udiseNumber: string | null
  principalSignature: string | null
  academicYear: string
}

export interface StudentDef {
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
  parentPhone: string | null
  admissionDate: Date | null
  // Phase 6: surface lifecycle context on the card. Caller passes a withdrawal
  // record when one exists for the student's academic year; renderer shows a
  // "Withdrawn on DD/MM/YYYY" banner so a printed historical card is unambiguous.
  withdrawal?: { effectiveDate: Date; reason: string } | null
  // Caller sets this when admissionDate > exam.startDate so the renderer can
  // flag joiners whose result row legitimately has NA components.
  joinedMidSession?: boolean
}

export interface SubjectSummaryDef {
  subjectId: string
  subjectName: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  gradePoint: number | null
  status: string // pass | fail | absent | not_applicable
  componentsJson: string | null // JSON: {compName: {obtained, max}}
}

export interface ExamResultDef {
  examId: string
  examName: string
  examGroupName: string | null
  paradigmName: string | null
  academicYear: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  gradePoint: number | null
  rankInClass: number | null
  rankInSection: number | null
  status: string // pass | fail | absent | partial
  failedSubjects: string | null // JSON array
  publishedAt: Date | null
  subjectSummaries: ReadonlyArray<SubjectSummaryDef>
}

export interface FinalResultDef {
  paradigmId: string
  paradigmName: string
  academicYear: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  rankInClass: number | null
  rankInSection: number | null
  attendancePct: number | null
  promotionStatus: string
  remarks: string | null
  publishedAt: Date | null
}

export interface AttendanceSnapshot {
  totalDays: number
  presentDays: number
  percentage: number
}

// ---------- Output shape ----------

export interface ReportCardComponentBreakdown {
  name: string
  obtained: number
  max: number
}

export interface ReportCardSubjectRow {
  subjectId: string
  subjectName: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  gradePoint: number | null
  status: string
  components: ReadonlyArray<ReportCardComponentBreakdown>
}

export interface ReportCardStudentField {
  key: StudentFieldKey
  label: string
  value: string
}

export interface ReportCardLifecycle {
  withdrawnOn: string | null
  withdrawalReason: string | null
  joinedMidSession: boolean
}

export interface ReportCardData {
  kind: 'exam' | 'final'
  title: string
  lifecycle: ReportCardLifecycle
  school: {
    name: string
    logo: string | null
    address: string
    affiliation: string | null
    registration: string | null
    udise: string | null
    academicYear: string
    principalSignature: string | null
  }
  examMeta: {
    name: string
    paradigm: string | null
    group: string | null
    academicYear: string
  }
  studentFields: ReadonlyArray<ReportCardStudentField>
  subjects: ReadonlyArray<ReportCardSubjectRow>
  totals: {
    totalMarks: number
    obtainedMarks: number
    percentage: number
    grade: string | null
    gradePoint: number | null
    status: string
    rankInClass: number | null
    rankInSection: number | null
  }
  attendance: AttendanceSnapshot | null
  promotion: { status: string; remarks: string | null } | null
  signatures: ReadonlyArray<string>
  options: {
    showComponents: boolean
    showGrade: boolean
    showRank: boolean
    showMaxMarks: boolean
    showPercentage: boolean
    showAttendance: boolean
    showRemarks: boolean
    showLogo: boolean
    showAddress: boolean
    showAffiliation: boolean
    includeCoScholastic: boolean
  }
}

// ---------- Field formatters ----------

function fullName(s: StudentDef): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ').trim()
}

function formatDate(d: Date | null): string {
  if (!d) return ''
  try {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

function studentFieldLabel(key: StudentFieldKey): string {
  switch (key) {
    case 'name': return 'Student Name'
    case 'admissionNumber': return 'Admission No.'
    case 'rollNumber': return 'Roll No.'
    case 'class': return 'Class'
    case 'section': return 'Section'
    case 'fatherName': return "Father's Name"
    case 'motherName': return "Mother's Name"
    case 'dateOfBirth': return 'Date of Birth'
    case 'gender': return 'Gender'
    case 'academicYear': return 'Academic Year'
    case 'admissionDate': return 'Admission Date'
    case 'parentPhone': return 'Parent Phone'
  }
}

function studentFieldValue(key: StudentFieldKey, student: StudentDef, school: SchoolDef): string {
  switch (key) {
    case 'name': return fullName(student)
    case 'admissionNumber': return student.admissionNumber ?? ''
    case 'rollNumber': return student.rollNumber ?? ''
    case 'class': return student.className ?? ''
    case 'section': return student.sectionName ?? ''
    case 'fatherName': return student.fatherName ?? ''
    case 'motherName': return student.motherName ?? ''
    case 'dateOfBirth': return formatDate(student.dateOfBirth)
    case 'gender': return student.gender ?? ''
    case 'academicYear': return school.academicYear
    case 'admissionDate': return formatDate(student.admissionDate)
    case 'parentPhone': return student.parentPhone ?? ''
  }
}

function parseComponents(json: string | null): ReadonlyArray<ReportCardComponentBreakdown> {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as Record<string, { obtained: number; max: number }>
    return Object.entries(parsed).map(([name, v]) => ({
      name,
      obtained: typeof v?.obtained === 'number' ? v.obtained : 0,
      max: typeof v?.max === 'number' ? v.max : 0,
    }))
  } catch {
    return []
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ---------- Builders ----------

export interface BuildExamCardInput {
  template: TemplateDef
  school: SchoolDef
  student: StudentDef
  result: ExamResultDef
  attendance?: AttendanceSnapshot | null
}

export function buildExamReportCard(input: BuildExamCardInput): ReportCardData {
  const layout = parseTemplateLayout(input.template.layoutJson)
  const title = layout.header.title?.trim() || 'Report Card'

  const studentFields = layout.studentBlock.map((key) => ({
    key,
    label: studentFieldLabel(key),
    value: studentFieldValue(key, input.student, input.school),
  }))

  // Co-scholastic subjects (gradeOnly with status pass, totalMarks=0) are
  // suppressed when the template hides them.
  const subjects: ReportCardSubjectRow[] = input.result.subjectSummaries
    .filter((s) => input.template.includeCoScholastic || s.totalMarks > 0)
    .map((s) => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      totalMarks: round2(s.totalMarks),
      obtainedMarks: round2(s.obtainedMarks),
      percentage: round2(s.percentage),
      grade: s.grade,
      gradePoint: s.gradePoint,
      status: s.status,
      components: parseComponents(s.componentsJson),
    }))

  return {
    kind: 'exam',
    title,
    lifecycle: {
      withdrawnOn: input.student.withdrawal ? formatDate(input.student.withdrawal.effectiveDate) : null,
      withdrawalReason: input.student.withdrawal?.reason ?? null,
      joinedMidSession: Boolean(input.student.joinedMidSession),
    },
    school: {
      name: input.school.name,
      logo: input.school.logo,
      address: input.school.address,
      affiliation: input.school.affiliationNumber,
      registration: input.school.registrationNumber,
      udise: input.school.udiseNumber,
      academicYear: input.school.academicYear,
      principalSignature: input.school.principalSignature,
    },
    examMeta: {
      name: input.result.examName,
      paradigm: input.result.paradigmName,
      group: input.result.examGroupName,
      academicYear: input.result.academicYear,
    },
    studentFields,
    subjects,
    totals: {
      totalMarks: round2(input.result.totalMarks),
      obtainedMarks: round2(input.result.obtainedMarks),
      percentage: round2(input.result.percentage),
      grade: input.result.grade,
      gradePoint: input.result.gradePoint,
      status: input.result.status,
      rankInClass: input.template.includeRank ? input.result.rankInClass : null,
      rankInSection: input.template.includeRank ? input.result.rankInSection : null,
    },
    attendance: input.template.includeAttendance ? (input.attendance ?? null) : null,
    promotion: null,
    signatures: layout.footer.signatures,
    options: {
      showComponents: layout.subjectTable.showComponents,
      showGrade: layout.subjectTable.showGrade,
      showRank: layout.subjectTable.showRank && input.template.includeRank,
      showMaxMarks: layout.subjectTable.showMaxMarks ?? true,
      showPercentage: layout.subjectTable.showPercentage ?? true,
      showAttendance: layout.footer.showAttendance && input.template.includeAttendance,
      showRemarks: layout.footer.showRemarks,
      showLogo: layout.header.showLogo,
      showAddress: layout.header.showAddress,
      showAffiliation: layout.header.showAffiliation ?? false,
      includeCoScholastic: input.template.includeCoScholastic,
    },
  }
}

export interface BuildFinalCardInput {
  template: TemplateDef
  school: SchoolDef
  student: StudentDef
  result: FinalResultDef
  // Per-exam summaries that contributed to the final — used to render the
  // term-wise table on annual cards.
  examResults: ReadonlyArray<ExamResultDef>
  attendance?: AttendanceSnapshot | null
}

export function buildFinalReportCard(input: BuildFinalCardInput): ReportCardData {
  const layout = parseTemplateLayout(input.template.layoutJson)
  const title = layout.header.title?.trim() || 'Annual Report Card'

  const studentFields = layout.studentBlock.map((key) => ({
    key,
    label: studentFieldLabel(key),
    value: studentFieldValue(key, input.student, input.school),
  }))

  // For an annual card we aggregate subject summaries across all contributing
  // exams. Sum obtained / total per subject; pick grade from the most recent
  // exam summary (caller orders examResults by publishedAt asc).
  const subjectMap = new Map<string, {
    subjectName: string
    obtained: number
    total: number
    grade: string | null
    gradePoint: number | null
    status: string
    components: ReportCardComponentBreakdown[]
  }>()

  for (const er of input.examResults) {
    for (const sm of er.subjectSummaries) {
      if (!input.template.includeCoScholastic && sm.totalMarks === 0) continue
      const existing = subjectMap.get(sm.subjectId)
      const compBreakdown = parseComponents(sm.componentsJson)
      if (existing) {
        existing.obtained += sm.obtainedMarks
        existing.total += sm.totalMarks
        existing.grade = sm.grade ?? existing.grade
        existing.gradePoint = sm.gradePoint ?? existing.gradePoint
        if (sm.status !== 'pass') existing.status = sm.status
        // Components from the latest exam win (avoids accidental double-count).
        if (compBreakdown.length > 0) existing.components = [...compBreakdown]
      } else {
        subjectMap.set(sm.subjectId, {
          subjectName: sm.subjectName,
          obtained: sm.obtainedMarks,
          total: sm.totalMarks,
          grade: sm.grade,
          gradePoint: sm.gradePoint,
          status: sm.status,
          components: compBreakdown.slice(),
        })
      }
    }
  }

  const subjects: ReportCardSubjectRow[] = Array.from(subjectMap.entries()).map(([subjectId, v]) => ({
    subjectId,
    subjectName: v.subjectName,
    totalMarks: round2(v.total),
    obtainedMarks: round2(v.obtained),
    percentage: v.total > 0 ? round2((v.obtained / v.total) * 100) : 0,
    grade: v.grade,
    gradePoint: v.gradePoint,
    status: v.status,
    components: v.components,
  }))

  return {
    kind: 'final',
    title,
    lifecycle: {
      withdrawnOn: input.student.withdrawal ? formatDate(input.student.withdrawal.effectiveDate) : null,
      withdrawalReason: input.student.withdrawal?.reason ?? null,
      joinedMidSession: Boolean(input.student.joinedMidSession),
    },
    school: {
      name: input.school.name,
      logo: input.school.logo,
      address: input.school.address,
      affiliation: input.school.affiliationNumber,
      registration: input.school.registrationNumber,
      udise: input.school.udiseNumber,
      academicYear: input.school.academicYear,
      principalSignature: input.school.principalSignature,
    },
    examMeta: {
      name: input.result.paradigmName,
      paradigm: input.result.paradigmName,
      group: null,
      academicYear: input.result.academicYear,
    },
    studentFields,
    subjects,
    totals: {
      totalMarks: round2(input.result.totalMarks),
      obtainedMarks: round2(input.result.obtainedMarks),
      percentage: round2(input.result.percentage),
      grade: input.result.grade,
      gradePoint: null,
      status: input.result.promotionStatus === 'detained' ? 'fail' : 'pass',
      rankInClass: input.template.includeRank ? input.result.rankInClass : null,
      rankInSection: input.template.includeRank ? input.result.rankInSection : null,
    },
    attendance: input.template.includeAttendance
      ? input.attendance ?? (input.result.attendancePct !== null
          ? { totalDays: 0, presentDays: 0, percentage: input.result.attendancePct }
          : null)
      : null,
    promotion: {
      status: input.result.promotionStatus,
      remarks: input.result.remarks,
    },
    signatures: layout.footer.signatures,
    options: {
      showComponents: layout.subjectTable.showComponents,
      showGrade: layout.subjectTable.showGrade,
      showRank: layout.subjectTable.showRank && input.template.includeRank,
      showMaxMarks: layout.subjectTable.showMaxMarks ?? true,
      showPercentage: layout.subjectTable.showPercentage ?? true,
      showAttendance: layout.footer.showAttendance && input.template.includeAttendance,
      showRemarks: layout.footer.showRemarks,
      showLogo: layout.header.showLogo,
      showAddress: layout.header.showAddress,
      showAffiliation: layout.header.showAffiliation ?? false,
      includeCoScholastic: input.template.includeCoScholastic,
    },
  }
}
