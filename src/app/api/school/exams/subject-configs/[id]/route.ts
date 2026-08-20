import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// PATCH /api/school/exams/subject-configs/[id] - update a single config
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to configure exams.")
    }
    const { id } = await params

    const existing = await db.examSubjectConfig.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { exam: { select: { lockedAt: true } }, components: true },
    })
    if (!existing) return notFoundError('ExamSubjectConfig')
    if (existing.exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before editing subject configs.')
    }

    const body = await request.json()
    const {
      isCompulsory,
      isOptional,
      isAdditional,
      gradeOnly,
      totalMarks,
      passingPercentage,
      examDate,
      durationMinutes,
    } = body

    const updateData: Record<string, unknown> = {}

    if (totalMarks !== undefined) {
      const n = Number(totalMarks)
      if (!Number.isFinite(n) || n <= 0) return apiError(400, 'totalMarks must be positive.')
      updateData.totalMarks = n
    }
    if (passingPercentage !== undefined) {
      const n = Number(passingPercentage)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return apiError(400, 'passingPercentage must be between 0 and 100.')
      }
      updateData.passingPercentage = n
    }
    if (isCompulsory !== undefined) updateData.isCompulsory = Boolean(isCompulsory)
    if (isOptional !== undefined) updateData.isOptional = Boolean(isOptional)
    if (isAdditional !== undefined) updateData.isAdditional = Boolean(isAdditional)
    if (gradeOnly !== undefined) updateData.gradeOnly = Boolean(gradeOnly)

    if (examDate !== undefined) {
      if (examDate === null || examDate === '') {
        updateData.examDate = null
      } else {
        const d = new Date(String(examDate))
        if (Number.isNaN(d.getTime())) return apiError(400, 'examDate is not a valid date.')
        updateData.examDate = d
      }
    }
    if (durationMinutes !== undefined) {
      if (durationMinutes === null) {
        updateData.durationMinutes = null
      } else {
        const dm = Math.trunc(Number(durationMinutes))
        if (!Number.isFinite(dm) || dm < 0) return apiError(400, 'durationMinutes must be non-negative.')
        updateData.durationMinutes = dm
      }
    }

    // If totalMarks changes, the component sum must still match it (or be empty).
    const nextTotal = (updateData.totalMarks as number | undefined) ?? existing.totalMarks
    if (existing.components.length > 0) {
      const sum = existing.components.reduce((s, c) => s + c.maxMarks, 0)
      if (Math.abs(sum - nextTotal) > 0.0001) {
        return apiError(
          409,
          `Component max marks (${sum}) must equal totalMarks (${nextTotal}). Update the components first.`,
        )
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.examSubjectConfig.update({
        where: { id },
        data: updateData,
        include: { components: { orderBy: { sequence: 'asc' } } },
      })
      await logExamChange(
        tx,
        schoolId,
        'ExamSubjectConfig',
        id,
        'updated',
        existing,
        result,
        { ...auditCtx, examId: existing.examId },
      )
      return result
    })

    return NextResponse.json({ config: updated, message: 'Subject config updated.' })
  } catch (error) {
    console.error('Update subject config error:', error)
    return internalError('updating the subject config')
  }
}

// DELETE /api/school/exams/subject-configs/[id] - soft delete (rejected if marks exist)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to remove subject configs.")
    }
    const { id } = await params

    const existing = await db.examSubjectConfig.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { exam: { select: { lockedAt: true } } },
    })
    if (!existing) return notFoundError('ExamSubjectConfig')
    if (existing.exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it first.')
    }

    const marks = await db.marksEntry.count({
      where: { subjectConfigId: id, deletedAt: null },
    })
    if (marks > 0) {
      return apiError(409, 'Marks have already been entered for this subject. Remove the marks first.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.examSubjectConfig.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
      await logExamChange(
        tx,
        schoolId,
        'ExamSubjectConfig',
        id,
        'deleted',
        existing,
        null,
        { ...auditCtx, examId: existing.examId },
      )
    })

    return NextResponse.json({ message: 'Subject config removed.' })
  } catch (error) {
    console.error('Delete subject config error:', error)
    return internalError('removing the subject config')
  }
}
