import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const VALID_RESULTS = new Set([
  'marked',
  'updated',
  'duplicate',
  'duplicate_event',
  'unknown_device',
  'unknown_user',
  'unknown_card',
  'inactive_credential',
  'card_revoked',
  'enrollment_missing',
  'finalized',
  'non_teaching',
  'invalid_uid',
  'ignored',
])

const VALID_PERSON_TYPES = new Set(['student', 'teacher', 'staff'])

const MARKED_RESULTS = ['marked', 'updated', 'duplicate']
const REJECTED_RESULTS = [
  'unknown_device',
  'unknown_user',
  'unknown_card',
  'inactive_credential',
  'card_revoked',
  'enrollment_missing',
  'invalid_uid',
]
const NON_TEACHING_RESULTS = ['non_teaching', 'finalized', 'ignored', 'duplicate_event']

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

type PunchLogRow = {
  id: string
  serialNo: string
  deviceUserId: string
  personType: string | null
  personId: string | null
  punchTime: Date
  verifyMode: string
  punchStatus: string
  workCode: string | null
  result: string
  errorDetail: string | null
  device: { id: string; name: string } | null
}

async function resolvePersons(schoolId: string, punches: PunchLogRow[]) {
  const personMap = new Map<string, { name: string; code: string }>()
  const studentIds: string[] = []
  const teacherIds: string[] = []
  const staffIds: string[] = []

  for (const p of punches) {
    if (!p.personId) continue
    if (p.personType === 'student') studentIds.push(p.personId)
    else if (p.personType === 'teacher') teacherIds.push(p.personId)
    else if (p.personType === 'staff') staffIds.push(p.personId)
  }

  const [students, teachers, staff] = await Promise.all([
    studentIds.length
      ? db.student.findMany({
          where: { schoolId, id: { in: studentIds } },
          select: { id: true, firstName: true, lastName: true, admissionNumber: true },
        })
      : Promise.resolve([]),
    teacherIds.length
      ? db.teacher.findMany({
          where: { schoolId, id: { in: teacherIds } },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })
      : Promise.resolve([]),
    staffIds.length
      ? db.staff.findMany({
          where: { schoolId, id: { in: staffIds } },
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        })
      : Promise.resolve([]),
  ])

  for (const s of students) personMap.set(s.id, { name: `${s.firstName} ${s.lastName}`, code: s.admissionNumber || '' })
  for (const t of teachers) personMap.set(t.id, { name: `${t.firstName} ${t.lastName}`, code: t.employeeId || '' })
  for (const s of staff) personMap.set(s.id, { name: `${s.firstName} ${s.lastName}`, code: s.employeeId || '' })

  return personMap
}

