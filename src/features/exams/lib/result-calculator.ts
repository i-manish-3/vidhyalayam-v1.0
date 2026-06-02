/**
 * Pure result-calculation engine. Every function is deterministic — takes
 * data in, produces a result shape out, never touches the DB or Prisma.
 *
 * Pipeline (call from an API handler):
 *  1. load marks, subject configs, grade scale, paradigm/group rules
 *  2. computeSubjectSummaries → ResultSubjectSummary shapes
 *  3. computeExamResults → ExamResult shapes
 *  4. computeGroupResults → ExamGroupResult shapes (optional)
 *  5. computeFinalResults → FinalResult shapes (optional)
 *  6. assignRanks
 *
 * The caller owns writing rows to the DB in a single transaction. This keeps
 * auditing simple: snapshot before + snapshot after = audit diff.
 */

// ---------- Types ----------

export interface ParsedAggregationRule {
  type: 'sum_all' | 'weighted' | 'best_of_n'
  components?: Array<{ id: string; weight: number }>
  n?: number
  ids?: string[]
}

export interface PassingRule {
  perSubject: number
  overall: number
  allowGrace: boolean
  graceMax: number
}

export interface ComponentDef {
  id: string
  name: string
  maxMarks: number
  passingMarks: number
  gradeOnly: boolean
}

export interface SubjectConfigDef {
  id: string
  examId: string
  subjectId: string
  subjectName: string
  classId: string
  sectionId: string | null
  totalMarks: number
  passingMarks: number
  graceMarksMax: number
  gradeOnly: boolean
  isCompulsory: boolean
  components: ComponentDef[]
}

export interface MarksEntryDef {
  studentId: string
  subjectConfigId: string
  componentId: string | null
  numericValue: number | null
  gradeValue: string | null
  status: string // entered | absent | medical_leave | not_applicable
  graceMarks: number
}

export interface GradeBandDef {
  code: string
  minValue: number
  maxValue: number
  gradePoint: number | null
  sequence: number
}

export interface GradeScaleDef {
  scaleType: 'percentage' | 'marks' | 'cgpa'
  bands: GradeBandDef[]
}

export interface SubjectSummary {
  subjectId: string
  subjectName: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  gradePoint: number | null
  status: 'pass' | 'fail' | 'absent' | 'not_applicable'
  componentsJson: string | null
  graceApplied: number
}

export interface ExamResultShape {
  studentId: string
  examId: string
  academicYear: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  gradePoint: number | null
  status: 'pass' | 'fail' | 'absent' | 'partial'
  failedSubjects: string | null // JSON array
  rankInClass: number | null
  rankInSection: number | null
  subjectSummaries: SubjectSummary[]
}

export interface GroupResultShape {
  studentId: string
  examGroupId: string
  academicYear: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  status: 'pass' | 'fail'
}

export interface FinalResultShape {
  studentId: string
  paradigmId: string
  academicYear: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string | null
  rankInClass: number | null
  rankInSection: number | null
  promotionStatus: 'promoted' | 'detained' | 'conditional' | 'withheld' | 'pending'
}

// ---------- Helpers ----------

export function parseAggregationRule(json: string | null): ParsedAggregationRule {
  if (!json) return { type: 'sum_all' }
  try {
    const v = JSON.parse(json)
    if (!v || typeof v !== 'object') return { type: 'sum_all' }
    const type = v.type
    if (type === 'weighted') return { type: 'weighted', components: Array.isArray(v.components) ? v.components : [] }
    if (type === 'best_of_n') return { type: 'best_of_n', n: v.n ?? 1, ids: Array.isArray(v.ids) ? v.ids : [] }
    return { type: 'sum_all' }
  } catch {
    return { type: 'sum_all' }
  }
}

export function parsePassingRule(json: string): PassingRule {
  try {
    const v = JSON.parse(json)
    return {
      perSubject: typeof v.perSubject === 'number' ? v.perSubject : 33,
      overall: typeof v.overall === 'number' ? v.overall : 33,
      allowGrace: Boolean(v.allowGrace),
      graceMax: typeof v.graceMax === 'number' ? v.graceMax : 5,
    }
  } catch {
    return { perSubject: 33, overall: 33, allowGrace: true, graceMax: 5 }
  }
}

/**
 * Resolve a grade band from a percentage (or marks for absolute-marks scales).
 * Bands are expected sorted by sequence. Returns null if no band matches.
 */
