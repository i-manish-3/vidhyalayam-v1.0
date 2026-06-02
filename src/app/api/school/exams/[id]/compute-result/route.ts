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
      include: { group: { include: { paradigm: true } } },
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

    // Load marks for these configs
    const marks = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: { in: subjectConfigs.map((c) => c.id) },
        deletedAt: null,
        ...(bodyStudentIds ? { studentId: { in: bodyStudentIds } } : {}),
      },
    })

    // Resolve student set (those who have any marks OR are in the requested class)
    const studentIdsFromMarks = new Set(marks.map((m) => m.studentId))
    const studentIdsToCompute = bodyStudentIds
      ? Array.from(new Set(bodyStudentIds))
      : Array.from(studentIdsFromMarks)

    if (studentIdsToCompute.length === 0) {
      return apiError(400, 'No students found with marks to compute. Enter marks first.')
    }

    // Resolve students with their class/section for ranking later
    const students = await db.student.findMany({
      where: {
        id: { in: studentIdsToCompute },
        schoolId: user.schoolId,
        deletedAt: null,
      },
      select: { id: true, classId: true, sectionId: true },
    })

    // Load grade scale — prefer default for this paradigm/school
    const gradeScale = await db.gradeScale.findFirst({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        OR: [
          { paradigmId: exam.group.paradigmId },
          { paradigmId: null, isDefault: true },
        ],
      },
      include: { bands: { orderBy: { sequence: 'asc' } } },
    })
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
      passingMarks: c.passingMarks,
      graceMarksMax: c.graceMarksMax,
      gradeOnly: c.gradeOnly,
      isCompulsory: c.isCompulsory,
      components: c.components.map((comp) => ({
        id: comp.id,
        name: comp.name,
        maxMarks: comp.maxMarks,
        passingMarks: comp.passingMarks,
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
        graceMarks: m.graceMarks,
      })
      marksByConfig.set(m.subjectConfigId, arr)
    }

    // Compute summaries per student
    const summariesByStudent = computeSubjectSummaries(configDefs, marksByConfig, passingRule)

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
            graceApplied: er.subjectSummaries.reduce((s, sm) => s + sm.graceApplied, 0),
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
