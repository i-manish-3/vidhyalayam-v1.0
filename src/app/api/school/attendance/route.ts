import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission, requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveAcademicYear(schoolId: string, value: string | null, requireActive = false) {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { academicYear: true },
  })
  const academicYear = (value || school?.academicYear || '').trim()

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

// GET /api/school/attendance - Get attendance by date/class/section
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const date = dateParam || todayStr
    const classId = searchParams.get('classId') || ''
    const sectionId = searchParams.get('sectionId') || ''
    const academicYear = await resolveAcademicYear(user.schoolId, searchParams.get('academicYear'))
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '200')
    const skip = (page - 1) * limit

    // Parse date as local midnight to avoid UTC timezone shifts
    const [year, month, day] = date.split('-').map(Number)
    const attendanceDate = new Date(year, month - 1, day)

    // Build attendance where clause with student relation filtering
    const studentFilter: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (academicYear) {
      const enrollmentFilter: Record<string, unknown> = { academicYear, deletedAt: null }
      if (classId) enrollmentFilter.classId = classId
      if (sectionId) enrollmentFilter.sectionId = sectionId
      studentFilter.OR = [
        { academicEnrollments: { some: enrollmentFilter } },
        {
          admission: {
            academicYear,
            ...(classId ? { classId } : {}),
            ...(sectionId ? { sectionId } : {}),
          },
        },
      ]
    } else {
      if (classId) studentFilter.classId = classId
      if (sectionId) studentFilter.sectionId = sectionId
    }

    const attendanceWhere: Record<string, unknown> = {
      schoolId: user.schoolId,
      date: attendanceDate,
      student: studentFilter,
    }
    if (academicYear) attendanceWhere.academicYear = academicYear

    const [records, total] = await Promise.all([
      db.attendance.findMany({
        where: attendanceWhere,
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rollNumber: true,
              classId: true,
              sectionId: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
              ...(academicYear
                ? {
                    academicEnrollments: {
                      where: { academicYear, deletedAt: null },
                      include: {
                        class: { select: { id: true, name: true } },
                        section: { select: { id: true, name: true } },
                      },
                      take: 1,
                    },
                  }
                : {}),
            },
          },
          markedByUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { student: { rollNumber: 'asc' } },
        skip,
        take: limit,
      }),
      db.attendance.count({ where: attendanceWhere }),
    ])

    const projectedRecords = academicYear
      ? records.map((record) => {
          const enrollment = (record.student as unknown as {
            academicEnrollments?: Array<{
              classId: string
              sectionId: string | null
              rollNumber: string | null
              class: { id: string; name: string } | null
              section: { id: string; name: string } | null
            }>
          }).academicEnrollments?.[0]
          if (!enrollment) return record
          return {
            ...record,
            student: {
              ...record.student,
              class: enrollment.class || record.student.class,
              section: enrollment.section || record.student.section,
              rollNumber: enrollment.rollNumber ?? record.student.rollNumber,
            },
          }
        })
      : records

    // Stats + finalized check
    const allAttendance = await db.attendance.findMany({
      where: attendanceWhere,
      select: { status: true, finalized: true, finalizedAt: true, finalizedBy: true },
    })

    const stats = {
      total: allAttendance.length,
      present: allAttendance.filter((a) => a.status === 'present').length,
      absent: allAttendance.filter((a) => a.status === 'absent').length,
      leave: allAttendance.filter((a) => a.status === 'leave').length,
    }

    // Determine if attendance is finalized (any record finalized = all finalized for that group)
    const isFinalized = allAttendance.length > 0 && allAttendance.every((a) => a.finalized)
    const finalizedAt = isFinalized ? allAttendance.find((a) => a.finalizedAt)?.finalizedAt ?? null : null

    return NextResponse.json({
      records: projectedRecords,
      stats,
      finalized: isFinalized,
      finalizedAt,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get attendance error:', error)
    return internalError('loading attendance')
  }
}

