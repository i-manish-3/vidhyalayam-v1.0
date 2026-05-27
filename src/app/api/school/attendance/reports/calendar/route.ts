import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  resolveAcademicYear,
  formatIsoDate,
  emptyTotals,
  addStatus,
  computePercent,
} from '@/lib/attendance-report-utils'

const MONTH_PATTERN = /^\d{4}-\d{2}$/

// GET /api/school/attendance/reports/calendar
// One student's daily attendance entries + monthly totals for a given month.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    if (user.role !== 'SCHOOL_ADMIN') {
      const ok = await requirePermission(request, 'attendance:report:view')
      if (!ok) return apiError(403, "You don't have permission to view attendance reports.")
    }

    const { searchParams } = new URL(request.url)
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))
    if (!academicYear) return apiError(400, 'Invalid academic year.')

    const studentId = searchParams.get('studentId') || ''
    if (!studentId) return apiError(400, 'Please select a student.')

    const month = searchParams.get('month') || ''
    if (!MONTH_PATTERN.test(month)) return apiError(400, 'Invalid month.')
    const [y, m] = month.split('-').map(Number)
    const monthStart = new Date(y, m - 1, 1)
    const monthEnd = new Date(y, m, 0) // last day of month

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        academicEnrollments: {
          where: { academicYear, deletedAt: null },
          select: {
            rollNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
          take: 1,
        },
      },
    })
    if (!student) return apiError(404, 'Student not found.')

    const entries = await db.attendance.findMany({
      where: {
        schoolId: user.schoolId,
        studentId,
        academicYear,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { date: true, status: true, remarks: true },
      orderBy: { date: 'asc' },
    })

    const summary = emptyTotals()
    for (const e of entries) addStatus(summary, e.status, 1)
    summary.percent = computePercent(summary.present, summary.total)

    const enr = student.academicEnrollments[0]

    return NextResponse.json({
      student: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        rollNumber: enr?.rollNumber ?? student.rollNumber,
        className: enr?.class?.name ?? student.class?.name ?? null,
        sectionName: enr?.section?.name ?? student.section?.name ?? null,
      },
      month,
      entries: entries.map((e) => ({ date: formatIsoDate(e.date), status: e.status, remarks: e.remarks })),
      summary,
    })
  } catch (error) {
    console.error('GET attendance calendar error:', error)
    return internalError()
  }
}
