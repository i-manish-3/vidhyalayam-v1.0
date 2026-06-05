/**
 * Seed a complete exam pipeline: paradigm → group (already seeded in index.ts)
 * → Exam → ExamClass → ExamSubjectConfig → ExamComponent → ExamSchedule →
 * MarksEntry → ExamResult → FinalResult.
 *
 * Only seeds the demo school (dps-delhi). Idempotent — skips if data already
 * exists for the school's paradigm.
 */

import { db } from '../../src/lib/db'

const ACADEMIC_YEAR = '2026-2027'

async function main() {
  console.log('🌱 Seeding exam pipeline data (marks → compute → publish)...')

  const school = await db.school.findFirst({ where: { subdomain: 'dps-delhi', deletedAt: null } })
  if (!school) {
    throw new Error('Demo school "dps-delhi" not found. Run core seed first.')
  }

  const paradigm = await db.examParadigm.findFirst({
    where: { schoolId: school.id, academicYear: ACADEMIC_YEAR, isDefault: true, deletedAt: null },
  })
  if (!paradigm) throw new Error('ExamParadigm not found. Run core seed first.')

  const term1 = await db.examGroup.findFirst({
    where: { schoolId: school.id, paradigmId: paradigm.id, shortCode: 'T1', deletedAt: null },
  })
  if (!term1) throw new Error('Term 1 group not found. Run core seed first.')

  const term2 = await db.examGroup.findFirst({
    where: { schoolId: school.id, paradigmId: paradigm.id, shortCode: 'T2', deletedAt: null },
  })
  if (!term2) throw new Error('Term 2 group not found. Run core seed first.')

  // Check if we already seeded exams.
  const existing = await db.exam.count({ where: { schoolId: school.id, examGroupId: term1.id, deletedAt: null } })
  if (existing > 0) {
    console.log('↺ Exam pipeline already seeded. Skipping.')
    return
  }

  // ── Pick a class and a few subjects ──
  const className = 'Class 10' // Class 10 is the most meaningful demo target.
  const cls = await db.class.findFirst({
    where: { schoolId: school.id, name: className, deletedAt: null },
    include: {
      sections: { where: { deletedAt: null }, take: 1, orderBy: { name: 'asc' } },
    },
  })
  if (!cls || cls.sections.length === 0) {
    console.log('ℹ️  Class 10 or its sections not found. Skipping exam seed.')
    return
  }
  const section = cls.sections[0]

  const classSubjectRows = await db.classSubject.findMany({
    where: { classId: cls.id, subject: { deletedAt: null } },
    take: 5,
    orderBy: { subject: { name: 'asc' } },
    include: { subject: true },
  })
  if (classSubjectRows.length < 3) {
    console.log('ℹ️  Class 10 has fewer than 3 subjects. Skipping exam seed.')
    return
  }

  const subj1 = classSubjectRows[0].subject
  const subj2 = classSubjectRows[1].subject
  const subj3 = classSubjectRows[2].subject

  // ── Students in this class+section ──
  const students = await db.student.findMany({
    where: {
      schoolId: school.id,
      classId: cls.id,
      sectionId: section.id,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, firstName: true, lastName: true },
    take: 10,
  })
  if (students.length === 0) {
    console.log('ℹ️  No students in Class 10 — skipping exam seed.')
    return
  }

  // ── Teacher for the teacher filter test ──
  const teacher = await db.teacher.findFirst({
    where: { schoolId: school.id, isActive: true },
    select: { id: true },
  })
  const schoolAdmin = await db.user.findFirst({
    where: { schoolId: school.id, role: 'SCHOOL_ADMIN', deletedAt: null, isActive: true },
    select: { id: true },
  })

  // ========================================================
  // 1. CREATE EXAMS
  // ========================================================
  const [halfYearly, unitTest] = await Promise.all([
    db.exam.create({
      data: {
        schoolId: school.id,
        academicYear: ACADEMIC_YEAR,
        examGroupId: term1.id,
        name: 'Half-Yearly Examination',
        shortCode: 'HY',
        examType: 'written',
        startDate: new Date('2026-09-15'),
        endDate: new Date('2026-09-28'),
        status: 'scheduled',
        includeInResult: true,
        visibleToParent: false,
        createdBy: schoolAdmin?.id,
      },
    }),
    db.exam.create({
      data: {
        schoolId: school.id,
        academicYear: ACADEMIC_YEAR,
        examGroupId: term1.id,
        name: 'Unit Test 1',
        shortCode: 'UT1',
        examType: 'written',
        startDate: new Date('2026-07-10'),
        endDate: new Date('2026-07-12'),
        status: 'completed',
        includeInResult: true,
        visibleToParent: false,
        createdBy: schoolAdmin?.id,
      },
    }),
  ])

  // ExamClass — which class this exam applies to.
  await db.examClass.create({ data: { examId: halfYearly.id, classId: cls.id, sectionIds: null } })

  // ========================================================
  // 2. SUBJECT CONFIG + COMPONENTS (for Half-Yearly)
  // ========================================================
  const mathsConfig = await db.examSubjectConfig.create({
    data: {
      schoolId: school.id,
      examId: halfYearly.id,
      classId: cls.id,
      subjectId: subj1.id,
      isCompulsory: true,
      totalMarks: 100,
      passingMarks: 33,
      graceMarksMax: 5,
    },
  })
  await db.examComponent.createMany({
    data: [
      { subjectConfigId: mathsConfig.id, name: 'Theory', shortCode: 'TH', sequence: 0, maxMarks: 80, passingMarks: 26 },
      { subjectConfigId: mathsConfig.id, name: 'Internal', shortCode: 'INT', sequence: 1, maxMarks: 20, passingMarks: 0 },
    ],
  })

  const scienceConfig = await db.examSubjectConfig.create({
    data: {
      schoolId: school.id,
      examId: halfYearly.id,
      classId: cls.id,
      subjectId: subj2.id,
      isCompulsory: true,
      totalMarks: 100,
      passingMarks: 33,
    },
  })
  await db.examComponent.createMany({
    data: [
      { subjectConfigId: scienceConfig.id, name: 'Theory', shortCode: 'TH', sequence: 0, maxMarks: 80, passingMarks: 26 },
      { subjectConfigId: scienceConfig.id, name: 'Practical', shortCode: 'PR', sequence: 1, maxMarks: 20, passingMarks: 6 },
    ],
  })

  const englishConfig = await db.examSubjectConfig.create({
    data: {
      schoolId: school.id,
      examId: halfYearly.id,
      classId: cls.id,
      subjectId: subj3.id,
      isCompulsory: true,
      totalMarks: 100,
      passingMarks: 33,
    },
  })
  await db.examComponent.createMany({
    data: [
      { subjectConfigId: englishConfig.id, name: 'Literature', shortCode: 'LIT', sequence: 0, maxMarks: 50, passingMarks: 16 },
      { subjectConfigId: englishConfig.id, name: 'Grammar', shortCode: 'GR', sequence: 1, maxMarks: 30, passingMarks: 10 },
      { subjectConfigId: englishConfig.id, name: 'Project', shortCode: 'PRJ', sequence: 2, maxMarks: 20, passingMarks: 0 },
    ],
  })

  // ========================================================
  // 3. MARKS ENTRY PER STUDENT (random reasonable scores)
  // ========================================================
  // Deterministic pseudo-scores based on student index so re-runs are stable.
  function scoreFor(i: number, max: number, baseMin: number): number {
    if (max <= 0) return 0
    // Linear distribution: 40%–98% of max, row-stable via student index.
    const pct = 0.4 + (i % students.length) / students.length * 0.58
    return Math.min(max, Math.max(0, Math.round(max * pct + (i * 3) % 5 - 2)))
  }

  const marksRows: Array<{
    schoolId: string
    examId: string
    subjectConfigId: string
    componentId: string | null
    studentId: string
    numericValue: number
    status: string
    enteredBy: string | null
    enteredAt: Date
  }> = []

  const adminId = schoolAdmin?.id ?? null
  const now = new Date('2026-09-20T10:00:00Z')

  const configs = [
    { cfg: mathsConfig, comps: [null, null] },
    { cfg: scienceConfig, comps: [null, null] },
    { cfg: englishConfig, comps: [null, null, null] },
  ]
  // Resolve components from DB
  const allComponents = await db.examComponent.findMany({
    where: { subjectConfig: { examId: halfYearly.id } },
  })
  for (const ct of configs) {
    ct.comps = allComponents.filter((c) => c.subjectConfigId === ct.cfg.id)
  }

  for (let i = 0; i < students.length; i++) {
    const studentId = students[i].id
    for (const { cfg, comps } of configs) {
      // Grade-only configs skip numeric marks.
      if (cfg.gradeOnly) continue
      for (const comp of comps) {
        const numeric = scoreFor(i, comp.maxMarks, 20)
        marksRows.push({
          schoolId: school.id,
          examId: halfYearly.id,
          subjectConfigId: cfg.id,
          componentId: comp.id,
          studentId,
          numericValue: numeric,
          status: 'entered',
          enteredBy: adminId,
          enteredAt: now,
        })
      }
    }
  }

  await db.marksEntry.createMany({ data: marksRows })
  console.log(`  Created ${marksRows.length} marks entries for ${students.length} students × ${configs.length} subjects`)

  // ========================================================
  // 4. TEACHER SUBJECT ASSIGNMENT (so the marks-grid edit check passes)
  // ========================================================
  if (teacher) {
    await db.teacherSubjectAssignment.create({
      data: {
        schoolId: school.id,
        academicYear: ACADEMIC_YEAR,
        teacherId: teacher.id,
        classId: cls.id,
        sectionId: section.id,
        subjectId: subj1.id,
      },
    })
  }

  // ========================================================
  // 5. COMPUTE RESULTS FOR HALF-YEARLY
  //    (re-runs the compute logic so ExamResult rows exist without UI click)
  // ========================================================
  const gradeScale = await db.gradeScale.findFirst({
    where: { schoolId: school.id, isDefault: true, isActive: true, deletedAt: null },
    include: { bands: { orderBy: { sequence: 'asc' } } },
  })
  if (!gradeScale || gradeScale.bands.length === 0) {
    console.log('⚠️  No default grade scale found — skipping result compute in seed.')
    console.log('✅ Exam pipeline seed complete (marks only — compute from UI).')
    return
  }

  const subjectConfigs = await db.examSubjectConfig.findMany({
    where: { examId: halfYearly.id, schoolId: school.id, deletedAt: null },
    include: { components: { orderBy: { sequence: 'asc' } } },
  })

  const allMarks = await db.marksEntry.findMany({
    where: { examId: halfYearly.id, deletedAt: null },
  })

  const subjectMap = new Map(
    (await db.subject.findMany({
      where: { id: { in: subjectConfigs.map((c) => c.subjectId) } },
      select: { id: true, name: true },
    })).map((s) => [s.id, s.name]),
  )

  const passingRule = { perSubject: 33, overall: 33, allowGrace: true, graceMax: 5 }
  const scale = {
    scaleType: gradeScale.scaleType as 'percentage',
    bands: gradeScale.bands.map((b) => ({
      code: b.code,
      minValue: b.minValue,
      maxValue: b.maxValue,
      gradePoint: b.gradePoint,
      sequence: b.sequence,
    })),
  }

  // Simple inline compute (avoids importing the full engine + matching its input types).
  // This mirrors result-calculator.ts logic at the shape level used by seed.
  for (const student of students) {
    let examTotalObtained = 0
    let examTotalMax = 0
    const subjectSummaries: Array<{
      subjectId: string
      subjectName: string
      totalMarks: number
      obtainedMarks: number
      percentage: number
      grade: string | null
      gradePoint: number | null
      status: string
      componentsJson: string | null
    }> = []

    for (const cfg of subjectConfigs) {
      let subjTotal = 0
      let subjObtained = 0
      const compBreakdown: Record<string, { obtained: number; max: number }> = {}

      for (const comp of cfg.components) {
        const entry = allMarks.find(
          (m) => m.studentId === student.id && m.subjectConfigId === cfg.id && m.componentId === comp.id,
        )
        const obtained = entry?.numericValue ?? 0
        subjTotal += comp.maxMarks
        subjObtained += obtained
        compBreakdown[comp.name] = { obtained, max: comp.maxMarks }
      }

      if (subjTotal === 0) subjTotal = cfg.totalMarks

      const pct = subjTotal > 0 ? (subjObtained / subjTotal) * 100 : 0
      let subjStatus: string

      // Grace: if just under passing and graceMax > 0.
      if (pct < passingRule.perSubject && subjObtained >= cfg.passingMarks - cfg.graceMarksMax) {
        const gap = cfg.passingMarks - subjObtained
        if (gap > 0 && gap <= cfg.graceMarksMax) {
          subjObtained += gap
          subjStatus = 'pass'
        } else {
          subjStatus = 'fail'
        }
      } else {
        subjStatus = pct >= passingRule.perSubject ? 'pass' : 'fail'
      }

      const gradeBand = scale.bands.find((b) => pct >= b.minValue && pct <= b.maxValue)

      subjectSummaries.push({
        subjectId: cfg.subjectId,
        subjectName: subjectMap.get(cfg.subjectId) ?? cfg.subjectId,
        totalMarks: cfg.totalMarks,
        obtainedMarks: subjObtained,
        percentage: Math.round(pct * 100) / 100,
        grade: gradeBand?.code ?? null,
        gradePoint: gradeBand?.gradePoint ?? null,
        status: subjStatus,
        componentsJson: Object.keys(compBreakdown).length > 0 ? JSON.stringify(compBreakdown) : null,
      })

      examTotalObtained += subjObtained
      examTotalMax += cfg.totalMarks
    }

    const overallPct = examTotalMax > 0 ? (examTotalObtained / examTotalMax) * 100 : 0
    const overallGrade = scale.bands.find((b) => overallPct >= b.minValue && b.maxValue <= b.maxValue)
    const failedSubjects = subjectSummaries.filter((s) => s.status === 'fail').map((s) => s.subjectId)
    const overallStatus = failedSubjects.length > 0 ? 'fail' : 'pass'

    const existingResult = await db.examResult.findUnique({
      where: { examId_studentId: { examId: halfYearly.id, studentId: student.id } },
    })
    if (existingResult) continue

    const result = await db.examResult.create({
      data: {
        schoolId: school.id,
        academicYear: ACADEMIC_YEAR,
        examId: halfYearly.id,
        studentId: student.id,
        totalMarks: examTotalMax,
        obtainedMarks: examTotalObtained,
        percentage: Math.round(overallPct * 100) / 100,
        grade: overallGrade?.code ?? null,
        gradePoint: overallGrade?.gradePoint ?? null,
        status: overallStatus,
        failedSubjects: failedSubjects.length > 0 ? JSON.stringify(failedSubjects) : null,
        computedAt: new Date(),
        computedBy: adminId,
      },
    })

    await db.resultSubjectSummary.createMany({
      data: subjectSummaries.map((sm) => ({
        resultId: result.id,
        ...sm,
      })),
    })
  }

  // Assign ranks (simple sort by percentage within the class).
  const allResults = await db.examResult.findMany({
    where: { examId: halfYearly.id, schoolId: school.id, deletedAt: null },
    include: { student: { select: { classId: true, sectionId: true } } },
    orderBy: { percentage: 'desc' },
  })
  const byClass = new Map<string, typeof allResults>()
  for (const r of allResults) {
    const key = r.student.classId ?? ''
    const arr = byClass.get(key) ?? []
    arr.push(r)
    byClass.set(key, arr)
  }
  for (const [, group] of byClass) {
    group.forEach((r, i) => {
      const rankInClass = i + 1
      // Section rank is approximate — we sort within section by pct then pick index.
      const sectionGroup = group.filter((g) => g.student.sectionId === r.student.sectionId)
      const sectionIdx = sectionGroup.indexOf(r)
      db.examResult
        .update({
          where: { id: r.id },
          data: {
            rankInClass,
            rankInSection: sectionIdx >= 0 ? sectionIdx + 1 : null,
          },
        })
        .catch(() => {}) // non-critical — the UI Recompute button is the definitive path
    })
  }

  // ── Create Unit Test 1 exam class too, so the list page has variety ──
  await db.examClass.create({ data: { examId: unitTest.id, classId: cls.id, sectionIds: null } })

  console.log(
    `✅ Exam pipeline seed complete: 2 exams, 3 subject configs, ${students.length} students with marks + computed results.`,
  )
}

main()
  .catch((e) => {
    console.error('❌ Exam seed failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
