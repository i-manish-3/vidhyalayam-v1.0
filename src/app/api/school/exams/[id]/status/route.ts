import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// Status state machine. Forward arrows reflect the natural lifecycle; admins
// can rewind to draft from anything pre-published when fixing mistakes.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['scheduled'],
  scheduled: ['ongoing', 'draft'],
  ongoing: ['completed', 'scheduled'],
  completed: ['result_published', 'ongoing'],
  result_published: ['completed'], // unpublish path
}

const VALID_STATUSES = Object.keys(ALLOWED_TRANSITIONS)

// POST /api/school/exams/[id]/status - Transition exam status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to change exam status.")
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { status: nextStatus, reason } = body as { status?: string; reason?: string }

    if (!nextStatus || typeof nextStatus !== 'string' || !VALID_STATUSES.includes(nextStatus)) {
      return apiError(400, `Please choose a valid status: ${VALID_STATUSES.join(', ')}.`)
    }

    const existing = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('Exam')

    if (existing.status === nextStatus) {
      return apiError(400, `This exam is already in "${nextStatus}" status.`)
    }

    const allowed = ALLOWED_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(nextStatus)) {
      return apiError(
        409,
        `Can't move from "${existing.status}" directly to "${nextStatus}". Allowed next states: ${allowed.join(', ') || 'none'}.`,
      )
    }

    // Result-published transitions require a separate permission gate.
    if (nextStatus === 'result_published' || existing.status === 'result_published') {
      const publisher = await requirePermission(request, 'exam:result:publish')
      if (!publisher) {
        return apiError(403, "You don't have permission to publish or unpublish results.")
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      const data: Record<string, unknown> = { status: nextStatus }
      if (nextStatus === 'result_published') {
        data.visibleToParent = true
        data.publishedAt = new Date()
        data.publishedBy = user.userId
      } else if (existing.status === 'result_published') {
        data.visibleToParent = false
        data.publishedAt = null
        data.publishedBy = null
      }

      const result = await tx.exam.update({
        where: { id },
        data,
      })

      await logExamChange(
        tx,
        schoolId,
        'Exam',
        id,
        'status_changed',
        { status: existing.status, visibleToParent: existing.visibleToParent },
        { status: result.status, visibleToParent: result.visibleToParent },
        {
          ...auditCtx,
          examId: id,
          metadata: {
            previousStatus: existing.status,
            newStatus: nextStatus,
            ...(reason ? { reason: String(reason).slice(0, 500) } : {}),
          },
        },
      )

      return result
    })

    return NextResponse.json({ exam: updated, message: `Status changed to "${nextStatus}".` })
  } catch (error) {
    console.error('Exam status transition error:', error)
    return internalError('changing the exam status')
  }
}
