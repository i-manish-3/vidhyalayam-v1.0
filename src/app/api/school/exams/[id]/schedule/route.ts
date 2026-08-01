import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError, forbiddenError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'
import {
  type ScheduleRow,
  detectConflictsAgainst,
  minutesOfDay,
} from '@/features/exams/lib/schedule-conflict-checker'

interface ScheduleInput {
  id?: string
  classId: string
  sectionId?: string | null
  subjectId: string
  examDate: string
  startTime: string
  endTime: string
  roomNumber?: string | null
  invigilatorId?: string | null
  maxMarks: number
  durationMinutes?: number | null
  instructions?: string | null
}

function validateRow(c: unknown): { ok: true; v: ScheduleInput } | { ok: false; error: string } {
  if (!c || typeof c !== 'object') return { ok: false, error: 'Each schedule row must be an object.' }
  const o = c as Record<string, unknown>
  const required = ['classId', 'subjectId', 'examDate', 'startTime', 'endTime']
  for (const k of required) {
    if (typeof o[k] !== 'string' || !o[k]) return { ok: false, error: `${k} is required.` }
  }
  const examDateStr = String(o.examDate)
  const examDate = new Date(examDateStr)
  if (Number.isNaN(examDate.getTime())) return { ok: false, error: 'examDate must be a valid date.' }
  try {
    const startMin = minutesOfDay(String(o.startTime))
    const endMin = minutesOfDay(String(o.endTime))
    if (endMin <= startMin) return { ok: false, error: 'endTime must be after startTime.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid time.' }
  }
  const maxMarks = Number(o.maxMarks)
  if (!Number.isFinite(maxMarks) || maxMarks < 0) return { ok: false, error: 'maxMarks must be non-negative.' }
  const durationMinutes = o.durationMinutes === undefined || o.durationMinutes === null
    ? null
    : Math.trunc(Number(o.durationMinutes))
  if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes < 0)) {
    return { ok: false, error: 'durationMinutes must be a non-negative integer.' }
  }
  return {
    ok: true,
    v: {
      id: typeof o.id === 'string' ? o.id : undefined,
      classId: String(o.classId),
      sectionId: o.sectionId === undefined || o.sectionId === null || o.sectionId === ''
        ? null
        : String(o.sectionId),
      subjectId: String(o.subjectId),
      examDate: examDateStr,
      startTime: String(o.startTime),
      endTime: String(o.endTime),
      roomNumber: o.roomNumber === undefined || o.roomNumber === null || o.roomNumber === ''
        ? null
        : String(o.roomNumber),
      invigilatorId: o.invigilatorId === undefined || o.invigilatorId === null || o.invigilatorId === ''
        ? null
        : String(o.invigilatorId),
      maxMarks,
      durationMinutes: durationMinutes ?? null,
      instructions: o.instructions === undefined || o.instructions === null || o.instructions === ''
        ? null
        : String(o.instructions),
    },
  }
}

function toScheduleRow(r: {
  id?: string
  classId: string
  sectionId: string | null
  subjectId: string
  examDate: Date | string
  startTime: string
  endTime: string
  invigilatorId: string | null
}): ScheduleRow {
  return {
    id: r.id,
    classId: r.classId,
    sectionId: r.sectionId,
    subjectId: r.subjectId,
    examDate: r.examDate,
    startTime: r.startTime,
    endTime: r.endTime,
    invigilatorId: r.invigilatorId,
  }
}

// GET /api/school/exams/[id]/schedule
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

    const rows = await db.examSchedule.findMany({
      where: { schoolId: user.schoolId, examId: id },
      orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
    })

    return NextResponse.json({ schedule: rows })
  } catch (error) {
    console.error('List exam schedule error:', error)
    return internalError('loading the exam schedule')
  }
}

// POST /api/school/exams/[id]/schedule - Upsert one schedule row
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:schedule')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage the exam schedule.")
    }
    const { id } = await params

    const exam = await db.exam.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')
    if (exam.lockedAt) {
      return apiError(423, 'This exam is locked. Unlock it before changing the schedule.')
    }

    const body = await request.json()
    const v = validateRow(body)
    if (!v.ok) return apiError(400, v.error)
    const row = v.v

    // Compare against ALL other schedule rows for this school on the same date.
    const existingForDate = await db.examSchedule.findMany({
      where: {
        schoolId: user.schoolId,
        examDate: new Date(row.examDate),
        ...(row.id ? { NOT: { id: row.id } } : {}),
      },
    })
    const conflicts = detectConflictsAgainst(
      toScheduleRow({
        id: row.id,
        classId: row.classId,
        sectionId: row.sectionId ?? null,
        subjectId: row.subjectId,
        examDate: row.examDate,
        startTime: row.startTime,
        endTime: row.endTime,
        invigilatorId: row.invigilatorId ?? null,
      }),
      existingForDate.map(toScheduleRow),
    )
    if (conflicts.length > 0) {
      return apiError(409, conflicts[0].message)
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const data = {
      schoolId,
      examId: id,
      classId: row.classId,
      sectionId: row.sectionId ?? null,
      subjectId: row.subjectId,
      examDate: new Date(row.examDate),
      startTime: row.startTime,
      endTime: row.endTime,
      roomNumber: row.roomNumber ?? null,
      invigilatorId: row.invigilatorId ?? null,
      maxMarks: row.maxMarks,
      durationMinutes:
        row.durationMinutes ??
        Math.max(0, minutesOfDay(row.endTime) - minutesOfDay(row.startTime)),
      instructions: row.instructions ?? null,
    }

    type ScheduleRowEntity = Awaited<ReturnType<typeof db.examSchedule.create>>
    const result = await db.$transaction(async (tx): Promise<ScheduleRowEntity | null> => {
      let saved: ScheduleRowEntity
      let oldRow: ScheduleRowEntity | null = null
      if (row.id) {
        oldRow = await tx.examSchedule.findUnique({ where: { id: row.id } })
        if (!oldRow || oldRow.schoolId !== schoolId || oldRow.examId !== id) {
          return null
        }
        saved = await tx.examSchedule.update({ where: { id: row.id }, data })
      } else {
        saved = await tx.examSchedule.create({ data })
      }
      await logExamChange(
        tx,
        schoolId,
        'ExamSchedule',
        saved.id,
        oldRow ? 'updated' : 'created',
        oldRow,
        saved,
        { ...auditCtx, examId: id },
      )
      return saved
    })

    if (!result) return apiError(404, 'The schedule row you tried to update could not be found.')

    return NextResponse.json({ schedule: result }, { status: row.id ? 200 : 201 })
  } catch (error) {
    console.error('Save exam schedule row error:', error)
    return internalError('saving the schedule row')
  }
}
