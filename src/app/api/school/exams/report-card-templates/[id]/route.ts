import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_FORMATS = new Set(['cbse', 'simple', 'term_wise', 'grade_only', 'coaching'])

// GET /api/school/exams/report-card-templates/[id]
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

    const template = await db.reportCardTemplate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!template) return notFoundError('Template')

    return NextResponse.json({ template })
  } catch (error) {
    console.error('Get report card template error:', error)
    return internalError('loading the template')
  }
}

// PATCH /api/school/exams/report-card-templates/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:reportcard:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage report card templates.")
    }
    const { id } = await params

    const existing = await db.reportCardTemplate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('Template')

    const body = await request.json().catch(() => ({}))
    const update: Record<string, unknown> = {}

    if (typeof body.name === 'string') {
      const trimmed = body.name.trim()
      if (!trimmed) return apiError(400, 'Name cannot be empty.')
      if (trimmed !== existing.name) {
        const dup = await db.reportCardTemplate.findFirst({
          where: { schoolId: user.schoolId, name: trimmed, deletedAt: null, NOT: { id } },
        })
        if (dup) return apiError(409, `A template named "${trimmed}" already exists.`)
        update.name = trimmed
      }
    }
    if (body.description !== undefined) {
      update.description = typeof body.description === 'string' ? body.description.trim() || null : null
    }
    if (typeof body.format === 'string') {
      if (!VALID_FORMATS.has(body.format)) {
        return apiError(400, `Format must be one of: ${Array.from(VALID_FORMATS).join(', ')}.`)
      }
      update.format = body.format
    }
    if (body.appliesToParadigmId !== undefined) {
      update.appliesToParadigmId = typeof body.appliesToParadigmId === 'string' && body.appliesToParadigmId
        ? body.appliesToParadigmId
        : null
    }
    if (typeof body.layoutJson === 'string') {
      try {
        JSON.parse(body.layoutJson)
      } catch {
        return apiError(400, 'Layout JSON is malformed.')
      }
      update.layoutJson = body.layoutJson
    }
    for (const flag of [
      'includeAttendance',
      'includeRank',
      'includeCoScholastic',
      'showPrincipalRemarks',
      'showTeacherRemarks',
      'isActive',
    ] as const) {
      if (body[flag] !== undefined) update[flag] = Boolean(body[flag])
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)
    const isDefaultBeingSet = body.isDefault === true && !existing.isDefault

    const updated = await db.$transaction(async (tx) => {
      if (isDefaultBeingSet) {
        await tx.reportCardTemplate.updateMany({
          where: { schoolId, isDefault: true, deletedAt: null, NOT: { id } },
          data: { isDefault: false },
        })
        update.isDefault = true
      } else if (body.isDefault === false && existing.isDefault) {
        update.isDefault = false
      }

      const saved = await tx.reportCardTemplate.update({
        where: { id },
        data: update,
      })
      await logExamChange(tx, schoolId, 'ReportCardTemplate', id, 'updated', existing, saved, auditCtx)
      return saved
    })

    return NextResponse.json({ template: updated })
  } catch (error) {
    console.error('Update report card template error:', error)
    return internalError('updating the template')
  }
}

// DELETE /api/school/exams/report-card-templates/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:reportcard:manage')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage report card templates.")
    }
    const { id } = await params

    const existing = await db.reportCardTemplate.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('Template')

    if (existing.isDefault) {
      return apiError(409, 'Cannot delete the default template. Set another template as default first.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      const soft = await tx.reportCardTemplate.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      })
      await logExamChange(tx, schoolId, 'ReportCardTemplate', id, 'deleted', existing, soft, auditCtx)
    })

    return NextResponse.json({ message: 'Template deleted.' })
  } catch (error) {
    console.error('Delete report card template error:', error)
    return internalError('deleting the template')
  }
}