// POST /api/school/attendance - Mark attendance (bulk)
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { date, records } = body
    const academicYear = await resolveAcademicYear(user.schoolId, body.academicYear || null, true)

    if (!date || !records || !Array.isArray(records)) {
      return apiError(400, 'Please select a date and add attendance entries for at least one student.')
    }
    if (!academicYear) {
      return apiError(400, 'Please choose an active academic year.')
    }

    // Parse date as local midnight to avoid UTC timezone shifts
    const [pYear, pMonth, pDay] = date.split('-').map(Number)
    const attendanceDate = new Date(pYear, pMonth - 1, pDay)

    // Block future dates
    const now = new Date()
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (attendanceDate > todayDate) {
      return apiError(400, 'Attendance cannot be marked for future dates.')
    }
    const currentDay = attendanceDate.getDate()

    // Check if any existing attendance is finalized — block edits
    const existingFinalized = await db.attendance.findFirst({
      where: {
        schoolId: user.schoolId,
        date: attendanceDate,
        academicYear,
        studentId: { in: records.map((r: { studentId: string }) => r.studentId) },
        finalized: true,
      },
    })
    if (existingFinalized) {
      return apiError(403, 'Attendance is already finalized and cannot be edited.')
    }

    // Business rule: Check for unpaid fees after 5th
    const feeWarnings: string[] = []
    if (currentDay > 5) {
      for (const record of records) {
        if (record.status === 'present' || record.status === 'late') {
          const unpaidFees = await db.feeCollection.findFirst({
            where: {
              schoolId: user.schoolId,
              studentId: record.studentId,
              paymentStatus: { in: ['unpaid', 'partial'] },
              deletedAt: null,
            },
          })
          if (unpaidFees) {
            const student = await db.student.findUnique({
              where: { id: record.studentId },
              select: { firstName: true, lastName: true },
            })
            feeWarnings.push(
              `${student?.firstName} ${student?.lastName} has unpaid fees`
            )
          }
        }
      }
    }

    // Create/update attendance records. Each student's write is wrapped in
    // its own small transaction so that the read-of-existing → upsert → optional
    // change-log entry stay atomic. Per-student tx keeps total tx duration tiny
    // even for large classes (vs. one big tx that could exceed default timeout).
    const results: Awaited<ReturnType<typeof db.attendance.upsert>>[] = []
    for (const record of records) {
      const { studentId, status, remarks } = record

      // Verify student belongs to this school + the active session (read; outside tx is fine)
      const student = await db.student.findFirst({
        where: {
          id: studentId,
          schoolId: user.schoolId,
          deletedAt: null,
          OR: [
            { academicEnrollments: { some: { academicYear, deletedAt: null } } },
            { admission: { academicYear } },
          ],
        },
        select: { id: true },
      })
      if (!student) continue

      const attendance = await db.$transaction(async (tx) => {
        const existing = await tx.attendance.findUnique({
          where: {
            schoolId_studentId_date: {
              schoolId: user.schoolId!,
              studentId,
              date: attendanceDate,
            },
          },
          select: { status: true, remarks: true },
        })

        const upserted = await tx.attendance.upsert({
          where: {
            schoolId_studentId_date: {
              schoolId: user.schoolId!,
              studentId,
              date: attendanceDate,
            },
          },
          create: {
            schoolId: user.schoolId!,
            studentId,
            academicYear,
            date: attendanceDate,
            status,
            remarks,
            markedBy: user.userId,
          },
          update: {
            status,
            remarks,
            markedBy: user.userId,
          },
        })

        // Only log MUTATIONS — first marks are covered by Attendance.createdAt + markedBy.
        const oldRemarks = existing?.remarks ?? null
        const newRemarks = remarks ?? null
        if (existing && (existing.status !== status || oldRemarks !== newRemarks)) {
          await tx.attendanceChangeLog.create({
            data: {
              schoolId: user.schoolId!,
              academicYear,
              studentId,
              date: attendanceDate,
              oldStatus: existing.status,
              newStatus: status,
              oldRemarks,
              newRemarks,
              changedBy: user.userId,
            },
          })
        }

        return upserted
      })
      results.push(attendance)
    }

    return NextResponse.json({
      message: `Attendance has been saved for ${results.length} students.`,
      count: results.length,
      feeWarnings: feeWarnings.length > 0 ? feeWarnings : undefined,
    })
  } catch (error) {
    console.error('Mark attendance error:', error)
    return internalError('marking attendance')
  }
}

