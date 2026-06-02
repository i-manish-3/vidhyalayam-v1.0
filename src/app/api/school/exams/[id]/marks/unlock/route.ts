import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// POST /api/school/exams/[id]/marks/unlock
// Body: { classId?, sectionId?, subjectId?, reason? }
// Reason is optional but recommended — the API encourages it with a soft nudge
// in the response message when omitted.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:marks:unlock')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to unlock marks.")
    }
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')

    const body = await request.json().catch(() => ({}))
    const { classId, sectionId, subjectId, reason } = body as {
      classId?: string
      sectionId?: string | null
      subjectId?: string
      reason?: string
    }

    const configWhere = {
      examId,
      schoolId: user.schoolId,
      deletedAt: null,
      ...(classId ? { classId } : {}),
      ...(sectionId !== undefined ? { sectionId: sectionId ?? null } : {}),
      ...(subjectId ? { subjectId } : {}),
    }

    const configs = await db.examSubjectConfig.findMany({
      where: configWhere,
      select: { id: true },
    })
    if (configs.length === 0) {
      return apiError(400, 'No subject configs matched your filter.')
    }
    const configIds = configs.map((c) => c.id)

    const beforeCount = await db.marksEntry.count({
      where: {
        examId,
        subjectConfigId: { in: configIds },
        deletedAt: null,
        lockedAt: { not: null },
      },
    })

    if (beforeCount === 0) {
      return apiError(400, 'No locked marks found for the selected scope.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.marksEntry.updateMany({
        where: {
          examId,
          subjectConfigId: { in: configIds },
          deletedAt: null,
          lockedAt: { not: null },
        },
        data: {
          lockedAt: null,
          lockedBy: null,
        },
      })

      await logExamChange(
        tx,
        schoolId,
        'MarksEntry',
        configIds.join(','),
        'marks_unlocked',
        { count: beforeCount, status: 'locked' },
        { count: beforeCount, status: 'unlocked' },
        {
          ...auditCtx,
          examId,
          metadata: {
            configIds,
            classId: classId ?? null,
            sectionId: sectionId ?? null,
            subjectId: subjectId ?? null,
            reason: reason ? String(reason).slice(0, 500) : undefined,
          },
        },
      )
    })

    return NextResponse.json({
      unlocked: beforeCount,
      message: `${beforeCount} mark entry(s) unlocked.`,
    })
  } catch (error) {
    console.error('Unlock marks error:', error)
    return internalError('unlocking the marks')
  }
}