/**
 * GET /api/school/attendance-devices/punch-logs
 *
 * Append-only audit of every punch received from ZKTeco/ADMS devices.
 * Filters:  dateFrom, dateTo, result, personType, deviceId,
 *           search (device user id, serial no, or person name/code)
 * Output:   ?format=csv for CSV download (capped at 10000 rows)
 */
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    if (user.role !== 'SCHOOL_ADMIN') {
      const ok = await requirePermission(request, 'rfid:taps:view')
      if (!ok) return apiError(403, "You don't have permission to view device punch logs.")
    }

    const { searchParams } = new URL(request.url)
    const dateFromStr = searchParams.get('dateFrom')
    const dateToStr = searchParams.get('dateTo')
    const result = searchParams.get('result')
    const personType = searchParams.get('personType')
    const deviceId = searchParams.get('deviceId')
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
    if (personType && !VALID_PERSON_TYPES.has(personType)) return apiError(400, 'Invalid person type.')

    const where: Record<string, unknown> = { schoolId: user.schoolId }
    if (result) where.result = result
    if (personType) where.personType = personType
    if (deviceId) where.deviceId = deviceId
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) range.gte = dateFrom
      if (dateTo) range.lte = dateTo
      where.punchTime = range
    }

    if (search) {
      const searchWhere: Record<string, unknown>[] = [
        { serialNo: { contains: search, mode: 'insensitive' } },
        { deviceUserId: { contains: search, mode: 'insensitive' } },
      ]

      const [students, teachers, staff] = await Promise.all([
        db.student.findMany({
          where: {
            schoolId: user.schoolId,
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { admissionNumber: { contains: search, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        db.teacher.findMany({
          where: {
            schoolId: user.schoolId,
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { employeeId: { contains: search, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
        db.staff.findMany({
          where: {
            schoolId: user.schoolId,
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { employeeId: { contains: search, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        }),
      ])

      if (students.length) searchWhere.push({ personType: 'student', personId: { in: students.map((s) => s.id) } })
      if (teachers.length) searchWhere.push({ personType: 'teacher', personId: { in: teachers.map((t) => t.id) } })
      if (staff.length) searchWhere.push({ personType: 'staff', personId: { in: staff.map((s) => s.id) } })

      where.OR = searchWhere
    }

    const fetchLimit = wantCsv ? 10000 : limit
    const fetchSkip = wantCsv ? 0 : skip

    const [punches, total, devices, markedCount, rejectedCount, nonTeachingCount] = await Promise.all([
      db.attendanceDevicePunchLog.findMany({
        where,
        orderBy: [{ punchTime: 'desc' }, { createdAt: 'desc' }],
        take: fetchLimit,
        skip: fetchSkip,
        select: {
          id: true,
          serialNo: true,
          deviceUserId: true,
          personType: true,
          personId: true,
          punchTime: true,
          verifyMode: true,
          punchStatus: true,
          workCode: true,
          result: true,
          errorDetail: true,
          device: { select: { id: true, name: true } },
        },
      }),
      wantCsv ? Promise.resolve(0) : db.attendanceDevicePunchLog.count({ where }),
      db.attendanceDevice.findMany({
        where: { schoolId: user.schoolId, deletedAt: null },
        select: { id: true, name: true, serialNo: true },
        orderBy: { name: 'asc' },
      }),
      wantCsv ? Promise.resolve(0) : db.attendanceDevicePunchLog.count({ where: { ...where, result: { in: MARKED_RESULTS } } }),
      wantCsv ? Promise.resolve(0) : db.attendanceDevicePunchLog.count({ where: { ...where, result: { in: REJECTED_RESULTS } } }),
      wantCsv ? Promise.resolve(0) : db.attendanceDevicePunchLog.count({ where: { ...where, result: { in: NON_TEACHING_RESULTS } } }),
    ])

    const personMap = await resolvePersons(user.schoolId, punches)

    const withPerson = punches.map((p) => {
      const person = p.personId ? personMap.get(p.personId) : undefined
      return {
        ...p,
        punchTime: p.punchTime.toISOString(),
        person: person ? { id: p.personId, name: person.name, code: person.code } : null,
      }
    })

    if (wantCsv) {
      const header = [
        'Timestamp',
        'Result',
        'Person',
        'Person Type',
        'Code',
        'Device User ID',
        'Device',
        'Serial No',
        'Verify Mode',
        'Punch Status',
        'Work Code',
        'Error Detail',
      ].map(csvEscape).join(',')

      const rows = withPerson.map((p) =>
        [
          new Date(p.punchTime).toLocaleString(),
          p.result,
          p.person?.name || '',
          p.personType || '',
          p.person?.code || '',
          p.deviceUserId,
          p.device?.name || '',
          p.serialNo,
          p.verifyMode,
          p.punchStatus,
          p.workCode || '',
          p.errorDetail || '',
        ].map(csvEscape).join(','),
      )

      const csv = [header, ...rows].join('\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="device-punches-${Date.now()}.csv"`,
        },
      })
    }

    return NextResponse.json({
      punches: withPerson,
      devices,
      total,
      page,
      limit,
      hasMore: skip + punches.length < total,
      stats: { total, marked: markedCount, rejected: rejectedCount, nonTeaching: nonTeachingCount },
    })
  } catch (error) {
    console.error('Device punch log error:', error)
    return internalError('loading the device punch log')
  }
}