import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// DELETE /api/school/exams/schedule/[id] - Remove a single schedule row
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:schedule')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage the exam schedule.")
    }
    const { id } = await params

    const existing = await db.examSchedule.findFirst({
      where: { id, schoolId: user.schoolId },
      include: { exam: { select: { lockedAt: true } } },
    })
    if (!existing) return notFoundError('ExamSchedule')
    if (existing.exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it first.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.examSchedule.delete({ where: { id } })
      await logExamChange(
        tx,
        schoolId,
        'ExamSchedule',
        id,
        'deleted',
        existing,
        null,
        { ...auditCtx, examId: existing.examId },
      )
    })

    return NextResponse.json({ message: 'Schedule row removed.' })
  } catch (error) {
    console.error('Delete exam schedule error:', error)
    return internalError('removing the schedule row')
  }
}
