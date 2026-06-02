import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, forbiddenError, internalError } from '@/lib/api-errors'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/school/exams/audit
 *
 * Query exam audit logs with filtering and pagination. Same shape as
 * /api/school/fees/audit so the UI shares pagination/CSV-export logic.
 *
 * Filters: entityType, action, examId, studentId, userId, startDate, endDate.
 * Pagination: ?page= ?limit= (max 100).
 */
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF', 'TEACHER'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const ok = await requirePermission(request, 'exam:audit:view')
      if (!ok) return forbiddenError("You don't have access to exam audit logs.")
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const skip = (page - 1) * limit

    const entityType = searchParams.get('entityType') || undefined
    const action = searchParams.get('action') || undefined
    const examId = searchParams.get('examId') || undefined
    const studentId = searchParams.get('studentId') || undefined
    const userId = searchParams.get('userId') || undefined
    const startDate = searchParams.get('startDate') || undefined
    const endDate = searchParams.get('endDate') || undefined

    const where: Prisma.ExamAuditLogWhereInput = {
      schoolId: user.schoolId,
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(examId ? { examId } : {}),
      ...(studentId ? { studentId } : {}),
      ...(userId ? { userId } : {}),
    }
    if (startDate || endDate) {
      const range: Prisma.DateTimeFilter = {}
      if (startDate) range.gte = new Date(startDate)
      if (endDate) range.lte = new Date(endDate)
      where.createdAt = range
    }

    const [logs, total] = await Promise.all([
      db.examAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.examAuditLog.count({ where }),
    ])

    // Hydrate referenced user + student + exam in one round trip each.
    const userIds = Array.from(new Set(logs.map((l) => l.userId).filter((x): x is string => !!x)))
    const studentIds = Array.from(new Set(logs.map((l) => l.studentId).filter((x): x is string => !!x)))
    const examIds = Array.from(new Set(logs.map((l) => l.examId).filter((x): x is string => !!x)))

    const [users, students, exams] = await Promise.all([
      db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, role: true },
      }),
      db.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true },
      }),
      db.exam.findMany({
        where: { id: { in: examIds } },
        select: { id: true, name: true, shortCode: true },
      }),
    ])
    const userMap = new Map(users.map((u) => [u.id, u]))
    const studentMap = new Map(students.map((s) => [s.id, s]))
    const examMap = new Map(exams.map((e) => [e.id, e]))

    const parsedLogs = logs.map((log) => ({
      ...log,
      oldValue: log.oldValue ? safeParse(log.oldValue) : null,
      newValue: log.newValue ? safeParse(log.newValue) : null,
      metadata: log.metadata ? safeParse(log.metadata) : null,
      user: log.userId ? userMap.get(log.userId) ?? null : null,
      student: log.studentId ? studentMap.get(log.studentId) ?? null : null,
      exam: log.examId ? examMap.get(log.examId) ?? null : null,
    }))

    return NextResponse.json({
      logs: parsedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Fetch exam audit logs error:', error)
    return internalError('fetching exam audit logs')
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
