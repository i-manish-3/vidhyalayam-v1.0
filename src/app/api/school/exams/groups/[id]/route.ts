import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_AGG_TYPES = ['weighted', 'best_of_n', 'sum_all']

function validateGroupAggRule(value: unknown):
  | { ok: true; json: string | null }
  | { ok: false; error: string } {
  if (value === null || value === '') {
    return { ok: true, json: null }
  }
  if (value === undefined) {
    return { ok: true, json: undefined as unknown as null } // signals "no change"
  }
  let obj: unknown = value
  if (typeof value === 'string') {
    try {
      obj = JSON.parse(value)
    } catch {
      return { ok: false, error: "The aggregation rule isn't valid JSON." }
    }
  }
  if (typeof obj !== 'object' || obj === null) {
    return { ok: false, error: 'The aggregation rule must be a JSON object.' }
  }
  const t = (obj as Record<string, unknown>).type
  if (typeof t !== 'string' || !VALID_AGG_TYPES.includes(t)) {
    return { ok: false, error: `Aggregation type must be one of: ${VALID_AGG_TYPES.join(', ')}.` }
  }
  return { ok: true, json: JSON.stringify(obj) }
}

// GET /api/school/exams/groups/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const group = await db.examGroup.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        paradigm: { select: { id: true, name: true, academicYear: true } },
        exams: {
          where: { deletedAt: null },
          orderBy: { startDate: 'asc' },
          select: { id: true, name: true, shortCode: true, status: true, startDate: true, endDate: true },
        },
      },
    })

    if (!group) return notFoundError('ExamGroup')
    return NextResponse.json({ group })
  } catch (error) {
    console.error('Get exam group error:', error)
    return internalError('loading the exam group')
  }
}

// PATCH /api/school/exams/groups/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update exam groups.")
    }

    const { id } = await params
    const body = await request.json()
    const { name, shortCode, sequence, weight, aggregationRule, isCoScholastic } = body

    const existing = await db.examGroup.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('ExamGroup')

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) return apiError(400, 'Please enter a group name.')
      if (trimmed !== existing.name) {
        const dup = await db.examGroup.findFirst({
          where: {
            schoolId: user.schoolId,
            paradigmId: existing.paradigmId,
            name: trimmed,
            deletedAt: null,
            id: { not: id },
          },
        })
        if (dup) return apiError(409, `A group named "${trimmed}" already exists under this paradigm.`)
      }
      updateData.name = trimmed
    }

    if (shortCode !== undefined) {
      updateData.shortCode = shortCode ? String(shortCode).trim() : null
    }

    if (sequence !== undefined) {
      const n = Math.trunc(Number(sequence))
      if (!Number.isFinite(n) || n < 0) return apiError(400, 'Sequence must be a non-negative number.')
      updateData.sequence = n
    }

    if (weight !== undefined) {
      const w = Number(weight)
      if (!Number.isFinite(w) || w < 0 || w > 100) return apiError(400, 'Weight must be 0-100.')
      updateData.weight = w
    }

    if (aggregationRule !== undefined) {
      const agg = validateGroupAggRule(aggregationRule)
      if (!agg.ok) return apiError(400, agg.error)
      updateData.aggregationRule = agg.json
    }

    if (isCoScholastic !== undefined) updateData.isCoScholastic = Boolean(isCoScholastic)

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.examGroup.update({ where: { id }, data: updateData })
      await logExamChange(tx, schoolId, 'ExamGroup', id, 'updated', existing, result, auditCtx)
      return result
    })

    return NextResponse.json({ group: updated, message: 'Group updated.' })
  } catch (error) {
    console.error('Update exam group error:', error)
    return internalError('updating the exam group')
  }
}

// DELETE /api/school/exams/groups/[id] - blocked if exams exist under it
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete exam groups.")
    }
    const { id } = await params

    const existing = await db.examGroup.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('ExamGroup')

    const liveExamCount = await db.exam.count({
      where: { schoolId: user.schoolId, examGroupId: id, deletedAt: null },
    })
    if (liveExamCount > 0) {
      return apiError(
        409,
        'This group has exams already created under it. Delete or move those exams first.',
      )
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      await tx.examGroup.update({
        where: { id },
        data: { deletedAt: new Date() },
      })
      await logExamChange(tx, schoolId, 'ExamGroup', id, 'deleted', existing, null, auditCtx)
    })

    return NextResponse.json({ message: 'Group deleted.' })
  } catch (error) {
    console.error('Delete exam group error:', error)
    return internalError('deleting the exam group')
  }
}