export function resolveGrade(
  value: number,
  scale: GradeScaleDef,
): { code: string; gradePoint: number | null } | null {
  for (const band of scale.bands) {
    if (value >= band.minValue && value <= band.maxValue) {
      return { code: band.code, gradePoint: band.gradePoint }
    }
  }
  return null
}

// ---------- Stage 1: Subject Summary ----------

export function computeSubjectSummary(
  config: SubjectConfigDef,
  marks: MarksEntryDef[],
  passingRule: PassingRule,
): SubjectSummary {
  if (config.gradeOnly) {
    // Co-scholastic — find the grade from gradeValue entries. No numeric sum.
    const gradeEntry = marks.find((m) => m.gradeValue)
    return {
      subjectId: config.subjectId,
      subjectName: config.subjectName,
      totalMarks: 0,
      obtainedMarks: 0,
      percentage: 0,
      grade: gradeEntry?.gradeValue ?? null,
      gradePoint: null,
      status: 'pass',
      componentsJson: null,
      graceApplied: 0,
    }
  }

  // Sum numeric marks across components
  let totalMax = 0
  let totalObtained = 0
  let graceApplied = 0
  let anyAbsent = false
  const componentBreakdown: Record<string, { obtained: number; max: number }> = {}

  for (const comp of config.components) {
    totalMax += comp.maxMarks
    const entry = marks.find((m) => m.componentId === comp.id)
    if (!entry) {
      totalObtained += 0
      componentBreakdown[comp.name] = { obtained: 0, max: comp.maxMarks }
      continue
    }

    if (entry.status === 'absent' || entry.status === 'medical_leave') {
      anyAbsent = true
      componentBreakdown[comp.name] = { obtained: 0, max: comp.maxMarks }
      continue
    }

    if (entry.status === 'not_applicable') {
      componentBreakdown[comp.name] = { obtained: 0, max: comp.maxMarks }
      continue
    }

    const numeric = entry.numericValue ?? 0
    totalObtained += numeric
    componentBreakdown[comp.name] = { obtained: numeric, max: comp.maxMarks }
  }

  // For components-less configs: config-level entry
  if (config.components.length === 0) {
    totalMax = config.totalMarks
    const entry = marks.find((m) => m.componentId === null)
    if (entry) {
      if (entry.status === 'absent' || entry.status === 'medical_leave') {
        anyAbsent = true
      } else if (entry.status !== 'not_applicable') {
        const numeric = entry.numericValue ?? 0
        totalObtained = numeric
        graceApplied = entry.graceMarks ?? 0
        totalObtained += graceApplied
      }
    }
  }

  if (anyAbsent) {
    return {
      subjectId: config.subjectId,
      subjectName: config.subjectName,
      totalMarks: totalMax,
      obtainedMarks: totalObtained,
      percentage: totalMax > 0 ? (totalObtained / totalMax) * 100 : 0,
      grade: null,
      gradePoint: null,
      status: 'absent',
      componentsJson: JSON.stringify(componentBreakdown),
      graceApplied: 0,
    }
  }

  // Grace marks logic
  if (passingRule.allowGrace && passingRule.graceMax > 0 && config.graceMarksMax > 0) {
    const pct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0
    if (pct < passingRule.perSubject) {
      const needed = Math.ceil((passingRule.perSubject / 100) * totalMax - totalObtained)
      const maxAvailable = Math.min(config.graceMarksMax, passingRule.graceMax)
      if (needed <= maxAvailable) {
        graceApplied = needed
        totalObtained += graceApplied
      }
    }
  }

  const pct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0
  const passed = pct >= passingRule.perSubject

  return {
    subjectId: config.subjectId,
    subjectName: config.subjectName,
    totalMarks: totalMax,
    obtainedMarks: Math.min(totalObtained, totalMax),
    percentage: Math.min(pct, 100),
    grade: null,
    gradePoint: null,
    status: passed ? 'pass' : 'fail',
    componentsJson: JSON.stringify(componentBreakdown),
    graceApplied,
  }
}

