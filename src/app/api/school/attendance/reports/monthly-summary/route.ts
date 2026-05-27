import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  resolveAcademicYear,
  parseLocalMidnight,
  csvEscape,
  computeStudentSummaries,
} from '@/lib/attendance-report-utils'

// GET /api/school/attendance/reports/monthly-summary
// Per-student attendance totals + % for a class/section over a date range.
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

    const classId = searchParams.get('classId') || ''
    if (!classId) return apiError(400, 'Please select a class.')
    const sectionId = searchParams.get('sectionId') || null

    const dateFrom = parseLocalMidnight(searchParams.get('dateFrom'))
    const dateTo = parseLocalMidnight(searchParams.get('dateTo'))
    if (!dateFrom || !dateTo) return apiError(400, 'Please provide a valid date range.')
    if (dateFrom > dateTo) return apiError(400, 'Start date must be before end date.')

    const summaries = await computeStudentSummaries(
      user.schoolId, academicYear, classId, sectionId, dateFrom, dateTo,
    )

    const wantCsv = searchParams.get('format') === 'csv'
    if (wantCsv) {
      const header = ['Roll', 'Name', 'Class', 'Section', 'Present', 'Absent', 'Leave', 'Total Marked', 'Percent']
      const lines = [header.join(',')]
      for (const s of summaries) {
        lines.push([
          csvEscape(s.rollNumber),
          csvEscape(`${s.firstName} ${s.lastName}`.trim()),
          csvEscape(s.className),
          csvEscape(s.sectionName),
          s.totals.present,
          s.totals.absent,
          s.totals.leave,
          s.totals.total,
          `${s.totals.percent}%`,
        ].map(csvEscape).join(','))
      }
      return new NextResponse(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="attendance-monthly-summary.csv"',
        },
      })
    }

    return NextResponse.json({
      records: summaries.map((s) => ({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        className: s.className,
        sectionName: s.sectionName,
        ...s.totals,
      })),
    })
  } catch (error) {
    console.error('GET attendance monthly-summary error:', error)
    return internalError()
  }
}
