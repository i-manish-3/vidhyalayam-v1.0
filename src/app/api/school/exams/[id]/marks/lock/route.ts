import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

// POST /api/school/exams/[id]/marks/lock
// Body: { classId?, sectionId?, subjectId? }
// Omitting filters => lock marks for the entire exam (all configs). Narrowing
// by classId + (optional) sectionId + (optional) subjectId locks a specific
// subject-config's marks.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:marks:lock')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to lock marks.")
    }
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')

    const body = await request.json().catch(() => ({}))
    const { classId, sectionId, subjectId } = body as {
      classId?: string
      sectionId?: string | null
      subjectId?: string
    }

    // Resolve which subject config(s) to lock
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
      return apiError(400, 'No subject configs matched your filter. Check classId/sectionId/subjectId.')
    }
    const configIds = configs.map((c) => c.id)

    // Count marks that would be affected
    const beforeCount = await db.marksEntry.count({
      where: {
        examId,
        subjectConfigId: { in: configIds },
        deletedAt: null,
      },
    })

    if (beforeCount === 0) {
      return apiError(400, 'No marks to lock for the selected scope.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)
    const now = new Date()

    await db.$transaction(async (tx) => {
      await tx.marksEntry.updateMany({
        where: {
          examId,
          subjectConfigId: { in: configIds },
          deletedAt: null,
        },
        data: {
          lockedAt: now,
          lockedBy: user.userId,
        },
      })

      await logExamChange(
        tx,
        schoolId,
        'MarksEntry',
        configIds.join(','),
        'marks_locked',
        { count: beforeCount, status: 'unlocked' },
        { count: beforeCount, status: 'locked', lockedBy: user.userId },
        {
          ...auditCtx,
          examId,
          metadata: {
            configIds,
            classId: classId ?? null,
            sectionId: sectionId ?? null,
            subjectId: subjectId ?? null,
            reason: body.reason ? String(body.reason).slice(0, 500) : undefined,
          },
        },
      )
    })

    return NextResponse.json({
      locked: beforeCount,
      message: `${beforeCount} mark entry(s) locked.`,
    })
  } catch (error) {
    console.error('Lock marks error:', error)
    return internalError('locking the marks')
  }
}
