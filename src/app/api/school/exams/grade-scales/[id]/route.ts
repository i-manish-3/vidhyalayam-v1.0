import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_SCALE_TYPES = ['percentage', 'marks', 'cgpa']

// GET /api/school/exams/grade-scales/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const permitted = await requirePermission(request, 'exam:view')
    if (!permitted) return forbiddenError()

    const { id } = await params

    const scale = await db.gradeScale.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { bands: { orderBy: { sequence: 'asc' } } },
    })
    if (!scale) return notFoundError('GradeScale')
    return NextResponse.json({ scale })
  } catch (error) {
    console.error('Get grade scale error:', error)
    return internalError('loading the grade scale')
  }
}

// PATCH /api/school/exams/grade-scales/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:gradescale:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage grade scales.")
    }
    const { id } = await params

    const existing = await db.gradeScale.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('GradeScale')

    const body = await request.json()
    const { name, scaleType, isActive, isDefault, paradigmId, examGroupId, classId } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) return apiError(400, 'Please enter a grade scale name.')
      if (trimmed !== existing.name) {
        const dup = await db.gradeScale.findFirst({
          where: { schoolId: user.schoolId, name: trimmed, deletedAt: null, id: { not: id } },
        })
        if (dup) return apiError(409, `A grade scale named "${trimmed}" already exists.`)
      }
      updateData.name = trimmed
    }
    if (scaleType !== undefined) {
      if (!VALID_SCALE_TYPES.includes(scaleType)) {
        return apiError(400, `Scale type must be one of: ${VALID_SCALE_TYPES.join(', ')}.`)
      }
      updateData.scaleType = scaleType
    }
    if (isActive !== undefined) updateData.isActive = Boolean(isActive)
    if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault)
    if (paradigmId !== undefined) updateData.paradigmId = paradigmId || null
    if (examGroupId !== undefined) updateData.examGroupId = examGroupId || null
    if (classId !== undefined) updateData.classId = classId || null

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      if (isDefault === true && !existing.isDefault) {
        await tx.gradeScale.updateMany({
          where: { schoolId, isDefault: true, deletedAt: null, id: { not: id } },
          data: { isDefault: false },
        })
      }
      const result = await tx.gradeScale.update({ where: { id }, data: updateData })
      await logExamChange(tx, schoolId, 'GradeScale', id, 'updated', existing, result, auditCtx)
      return result
    })

    return NextResponse.json({ scale: updated, message: 'Grade scale updated.' })
  } catch (error) {
    console.error('Update grade scale error:', error)
    return internalError('updating the grade scale')
  }
}

// DELETE /api/school/exams/grade-scales/[id] - soft delete (refuse default)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:gradescale:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete grade scales.")
    }
    const { id } = await params

    const existing = await db.gradeScale.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('GradeScale')
    if (existing.isDefault) {
      return apiError(409, 'The default grade scale cannot be deleted. Mark another as default first.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.gradeScale.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      })
      await logExamChange(tx, schoolId, 'GradeScale', id, 'deleted', existing, null, auditCtx)
    })

    return NextResponse.json({ message: 'Grade scale removed.' })
  } catch (error) {
    console.error('Delete grade scale error:', error)
    return internalError('removing the grade scale')
  }
}
