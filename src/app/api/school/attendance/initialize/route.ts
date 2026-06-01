import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { isSchoolTeachingDay } from '@/lib/academic-calendar'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

async function resolveAcademicYear(
  schoolId: string,
  requested: string | null,
): Promise<string | null> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const year = (requested || school?.academicYear || '').trim()
  if (!ACADEMIC_YEAR_PATTERN.test(year)) return null
  const exists = await db.academicYear.findFirst({
    where: { schoolId, name: year, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return exists ? year : null
}

/**
 * POST /api/school/attendance/initialize
 *
 * Materialise `absent` rows for every enrolled student in (classId, sectionId)
 * on `date` who does not already have an Attendance row. Used to enforce the
 * "everyone is absent unless RFID-tapped or manually marked" default.
 *
 * Idempotent — uses createMany + skipDuplicates against the
 * @@unique([schoolId, studentId, date]) constraint. Safe to call repeatedly:
 * already-present (RFID) students keep their status, manually-edited rows are
 * untouched, only true gaps get filled with status='absent'.
 *
 * Body: { date: 'YYYY-MM-DD', classId, sectionId?, academicYear? }
 */
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError(400, 'Body missing.')

    const date = typeof body.date === 'string' ? body.date : ''
    const classId = typeof body.classId === 'string' ? body.classId : ''
    const sectionId =
      typeof body.sectionId === 'string' && body.sectionId.length > 0
        ? body.sectionId
        : undefined

    if (!DATE_PATTERN.test(date)) {
      return apiError(400, 'Date must be YYYY-MM-DD.')
    }
    if (!classId) return apiError(400, 'classId is required.')

    const academicYear = await resolveAcademicYear(
      user.schoolId,
      typeof body.academicYear === 'string' ? body.academicYear : null,
    )
    if (!academicYear) return apiError(400, 'Active academic year not found.')

    // Server-local midnight (matches the marking route convention).
    const [y, m, d] = date.split('-').map(Number)
    const attendanceDate = new Date(y, m - 1, d)

    // Block future dates
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (attendanceDate > today) {
      return apiError(400, 'Cannot initialize attendance for future dates.')
    }

    // Block non-teaching days (holiday / weekly off)
    const teaching = await isSchoolTeachingDay(user.schoolId, academicYear, attendanceDate)
    if (!teaching.teaching) {
      return apiError(
        400,
        teaching.reason === 'holiday'
          ? `${teaching.holiday?.name || 'Holiday'} — no attendance to initialize.`
          : 'School is closed on this day.',
      )
    }

    // Fetch enrolled students for this (class, section, academic year).
    // Mirrors the GET attendance route: accepts either a real enrollment OR
    // a current-year admission row (handles students whose enrollment hasn't
    // been formalized yet but who are admitted).
    const students = await db.student.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        OR: [
          {
            academicEnrollments: {
              some: {
                academicYear,
                classId,
                ...(sectionId ? { sectionId } : {}),
                deletedAt: null,
              },
            },
          },
          {
            admission: {
              academicYear,
              classId,
              ...(sectionId ? { sectionId } : {}),
            },
          },
        ],
      },
      select: { id: true },
    })

    if (students.length === 0) {
      return NextResponse.json({
        created: 0,
        totalStudents: 0,
        message: 'No students enrolled in this class/section.',
      })
    }

    // Bulk insert. skipDuplicates makes this idempotent — students who
    // already have a row (RFID-marked, manual-marked, or previously
    // auto-defaulted) are left alone.
    const result = await db.attendance.createMany({
      data: students.map((s) => ({
        schoolId: user.schoolId!,
        studentId: s.id,
        academicYear,
        date: attendanceDate,
        status: 'absent',
        markedBy: null,
        markedSource: 'auto_default',
      })),
      skipDuplicates: true,
    })

    return NextResponse.json({
      created: result.count,
      totalStudents: students.length,
      message:
        result.count === 0
          ? 'All students already have attendance for this day.'
          : `Initialized ${result.count} students as absent by default.`,
    })
  } catch (error) {
    console.error('Initialize attendance error:', error)
    return internalError('initializing attendance')
  }
}
