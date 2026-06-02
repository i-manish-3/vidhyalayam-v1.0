import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// POST /api/school/exams/[id]/publish
//
// Flips visibleToParent=true on the exam and stamps publishedAt/publishedBy.
// Refuses if no ExamResult rows exist (publishing nothing is almost always a
// mistake). status moves to 'result_published'.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:publish')
    if (!user || !user.schoolId) return apiError(403, "You don't have permission to publish results.")
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')

    if (exam.visibleToParent && exam.publishedAt) {
      return apiError(409, 'This exam result is already published.')
    }

    const resultCount = await db.examResult.count({
      where: { examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (resultCount === 0) {
      return apiError(400, 'No computed results to publish. Compute results first.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.exam.update({
        where: { id: examId },
        data: {
          visibleToParent: true,
          publishedAt: new Date(),
          publishedBy: user.userId,
          status: 'result_published',
        },
      })
      await logExamChange(
        tx,
        schoolId,
        'Exam',
        examId,
        'result_published',
        exam,
        saved,
        { ...auditCtx, examId, metadata: { resultCount } },
      )
      return saved
    })

    return NextResponse.json({
      exam: updated,
      publishedCount: resultCount,
      message: `Published results for ${resultCount} student(s).`,
    })
  } catch (error) {
    console.error('Publish exam error:', error)
    return internalError('publishing the exam result')
  }
}
