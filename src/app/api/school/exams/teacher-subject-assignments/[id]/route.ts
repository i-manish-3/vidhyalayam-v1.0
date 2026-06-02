import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// DELETE /api/school/exams/teacher-subject-assignments/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to remove teacher subject assignments.")
    }
    const { id } = await params

    const existing = await db.teacherSubjectAssignment.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('TeacherSubjectAssignment')

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.teacherSubjectAssignment.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
      await logExamChange(
        tx,
        schoolId,
        'TeacherSubjectAssignment',
        id,
        'deleted',
        existing,
        null,
        auditCtx,
      )
    })

    return NextResponse.json({ message: 'Teacher subject assignment removed.' })
  } catch (error) {
    console.error('Delete teacher subject assignment error:', error)
    return internalError('removing the teacher subject assignment')
  }
}
