import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveActiveAcademicYear(schoolId: string, value: unknown) {
  const academicYear = typeof value === 'string' ? value.trim() : ''
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null

  const exists = await db.academicYear.findFirst({
    where: { schoolId, name: academicYear, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return exists ? academicYear : null
}

// POST /api/school/students/assign-roll-numbers
// Bulk-assign roll numbers per academic year + class (+ section).
// Body: { academicYear, classId, sectionId?, assignments: [{ studentId, rollNumber }] }
//
// Roll numbers live on StudentAcademicEnrollment (per year + class + section),
// so changing a roll in 2025-2026 does NOT touch the 2024-2025 history.
// Student.rollNumber is kept in sync ONLY when the student's current class
// matches the targeted enrollment (so attendance / exam ordering stays right).
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user) return unauthorizedError()
    if (!user.schoolId) {
      return forbiddenError('No school is linked to your account. Please contact your administrator.')
    }

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:update')
      if (!authorized) {
        return forbiddenError("You don't have permission to assign roll numbers. Please contact your school administrator if you need this access.")
      }
    }

    const body = await request.json()
    const classId = typeof body.classId === 'string' ? body.classId.trim() : ''
    const sectionId = typeof body.sectionId === 'string' && body.sectionId.trim() ? body.sectionId.trim() : null
    const academicYear = await resolveActiveAcademicYear(user.schoolId, body.academicYear)
    const assignments: Array<{ studentId: string; rollNumber: string | null }> = Array.isArray(body.assignments) ? body.assignments : []

    if (!academicYear) return apiError(400, 'Please choose an active academic year.')
    if (!classId) return apiError(400, 'Please select a class.')
    if (assignments.length === 0) return apiError(400, 'No students to update.')

    const normalised = assignments.map((row) => ({
      studentId: typeof row.studentId === 'string' ? row.studentId : '',
      rollNumber: typeof row.rollNumber === 'string' && row.rollNumber.trim() ? row.rollNumber.trim() : null,
    })).filter((row) => row.studentId)

    if (normalised.length === 0) return apiError(400, 'No valid student rows in the request.')

    // Duplicate roll numbers within the submitted batch
    const seen = new Map<string, string>()
    for (const row of normalised) {
      if (!row.rollNumber) continue
      const prev = seen.get(row.rollNumber)
      if (prev && prev !== row.studentId) {
        return apiError(400, `Roll number "${row.rollNumber}" is assigned to more than one student in this submission.`)
      }
      seen.set(row.rollNumber, row.studentId)
    }

    const studentIds = normalised.map((row) => row.studentId)

    // Pull each student's enrollment for the targeted (year + class + section).
    // We update the enrollment row; if it doesn't exist, that's an error —
    // the UI should be loading only enrolled students for this scope.
    const enrollments = await db.studentAcademicEnrollment.findMany({
      where: {
        schoolId: user.schoolId,
        studentId: { in: studentIds },
        academicYear,
        classId,
        ...(sectionId ? { sectionId } : { sectionId: null }),
        deletedAt: null,
      },
      select: { id: true, studentId: true, rollNumber: true },
    })

    const enrollmentByStudent = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]))
    const missing = studentIds.filter((id) => !enrollmentByStudent.has(id))
    if (missing.length > 0) {
      return apiError(
        400,
        `${missing.length} student(s) don't have an enrollment in this class & section for ${academicYear}. Refresh and try again.`
      )
    }

    // Detect roll conflicts within the same (year, class, section) enrollment
    // scope, EXCLUDING the students being updated (so a swap is valid).
    const submittedRolls = normalised
      .map((row) => row.rollNumber)
      .filter((roll): roll is string => !!roll)

    if (submittedRolls.length > 0) {
      const conflicts = await db.studentAcademicEnrollment.findMany({
        where: {
          schoolId: user.schoolId,
          academicYear,
          classId,
          ...(sectionId ? { sectionId } : { sectionId: null }),
          deletedAt: null,
          studentId: { notIn: studentIds },
          rollNumber: { in: submittedRolls },
        },
        select: {
          rollNumber: true,
          student: { select: { firstName: true, lastName: true } },
        },
      })
      if (conflicts.length > 0) {
        const first = conflicts[0]
        const name = first.student ? `${first.student.firstName} ${first.student.lastName}`.trim() : 'another student'
        return apiError(
          400,
          `Roll number "${first.rollNumber}" is already assigned to ${name} in this class for ${academicYear}. Clear it before assigning again.`
        )
      }
    }

    // Determine which students currently sit in this class+section. Only those
    // have their Student.rollNumber synced (attendance / exam queries sort by
    // it). Past-year enrollments leave the historical row authoritative.
    const currentStudents = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: user.schoolId,
        classId,
        ...(sectionId ? { sectionId } : { sectionId: null }),
        deletedAt: null,
      },
      select: { id: true },
    })
    const currentInScope = new Set(currentStudents.map((student) => student.id))

    const result = await db.$transaction(async (tx) => {
      let enrollmentUpdates = 0
      let studentUpdates = 0
      for (const row of normalised) {
        const enrollment = enrollmentByStudent.get(row.studentId)
        if (!enrollment) continue

        await tx.studentAcademicEnrollment.update({
          where: { id: enrollment.id },
          data: { rollNumber: row.rollNumber },
        })
        enrollmentUpdates += 1

        if (currentInScope.has(row.studentId)) {
          await tx.student.update({
            where: { id: row.studentId },
            data: { rollNumber: row.rollNumber },
          })
          studentUpdates += 1
        }
      }
      return { enrollmentUpdates, studentUpdates }
    })

    return NextResponse.json({
      updated: result.enrollmentUpdates,
      currentClassUpdated: result.studentUpdates,
      message: `${result.enrollmentUpdates} student(s) updated for ${academicYear}.`,
    })
  } catch (error) {
    console.error('Bulk assign roll numbers error:', error)
    return internalError('assigning roll numbers')
  }
}
