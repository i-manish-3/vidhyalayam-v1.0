import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'

// GET /api/school/exams/[id]/admit-cards/students
//   ?classId=...&sectionId=...&search=...
//
// Student picker for the admit-card generate screen. Scoped to the exam's
// academic year and (when the exam declares examClasses) to the classes the
// exam actually runs for, so the admin can't accidentally issue admit cards to
// a class outside the exam. Gated on the same permission as generation.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()
    const allowed = await requirePermission(request, 'exam:admitcard:download')
    if (!allowed) return apiError(403, "You don't have permission to view admit-card data.")

    const { id: examId } = await params
    const schoolId = user.schoolId

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId, deletedAt: null },
      select: {
        academicYear: true,
        examClasses: { select: { classId: true } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId')?.trim() || ''
    const sectionId = searchParams.get('sectionId')?.trim() || ''
    const search = searchParams.get('search')?.trim() || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '500', 10) || 500, 500)

    // Class scope: explicit filter takes precedence; otherwise the exam's
    // declared classes; otherwise unrestricted (exam covers all classes).
    const examClassIds = exam.examClasses.map((c) => c.classId)
    let scopedClassIds: string[] | null = null
    if (classId) {
      if (examClassIds.length > 0 && !examClassIds.includes(classId)) {
        return NextResponse.json({ students: [] })
      }
      scopedClassIds = [classId]
    } else if (examClassIds.length > 0) {
      scopedClassIds = examClassIds
    }

    const enrollmentFilter: Record<string, unknown> = {
      academicYear: exam.academicYear,
      deletedAt: null,
    }
    if (scopedClassIds) enrollmentFilter.classId = { in: scopedClassIds }
    if (sectionId) enrollmentFilter.sectionId = sectionId

    const where: Record<string, unknown> = {
      schoolId,
      deletedAt: null,
      admissionStatus: { in: ['admitted', 'promoted'] },
      academicEnrollments: { some: enrollmentFilter },
    }
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
      ]
    }

    const students = await db.student.findMany({
      where,
      take: limit,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        profileImage: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        academicEnrollments: {
          where: { academicYear: exam.academicYear, deletedAt: null },
          select: {
            rollNumber: true,
            class: { select: { id: true, name: true } },
            section: { select: { id: true, name: true } },
          },
          take: 1,
        },
      },
    })

    return NextResponse.json({ students })
  } catch (error) {
    console.error('List admit-card students error:', error)
    return internalError('loading students for admit cards')
  }
}
