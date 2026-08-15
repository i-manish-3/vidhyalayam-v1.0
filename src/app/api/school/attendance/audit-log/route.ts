import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { getEnrolledStudents, type EnrolledStudent } from '@/lib/attendance-report-utils'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CSV_AUDIT_CAP = 2000
const CSV_TOTAL_ROW_CAP = 30000

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
        take: CSV_AUDIT_CAP,
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

      // For every reopen row, look up its per-student changes inside its
      // window (until the next subsequent audit event for the same key, or
      // now). Done in parallel; the enrolled-students lookup is cached per
      // (academicYear|classId|sectionId) so multiple reopens of the same
      // class on the same day share a single query.
      const enrolledCache = new Map<string, EnrolledStudent[]>()
      const cachedEnrolled = async (
        academicYear: string, classId: string, sectionId: string | null,
      ): Promise<EnrolledStudent[]> => {
        const key = `${academicYear}|${classId}|${sectionId ?? ''}`
        const cached = enrolledCache.get(key)
        if (cached) return cached
        const fresh = await getEnrolledStudents(user.schoolId!, academicYear, classId, sectionId)
        enrolledCache.set(key, fresh)
        return fresh
      }

      type ChangeRow = {
        oldStatus: string
        newStatus: string
        oldRemarks: string | null
        newRemarks: string | null
        changedAt: Date
        student: { firstName: string; lastName: string; rollNumber: string | null }
        changer: { name: string } | null
      }
      const changesByAudit = await Promise.all(
        records.map(async (r): Promise<ChangeRow[] | null> => {
          if (r.action !== 'reopen') return null
          const nextEvent = await db.attendanceAuditLog.findFirst({
            where: {
              schoolId: r.schoolId,
              date: r.date,
              classId: r.classId,
              sectionId: r.sectionId,
              createdAt: { gt: r.createdAt },
            },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          })
          const enrolled = await cachedEnrolled(r.academicYear, r.classId, r.sectionId)
          if (enrolled.length === 0) return []
          const studentIds = enrolled.map((s) => s.id)
          const changes = await db.attendanceChangeLog.findMany({
            where: {
              schoolId: r.schoolId,
              studentId: { in: studentIds },
              date: r.date,
              changedAt: {
                gt: r.createdAt,
                ...(nextEvent ? { lt: nextEvent.createdAt } : {}),
              },
            },
            orderBy: { changedAt: 'asc' },
            include: {
              student: { select: { firstName: true, lastName: true, rollNumber: true } },
              changer: { select: { name: true } },
            },
          })
          return changes
        }),
      )

      // Flat layout: every CSV row carries the audit-event columns plus
      // (when applicable) the change-specific columns. A reopen with N
      // changes produces N rows, all sharing the same audit-event columns.
      // A reopen with 0 changes / a finalize produces 1 row with empty
      // change columns. Truncated at CSV_TOTAL_ROW_CAP to bound memory.
      const header = [
        'Audit Date', 'Class', 'Section', 'Action', 'Reason',
        'Performed By', 'Performed By Email', 'Performed At',
        'Student Roll', 'Student Name',
        'Old Status', 'New Status',
        'Old Remarks', 'New Remarks',
        'Changed By', 'Changed At',
      ]
      const lines = [header.join(',')]
      let totalRows = 1
      let truncated = false

      outer: for (let i = 0; i < records.length; i++) {
        const r = records[i]
        const auditCols = [
          csvEscape(formatIsoDate(r.date)),
          csvEscape(classMap.get(r.classId) ?? r.classId),
          csvEscape(r.sectionId ? sectionMap.get(r.sectionId) ?? r.sectionId : ''),
          csvEscape(r.action),
          csvEscape(r.reason),
          csvEscape(r.actor?.name ?? ''),
          csvEscape(r.actor?.email ?? ''),
          csvEscape(r.createdAt.toISOString()),
        ]
        const emptyChangeCols = ['', '', '', '', '', '', '', '']
        const changes = changesByAudit[i]
        if (!changes || changes.length === 0) {
          lines.push([...auditCols, ...emptyChangeCols].join(','))
          totalRows++
          if (totalRows >= CSV_TOTAL_ROW_CAP) { truncated = true; break outer }
          continue
        }
        for (const c of changes) {
          lines.push([
            ...auditCols,
            csvEscape(c.student.rollNumber ?? ''),
            csvEscape(`${c.student.firstName} ${c.student.lastName}`.trim()),
            csvEscape(c.oldStatus),
            csvEscape(c.newStatus),
            csvEscape(c.oldRemarks),
            csvEscape(c.newRemarks),
            csvEscape(c.changer?.name ?? ''),
            csvEscape(c.changedAt.toISOString()),
          ].join(','))
          totalRows++
          if (totalRows >= CSV_TOTAL_ROW_CAP) { truncated = true; break outer }
        }
      }
      if (truncated) {
        lines.push(`# Truncated at ${CSV_TOTAL_ROW_CAP} rows. Refine filters for the full export.`)
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

    const [records, total, performersRaw, finalizeCount, reopenCount] = await Promise.all([
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
      db.attendanceAuditLog.count({ where: { ...where, action: 'finalize' } }),
      db.attendanceAuditLog.count({ where: { ...where, action: 'reopen' } }),
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

    // For reopen rows, count the per-student changes that happened inside the
    // reopen window (between this audit event and the next one for the same
    // date/class/section). Finalize rows get changeCount=null.
    const changeCounts = await Promise.all(
      records.map(async (r) => {
        if (r.action !== 'reopen') return null
        const nextEvent = await db.attendanceAuditLog.findFirst({
          where: {
            schoolId: r.schoolId,
            date: r.date,
            classId: r.classId,
            sectionId: r.sectionId,
            createdAt: { gt: r.createdAt },
          },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        })
        const count = await db.attendanceChangeLog.count({
          where: {
            schoolId: r.schoolId,
            date: r.date,
            changedAt: {
              gt: r.createdAt,
              ...(nextEvent ? { lt: nextEvent.createdAt } : {}),
            },
            student: {
              OR: [
                {
                  academicEnrollments: {
                    some: {
                      academicYear: r.academicYear,
                      classId: r.classId,
                      ...(r.sectionId ? { sectionId: r.sectionId } : {}),
                      deletedAt: null,
                    },
                  },
                },
                {
                  admission: {
                    academicYear: r.academicYear,
                    classId: r.classId,
                    ...(r.sectionId ? { sectionId: r.sectionId } : {}),
                  },
                },
              ],
            },
          },
        })
        return count
      }),
    )

    return NextResponse.json({
      records: records.map((r, i) => ({
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
        changeCount: changeCounts[i],
      })),
      performers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: { total, finalizes: finalizeCount, reopens: reopenCount },
    })
  } catch (error) {
    console.error('GET /api/school/attendance/audit-log error:', error)
    return internalError()
  }
}
