import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { formatIsoDate, getEnrolledStudents } from '@/lib/attendance-report-utils'

// GET /api/school/attendance/audit-log/[id]/changes
// Returns the per-student attendance changes that happened during a specific
// reopen cycle — i.e., between this reopen audit event and the next audit
// event (finalize or another reopen) for the same (date, class, section), or
// up to now if there is no next event. For finalize events, returns empty
// (changes are only meaningful inside a reopen window).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    if (user.role !== 'SCHOOL_ADMIN') {
      const ok = await requirePermission(request, 'attendance:audit:view')
      if (!ok) return apiError(403, "You don't have permission to view attendance audit changes.")
    }

    const { id } = await context.params
    const audit = await db.attendanceAuditLog.findFirst({
      where: { id, schoolId: user.schoolId },
    })
    if (!audit) return apiError(404, 'Audit event not found.')

    // Changes only attach to reopen windows. For finalize rows we return empty
    // (the marks that led to a fresh finalize are the original records, visible
    // on the View Attendance page; no diffs to surface).
    if (audit.action !== 'reopen') {
      return NextResponse.json({ changes: [], windowEnd: null, note: 'Changes are only tracked for reopen events.' })
    }

    const nextEvent = await db.attendanceAuditLog.findFirst({
      where: {
        schoolId: user.schoolId,
        date: audit.date,
        classId: audit.classId,
        sectionId: audit.sectionId,
        createdAt: { gt: audit.createdAt },
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    })
    const windowEnd = nextEvent?.createdAt ?? null

    const enrolled = await getEnrolledStudents(
      user.schoolId,
      audit.academicYear,
      audit.classId,
      audit.sectionId,
    )
    const studentIds = enrolled.map((s) => s.id)
    if (studentIds.length === 0) {
      return NextResponse.json({ changes: [], windowEnd })
    }

    const changes = await db.attendanceChangeLog.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: studentIds },
        date: audit.date,
        changedAt: {
          gt: audit.createdAt,
          ...(windowEnd ? { lt: windowEnd } : {}),
        },
      },
      include: {
        changer: { select: { id: true, name: true, email: true } },
        student: { select: { firstName: true, lastName: true, rollNumber: true } },
      },
      orderBy: { changedAt: 'asc' },
    })

    return NextResponse.json({
      changes: changes.map((c) => ({
        id: c.id,
        studentId: c.studentId,
        studentName: `${c.student.firstName} ${c.student.lastName}`.trim(),
        rollNumber: c.student.rollNumber,
        oldStatus: c.oldStatus,
        newStatus: c.newStatus,
        oldRemarks: c.oldRemarks,
        newRemarks: c.newRemarks,
        changedBy: c.changedBy,
        changedByName: c.changer?.name ?? null,
        changedByEmail: c.changer?.email ?? null,
        changedAt: c.changedAt.toISOString(),
      })),
      windowEnd: windowEnd ? windowEnd.toISOString() : null,
      date: formatIsoDate(audit.date),
    })
  } catch (error) {
    console.error('GET audit-log changes error:', error)
    return internalError()
  }
}
