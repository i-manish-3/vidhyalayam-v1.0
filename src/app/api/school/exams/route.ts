import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

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
const VALID_STATUSES = ['draft', 'scheduled', 'ongoing', 'completed', 'result_published']

function parseDateOrNull(value: unknown, field: string): { ok: true; date: Date | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, date: null }
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return { ok: false, error: `${field} isn't a valid date.` }
  return { ok: true, date: d }
}

interface ExamClassInput {
  classId: string
  sectionIds?: string[] | null
}

function validateExamClasses(value: unknown): { ok: true; rows: ExamClassInput[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, rows: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'Classes must be an array.' }
  const seen = new Set<string>()
  const rows: ExamClassInput[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return { ok: false, error: 'Each class entry must be an object.' }
    const classId = (item as Record<string, unknown>).classId
    if (typeof classId !== 'string' || !classId) return { ok: false, error: 'Each class entry needs a classId.' }
    if (seen.has(classId)) return { ok: false, error: 'Duplicate classId in the classes list.' }
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

// GET /api/school/exams - List exams
// Supports filters: academicYear, examGroupId, paradigmId, status, classId
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const permitted = await requirePermission(request, 'exam:view')
    if (!permitted) return forbiddenError()

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear') ?? undefined
    const examGroupId = searchParams.get('examGroupId') ?? undefined
    const paradigmId = searchParams.get('paradigmId') ?? undefined
    const status = searchParams.get('status') ?? undefined
    const classId = searchParams.get('classId') ?? undefined

    const exams = await db.exam.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(academicYear ? { academicYear } : {}),
        ...(examGroupId ? { examGroupId } : {}),
        ...(status ? { status } : {}),
        ...(paradigmId ? { group: { paradigmId } } : {}),
        ...(classId ? { examClasses: { some: { classId } } } : {}),
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            paradigmId: true,
            paradigm: { select: { id: true, name: true } },
          },
        },
        examClasses: { select: { classId: true, sectionIds: true } },
        _count: { select: { subjectConfigs: true, schedules: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { startDate: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ exams })
  } catch (error) {
    console.error('List exams error:', error)
    return internalError('loading exams')
  }
}

// POST /api/school/exams - Create exam
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create exams.")
    }

    const body = await request.json()
    const {
      academicYear,
      examGroupId,
      name,
      shortCode,
      examType,
      startDate,
      endDate,
      includeInResult,
      classes,
      parentExamId,
      autoAddSubjects,
    } = body

    if (!academicYear || typeof academicYear !== 'string') {
      return apiError(400, 'Please choose an academic year for this exam.')
    }
    if (!examGroupId || typeof examGroupId !== 'string') {
      return apiError(400, 'Please choose the group this exam belongs to.')
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return apiError(400, 'Please enter a name for the exam.')
    }
    const trimmedName = name.trim()

    const resolvedExamType = examType ?? 'written'
    if (!VALID_EXAM_TYPES.includes(resolvedExamType)) {
      return apiError(400, `Exam type must be one of: ${VALID_EXAM_TYPES.join(', ')}.`)
    }

    const start = parseDateOrNull(startDate, 'Start date')
    if (!start.ok) return apiError(400, start.error)
    const end = parseDateOrNull(endDate, 'End date')
    if (!end.ok) return apiError(400, end.error)
    if (start.date && end.date && end.date < start.date) {
      return apiError(400, 'End date must be on or after the start date.')
    }

    const classRows = validateExamClasses(classes)
    if (!classRows.ok) return apiError(400, classRows.error)

    const group = await db.examGroup.findFirst({
      where: { id: examGroupId, schoolId: user.schoolId, deletedAt: null },
      include: { paradigm: true },
    })
    if (!group) return apiError(404, "We couldn't find that exam group.")
    if (group.paradigm.academicYear !== academicYear) {
      return apiError(400, 'Academic year must match the paradigm.')
    }

    if (parentExamId) {
      const parent = await db.exam.findFirst({
        where: { id: String(parentExamId), schoolId: user.schoolId, deletedAt: null },
      })
      if (!parent) return apiError(400, "We couldn't find the parent exam.")
    }

    // Validate class IDs belong to this school.
    if (classRows.rows.length > 0) {
      const classIds = classRows.rows.map((r) => r.classId)
      const found = await db.class.findMany({
        where: { id: { in: classIds }, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      })
      if (found.length !== classIds.length) {
        return apiError(400, 'One or more of the selected classes could not be found.')
      }
    }

    const dup = await db.exam.findFirst({
      where: {
        schoolId: user.schoolId,
        academicYear,
        examGroupId,
        name: trimmedName,
        deletedAt: null,
      },
    })
    if (dup) {
      return apiError(409, `An exam named "${trimmedName}" already exists in this group.`)
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)
    let autoAddedSubjects = 0

    const exam = await db.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          schoolId,
          academicYear,
          examGroupId,
          name: trimmedName,
          shortCode: shortCode ? String(shortCode).trim() : null,
          examType: resolvedExamType,
          startDate: start.date,
          endDate: end.date,
          includeInResult: includeInResult === undefined ? true : Boolean(includeInResult),
          parentExamId: parentExamId ? String(parentExamId) : null,
          createdBy: user.userId,
          examClasses: classRows.rows.length
            ? {
                create: classRows.rows.map((row) => ({
                  classId: row.classId,
                  sectionIds: row.sectionIds && row.sectionIds.length ? JSON.stringify(row.sectionIds) : null,
                })),
              }
            : undefined,
        },
        include: { examClasses: true },
      })

      await logExamChange(
        tx,
        schoolId,
        'Exam',
        created.id,
        'created',
        null,
        created,
        { ...auditCtx, examId: created.id },
      )

      // Auto-include every subject mapped to the selected classes (ClassSubject),
      // so the exam ships with the full class syllabus without manual entry.
      if (autoAddSubjects && classRows.rows.length > 0) {
        const classSubjectRows = await tx.classSubject.findMany({
          where: { classId: { in: classRows.rows.map((r) => r.classId) } },
          select: { classId: true, subjectId: true },
        })
        const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []
        for (const row of classSubjectRows) {
          const cfg = await tx.examSubjectConfig.create({
            data: {
              schoolId,
              examId: created.id,
              classId: row.classId,
              sectionId: null,
              subjectId: row.subjectId,
              isCompulsory: true,
              totalMarks: 100,
              passingMarks: 33,
            },
          })
          autoAddedSubjects += 1
          auditEntries.push({
            entityType: 'ExamSubjectConfig',
            entityId: cfg.id,
            action: 'created',
            oldValue: null,
            newValue: cfg,
            examId: created.id,
          })
        }
        if (auditEntries.length) {
          await logExamChangesBatch(tx, schoolId, auditEntries, { ...auditCtx, examId: created.id })
        }
      }

      return created
    })

    return NextResponse.json(
      { exam, autoAddedSubjects: autoAddedSubjects },
      { status: 201 },
    )
  } catch (error) {
    console.error('Create exam error:', error)
    return internalError('creating the exam')
  }
}