// PATCH /api/school/attendance - Finalize attendance for a date/class/section
export async function PATCH(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { date, classId, sectionId } = body
    const action = body.action === 'reopen' ? 'reopen' : 'finalize'
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const academicYear = await resolveAcademicYear(user.schoolId, body.academicYear || null, true)

    if (!date || !classId) {
      return apiError(400, 'Date and class are required.')
    }
    if (!academicYear) {
      return apiError(400, 'Please choose an active academic year.')
    }
    if (action === 'reopen' && user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'attendance:reopen')
      if (!authorized) return apiError(403, "You don't have permission to reopen finalized attendance.")
    }
    if (action === 'reopen' && reason.length < 5) {
      return apiError(400, 'Please enter a reason for reopening attendance.')
    }

    // Parse date as local midnight
    const [year, month, day] = date.split('-').map(Number)
    const attendanceDate = new Date(year, month - 1, day)

    // Block future dates
    const now = new Date()
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (attendanceDate > todayDate) {
      return apiError(400, 'Attendance cannot be finalized for future dates.')
    }

    // Check all students have attendance marked
    const studentWhere: Record<string, unknown> = {
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
    }

    const students = await db.student.findMany({
      where: studentWhere,
      select: { id: true },
    })

    const studentIds = students.map((s) => s.id)

    const existingAttendance = await db.attendance.findMany({
      where: {
        schoolId: user.schoolId,
        date: attendanceDate,
        academicYear,
        studentId: { in: studentIds },
      },
      select: { studentId: true, finalized: true },
    })
    if (existingAttendance.length === 0) {
      return apiError(400, 'No attendance records found for this class and date.')
    }

    // Check if already finalized
    const alreadyFinalized = existingAttendance.every((a) => a.finalized)
    if (action === 'finalize' && alreadyFinalized && existingAttendance.length > 0) {
      return apiError(400, 'Attendance is already finalized.')
    }
    if (action === 'reopen' && !alreadyFinalized) {
      return apiError(400, 'Attendance is already open for editing.')
    }

    // Check all students are marked before finalizing
    if (action === 'finalize') {
      const markedStudentIds = new Set(existingAttendance.map((a) => a.studentId))
      const unmarkedCount = studentIds.filter((id) => !markedStudentIds.has(id)).length
      if (unmarkedCount > 0) {
        return apiError(400, `Cannot finalize: ${unmarkedCount} student(s) have no attendance marked. Please mark all students first.`)
      }
    }

    const nowTs = new Date()
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.attendance.updateMany({
        where: {
          schoolId: user.schoolId,
          date: attendanceDate,
          academicYear,
          studentId: { in: studentIds },
        },
        data: {
          finalized: action === 'finalize',
          finalizedAt: action === 'finalize' ? nowTs : null,
          finalizedBy: action === 'finalize' ? user.userId : null,
        },
      })

      await tx.attendanceAuditLog.create({
        data: {
          schoolId: user.schoolId!,
          academicYear,
          date: attendanceDate,
          classId,
          sectionId: sectionId || null,
          action,
          reason: action === 'reopen' ? reason : null,
          performedBy: user.userId,
          createdAt: nowTs,
        },
      })

      return updated
    })

    return NextResponse.json({
      message: action === 'finalize'
        ? `Attendance finalized for ${result.count} students. No further edits allowed.`
        : `Attendance reopened for ${result.count} students. Editing is now allowed.`,
      count: result.count,
      finalized: action === 'finalize',
    })
  } catch (error) {
    console.error('Finalize attendance error:', error)
    return internalError('finalizing attendance')
  }
}
