import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_AGG_TYPES = ['weighted', 'best_of_n', 'sum_all']

function parseAndValidateRule(
  value: unknown,
  fieldLabel: string,
  requireAggType = false,
): { ok: true; json: string } | { ok: false; error: string } {
  let obj: unknown = value
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value)
    } catch {
      return { ok: false, error: `The ${fieldLabel} isn't valid JSON.` }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { ok: false, error: `The ${fieldLabel} must be a JSON object.` }
  }
  if (requireAggType) {
    const t = (obj as Record<string, unknown>).type
    if (typeof t !== 'string' || !VALID_AGG_TYPES.includes(t)) {
      return { ok: false, error: `Aggregation type must be one of: ${VALID_AGG_TYPES.join(', ')}.` }
    }
  }
  return { ok: true, json: JSON.stringify(obj) }
}

// GET /api/school/exams/paradigms/[id] - Paradigm detail with groups
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const permitted = await requirePermission(request, 'exam:view')
    if (!permitted) {
      return forbiddenError()
    }
    const { id } = await params

    const paradigm = await db.examParadigm.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        examGroups: {
          where: { deletedAt: null },
          orderBy: { sequence: 'asc' },
          include: { _count: { select: { exams: true } } },
        },
      },
    })

    if (!paradigm) {
      return notFoundError('ExamParadigm')
    }

    return NextResponse.json({ paradigm })
  } catch (error) {
    console.error('Get exam paradigm error:', error)
    return internalError('loading the exam paradigm')
  }
}

// PATCH /api/school/exams/paradigms/[id] - Update paradigm
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update exam paradigms.")
    }

    const { id } = await params
    const body = await request.json()
    const { name, description, aggregationRule, passingRule, isActive, isDefault } = body

    const existing = await db.examParadigm.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) {
      return notFoundError('ExamParadigm')
    }

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) return apiError(400, 'Please enter a paradigm name.')
      if (trimmed !== existing.name) {
        const dup = await db.examParadigm.findFirst({
          where: {
            schoolId: user.schoolId,
            academicYear: existing.academicYear,
            name: trimmed,
            deletedAt: null,
            id: { not: id },
          },
        })
        if (dup) return apiError(409, `A paradigm named "${trimmed}" already exists for this year.`)
      }
      updateData.name = trimmed
    }

    if (description !== undefined) {
      updateData.description = description ? String(description).trim() : null
    }

    if (aggregationRule !== undefined) {
      const agg = parseAndValidateRule(aggregationRule, 'aggregation rule', true)
      if (!agg.ok) return apiError(400, agg.error)
      updateData.aggregationRule = agg.json
    }

    if (passingRule !== undefined) {
      const passing = parseAndValidateRule(passingRule, 'passing rule')
      if (!passing.ok) return apiError(400, passing.error)
      updateData.passingRule = passing.json
    }

    if (isActive !== undefined) updateData.isActive = Boolean(isActive)
    if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault)

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      if (isDefault === true && !existing.isDefault) {
        await tx.examParadigm.updateMany({
          where: {
            schoolId,
            academicYear: existing.academicYear,
            isDefault: true,
            deletedAt: null,
            id: { not: id },
          },
          data: { isDefault: false },
        })
      }

      const result = await tx.examParadigm.update({
        where: { id },
        data: updateData,
      })
      await logExamChange(tx, schoolId, 'ExamParadigm', id, 'updated', existing, result, auditCtx)
      return result
    })

    return NextResponse.json({ paradigm: updated, message: 'Paradigm updated.' })
  } catch (error) {
    console.error('Update exam paradigm error:', error)
    return internalError('updating the exam paradigm')
  }
}

// DELETE /api/school/exams/paradigms/[id] - Soft delete (rejected if it has exams)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete exam paradigms.")
    }
    const { id } = await params

    const existing = await db.examParadigm.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { _count: { select: { examGroups: true } } },
    })
    if (!existing) {
      return notFoundError('ExamParadigm')
    }

    // Block delete when the paradigm has live exams under any of its groups.
    const liveExamCount = await db.exam.count({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        group: { paradigmId: id, deletedAt: null },
      },
    })
    if (liveExamCount > 0) {
      return apiError(
        409,
        'This paradigm has exams already created under it. Delete or move those exams first.',
      )
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      const now = new Date()
      await tx.examParadigm.update({
        where: { id },
        data: { deletedAt: now, isActive: false, isDefault: false },
      })
      // Cascade-soft-delete groups too so re-creating with same name works.
      await tx.examGroup.updateMany({
        where: { paradigmId: id, deletedAt: null },
        data: { deletedAt: now },
      })
      await logExamChange(tx, schoolId, 'ExamParadigm', id, 'deleted', existing, null, auditCtx)
    })

    return NextResponse.json({ message: 'Paradigm deleted.' })
  } catch (error) {
    console.error('Delete exam paradigm error:', error)
    return internalError('deleting the exam paradigm')
  }
}
