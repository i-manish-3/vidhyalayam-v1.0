import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CSV_MAX_ROWS = 5000

async function resolveAcademicYear(schoolId: string, value: string | null) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null
  return academicYear
}

function parseLocalMidnight(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

function csvEscape(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// GET /api/school/attendance/audit-log
// Lists finalize/reopen audit entries for the user's school, scoped by academic year.
// SCHOOL_ADMIN sees all; other roles require `attendance:audit:view` permission.
// Supports `format=csv` for downloading a flat CSV of the filtered set.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }
    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'attendance:audit:view')
      if (!authorized) {
        return apiError(403, "You don't have permission to view the attendance audit log.")
      }
    }

    const { searchParams } = new URL(request.url)
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))
    if (!academicYear) {
      return apiError(400, 'Invalid academic year.')
    }

    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')
    const dateFrom = dateFromStr ? parseLocalMidnight(dateFromStr) : null
    const dateTo = dateToStr ? parseLocalMidnight(dateToStr) : null
    if (dateFromStr && !dateFrom) return apiError(400, 'Invalid dateFrom.')
    if (dateToStr && !dateTo) return apiError(400, 'Invalid dateTo.')

    const actionParam = searchParams.get('action')
    const action = actionParam === 'finalize' || actionParam === 'reopen' ? actionParam : null
    const classId = searchParams.get('classId') || null
    const sectionId = searchParams.get('sectionId') || null
    const performedBy = searchParams.get('performedBy') || null
    const format = searchParams.get('format')
    const wantCsv = format === 'csv'

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      academicYear,
    }
    if (action) where.action = action
    if (classId) where.classId = classId
    if (sectionId) where.sectionId = sectionId
    if (performedBy) where.performedBy = performedBy
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) range.gte = dateFrom
      if (dateTo) range.lte = dateTo
      where.date = range
    }

    if (wantCsv) {
      const records = await db.attendanceAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: CSV_MAX_ROWS,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      })

      const classIds = Array.from(new Set(records.map((r) => r.classId).filter(Boolean))) as string[]
      const sectionIds = Array.from(new Set(records.map((r) => r.sectionId).filter(Boolean))) as string[]
      const emptyRefs: { id: string; name: string }[] = []
      const [classes, sections] = await Promise.all([
        classIds.length
          ? db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
          : Promise.resolve(emptyRefs),
        sectionIds.length
          ? db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } })
          : Promise.resolve(emptyRefs),
      ])
      const classMap = new Map<string, string>(classes.map((c) => [c.id, c.name]))
      const sectionMap = new Map<string, string>(sections.map((s) => [s.id, s.name]))

      const header = ['Date', 'Class', 'Section', 'Action', 'Reason', 'Performed By', 'Performed By Email', 'Performed At']
      const lines = [header.join(',')]
      for (const r of records) {
        lines.push([
          csvEscape(formatIsoDate(r.date)),
          csvEscape(classMap.get(r.classId) ?? r.classId),
          csvEscape(r.sectionId ? sectionMap.get(r.sectionId) ?? r.sectionId : ''),
          csvEscape(r.action),
          csvEscape(r.reason),
          csvEscape(r.actor?.name ?? ''),
          csvEscape(r.actor?.email ?? ''),
          csvEscape(r.createdAt.toISOString()),
        ].join(','))
      }
      const csv = lines.join('\n')
      const fromTag = dateFromStr || 'all'
      const toTag = dateToStr || 'all'
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="attendance-audit-${fromTag}-to-${toTag}.csv"`,
        },
      })
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const skip = (page - 1) * limit

    const [records, total, performersRaw] = await Promise.all([
      db.attendanceAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      db.attendanceAuditLog.count({ where }),
      // Distinct performers within the same year + school — used to populate the
      // "Performed by" filter dropdown. Scoped to the year so the dropdown only
      // shows people who actually have audit activity in this context.
      db.attendanceAuditLog.findMany({
        where: { schoolId: user.schoolId, academicYear },
        distinct: ['performedBy'],
        select: { performedBy: true, actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    const classIds = Array.from(new Set(records.map((r) => r.classId).filter(Boolean))) as string[]
    const sectionIds = Array.from(new Set(records.map((r) => r.sectionId).filter(Boolean))) as string[]
    const emptyRefsList: { id: string; name: string }[] = []
    const [classes, sections] = await Promise.all([
      classIds.length
        ? db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
        : Promise.resolve(emptyRefsList),
      sectionIds.length
        ? db.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true } })
        : Promise.resolve(emptyRefsList),
    ])
    const classMap = new Map<string, string>(classes.map((c) => [c.id, c.name]))
    const sectionMap = new Map<string, string>(sections.map((s) => [s.id, s.name]))

    const performers = performersRaw
      .filter((p) => p.actor)
      .map((p) => ({ id: p.actor!.id, name: p.actor!.name, email: p.actor!.email }))

    return NextResponse.json({
      records: records.map((r) => ({
        id: r.id,
        date: formatIsoDate(r.date),
        classId: r.classId,
        className: classMap.get(r.classId) ?? null,
        sectionId: r.sectionId,
        sectionName: r.sectionId ? sectionMap.get(r.sectionId) ?? null : null,
        action: r.action,
        reason: r.reason,
        performedBy: r.performedBy,
        performedByName: r.actor?.name ?? null,
        performedByEmail: r.actor?.email ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      performers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (error) {
    console.error('GET /api/school/attendance/audit-log error:', error)
    return internalError()
  }
}
