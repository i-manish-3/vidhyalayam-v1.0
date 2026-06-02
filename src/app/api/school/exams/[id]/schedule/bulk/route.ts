import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'
import {
  type ScheduleRow,
  detectScheduleConflicts,
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
  if (!c || typeof c !== 'object') return { ok: false, error: 'Each row must be an object.' }
  const o = c as Record<string, unknown>
  for (const k of ['classId', 'subjectId', 'examDate', 'startTime', 'endTime']) {
    if (typeof o[k] !== 'string' || !o[k]) return { ok: false, error: `${k} is required.` }
  }
  const d = new Date(String(o.examDate))
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'examDate is not a valid date.' }
  try {
    const start = minutesOfDay(String(o.startTime))
    const end = minutesOfDay(String(o.endTime))
    if (end <= start) return { ok: false, error: 'endTime must be after startTime.' }
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
      examDate: String(o.examDate),
      startTime: String(o.startTime),
      endTime: String(o.endTime),
      roomNumber: o.roomNumber === undefined || o.roomNumber === null || o.roomNumber === ''
        ? null
        : String(o.roomNumber),
      invigilatorId: o.invigilatorId === undefined || o.invigilatorId === null || o.invigilatorId === ''
        ? null
        : String(o.invigilatorId),
      maxMarks,
      durationMinutes,
      instructions: o.instructions === undefined || o.instructions === null || o.instructions === ''
        ? null
        : String(o.instructions),
    },
  }
}

// POST /api/school/exams/[id]/schedule/bulk - Replace the entire schedule for this exam
// Body: { rows: ScheduleInput[] }
// Validates internal conflicts AND cross-exam conflicts at the school level.
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
      return apiError(423, 'This exam is locked. Unlock it before bulk-replacing the schedule.')
    }

    const body = await request.json()
    if (!Array.isArray(body?.rows)) {
      return apiError(400, 'Please send a rows array.')
    }

    const validated: ScheduleInput[] = []
    for (const raw of body.rows) {
      const v = validateRow(raw)
      if (!v.ok) return apiError(400, v.error)
      validated.push(v.v)
    }

    // Internal conflicts within the payload.
    const internalRows: ScheduleRow[] = validated.map((r) => ({
      classId: r.classId,
      sectionId: r.sectionId ?? null,
      subjectId: r.subjectId,
      examDate: new Date(r.examDate),
      startTime: r.startTime,
      endTime: r.endTime,
      invigilatorId: r.invigilatorId ?? null,
    }))
    const internalConflicts = detectScheduleConflicts(internalRows)
    if (internalConflicts.length > 0) {
      return apiError(409, `Schedule has internal conflicts: ${internalConflicts[0].message}`)
    }

    // Cross-exam conflicts (other exams of this school on the same dates).
    const candidateDates = Array.from(new Set(validated.map((r) => r.examDate)))
    const otherRows = await db.examSchedule.findMany({
      where: {
        schoolId: user.schoolId,
        examId: { not: id },
        examDate: { in: candidateDates.map((d) => new Date(d)) },
      },
      select: {
        id: true,
        classId: true,
        sectionId: true,
        subjectId: true,
        examDate: true,
        startTime: true,
        endTime: true,
        invigilatorId: true,
      },
    })
    if (otherRows.length > 0) {
      const merged = [...internalRows, ...otherRows.map((r) => ({
        id: r.id,
        classId: r.classId,
        sectionId: r.sectionId,
        subjectId: r.subjectId,
        examDate: r.examDate,
        startTime: r.startTime,
        endTime: r.endTime,
        invigilatorId: r.invigilatorId,
      } as ScheduleRow))]
      const crossConflicts = detectScheduleConflicts(merged).filter(
        // only conflicts that involve at least one of the new rows (index < validated.length)
        (c) =>
          (c.rowAIndex !== undefined && c.rowAIndex < validated.length) ||
          (c.rowBIndex !== undefined && c.rowBIndex < validated.length),
      )
      if (crossConflicts.length > 0) {
        return apiError(409, `Schedule conflicts with another exam: ${crossConflicts[0].message}`)
      }
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const result = await db.$transaction(async (tx) => {
      const previous = await tx.examSchedule.findMany({
        where: { schoolId, examId: id },
      })

      await tx.examSchedule.deleteMany({ where: { schoolId, examId: id } })

      if (validated.length > 0) {
        await tx.examSchedule.createMany({
          data: validated.map((r) => ({
            schoolId,
            examId: id,
            classId: r.classId,
            sectionId: r.sectionId ?? null,
            subjectId: r.subjectId,
            examDate: new Date(r.examDate),
            startTime: r.startTime,
            endTime: r.endTime,
            roomNumber: r.roomNumber ?? null,
            invigilatorId: r.invigilatorId ?? null,
            maxMarks: r.maxMarks,
            durationMinutes:
              r.durationMinutes ??
              Math.max(0, minutesOfDay(r.endTime) - minutesOfDay(r.startTime)),
            instructions: r.instructions ?? null,
          })),
        })
      }

      const saved = await tx.examSchedule.findMany({
        where: { schoolId, examId: id },
        orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
      })

      await logExamChange(
        tx,
        schoolId,
        'ExamSchedule',
        id,
        'updated',
        { rows: previous },
        { rows: saved },
        { ...auditCtx, examId: id, metadata: { bulkReplace: true, count: saved.length } },
      )

      return saved
    })

    return NextResponse.json({ schedule: result, message: `Saved ${result.length} schedule row(s).` })
  } catch (error) {
    console.error('Bulk save exam schedule error:', error)
    return internalError('saving the exam schedule')
  }
}
