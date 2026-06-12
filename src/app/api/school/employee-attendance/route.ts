import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { isSchoolTeachingDay } from '@/lib/academic-calendar'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const STAFF_TYPES = ['teacher', 'staff'] as const
const STATUSES = new Set(['present', 'absent', 'leave'])

type StaffType = (typeof STAFF_TYPES)[number]
type StaffTypeFilter = StaffType | 'all'

interface EmployeePerson {
  staffType: StaffType
  staffId: string
  employeeId: string | null
  firstName: string
  lastName: string
  roleLabel: string | null
}

function isStaffType(value: string): value is StaffType {
  return value === 'teacher' || value === 'staff'
}

function parseStaffTypeFilter(value: string | null): StaffTypeFilter {
  return isStaffType(value || '') ? (value as StaffType) : 'all'
}

function parseLocalDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function todayString(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

async function resolveAcademicYear(schoolId: string, requested: string | null, requireActive = false) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (requested || school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null

  if (requireActive) {
    const exists = await db.academicYear.findFirst({
      where: { schoolId, name: academicYear, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!exists) return null
  }

  return academicYear
}

async function listPeople(schoolId: string, staffType: StaffTypeFilter): Promise<EmployeePerson[]> {
  const [teachers, staffRows] = await Promise.all([
    staffType === 'staff'
      ? Promise.resolve([])
      : db.teacher.findMany({
          where: { schoolId, deletedAt: null, isActive: true },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            specialization: true,
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
    staffType === 'teacher'
      ? Promise.resolve([])
      : db.staff.findMany({
          where: { schoolId, deletedAt: null, isActive: true },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            designation: true,
            department: true,
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        }),
  ])

  return [
    ...teachers.map((teacher) => ({
      staffType: 'teacher' as const,
      staffId: teacher.id,
      employeeId: teacher.employeeId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      roleLabel: teacher.specialization || 'Teacher',
    })),
    ...staffRows.map((staff) => ({
      staffType: 'staff' as const,
      staffId: staff.id,
      employeeId: staff.employeeId,
      firstName: staff.firstName,
      lastName: staff.lastName,
      roleLabel: staff.designation || staff.department || 'Staff',
    })),
  ].sort((a, b) => {
    const typeCompare = a.staffType.localeCompare(b.staffType)
    if (typeCompare !== 0) return typeCompare
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
  })
}

function personWhere(people: EmployeePerson[]) {
  return people.map((person) => ({
    staffType: person.staffType,
    staffId: person.staffId,
  }))
}

async function ensureWorkingDate(schoolId: string, academicYear: string, date: Date, action: string) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (date > today) {
    return apiError(400, `Employee attendance cannot be ${action} for future dates.`)
  }

  const teaching = await isSchoolTeachingDay(schoolId, academicYear, date)
  if (!teaching.teaching) {
    return apiError(
      400,
      teaching.reason === 'holiday'
        ? `${teaching.holiday?.name || 'Holiday'} — employee attendance cannot be ${action} on a declared holiday.`
        : `School is closed on this day — employee attendance cannot be ${action}.`,
    )
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const dateValue = searchParams.get('date') || todayString()
    const attendanceDate = parseLocalDate(dateValue)
    if (!attendanceDate) return apiError(400, 'Date must be YYYY-MM-DD.')

    const staffType = parseStaffTypeFilter(searchParams.get('staffType'))
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))
    const finalizedOnly = searchParams.get('finalizedOnly') === 'true'
    const people = await listPeople(user.schoolId, staffType)
    const peopleFilter = personWhere(people)

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      date: attendanceDate,
      ...(academicYear ? { academicYear } : {}),
      ...(finalizedOnly ? { finalized: true } : {}),
      ...(peopleFilter.length > 0 ? { OR: peopleFilter } : { staffId: '__none__' }),
    }

    const records = await db.employeeAttendance.findMany({
      where,
      include: {
        markedByUser: { select: { id: true, name: true } },
        finalizedByUser: { select: { id: true, name: true } },
      },
      orderBy: [{ staffType: 'asc' }, { createdAt: 'asc' }],
    })

    const personByKey = new Map(people.map((person) => [`${person.staffType}:${person.staffId}`, person]))
    const projectedRecords = records
      .map((record) => ({
        ...record,
        person: personByKey.get(`${record.staffType}:${record.staffId}`) ?? null,
      }))
      .filter((record) => record.person)

    const stats = {
      total: records.length,
      present: records.filter((record) => record.status === 'present').length,
      absent: records.filter((record) => record.status === 'absent').length,
      leave: records.filter((record) => record.status === 'leave').length,
    }
    const finalized = people.length > 0 && records.length === people.length && records.every((record) => record.finalized)
    const finalizedAt = finalized ? records.find((record) => record.finalizedAt)?.finalizedAt ?? null : null

    return NextResponse.json({
      people,
      records: projectedRecords,
      stats,
      finalized,
      finalizedAt,
    })
  } catch (error) {
    console.error('Get employee attendance error:', error)
    return internalError('loading employee attendance')
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await request.json()
    const dateValue = typeof body.date === 'string' ? body.date : ''
    const records = Array.isArray(body.records) ? body.records : []
    const attendanceDate = parseLocalDate(dateValue)
    const academicYear = await resolveAcademicYear(user.schoolId, typeof body.academicYear === 'string' ? body.academicYear : null, true)

    if (!attendanceDate || records.length === 0) {
      return apiError(400, 'Please select a date and add employee attendance entries.')
    }
    if (!academicYear) return apiError(400, 'Please choose an active academic year.')

    const blocked = await ensureWorkingDate(user.schoolId, academicYear, attendanceDate, 'marked')
    if (blocked) return blocked

    const validRecords = records
      .map((record: { staffType?: string; staffId?: string; status?: string; remarks?: string }) => ({
        staffType: record.staffType,
        staffId: typeof record.staffId === 'string' ? record.staffId : '',
        status: typeof record.status === 'string' ? record.status : '',
        remarks: typeof record.remarks === 'string' && record.remarks.trim() ? record.remarks.trim() : null,
      }))
      .filter((record): record is { staffType: StaffType; staffId: string; status: string; remarks: string | null } =>
        isStaffType(record.staffType || '') && !!record.staffId && STATUSES.has(record.status),
      )

    if (validRecords.length === 0) return apiError(400, 'No valid employee attendance entries were found.')

    const existingFinalized = await db.employeeAttendance.findFirst({
      where: {
        schoolId: user.schoolId,
        date: attendanceDate,
        academicYear,
        finalized: true,
        OR: validRecords.map((record) => ({ staffType: record.staffType, staffId: record.staffId })),
      },
      select: { id: true },
    })
    if (existingFinalized) return apiError(403, 'Employee attendance is already finalized and cannot be edited.')

    let savedCount = 0
    for (const record of validRecords) {
      const exists = record.staffType === 'teacher'
        ? await db.teacher.findFirst({
            where: { id: record.staffId, schoolId: user.schoolId, deletedAt: null, isActive: true },
            select: { id: true },
          })
        : await db.staff.findFirst({
            where: { id: record.staffId, schoolId: user.schoolId, deletedAt: null, isActive: true },
            select: { id: true },
          })
      if (!exists) continue

      const current = await db.employeeAttendance.findUnique({
        where: {
          schoolId_staffType_staffId_date: {
            schoolId: user.schoolId,
            staffType: record.staffType,
            staffId: record.staffId,
            date: attendanceDate,
          },
        },
        select: { status: true, remarks: true },
      })
      if (current && current.status === record.status && (current.remarks ?? null) === record.remarks) continue

      await db.employeeAttendance.upsert({
        where: {
          schoolId_staffType_staffId_date: {
            schoolId: user.schoolId,
            staffType: record.staffType,
            staffId: record.staffId,
            date: attendanceDate,
          },
        },
        create: {
          schoolId: user.schoolId,
          staffType: record.staffType,
          staffId: record.staffId,
          academicYear,
          date: attendanceDate,
          status: record.status,
          remarks: record.remarks,
          markedBy: user.userId,
          markedSource: 'manual',
        },
        update: {
          status: record.status,
          remarks: record.remarks,
          markedBy: user.userId,
          markedSource: 'manual',
        },
      })
      savedCount += 1
    }

    return NextResponse.json({
      message: `Employee attendance has been saved for ${savedCount} people.`,
      count: savedCount,
    })
  } catch (error) {
    console.error('Save employee attendance error:', error)
    return internalError('saving employee attendance')
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await request.json()
    const action = body.action === 'reopen' ? 'reopen' : 'finalize'
    const dateValue = typeof body.date === 'string' ? body.date : ''
    const staffType = parseStaffTypeFilter(typeof body.staffType === 'string' ? body.staffType : null)
    const attendanceDate = parseLocalDate(dateValue)
    const academicYear = await resolveAcademicYear(user.schoolId, typeof body.academicYear === 'string' ? body.academicYear : null, true)

    if (!attendanceDate) return apiError(400, 'Date must be YYYY-MM-DD.')
    if (!academicYear) return apiError(400, 'Please choose an active academic year.')
    if (action === 'reopen' && user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'attendance:reopen')
      if (!authorized) return apiError(403, "You don't have permission to reopen finalized attendance.")
    }

    const blocked = await ensureWorkingDate(user.schoolId, academicYear, attendanceDate, action === 'finalize' ? 'finalized' : 'reopened')
    if (blocked) return blocked

    const people = await listPeople(user.schoolId, staffType)
    if (people.length === 0) return apiError(400, 'No active employees found for this filter.')

    const peopleFilter = personWhere(people)
    const existingAttendance = await db.employeeAttendance.findMany({
      where: {
        schoolId: user.schoolId,
        date: attendanceDate,
        academicYear,
        OR: peopleFilter,
      },
      select: { staffType: true, staffId: true, finalized: true },
    })
    if (existingAttendance.length === 0) return apiError(400, 'No employee attendance records found for this date.')

    const alreadyFinalized = existingAttendance.length === people.length && existingAttendance.every((record) => record.finalized)
    if (action === 'finalize' && alreadyFinalized) return apiError(400, 'Employee attendance is already finalized.')
    if (action === 'reopen' && !alreadyFinalized) return apiError(400, 'Employee attendance is already open for editing.')

    if (action === 'finalize') {
      const markedKeys = new Set(existingAttendance.map((record) => `${record.staffType}:${record.staffId}`))
      const missingCount = people.filter((person) => !markedKeys.has(`${person.staffType}:${person.staffId}`)).length
      if (missingCount > 0) {
        return apiError(400, `Cannot finalize: ${missingCount} employee(s) have no attendance marked.`)
      }
    }

    const now = new Date()
    const result = await db.employeeAttendance.updateMany({
      where: {
        schoolId: user.schoolId,
        date: attendanceDate,
        academicYear,
        OR: peopleFilter,
      },
      data: {
        finalized: action === 'finalize',
        finalizedAt: action === 'finalize' ? now : null,
        finalizedBy: action === 'finalize' ? user.userId : null,
      },
    })

    return NextResponse.json({
      message: action === 'finalize'
        ? `Employee attendance finalized for ${result.count} people.`
        : `Employee attendance reopened for ${result.count} people.`,
      count: result.count,
      finalized: action === 'finalize',
    })
  } catch (error) {
    console.error('Finalize employee attendance error:', error)
    return internalError('finalizing employee attendance')
  }
}
