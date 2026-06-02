import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError, notFoundError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// POST /api/school/exams/[id]/unpublish
// Body: { reason: string }  — reason is mandatory and goes into the audit log.
// Flips visibleToParent back to false; existing computed results stay intact.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:publish')
    if (!user || !user.schoolId) return apiError(403, "You don't have permission to unpublish results.")
    const { id: examId } = await params

    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!reason) {
      return apiError(400, 'Please provide a reason for unpublishing — it goes into the audit log.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')

    if (!exam.visibleToParent && !exam.publishedAt) {
      return apiError(409, 'This exam result is not currently published.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      const saved = await tx.exam.update({
        where: { id: examId },
        data: {
          visibleToParent: false,
          status: 'completed',
        },
      })
      await logExamChange(
        tx,
        schoolId,
        'Exam',
        examId,
        'result_unpublished',
        exam,
        saved,
        { ...auditCtx, examId, metadata: { reason } },
      )
      return saved
    })

    return NextResponse.json({ exam: updated, message: 'Result unpublished.' })
  } catch (error) {
    console.error('Unpublish exam error:', error)
    return internalError('unpublishing the exam result')
  }
}
