import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, forbiddenError, internalError, unauthorizedError } from '@/lib/api-errors'

// GET /api/school/fees/assignments/unassigned?academicYear=&classId=
// Lists students enrolled for a class in the given academic year who do NOT yet
// have an active fee assignment for that year. Powers the "Assign Fee Group"
// tab, which freshly assigns a fee group to bulk-imported students.
//
// Source of truth for class membership is StudentAcademicEnrollment (one row per
// student per year), not Student.classId — the latter drifts after promotion.
export async function GET(request: NextRequest) {
  try {
    // SUPER_ADMIN is intentionally excluded — same restriction as change-group.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to assign fee groups. Contact your school administrator.")
      }
    }

    const { searchParams } = new URL(request.url)
    const academicYear = (searchParams.get('academicYear') || '').trim()
    const classId = (searchParams.get('classId') || '').trim()
    const schoolId = user.schoolId

    if (!academicYear) {
      return apiError(400, 'Please select an academic year.')
    }

    const enrollments = await db.studentAcademicEnrollment.findMany({
      where: {
        schoolId,
        academicYear,
        status: 'active',
        deletedAt: null,
        ...(classId ? { classId } : {}),
        student: { deletedAt: null, isActive: true },
      },
      select: {
        studentId: true,
        classId: true,
        sectionId: true,
        rollNumber: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            admissionDate: true,
          },
        },
      },
      orderBy: [{ classId: 'asc' }, { rollNumber: 'asc' }],
    })

    if (enrollments.length === 0) {
      return NextResponse.json({ students: [], total: 0 })
    }

    // Which of these students already carry an active fee assignment this year?
    const studentIds = enrollments.map((enrollment) => enrollment.studentId)
    const existing = await db.studentFeeAssignment.findMany({
      where: {
        schoolId,
        academicYear,
        status: 'active',
        deletedAt: null,
        studentId: { in: studentIds },
      },
      select: { studentId: true },
    })
    const assignedIds = new Set(existing.map((row) => row.studentId))

    const students = enrollments
      .filter((enrollment) => enrollment.student && !assignedIds.has(enrollment.studentId))
      .map((enrollment) => ({
        id: enrollment.student!.id,
        firstName: enrollment.student!.firstName,
        lastName: enrollment.student!.lastName,
        admissionNumber: enrollment.student!.admissionNumber,
        admissionDate: enrollment.student!.admissionDate,
        rollNumber: enrollment.rollNumber,
        classId: enrollment.classId,
        sectionId: enrollment.sectionId,
        className: enrollment.class?.name || null,
        sectionName: enrollment.section?.name || null,
      }))

    return NextResponse.json({ students, total: students.length })
  } catch (error) {
    console.error('List unassigned students error:', error)
    return internalError('listing unassigned students')
  }
}
