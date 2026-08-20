import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'

interface ConfigInput {
  classId: string
  sectionId?: string | null
  subjectId: string
  isCompulsory?: boolean
  isOptional?: boolean
  isAdditional?: boolean
  gradeOnly?: boolean
  totalMarks?: number
  passingPercentage?: number
  examDate?: string | null
  durationMinutes?: number | null
}

function validateConfig(c: unknown): { ok: true; v: ConfigInput } | { ok: false; error: string } {
  if (!c || typeof c !== 'object') return { ok: false, error: 'Each subject config must be an object.' }
  const o = c as Record<string, unknown>
  if (typeof o.classId !== 'string' || !o.classId) {
    return { ok: false, error: 'classId is required on each subject config.' }
  }
  if (typeof o.subjectId !== 'string' || !o.subjectId) {
    return { ok: false, error: 'subjectId is required on each subject config.' }
  }
  if (o.sectionId !== undefined && o.sectionId !== null && typeof o.sectionId !== 'string') {
    return { ok: false, error: 'sectionId must be a string or null.' }
  }
  const totalMarks = o.totalMarks === undefined ? 100 : Number(o.totalMarks)
  const passingPercentage = o.passingPercentage === undefined ? 33 : Number(o.passingPercentage)
  if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
    return { ok: false, error: 'totalMarks must be a positive number.' }
  }
  if (!Number.isFinite(passingPercentage) || passingPercentage < 0 || passingPercentage > 100) {
    return { ok: false, error: 'passingPercentage must be between 0 and 100.' }
  }
  let examDate: string | null = null
  if (o.examDate !== undefined && o.examDate !== null && o.examDate !== '') {
    const d = new Date(String(o.examDate))
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'examDate must be a valid date.' }
    examDate = d.toISOString()
  }
  let durationMinutes: number | null = null
  if (o.durationMinutes !== undefined && o.durationMinutes !== null) {
    const dm = Math.trunc(Number(o.durationMinutes))
    if (!Number.isFinite(dm) || dm < 0) return { ok: false, error: 'durationMinutes must be a non-negative integer.' }
    durationMinutes = dm
  }
  return {
    ok: true,
    v: {
      classId: o.classId,
      sectionId: (o.sectionId as string | null | undefined) ?? null,
      subjectId: o.subjectId,
      isCompulsory: o.isCompulsory === undefined ? true : Boolean(o.isCompulsory),
      isOptional: Boolean(o.isOptional),
      isAdditional: Boolean(o.isAdditional),
      gradeOnly: Boolean(o.gradeOnly),
      totalMarks,
      passingPercentage,
      examDate,
      durationMinutes,
    },
  }
}

// GET /api/school/exams/[id]/subject-configs - list configs (with components) for an exam
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

    const exam = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!exam) return notFoundError('Exam')

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') ?? undefined
    const sectionId = searchParams.get('sectionId') ?? undefined
    const subjectId = searchParams.get('subjectId') ?? undefined

    const configs = await db.examSubjectConfig.findMany({
      where: {
        examId: id,
        schoolId: user.schoolId,
        deletedAt: null,
        ...(classId ? { classId } : {}),
        ...(sectionId === 'null' ? { sectionId: null } : sectionId ? { sectionId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      include: { components: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ classId: 'asc' }, { subjectId: 'asc' }],
    })

    return NextResponse.json({ configs })
  } catch (error) {
    console.error('List subject configs error:', error)
    return internalError('loading subject configs')
  }
}

// POST /api/school/exams/[id]/subject-configs - bulk create configs
// Body: { configs: ConfigInput[] }
// Skips rows that already exist (upserts insert-only) to make repeat saves safe.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to configure exams.")
    }
    const { id } = await params

    const exam = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')
    if (exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before changing subject configs.')
    }

    const body = await request.json()
    if (!Array.isArray(body?.configs) || body.configs.length === 0) {
      return apiError(400, 'Please send at least one subject config in the configs array.')
    }

    const validated: ConfigInput[] = []
    for (const raw of body.configs) {
      const v = validateConfig(raw)
      if (!v.ok) return apiError(400, v.error)
      validated.push(v.v)
    }

    // Validate referenced classes + subjects belong to this school.
    const classIds = Array.from(new Set(validated.map((v) => v.classId)))
    const subjectIds = Array.from(new Set(validated.map((v) => v.subjectId)))
    const [foundClasses, foundSubjects] = await Promise.all([
      db.class.findMany({
        where: { id: { in: classIds }, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      }),
      db.subject.findMany({
        where: { id: { in: subjectIds }, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      }),
    ])
    if (foundClasses.length !== classIds.length) {
      return apiError(400, 'One or more of the selected classes could not be found.')
    }
    if (foundSubjects.length !== subjectIds.length) {
      return apiError(400, 'One or more of the selected subjects could not be found.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const result = await db.$transaction(async (tx) => {
      const created: { id: string; classId: string; subjectId: string; sectionId: string | null }[] = []
      const skipped: { classId: string; subjectId: string; sectionId: string | null }[] = []
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []

      for (const cfg of validated) {
        const existing = await tx.examSubjectConfig.findFirst({
          where: {
            examId: id,
            classId: cfg.classId,
            subjectId: cfg.subjectId,
            sectionId: cfg.sectionId ?? null,
            deletedAt: null,
          },
        })
        if (existing) {
          skipped.push({ classId: cfg.classId, subjectId: cfg.subjectId, sectionId: cfg.sectionId ?? null })
          continue
        }

        const row = await tx.examSubjectConfig.create({
          data: {
            schoolId,
            examId: id,
            classId: cfg.classId,
            sectionId: cfg.sectionId ?? null,
            subjectId: cfg.subjectId,
            isCompulsory: cfg.isCompulsory ?? true,
            isOptional: cfg.isOptional ?? false,
            isAdditional: cfg.isAdditional ?? false,
            gradeOnly: cfg.gradeOnly ?? false,
            totalMarks: cfg.totalMarks ?? 100,
            passingPercentage: cfg.passingPercentage ?? 33,
            examDate: cfg.examDate ? new Date(cfg.examDate) : null,
            durationMinutes: cfg.durationMinutes ?? null,
          },
        })
        created.push({ id: row.id, classId: row.classId, subjectId: row.subjectId, sectionId: row.sectionId })
        auditEntries.push({
          entityType: 'ExamSubjectConfig',
          entityId: row.id,
          action: 'created',
          oldValue: null,
          newValue: row,
          examId: id,
        })
      }

      if (auditEntries.length) {
        await logExamChangesBatch(tx, schoolId, auditEntries, { ...auditCtx, examId: id })
      }

      return { created, skipped }
    })

    return NextResponse.json(
      {
        created: result.created,
        skipped: result.skipped,
        message: `Created ${result.created.length} subject config(s). Skipped ${result.skipped.length} that already existed.`,
      },
      { status: result.created.length > 0 ? 201 : 200 },
    )
  } catch (error) {
    console.error('Bulk create subject configs error:', error)
    return internalError('saving the subject configs')
  }
}
