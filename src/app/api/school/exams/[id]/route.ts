import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_EXAM_TYPES = [
  'written',
  'practical',
  'oral',
  'project',
  'internal',
  'activity',
  'attendance',
  'reexam',
]

function parseDateOrUndefined(value: unknown, field: string):
  | { ok: true; date: Date | null | undefined }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, date: undefined }
  if (value === null || value === '') return { ok: true, date: null }
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return { ok: false, error: `${field} isn't a valid date.` }
  return { ok: true, date: d }
}

interface ExamClassInput {
  classId: string
  sectionIds?: string[] | null
}

function validateExamClasses(value: unknown):
  | { ok: true; rows: ExamClassInput[] | undefined }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true, rows: undefined }
  if (!Array.isArray(value)) return { ok: false, error: 'Classes must be an array.' }
  const seen = new Set<string>()
  const rows: ExamClassInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Each class entry must be an object.' }
    const classId = (item as Record<string, unknown>).classId
    if (typeof classId !== 'string' || !classId) return { ok: false, error: 'Each class entry needs a classId.' }
    if (seen.has(classId)) return { ok: false, error: 'Duplicate classId.' }
    seen.add(classId)
    const sectionIds = (item as Record<string, unknown>).sectionIds
    if (sectionIds === undefined || sectionIds === null) {
      rows.push({ classId, sectionIds: null })
    } else if (Array.isArray(sectionIds) && sectionIds.every((s) => typeof s === 'string')) {
      rows.push({ classId, sectionIds: sectionIds as string[] })
    } else {
      return { ok: false, error: 'sectionIds must be an array of strings or omitted.' }
    }
  }
  return { ok: true, rows }
}

// GET /api/school/exams/[id] - Exam detail with subjectConfigs + schedule + classes
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const { id } = await params

    const exam = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        group: { include: { paradigm: { select: { id: true, name: true, academicYear: true } } } },
        examClasses: true,
        subjectConfigs: {
          where: { deletedAt: null },
          include: {
            components: { orderBy: { sequence: 'asc' } },
          },
        },
        schedules: { orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }] },
      },
    })

    if (!exam) return notFoundError('Exam')
    return NextResponse.json({ exam })
  } catch (error) {
    console.error('Get exam error:', error)
    return internalError('loading the exam')
  }
}

// PATCH /api/school/exams/[id] - Update exam meta + classes
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:update')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to update exams.")
    }
    const { id } = await params
    const body = await request.json()
    const {
      name,
      shortCode,
      examType,
      startDate,
      endDate,
      includeInResult,
      classes,
    } = body

    const existing = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: { examClasses: true },
    })
    if (!existing) return notFoundError('Exam')

    if (existing.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before making changes.')
    }

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      const trimmed = String(name).trim()
      if (!trimmed) return apiError(400, 'Please enter an exam name.')
      if (trimmed !== existing.name) {
        const dup = await db.exam.findFirst({
          where: {
            schoolId: user.schoolId,
            academicYear: existing.academicYear,
            examGroupId: existing.examGroupId,
            name: trimmed,
            deletedAt: null,
            id: { not: id },
          },
        })
        if (dup) return apiError(409, `An exam named "${trimmed}" already exists in this group.`)
      }
      updateData.name = trimmed
    }

    if (shortCode !== undefined) {
      updateData.shortCode = shortCode ? String(shortCode).trim() : null
    }

    if (examType !== undefined) {
      if (!VALID_EXAM_TYPES.includes(examType)) {
        return apiError(400, `Exam type must be one of: ${VALID_EXAM_TYPES.join(', ')}.`)
      }
      updateData.examType = examType
    }

    const start = parseDateOrUndefined(startDate, 'Start date')
    if (!start.ok) return apiError(400, start.error)
    const end = parseDateOrUndefined(endDate, 'End date')
    if (!end.ok) return apiError(400, end.error)
    const finalStart = start.date === undefined ? existing.startDate : start.date
    const finalEnd = end.date === undefined ? existing.endDate : end.date
    if (finalStart && finalEnd && finalEnd < finalStart) {
      return apiError(400, 'End date must be on or after the start date.')
    }
    if (start.date !== undefined) updateData.startDate = start.date
    if (end.date !== undefined) updateData.endDate = end.date

    if (includeInResult !== undefined) updateData.includeInResult = Boolean(includeInResult)

    const classRows = validateExamClasses(classes)
    if (!classRows.ok) return apiError(400, classRows.error)

    if (classRows.rows !== undefined && classRows.rows.length > 0) {
      const classIds = classRows.rows.map((r) => r.classId)
      const found = await db.class.findMany({
        where: { id: { in: classIds }, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      })
      if (found.length !== classIds.length) {
        return apiError(400, 'One or more of the selected classes could not be found.')
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const updated = await db.$transaction(async (tx) => {
      if (classRows.rows !== undefined) {
        // Replace examClasses set wholesale to keep PATCH idempotent.
        await tx.examClass.deleteMany({ where: { examId: id } })
        if (classRows.rows.length > 0) {
          await tx.examClass.createMany({
            data: classRows.rows.map((r) => ({
              examId: id,
              classId: r.classId,
              sectionIds: r.sectionIds && r.sectionIds.length ? JSON.stringify(r.sectionIds) : null,
            })),
          })
        }
      }

      const result = await tx.exam.update({
        where: { id },
        data: updateData,
        include: { examClasses: true },
      })
      await logExamChange(
        tx,
        schoolId,
        'Exam',
        id,
        'updated',
        existing,
        result,
        { ...auditCtx, examId: id },
      )
      return result
    })

    return NextResponse.json({ exam: updated, message: 'Exam updated.' })
  } catch (error) {
    console.error('Update exam error:', error)
    return internalError('updating the exam')
  }
}

// DELETE /api/school/exams/[id] - Soft delete (rejected if marks already entered)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:delete')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to delete exams.")
    }
    const { id } = await params

    const existing = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!existing) return notFoundError('Exam')

    if (existing.status === 'result_published') {
      return apiError(409, 'You cannot delete an exam whose results have been published.')
    }
    if (existing.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it first.')
    }

    const liveMarks = await db.marksEntry.count({
      where: { examId: id, deletedAt: null },
    })
    if (liveMarks > 0) {
      return apiError(409, 'Marks have already been entered for this exam. Soft-delete the marks first.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    await db.$transaction(async (tx) => {
      const now = new Date()
      await tx.exam.update({
        where: { id },
        data: { deletedAt: now, status: 'draft' },
      })
      // Soft-cascade subjectConfigs so they don't block recreating the same exam.
      await tx.examSubjectConfig.updateMany({
        where: { examId: id, deletedAt: null },
        data: { deletedAt: now },
      })
      await logExamChange(
        tx,
        schoolId,
        'Exam',
        id,
        'deleted',
        existing,
        null,
        { ...auditCtx, examId: id },
      )
    })

    return NextResponse.json({ message: 'Exam deleted.' })
  } catch (error) {
    console.error('Delete exam error:', error)
    return internalError('deleting the exam')
  }
}
