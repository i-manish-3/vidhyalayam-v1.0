import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  resolveAcademicYear,
  parseLocalMidnight,
  csvEscape,
  computeStudentSummaries,
} from '@/lib/attendance-report-utils'

// GET /api/school/attendance/reports/defaulters
// Students below an attendance % threshold over a date range, worst first.
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

    const thresholdRaw = parseFloat(searchParams.get('threshold') || '75')
    const threshold = Number.isFinite(thresholdRaw) ? Math.min(100, Math.max(0, thresholdRaw)) : 75

    const summaries = await computeStudentSummaries(
      user.schoolId, academicYear, classId, sectionId, dateFrom, dateTo,
    )

    // Only students who actually have marked days can be defaulters.
    const defaulters = summaries
      .filter((s) => s.totals.total > 0 && s.totals.percent < threshold)
      .sort((a, b) => a.totals.percent - b.totals.percent)

    // Look up a primary parent phone for each defaulter (best-effort).
    const ids = defaulters.map((d) => d.id)
    const phoneMap = new Map<string, string>()
    if (ids.length > 0) {
      const links = await db.studentParent.findMany({
        where: { studentId: { in: ids } },
        select: {
          studentId: true,
          isPrimary: true,
          parent: { select: { phone: true } },
        },
        orderBy: { isPrimary: 'desc' },
      })
      for (const l of links) {
        if (!phoneMap.has(l.studentId) && l.parent?.phone) {
          phoneMap.set(l.studentId, l.parent.phone)
        }
      }
    }

    const wantCsv = searchParams.get('format') === 'csv'
    if (wantCsv) {
      const header = ['Roll', 'Name', 'Class', 'Section', 'Present', 'Absent', 'Total Marked', 'Percent', 'Parent Phone']
      const lines = [header.join(',')]
      for (const s of defaulters) {
        lines.push([
          s.rollNumber,
          `${s.firstName} ${s.lastName}`.trim(),
          s.className,
          s.sectionName,
          s.totals.present,
          s.totals.absent,
          s.totals.total,
          `${s.totals.percent}%`,
          phoneMap.get(s.id) ?? '',
        ].map(csvEscape).join(','))
      }
      return new NextResponse(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="attendance-defaulters.csv"',
        },
      })
    }

    return NextResponse.json({
      threshold,
      records: defaulters.map((s) => ({
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        className: s.className,
        sectionName: s.sectionName,
        present: s.totals.present,
        absent: s.totals.absent,
        total: s.totals.total,
        percent: s.totals.percent,
        parentPhone: phoneMap.get(s.id) ?? null,
      })),
    })
  } catch (error) {
    console.error('GET attendance defaulters error:', error)
    return internalError()
  }
}
