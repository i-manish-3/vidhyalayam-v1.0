import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError, notFoundError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

// POST /api/school/exams/paradigms/[id]/publish-final
//
// Stamps publishedAt on every FinalResult under the paradigm (or a subset
// passed in `studentIds`). Different shape from per-exam publish because
// FinalResult is the unit of visibility for annual cards — there's no
// equivalent "visibleToParent" flag on Exam, the publishedAt being non-null
// IS the visibility flag.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:publish')
    if (!user || !user.schoolId) return apiError(403, "You don't have permission to publish results.")
    const { id: paradigmId } = await params

    const paradigm = await db.examParadigm.findFirst({
      where: { id: paradigmId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!paradigm) return notFoundError('Paradigm')

    const body = await request.json().catch(() => ({}))
    const studentIds: string[] | undefined = Array.isArray(body?.studentIds)
      ? body.studentIds.filter((s: unknown): s is string => typeof s === 'string' && s.length > 0)
      : undefined

    const where = {
      schoolId: user.schoolId,
      paradigmId,
      deletedAt: null,
      ...(studentIds && studentIds.length ? { studentId: { in: studentIds } } : {}),
    }

    const finals = await db.finalResult.findMany({
      where,
      select: { id: true, studentId: true, publishedAt: true },
    })
    if (finals.length === 0) {
      return apiError(400, 'No final results to publish. Compute final results first.')
    }
    const alreadyPublished = finals.filter((f) => f.publishedAt !== null).length
    const toPublish = finals.filter((f) => f.publishedAt === null)
    if (toPublish.length === 0) {
      return apiError(409, 'All matching final results are already published.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)
    const now = new Date()

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.finalResult.updateMany({
        where: { id: { in: toPublish.map((f) => f.id) } },
        data: { publishedAt: now },
      })
      await logExamChangesBatch(
        tx,
        schoolId,
        toPublish.map((f) => ({
          entityType: 'FinalResult' as const,
          entityId: f.id,
          action: 'result_published' as const,
          oldValue: { publishedAt: null },
          newValue: { publishedAt: now },
          studentId: f.studentId,
          metadata: { paradigmId },
        })),
        auditCtx,
      )
      return updated.count
    })

    return NextResponse.json({
      published: result,
      alreadyPublished,
      message: `Published ${result} final result(s).`,
    })
  } catch (error) {
    console.error('Publish paradigm final error:', error)
    return internalError('publishing the final results')
  }
}