export function computeSubjectSummaries(
  configs: SubjectConfigDef[],
  marksByConfig: Map<string, MarksEntryDef[]>,
  passingRule: PassingRule,
): Map<string, SubjectSummary[]> {
  // Group summaries by studentId → SubjectSummary[]
  const byStudent = new Map<string, SubjectSummary[]>()
  for (const config of configs) {
    const marks = marksByConfig.get(config.id) ?? []
    // Group marks by studentId
    const marksByStudent = new Map<string, MarksEntryDef[]>()
    for (const m of marks) {
      const arr = marksByStudent.get(m.studentId) ?? []
      arr.push(m)
      marksByStudent.set(m.studentId, arr)
    }
    for (const [studentId, studentMarks] of marksByStudent) {
      const summary = computeSubjectSummary(config, studentMarks, passingRule)
      const summaries = byStudent.get(studentId) ?? []
      summaries.push(summary)
      byStudent.set(studentId, summaries)
    }
  }
  return byStudent
}

// ---------- Stage 2: Exam Result ----------

export function computeExamResult(
  studentId: string,
  examId: string,
  academicYear: string,
  summaries: SubjectSummary[],
  scale: GradeScaleDef,
  passingRule: PassingRule,
): ExamResultShape {
  const totalMarks = summaries.reduce((s, sm) => s + sm.totalMarks, 0)
  const obtainedMarks = summaries.reduce((s, sm) => s + sm.obtainedMarks, 0)
  const pct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0
  const grade = resolveGrade(pct, scale)

  const failedSubjects = summaries
    .filter((sm) => sm.status === 'fail')
    .map((sm) => ({ subjectId: sm.subjectId, subjectName: sm.subjectName, percentage: Math.round(sm.percentage * 100) / 100 }))

  const absentCount = summaries.filter((sm) => sm.status === 'absent').length
  const totalSubjects = summaries.length

  let status: ExamResultShape['status']
  if (absentCount === totalSubjects) {
    status = 'absent'
  } else if (failedSubjects.length === 0 || pct >= passingRule.overall) {
    status = 'pass'
  } else if (failedSubjects.length < totalSubjects) {
    status = 'partial'
  } else {
    status = 'fail'
  }

  return {
    studentId,
    examId,
    academicYear,
    totalMarks,
    obtainedMarks,
    percentage: Math.round(pct * 100) / 100,
    grade: grade?.code ?? null,
    gradePoint: grade?.gradePoint ?? null,
    status,
    failedSubjects: failedSubjects.length > 0 ? JSON.stringify(failedSubjects) : null,
    rankInClass: null,
    rankInSection: null,
    subjectSummaries: summaries,
  }
}

// ---------- Stage 3: Group Result ----------

export interface ExamResultForGroup {
  studentId: string
  examId: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  includeInResult: boolean
  status: 'pass' | 'fail' | 'absent' | 'partial'
}

export function computeGroupResult(
  studentId: string,
  groupId: string,
  academicYear: string,
  examResults: ExamResultForGroup[],
  aggRule: ParsedAggregationRule,
  scale: GradeScaleDef,
): GroupResultShape {
  const included = examResults.filter((e) => e.includeInResult)
  if (included.length === 0) {
    return {
      studentId,
      examGroupId: groupId,
      academicYear,
      totalMarks: 0,
      obtainedMarks: 0,
      percentage: 0,
      grade: null,
      status: 'fail',
    }
  }

  let totalMarks = 0
  let obtainedMarks = 0

  if (aggRule.type === 'sum_all' || !aggRule.type) {
    totalMarks = included.reduce((s, e) => s + e.totalMarks, 0)
    obtainedMarks = included.reduce((s, e) => s + e.obtainedMarks, 0)
  } else if (aggRule.type === 'weighted' && aggRule.components) {
    const weightMap = new Map(aggRule.components.map((c) => [c.id, c.weight]))
    for (const e of included) {
      const w = (weightMap.get(e.examId) ?? 0) / 100
      totalMarks += e.totalMarks * w
      obtainedMarks += e.obtainedMarks * w
    }
    if (totalMarks === 0) totalMarks = 1
  } else if (aggRule.type === 'best_of_n') {
    const n = aggRule.n ?? 1
    const ids = new Set(aggRule.ids ?? [])
    const candidates = included
      .filter((e) => ids.size === 0 || ids.has(e.examId))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, n)
    totalMarks = candidates.reduce((s, e) => s + e.totalMarks, 0)
    obtainedMarks = candidates.reduce((s, e) => s + e.obtainedMarks, 0)
  }

  const pct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0
  const grade = resolveGrade(pct, scale)

  return {
    studentId,
    examGroupId: groupId,
    academicYear,
    totalMarks: Math.round(totalMarks * 100) / 100,
    obtainedMarks: Math.round(obtainedMarks * 100) / 100,
    percentage: Math.round(pct * 100) / 100,
    grade: grade?.code ?? null,
    status: pct >= 33 ? 'pass' : 'fail',
  }
}

