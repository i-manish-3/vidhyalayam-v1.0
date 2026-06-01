import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const VALID_RESULTS = new Set([
  'marked',
  'updated',
  'duplicate',
  'unknown_card',
  'card_revoked',
  'enrollment_missing',
  'finalized',
  'non_teaching',
  'invalid_uid',
])

function parseLocalMidnight(v: string): Date | null {
  if (!DATE_PATTERN.test(v)) return null
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return ''
  const str = String(v)
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

/**
 * GET /api/school/rfid/audit/taps
 *
 * Lists every tap that hit the system — successful, duplicate, rejected, or
 * unmatched. Append-only; the source of truth for "did a card touch a reader".
 *
 * Filters:  academicYear, dateFrom, dateTo, result, source (kiosk|webhook),
 *           deviceId, studentId, search (UID prefix or student name/adm)
 * Output:   ?format=csv for CSV download (capped at 10000 rows)
 */
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    if (user.role !== 'SCHOOL_ADMIN') {
      const ok = await requirePermission(request, 'rfid:taps:view')
      if (!ok) return apiError(403, "You don't have permission to view RFID tap logs.")
    }

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear') || ''
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')
    const result = searchParams.get('result')
    const source = searchParams.get('source')
    const deviceId = searchParams.get('deviceId')
    const studentId = searchParams.get('studentId')
    const search = (searchParams.get('search') || '').trim()
    const format = searchParams.get('format')
    const wantCsv = format === 'csv'
    const limit = Math.min(Number.parseInt(searchParams.get('limit') || '100', 10) || 100, 500)
    const page = Math.max(Number.parseInt(searchParams.get('page') || '1', 10) || 1, 1)
    const skip = (page - 1) * limit

    const dateFrom = dateFromStr ? parseLocalMidnight(dateFromStr) : null
    const dateTo = dateToStr ? parseLocalMidnight(dateToStr) : null
    if (dateFromStr && !dateFrom) return apiError(400, 'Invalid dateFrom.')
    if (dateToStr && !dateTo) return apiError(400, 'Invalid dateTo.')
    if (dateTo) dateTo.setHours(23, 59, 59, 999)

    if (result && !VALID_RESULTS.has(result)) return apiError(400, 'Invalid result code.')
    if (source && source !== 'kiosk' && source !== 'webhook') {
      return apiError(400, 'Invalid source.')
    }
    if (academicYear && !ACADEMIC_YEAR_PATTERN.test(academicYear)) {
      return apiError(400, 'Invalid academic year.')
    }

    const where: Record<string, unknown> = { schoolId: user.schoolId }
    if (academicYear) where.academicYear = academicYear
    if (result) where.result = result
    if (source) where.source = source
    if (deviceId) where.deviceId = deviceId
    if (studentId) where.studentId = studentId
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) range.gte = dateFrom
      if (dateTo) range.lte = dateTo
      where.tappedAt = range
    }
    if (search) {
      where.OR = [
        { uid: { contains: search.toUpperCase() } },
        {
          student: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { admissionNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ]
    }

    const fetchLimit = wantCsv ? 10000 : limit
    const fetchSkip = wantCsv ? 0 : skip

    const [taps, total] = await Promise.all([
      db.rfidTapLog.findMany({
        where,
        orderBy: [{ tappedAt: 'desc' }],
        take: fetchLimit,
        skip: fetchSkip,
        select: {
          id: true,
          uid: true,
          source: true,
          tappedAt: true,
          result: true,
          academicYear: true,
          errorDetail: true,
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
            },
          },
          device: { select: { id: true, name: true } },
        },
      }),
      wantCsv ? Promise.resolve(0) : db.rfidTapLog.count({ where }),
    ])

    if (wantCsv) {
      const header = [
        'Timestamp',
        'Result',
        'UID',
        'Student',
        'Admission No',
        'Source',
        'Device',
        'Academic Year',
        'Detail',
      ].map(csvEscape).join(',')

      const rows = taps.map((t) =>
        [
          new Date(t.tappedAt).toLocaleString(),
          t.result,
          t.uid,
          t.student ? `${t.student.firstName} ${t.student.lastName}` : '',
          t.student?.admissionNumber || '',
          t.source,
          t.device?.name || (t.source === 'kiosk' ? 'Kiosk' : ''),
          t.academicYear || '',
          t.errorDetail || '',
        ].map(csvEscape).join(','),
      )

      const csv = [header, ...rows].join('\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="rfid-taps-${Date.now()}.csv"`,
        },
      })
    }

    return NextResponse.json({
      taps,
      total,
      page,
      limit,
      hasMore: skip + taps.length < total,
    })
  } catch (error) {
    console.error('RFID taps audit error:', error)
    return internalError('loading the RFID tap log')
  }
}
