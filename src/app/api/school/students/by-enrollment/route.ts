import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

// GET /api/school/students/by-enrollment
// Lists students enrolled in (academicYear, classId, sectionId?). Each row's
// rollNumber comes from the StudentAcademicEnrollment row for that year, NOT
// from Student.rollNumber. Used by the Assign Roll Numbers page so editing a
// roll in 2025-2026 doesn't show / touch 2024-2025 history.
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const academicYear = (searchParams.get('academicYear') || '').trim()
    const classId = (searchParams.get('classId') || '').trim()
    const sectionId = (searchParams.get('sectionId') || '').trim()

    if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) {
      return apiError(400, 'Please choose an academic year.')
    }
    if (!classId) {
      return apiError(400, 'Please select a class.')
    }

    const enrollments = await db.studentAcademicEnrollment.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear,
        classId,
        ...(sectionId ? { sectionId } : { sectionId: null }),
        deletedAt: null,
        status: { in: ['active', 'promoted', 'detained'] },
        student: { deletedAt: null },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            classId: true,
            sectionId: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    const students = enrollments
      .filter((enrollment) => enrollment.student)
      .map((enrollment) => ({
        id: enrollment.student!.id,
        firstName: enrollment.student!.firstName,
        lastName: enrollment.student!.lastName,
        admissionNumber: enrollment.student!.admissionNumber,
        rollNumber: enrollment.rollNumber,
        classId: enrollment.classId,
        sectionId: enrollment.sectionId,
        isActive: enrollment.student!.isActive,
        enrollmentId: enrollment.id,
        enrollmentStatus: enrollment.status,
      }))

    return NextResponse.json({ students })
  } catch (error) {
    console.error('List students by enrollment error:', error)
    return internalError('loading students')
  }
}
