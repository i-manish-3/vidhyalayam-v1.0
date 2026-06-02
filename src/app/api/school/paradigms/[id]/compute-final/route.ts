import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import {
  computeGroupResult,
  computeFinalResult,
  parseAggregationRule,
  parsePassingRule,
  assignRanks,
  type GradeScaleDef,
  type ExamResultForGroup,
  type GroupResultForFinal,
} from '@/features/exams/lib/result-calculator'

// POST /api/school/paradigms/[id]/compute-final
// Body: { studentIds?, classIds? }
// Aggregates all ExamResults under this paradigm → ExamGroupResult → FinalResult
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:compute')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to compute final results.")
    }
    const { id: paradigmId } = await params

    const paradigm = await db.examParadigm.findFirst({
      where: { id: paradigmId, schoolId: user.schoolId, deletedAt: null },
      include: {
        examGroups: {
          where: { deletedAt: null },
          include: {
            exams: {
              where: { deletedAt: null },
              select: { id: true, includeInResult: true },
            },
          },
        },
      },
    })
    if (!paradigm) return notFoundError('ExamParadigm')

    const body = await request.json().catch(() => ({}))
    const { studentIds: bodyStudentIds, classIds: bodyClassIds } = body as {
      studentIds?: string[]
      classIds?: string[]
    }

    const passingRule = parsePassingRule(paradigm.passingRule)
    const paradigmAgg = parseAggregationRule(paradigm.aggregationRule)

    // Load grade scale (paradigm-scoped or default)
    const gradeScale = await db.gradeScale.findFirst({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        OR: [
          { paradigmId },
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

    // Load all ExamResult rows for exams under this paradigm
    const examIds = paradigm.examGroups.flatMap((g) => g.exams.map((e) => e.id))
    if (examIds.length === 0) {
      return apiError(400, 'No exams found under this paradigm.')
    }

    const examResults = await db.examResult.findMany({
      where: {
        schoolId: user.schoolId,
        examId: { in: examIds },
        deletedAt: null,
        ...(bodyStudentIds ? { studentId: { in: bodyStudentIds } } : {}),
      },
    })

    const studentIdsToCompute = Array.from(new Set(examResults.map((r) => r.studentId)))
    if (studentIdsToCompute.length === 0) {
      return apiError(400, 'No exam results to aggregate. Compute per-exam results first.')
    }

    // Resolve students for ranking
    const students = await db.student.findMany({
      where: {
        id: { in: studentIdsToCompute },
        schoolId: user.schoolId,
        deletedAt: null,
        ...(bodyClassIds ? { classId: { in: bodyClassIds } } : {}),
      },
      select: { id: true, classId: true, sectionId: true, admissionStatus: true },
    })
    const studentLookup = new Map(students.map((s) => [s.id, s]))

    // Index includeInResult per exam
    const examIncludeMap = new Map(
      paradigm.examGroups.flatMap((g) => g.exams.map((e) => [e.id, e.includeInResult])),
    )

    // Index examId → groupId for grouping
    const examGroupMap = new Map<string, string>()
    for (const g of paradigm.examGroups) {
      for (const e of g.exams) examGroupMap.set(e.id, g.id)
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)
    const academicYear = paradigm.academicYear

    // Compute group + final per student
    type GroupResultRecord = {
      studentId: string
      examGroupId: string
      academicYear: string
      totalMarks: number
      obtainedMarks: number
      percentage: number
      grade: string | null
      status: 'pass' | 'fail'
    }
    type FinalResultRecord = {
      studentId: string
      paradigmId: string
      academicYear: string
      totalMarks: number
      obtainedMarks: number
      percentage: number
      grade: string | null
      promotionStatus: 'promoted' | 'detained' | 'conditional' | 'withheld' | 'pending'
    }
    const allGroupResults: GroupResultRecord[] = []
    const allFinalResults: FinalResultRecord[] = []

    for (const studentId of studentIdsToCompute) {
      const studentExamResults = examResults.filter((r) => r.studentId === studentId)

      // Group by examGroupId
      const groupResults: GroupResultForFinal[] = []
      for (const group of paradigm.examGroups) {
        const groupExamResults = studentExamResults
          .filter((r) => examGroupMap.get(r.examId) === group.id)
          .map<ExamResultForGroup>((r) => ({
            studentId: r.studentId,
            examId: r.examId,
            totalMarks: r.totalMarks,
            obtainedMarks: r.obtainedMarks,
            percentage: r.percentage,
            includeInResult: examIncludeMap.get(r.examId) ?? true,
            status: r.status as 'pass' | 'fail' | 'absent' | 'partial',
          }))

        if (groupExamResults.length === 0) continue

        const groupAgg = parseAggregationRule(group.aggregationRule)
        const groupResult = computeGroupResult(
          studentId,
          group.id,
          academicYear,
          groupExamResults,
          groupAgg,
          scale,
        )
        allGroupResults.push(groupResult)
        groupResults.push({
          examGroupId: group.id,
          weight: group.weight,
          totalMarks: groupResult.totalMarks,
          obtainedMarks: groupResult.obtainedMarks,
          percentage: groupResult.percentage,
          status: groupResult.status,
        })
      }

      // Skip withdrawn students from final result
      const stu = studentLookup.get(studentId)
      if (!stu || stu.admissionStatus === 'withdrawn') continue

      const finalResult = computeFinalResult(
        studentId,
        paradigmId,
        academicYear,
        groupResults,
        paradigmAgg,
        scale,
        passingRule,
      )
      allFinalResults.push(finalResult)
    }

    // Assign final ranks (per class). Skip students without a classId — they
    // can't be ranked within a class anyway.
    const finalByClass = new Map<string, typeof allFinalResults>()
    for (const f of allFinalResults) {
      const stu = studentLookup.get(f.studentId)
      if (!stu || !stu.classId) continue
      const arr = finalByClass.get(stu.classId) ?? []
      arr.push(f)
      finalByClass.set(stu.classId, arr)
    }

    const finalRankedById = new Map<string, { rankInClass: number; rankInSection: number }>()
    for (const [, classGroup] of finalByClass) {
      const rankInput = classGroup.map((f) => {
        const stu = studentLookup.get(f.studentId)
        return {
          id: f.studentId,
          classId: stu?.classId ?? '',
          sectionId: stu?.sectionId ?? null,
          percentage: f.percentage,
          obtainedMarks: f.obtainedMarks,
        }
      })
      const ranked = assignRanks(rankInput)
      for (const r of ranked) {
        finalRankedById.set(r.id, { rankInClass: r.rankInClass, rankInSection: r.rankInSection })
      }
    }

    // Persist
    const result = await db.$transaction(async (tx) => {
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []
      let groupWritten = 0
      let finalWritten = 0

      for (const g of allGroupResults) {
        const existing = await tx.examGroupResult.findUnique({
          where: { examGroupId_studentId: { examGroupId: g.examGroupId, studentId: g.studentId } },
        })
        const data = {
          schoolId,
          academicYear: g.academicYear,
          examGroupId: g.examGroupId,
          studentId: g.studentId,
          totalMarks: g.totalMarks,
          obtainedMarks: g.obtainedMarks,
          percentage: g.percentage,
          grade: g.grade,
          status: g.status,
          computedAt: new Date(),
        }
        const saved = existing
          ? await tx.examGroupResult.update({ where: { id: existing.id }, data })
          : await tx.examGroupResult.create({ data })
        groupWritten++
        auditEntries.push({
          entityType: 'ExamGroupResult',
          entityId: saved.id,
          action: 'result_calculated',
          oldValue: existing,
          newValue: saved,
          studentId: g.studentId,
        })
      }

      for (const f of allFinalResults) {
        const existing = await tx.finalResult.findUnique({
          where: { paradigmId_studentId: { paradigmId: f.paradigmId, studentId: f.studentId } },
        })
        const rank = finalRankedById.get(f.studentId)
        const data = {
          schoolId,
          academicYear: f.academicYear,
          paradigmId: f.paradigmId,
          studentId: f.studentId,
          totalMarks: f.totalMarks,
          obtainedMarks: f.obtainedMarks,
          percentage: f.percentage,
          grade: f.grade,
          rankInClass: rank?.rankInClass ?? null,
          rankInSection: rank?.rankInSection ?? null,
          promotionStatus: f.promotionStatus,
          computedAt: new Date(),
        }
        const saved = existing
          ? await tx.finalResult.update({ where: { id: existing.id }, data })
          : await tx.finalResult.create({ data })
        finalWritten++
        auditEntries.push({
          entityType: 'FinalResult',
          entityId: saved.id,
          action: 'result_calculated',
          oldValue: existing,
          newValue: saved,
          studentId: f.studentId,
          metadata: { paradigmId, promotionStatus: f.promotionStatus },
        })
      }

      if (auditEntries.length > 0) {
        await logExamChangesBatch(tx, schoolId, auditEntries, auditCtx)
      }

      return { groupWritten, finalWritten }
    })

    return NextResponse.json({
      computed: result,
      message: `Computed ${result.finalWritten} final result(s) across ${result.groupWritten} group result(s).`,
    })
  } catch (error) {
    console.error('Compute final result error:', error)
    return internalError('computing the final result')
  }
}
