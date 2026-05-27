import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  formatIsoDate,
  getEnrolledStudents,
} from '@/lib/attendance-report-utils'

// GET /api/school/attendance/snapshot?auditId=<id>
// Reconstructs the attendance state for an audit event's (date, class, section)
// at the moment that audit event happened. Uses `AttendanceChangeLog` to walk
// backwards from the current `Attendance` row — for each student, the earliest
// change after the audit time gives the historical `oldStatus` / `oldRemarks`;
// if no later change exists, the current row IS the historical value.
//
// Response shape mirrors GET /api/school/attendance so the same View Attendance
// UI can render it. Adds a `snapshot` block describing what was captured.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    if (user.role !== 'SCHOOL_ADMIN') {
      const ok = await requirePermission(request, 'attendance:audit:view')
      if (!ok) return apiError(403, "You don't have permission to view attendance snapshots.")
    }

    const { searchParams } = new URL(request.url)
    const auditId = searchParams.get('auditId') || ''
    if (!auditId) return apiError(400, 'auditId is required.')

    const audit = await db.attendanceAuditLog.findFirst({
      where: { id: auditId, schoolId: user.schoolId },
      include: { actor: { select: { id: true, name: true, email: true } } },
    })
    if (!audit) return apiError(404, 'Audit event not found.')

    const enrolled = await getEnrolledStudents(
      user.schoolId,
      audit.academicYear,
      audit.classId,
      audit.sectionId,
    )
    if (enrolled.length === 0) {
      return NextResponse.json({
        records: [],
        stats: { total: 0, present: 0, absent: 0, leave: 0 },
        finalized: audit.action === 'finalize',
        finalizedAt: audit.action === 'finalize' ? audit.createdAt.toISOString() : null,
        snapshot: { ...snapshotMeta(audit), isCurrent: true },
        pagination: { page: 1, limit: 0, total: 0, totalPages: 1 },
      })
    }

    const studentIds = enrolled.map((s) => s.id)

    // Current Attendance rows for these students on this date.
    const currentRows = await db.attendance.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear: audit.academicYear,
        studentId: { in: studentIds },
        date: audit.date,
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        remarks: true,
        markedBy: true,
        createdAt: true,
        updatedAt: true,
        markedByUser: { select: { id: true, name: true } },
      },
    })

    // All change-log rows after the audit moment for these students on this date.
    // Sorted asc — the FIRST one per student tells us what the value was AT the audit time.
    const laterChanges = await db.attendanceChangeLog.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear: audit.academicYear,
        studentId: { in: studentIds },
        date: audit.date,
        changedAt: { gt: audit.createdAt },
      },
      orderBy: { changedAt: 'asc' },
      select: {
        studentId: true,
        oldStatus: true,
        oldRemarks: true,
        changedAt: true,
      },
    })

    // Detect whether this snapshot is effectively the current state. The
    // snapshot equals "current" when no per-student changes have been logged
    // since this audit event AND no later audit event (which would have
    // touched the finalized flag) exists for the same key. The frontend uses
    // this to suppress the "historical snapshot" banner — the latest finalize
    // IS the current state and treating it as historical is confusing.
    const laterAuditEvent = await db.attendanceAuditLog.findFirst({
      where: {
        schoolId: user.schoolId,
        date: audit.date,
        classId: audit.classId,
        sectionId: audit.sectionId,
        createdAt: { gt: audit.createdAt },
      },
      select: { id: true },
    })
    const isCurrent = !laterAuditEvent && laterChanges.length === 0

    const firstChangeByStudent = new Map<string, { oldStatus: string; oldRemarks: string | null }>()
    for (const c of laterChanges) {
      if (!firstChangeByStudent.has(c.studentId)) {
        firstChangeByStudent.set(c.studentId, { oldStatus: c.oldStatus, oldRemarks: c.oldRemarks })
      }
    }

    const currentByStudent = new Map(currentRows.map((r) => [r.studentId, r]))

    // Build per-student snapshot records. Skip students whose Attendance row was
    // created AFTER the audit time (they weren't marked yet at that moment).
    type SnapshotRecord = {
      id: string
      date: string
      status: string
      remarks: string | null
      createdAt: string | null
      updatedAt: string | null
      student: {
        id: string
        firstName: string
        lastName: string
        rollNumber: string | null
        classId: string | null
        sectionId: string | null
        class: { name: string } | null
        section: { name: string } | null
      }
      markedByUser: { id: string; name: string } | null
    }
    const records: SnapshotRecord[] = []
    for (const s of enrolled) {
      const cur = currentByStudent.get(s.id)
      const earliestChange = firstChangeByStudent.get(s.id)

      // Determine snapshot status:
      // - If there is a change after audit time → use that change's oldStatus
      // - Else if there is a current row → use its current status (no changes since)
      // - Else → not marked at audit time → skip
      let snapshotStatus: string | null = null
      let snapshotRemarks: string | null = null
      if (earliestChange) {
        snapshotStatus = earliestChange.oldStatus
        snapshotRemarks = earliestChange.oldRemarks
      } else if (cur && cur.createdAt <= audit.createdAt) {
        snapshotStatus = cur.status
        snapshotRemarks = cur.remarks
      } else {
        // Either no Attendance row exists, OR the row was created AFTER the audit
        // moment. Either way the student was unmarked at audit time — skip.
        continue
      }

      records.push({
        id: cur?.id ?? `snapshot-${s.id}`,
        date: formatIsoDate(audit.date),
        status: snapshotStatus,
        remarks: snapshotRemarks,
        createdAt: cur?.createdAt.toISOString() ?? null,
        updatedAt: cur?.updatedAt.toISOString() ?? null,
        student: {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          rollNumber: s.rollNumber,
          classId: audit.classId,
          sectionId: audit.sectionId,
          class: s.className ? { name: s.className } : null,
          section: s.sectionName ? { name: s.sectionName } : null,
        },
        markedByUser: cur?.markedByUser ?? null,
      })
    }

    const stats = {
      total: records.length,
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      leave: records.filter((r) => r.status === 'leave').length,
    }

    return NextResponse.json({
      records,
      stats,
      // After a finalize event, the data was finalized. After a reopen, it wasn't.
      finalized: audit.action === 'finalize',
      finalizedAt: audit.action === 'finalize' ? audit.createdAt.toISOString() : null,
      snapshot: { ...snapshotMeta(audit), isCurrent },
      pagination: {
        page: 1,
        limit: records.length,
        total: records.length,
        totalPages: 1,
      },
    })
  } catch (error) {
    console.error('GET attendance snapshot error:', error)
    return internalError()
  }
}

function snapshotMeta(audit: {
  id: string
  action: string
  date: Date
  classId: string
  sectionId: string | null
  reason: string | null
  createdAt: Date
  actor: { id: string; name: string; email: string } | null
}) {
  return {
    auditId: audit.id,
    action: audit.action,
    date: formatIsoDate(audit.date),
    classId: audit.classId,
    sectionId: audit.sectionId,
    capturedAt: audit.createdAt.toISOString(),
    capturedByName: audit.actor?.name ?? null,
    reason: audit.reason,
  }
}
