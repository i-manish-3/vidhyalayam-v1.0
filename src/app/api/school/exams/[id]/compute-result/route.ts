import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import {
  computeSubjectSummaries,
  computeExamResult,
  assignRanks,
  parsePassingRule,
  type SubjectConfigDef,
  type MarksEntryDef,
  type GradeScaleDef,
} from '@/features/exams/lib/result-calculator'

// POST /api/school/exams/[id]/compute-result
// Body: { studentIds?, classIds? } — narrows recompute; defaults to all
// students of all classes the exam covers.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:compute')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to compute results.")
    }
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
      include: {
        examClasses: true,
        group: { include: { paradigm: true } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const body = await request.json().catch(() => ({}))
    const { studentIds: bodyStudentIds, classIds: bodyClassIds } = body as {
      studentIds?: string[]
      classIds?: string[]
    }

    // Load subject configs + components for this exam
    const subjectConfigs = await db.examSubjectConfig.findMany({
      where: {
        examId,
        schoolId: user.schoolId,
        deletedAt: null,
        ...(bodyClassIds ? { classId: { in: bodyClassIds } } : {}),
      },
      include: {
        components: { orderBy: { sequence: 'asc' } },
      },
    })
    if (subjectConfigs.length === 0) {
      return apiError(400, 'No subject configs found for this exam.')
    }

    // Get subject names (denormalized for stability in summaries)
    const subjectIds = Array.from(new Set(subjectConfigs.map((c) => c.subjectId)))
    const subjects = await db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    })
    const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]))

    const examClassScopes = exam.examClasses
      .filter((scope) => !bodyClassIds || bodyClassIds.includes(scope.classId))
      .map((scope) => ({
        classId: scope.classId,
        sectionIds: scope.sectionIds ? JSON.parse(scope.sectionIds) as string[] : null,
      }))

    if (examClassScopes.length === 0) {
      return apiError(400, 'No exam classes matched the selected scope.')
    }

    const examStudentScopeWhere = {
      OR: examClassScopes.map((scope) => ({
        classId: scope.classId,
        ...(scope.sectionIds?.length ? { sectionId: { in: scope.sectionIds } } : {}),
      })),
    }

    const students = await db.student.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        ...(bodyStudentIds ? { id: { in: bodyStudentIds }, AND: [examStudentScopeWhere] } : examStudentScopeWhere),
      },
      select: { id: true, classId: true, sectionId: true, admissionDate: true },
    })
    const studentIdsToCompute = students.map((student) => student.id)

    if (studentIdsToCompute.length === 0) {
      return apiError(400, 'No students found for this exam scope.')
    }

    // Load marks for these configs
    const marks = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: { in: subjectConfigs.map((c) => c.id) },
        studentId: { in: studentIdsToCompute },
        deletedAt: null,
      },
    })

    // Load grade scale: paradigm-specific wins, then the school default.
    const gradeScale =
      (await db.gradeScale.findFirst({
        where: {
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
          paradigmId: exam.group.paradigmId,
        },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      })) ??
      (await db.gradeScale.findFirst({
        where: {
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
          paradigmId: null,
          isDefault: true,
        },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      }))
    if (!gradeScale) {
      return apiError(400, 'No grade scale configured. Create one on the Grade Scales page first.')
    }

    const scale: GradeScaleDef = {
      scaleType: gradeScale.scaleType as 'percentage' | 'marks' | 'cgpa',
      bands: gradeScale.bands.map((b) => ({
        code: b.code,
        minValue: b.minValue,
        maxValue: b.maxValue,
        gradePoint: b.gradePoint,
        sequence: b.sequence,
      })),
    }

    const passingRule = parsePassingRule(exam.group.paradigm.passingRule)

    // Convert configs to engine input shape
    const configDefs: SubjectConfigDef[] = subjectConfigs.map((c) => ({
      id: c.id,
      examId: c.examId,
      subjectId: c.subjectId,
      subjectName: subjectNameMap.get(c.subjectId) ?? c.subjectId,
      classId: c.classId,
      sectionId: c.sectionId,
      totalMarks: c.totalMarks,
      passingPercentage: c.passingPercentage,
      gradeOnly: c.gradeOnly,
      isCompulsory: c.isCompulsory,
      components: c.components.map((comp) => ({
        id: comp.id,
        name: comp.name,
        maxMarks: comp.maxMarks,
        gradeOnly: comp.gradeOnly,
      })),
    }))

    // Index marks by config
    const marksByConfig = new Map<string, MarksEntryDef[]>()
    for (const m of marks) {
      const arr = marksByConfig.get(m.subjectConfigId) ?? []
      arr.push({
        studentId: m.studentId,
        subjectConfigId: m.subjectConfigId,
        componentId: m.componentId,
        numericValue: m.numericValue,
        gradeValue: m.gradeValue,
        status: m.status,
      })
      marksByConfig.set(m.subjectConfigId, arr)
    }

    const mappings = await db.studentSubjectMapping.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear: exam.academicYear,
        studentId: { in: studentIdsToCompute },
        deletedAt: null,
      },
    })
    const mappingsByStudent = new Map<string, typeof mappings>()
    for (const mapping of mappings) {
      const arr = mappingsByStudent.get(mapping.studentId) ?? []
      arr.push(mapping)
      mappingsByStudent.set(mapping.studentId, arr)
    }

    const examStartTime = exam.startDate ? new Date(exam.startDate).getTime() : null
    const examEndTime = exam.endDate
      ? new Date(exam.endDate).getTime()
      : examStartTime

    const mappingIsActive = (mapping: typeof mappings[number]) => {
      const from = mapping.effectiveFrom?.getTime() ?? null
      const to = mapping.effectiveTo?.getTime() ?? null
      if (examEndTime && from && from > examEndTime) return false
      if (examStartTime && to && to < examStartTime) return false
      return true
    }

    const configAppliesToStudent = (
      config: typeof subjectConfigs[number],
      student: typeof students[number],
    ) => {
      const activeMappings = (mappingsByStudent.get(student.id) ?? []).filter(mappingIsActive)

      if (
        activeMappings.some(
          (mapping) =>
            mapping.mappingType === 'replacing_compulsory' &&
            mapping.replacesSubjectId === config.subjectId,
        )
      ) {
        return false
      }

      if (config.isOptional || config.isAdditional) {
        return activeMappings.some(
          (mapping) =>
            mapping.subjectId === config.subjectId &&
            ['optional', 'additional', 'replacing_compulsory'].includes(mapping.mappingType),
        )
      }

      return true
    }

    const studentIdsByConfig = new Map<string, string[]>()
    for (const student of students) {
      const bestConfigBySubject = new Map<string, typeof subjectConfigs[number]>()
      for (const config of subjectConfigs) {
        if (student.classId !== config.classId) continue
        if (config.sectionId && student.sectionId !== config.sectionId) continue

        const previous = bestConfigBySubject.get(config.subjectId)
        const isExactSection = config.sectionId !== null && config.sectionId === student.sectionId
        const previousIsExactSection = previous?.sectionId !== null && previous?.sectionId === student.sectionId
        if (!previous || (isExactSection && !previousIsExactSection)) {
          bestConfigBySubject.set(config.subjectId, config)
        }
      }

      for (const config of bestConfigBySubject.values()) {
        if (!configAppliesToStudent(config, student)) continue
        const ids = studentIdsByConfig.get(config.id) ?? []
        ids.push(student.id)
        studentIdsByConfig.set(config.id, ids)
      }
    }

    const studentLookupForApplicability = new Map(students.map((student) => [student.id, student]))
    for (const config of subjectConfigs) {
      const ids = studentIdsByConfig.get(config.id) ?? []
      if (ids.length === 0) continue

      const configMarks = marksByConfig.get(config.id) ?? []
      for (const studentId of ids) {
        const student = studentLookupForApplicability.get(studentId)
        const admissionDate = student?.admissionDate ?? null
        const isLateAdmission =
          examStartTime !== null &&
          admissionDate !== null &&
          admissionDate.getTime() > examStartTime

        if (!isLateAdmission) continue
        if (configMarks.some((mark) => mark.studentId === studentId)) continue

        if (config.components.length > 0) {
          for (const component of config.components) {
            configMarks.push({
              studentId,
              subjectConfigId: config.id,
              componentId: component.id,
              numericValue: null,
              gradeValue: null,
              status: 'not_applicable',
            })
          }
        } else {
          configMarks.push({
            studentId,
            subjectConfigId: config.id,
            componentId: null,
            numericValue: null,
            gradeValue: null,
            status: 'not_applicable',
          })
        }
      }
      marksByConfig.set(config.id, configMarks)
    }

    // Compute summaries per student
    const summariesByStudent = computeSubjectSummaries(configDefs, marksByConfig, passingRule, studentIdsByConfig)

    // Compute exam results per student
    const examResults = studentIdsToCompute.map((studentId) => {
      const summaries = summariesByStudent.get(studentId) ?? []
      return computeExamResult(studentId, examId, exam.academicYear, summaries, scale, passingRule)
    })

    // Assign ranks (within class/section context)
    const studentLookup = new Map(students.map((s) => [s.id, s]))
    const rankInput = examResults
      .filter((r) => r.status === 'pass' || r.status === 'partial')
      .map((r) => {
        const stu = studentLookup.get(r.studentId)
        return {
          id: r.studentId,
          classId: stu?.classId ?? '',
          sectionId: stu?.sectionId ?? null,
          percentage: r.percentage,
          obtainedMarks: r.obtainedMarks,
        }
      })

    const rankedById = new Map<string, { rankInClass: number; rankInSection: number }>()
    // Rank within each class separately
    const byClass = new Map<string, typeof rankInput>()
    for (const r of rankInput) {
      const arr = byClass.get(r.classId) ?? []
      arr.push(r)
      byClass.set(r.classId, arr)
    }
    for (const [, classGroup] of byClass) {
      const ranked = assignRanks(classGroup)
      for (const r of ranked) {
        rankedById.set(r.id, { rankInClass: r.rankInClass, rankInSection: r.rankInSection })
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    // Persist results in a transaction
    const result = await db.$transaction(async (tx) => {
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []
      let writtenCount = 0

      for (const er of examResults) {
        const rank = rankedById.get(er.studentId)
        const existing = await tx.examResult.findUnique({
          where: { examId_studentId: { examId, studentId: er.studentId } },
        })

        const examResultData = {
          schoolId,
          academicYear: er.academicYear,
          examId: er.examId,
          studentId: er.studentId,
          totalMarks: er.totalMarks,
          obtainedMarks: er.obtainedMarks,
          percentage: er.percentage,
          grade: er.grade,
          gradePoint: er.gradePoint,
          rankInClass: rank?.rankInClass ?? null,
          rankInSection: rank?.rankInSection ?? null,
          status: er.status,
          failedSubjects: er.failedSubjects,
          computedAt: new Date(),
          computedBy: user.userId,
        }

        const saved = existing
          ? await tx.examResult.update({ where: { id: existing.id }, data: examResultData })
          : await tx.examResult.create({ data: examResultData })

        // Replace ResultSubjectSummary rows
        await tx.resultSubjectSummary.deleteMany({ where: { resultId: saved.id } })
        if (er.subjectSummaries.length > 0) {
          await tx.resultSubjectSummary.createMany({
            data: er.subjectSummaries.map((sm) => ({
              resultId: saved.id,
              subjectId: sm.subjectId,
              subjectName: sm.subjectName,
              totalMarks: sm.totalMarks,
              obtainedMarks: sm.obtainedMarks,
              percentage: sm.percentage,
              grade: sm.grade,
              gradePoint: sm.gradePoint,
              status: sm.status,
              componentsJson: sm.componentsJson,
            })),
          })
        }

        auditEntries.push({
          entityType: 'ExamResult',
          entityId: saved.id,
          action: 'result_calculated',
          oldValue: existing,
          newValue: saved,
          examId,
          studentId: er.studentId,
          metadata: {
            subjectCount: er.subjectSummaries.length,
          },
        })
        writtenCount++
      }

      if (auditEntries.length > 0) {
        await logExamChangesBatch(tx, schoolId, auditEntries, { ...auditCtx, examId })
      }

      return writtenCount
    })

    return NextResponse.json({
      computed: result,
      message: `Computed results for ${result} student(s).`,
    })
  } catch (error) {
    console.error('Compute exam result error:', error)
    return internalError('computing the exam result')
  }
}