// ---------- Stage 4: Final Result ----------

export interface GroupResultForFinal {
  examGroupId: string
  weight: number
  totalMarks: number
  obtainedMarks: number
  percentage: number
  status: 'pass' | 'fail'
}

export function computeFinalResult(
  studentId: string,
  paradigmId: string,
  academicYear: string,
  groupResults: GroupResultForFinal[],
  aggRule: ParsedAggregationRule,
  scale: GradeScaleDef,
  passingRule: PassingRule,
): FinalResultShape {
  if (groupResults.length === 0) {
    return {
      studentId,
      paradigmId,
      academicYear,
      totalMarks: 0,
      obtainedMarks: 0,
      percentage: 0,
      grade: null,
      rankInClass: null,
      rankInSection: null,
      promotionStatus: 'withheld',
    }
  }

  let totalMarks = 0
  let obtainedMarks = 0

  if (aggRule.type === 'sum_all' || !aggRule.type) {
    totalMarks = groupResults.reduce((s, g) => s + g.totalMarks, 0)
    obtainedMarks = groupResults.reduce((s, g) => s + g.obtainedMarks, 0)
  } else if (aggRule.type === 'weighted' && aggRule.components) {
    const weightMap = new Map(aggRule.components.map((c) => [c.id, c.weight]))
    for (const g of groupResults) {
      const w = (weightMap.get(g.examGroupId) ?? g.weight) / 100
      totalMarks += g.totalMarks * w
      obtainedMarks += g.obtainedMarks * w
    }
    if (totalMarks === 0) totalMarks = 1
  } else if (aggRule.type === 'best_of_n') {
    const n = aggRule.n ?? 1
    const ids = new Set(aggRule.ids ?? [])
    const candidates = groupResults
      .filter((g) => ids.size === 0 || ids.has(g.examGroupId))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, n)
    totalMarks = candidates.reduce((s, g) => s + g.totalMarks, 0)
    obtainedMarks = candidates.reduce((s, g) => s + g.obtainedMarks, 0)
  }

  const pct = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0
  const grade = resolveGrade(pct, scale)

  const allPassed = groupResults.every((g) => g.status === 'pass')
  const overallPassed = pct >= passingRule.overall

  let promotionStatus: FinalResultShape['promotionStatus']
  if (allPassed && overallPassed) promotionStatus = 'promoted'
  else if (!overallPassed && groupResults.some((g) => g.status === 'pass')) promotionStatus = 'detained'
  else promotionStatus = 'detained'

  return {
    studentId,
    paradigmId,
    academicYear,
    totalMarks: Math.round(totalMarks * 100) / 100,
    obtainedMarks: Math.round(obtainedMarks * 100) / 100,
    percentage: Math.round(pct * 100) / 100,
    grade: grade?.code ?? null,
    rankInClass: null,
    rankInSection: null,
    promotionStatus,
  }
}

// ---------- Stage 5: Rank ----------

export interface RankableStudent {
  id: string
  classId: string
  sectionId: string | null
  percentage: number
  obtainedMarks: number
}

/**
 * Assign rankInClass and rankInSection. Ties break by higher obtainedMarks.
 * Returns a new array with ranks populated (does not mutate).
 */
export function assignRanks<T extends RankableStudent>(
  students: T[],
): Array<T & { rankInClass: number; rankInSection: number }> {
  // Sort by percentage desc, then obtainedMarks desc
  const sorted = [...students].sort(
    (a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks,
  )

  // Global rank (within the whole set, which caller should scope to one class
  // or one school depending on what they pass in).
  const withClassRank = sorted.map((s, i) => ({ ...s, rankInClass: i + 1 }))

  // Section rank
  const sectionGroups = new Map<string, typeof withClassRank>()
  for (const s of withClassRank) {
    const key = s.sectionId ?? '__all'
    const arr = sectionGroups.get(key) ?? []
    arr.push(s)
    sectionGroups.set(key, arr)
  }

  const result: Array<T & { rankInClass: number; rankInSection: number }> = []
  for (const [, group] of sectionGroups) {
    const sorted = [...group].sort(
      (a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks,
    )
    for (let i = 0; i < sorted.length; i++) {
      result.push({ ...sorted[i], rankInSection: i + 1 })
    }
  }

  return result
}
