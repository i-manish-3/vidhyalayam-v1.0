import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import {
  resolveAcademicYear,
  parseLocalMidnight,
  formatIsoDate,
  csvEscape,
  emptyTotals,
  addStatus,
  computePercent,
  type StatusTotals,
} from '@/lib/attendance-report-utils'

const MAX_ROWS = 20000

// GET /api/school/attendance/reports/daily-summary
// Per-day, per-(class+section) turnout aggregates over a date range.
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

    const classId = searchParams.get('classId') || null
    const sectionId = searchParams.get('sectionId') || null
    const dateFrom = parseLocalMidnight(searchParams.get('dateFrom'))
    const dateTo = parseLocalMidnight(searchParams.get('dateTo'))
    if (!dateFrom || !dateTo) return apiError(400, 'Please provide a valid date range.')
    if (dateFrom > dateTo) return apiError(400, 'Start date must be before end date.')

    const rows = await db.attendance.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear,
        date: { gte: dateFrom, lte: dateTo },
        ...(classId || sectionId
          ? {
              student: {
                ...(classId ? { classId } : {}),
                ...(sectionId ? { sectionId } : {}),
              },
            }
          : {}),
      },
      select: {
        date: true,
        status: true,
        student: {
          select: {
            classId: true,
            sectionId: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
      take: MAX_ROWS,
    })

    interface Group {
      date: string
      classId: string | null
      className: string | null
      sectionId: string | null
      sectionName: string | null
      totals: StatusTotals
    }
    const groups = new Map<string, Group>()
    for (const r of rows) {
      const dateStr = formatIsoDate(r.date)
      const cId = r.student.classId ?? '—'
      const sId = r.student.sectionId ?? '—'
      const key = `${dateStr}|${cId}|${sId}`
      let g = groups.get(key)
      if (!g) {
        g = {
          date: dateStr,
          classId: r.student.classId,
          className: r.student.class?.name ?? null,
          sectionId: r.student.sectionId,
          sectionName: r.student.section?.name ?? null,
          totals: emptyTotals(),
        }
        groups.set(key, g)
      }
      addStatus(g.totals, r.status, 1)
    }

    const records = Array.from(groups.values())
    for (const g of records) g.totals.percent = computePercent(g.totals.present, g.totals.total)
    records.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1 // date desc
      return (a.className || '').localeCompare(b.className || '')
    })

    const wantCsv = searchParams.get('format') === 'csv'
    if (wantCsv) {
      const header = ['Date', 'Class', 'Section', 'Present', 'Absent', 'Leave', 'Total Marked', 'Percent']
      const lines = [header.join(',')]
      for (const g of records) {
        lines.push([
          g.date,
          g.className,
          g.sectionName,
          g.totals.present,
          g.totals.absent,
          g.totals.leave,
          g.totals.total,
          `${g.totals.percent}%`,
        ].map(csvEscape).join(','))
      }
      return new NextResponse(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="attendance-daily-summary.csv"',
        },
      })
    }

    return NextResponse.json({
      records: records.map((g) => ({
        date: g.date,
        classId: g.classId,
        className: g.className,
        sectionId: g.sectionId,
        sectionName: g.sectionName,
        ...g.totals,
      })),
    })
  } catch (error) {
    console.error('GET attendance daily-summary error:', error)
    return internalError()
  }
}
