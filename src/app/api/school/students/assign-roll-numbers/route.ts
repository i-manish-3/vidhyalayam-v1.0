import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, forbiddenError } from '@/lib/api-errors'

// POST /api/school/students/assign-roll-numbers
// Bulk-assign roll numbers to a set of students within a single class+section.
// Body: { classId, sectionId?, assignments: [{ studentId, rollNumber }] }
//
// A blank/null rollNumber clears the student's roll.
// Within the submitted batch, duplicate non-blank roll numbers are rejected.
// Across the batch + existing students in the same (class, section), duplicates
// are also rejected (excluding the students being updated, so a swap is valid).
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF'])
    if (!user) return unauthorizedError()
    if (!user.schoolId) {
      return forbiddenError('No school is linked to your account. Please contact your administrator.')
    }

    // Check student:update permission for non-SUPER_ADMIN. We're updating
    // Student.rollNumber, so this matches the underlying action; no new
    // permission code needed.
    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'student:update')
      if (!authorized) {
        return forbiddenError("You don't have permission to assign roll numbers. Please contact your school administrator if you need this access.")
      }
    }

    const body = await request.json()
    const classId = typeof body.classId === 'string' ? body.classId.trim() : ''
    const sectionId = typeof body.sectionId === 'string' && body.sectionId.trim() ? body.sectionId.trim() : null
    const assignments: Array<{ studentId: string; rollNumber: string | null }> = Array.isArray(body.assignments) ? body.assignments : []

    if (!classId) return apiError(400, 'Please select a class.')
    if (assignments.length === 0) return apiError(400, 'No students to update.')

    // Normalise + validate input rows
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

    // All students must belong to this school + class + section.
    const students = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: user.schoolId,
        classId,
        ...(sectionId ? { sectionId } : {}),
        deletedAt: null,
      },
      select: { id: true },
    })
    if (students.length !== studentIds.length) {
      return apiError(400, 'Some students do not belong to the selected class/section. Please refresh and try again.')
    }

    // Detect conflicts with students NOT in the batch but in the same scope.
    const submittedRolls = normalised
      .map((row) => row.rollNumber)
      .filter((r): r is string => !!r)

    if (submittedRolls.length > 0) {
      const conflicts = await db.student.findMany({
        where: {
          schoolId: user.schoolId,
          classId,
          ...(sectionId ? { sectionId } : {}),
          deletedAt: null,
          id: { notIn: studentIds },
          rollNumber: { in: submittedRolls },
        },
        select: { id: true, firstName: true, lastName: true, rollNumber: true },
      })
      if (conflicts.length > 0) {
        const first = conflicts[0]
        return apiError(
          400,
          `Roll number "${first.rollNumber}" is already assigned to ${first.firstName} ${first.lastName} in this class. Clear it before assigning again.`
        )
      }
    }

    // All checks passed — bulk-update in a single transaction.
    const updated = await db.$transaction(
      normalised.map((row) =>
        db.student.update({
          where: { id: row.studentId },
          data: { rollNumber: row.rollNumber },
        })
      )
    )

    return NextResponse.json({ updated: updated.length, message: `${updated.length} student(s) updated.` })
  } catch (error) {
    console.error('Bulk assign roll numbers error:', error)
    return internalError('assigning roll numbers')
  }
}
