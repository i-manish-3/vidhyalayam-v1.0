import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// DELETE /api/school/exams/student-subject-mappings/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to remove subject mappings.")
    }
    const { id } = await params

    const existing = await db.studentSubjectMapping.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('StudentSubjectMapping')

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.studentSubjectMapping.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
      await logExamChange(
        tx,
        schoolId,
        'StudentSubjectMapping',
        id,
        'deleted',
        existing,
        null,
        { ...auditCtx, studentId: existing.studentId },
      )
    })

    return NextResponse.json({ message: 'Subject mapping removed.' })
  } catch (error) {
    console.error('Delete student subject mapping error:', error)
    return internalError('removing the subject mapping')
  }
}
