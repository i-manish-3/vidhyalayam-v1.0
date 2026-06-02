import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/students/[id]/results?academicYear=
// Returns all exam and final results for one student, scoped to school.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view student results.")
    }
    const { id: studentId } = await params

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, classId: true, sectionId: true },
    })
    if (!student) return notFoundError('Student')

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear') ?? undefined

    const [examResults, groupResults, finalResults] = await Promise.all([
      db.examResult.findMany({
        where: {
          schoolId: user.schoolId,
          studentId,
          deletedAt: null,
          ...(academicYear ? { academicYear } : {}),
        },
        include: {
          subjectSummaries: true,
          exam: {
            select: {
              id: true,
              name: true,
              shortCode: true,
              examType: true,
              startDate: true,
              endDate: true,
              examGroupId: true,
              group: { select: { name: true, paradigmId: true } },
            },
          },
        },
        orderBy: { computedAt: 'desc' },
      }),
      db.examGroupResult.findMany({
        where: {
          schoolId: user.schoolId,
          studentId,
          ...(academicYear ? { academicYear } : {}),
        },
        orderBy: { computedAt: 'desc' },
      }),
      db.finalResult.findMany({
        where: {
          schoolId: user.schoolId,
          studentId,
          deletedAt: null,
          ...(academicYear ? { academicYear } : {}),
        },
        orderBy: { computedAt: 'desc' },
      }),
    ])

    return NextResponse.json({
      student,
      examResults,
      groupResults,
      finalResults,
    })
  } catch (error) {
    console.error('List student results error:', error)
    return internalError('loading the student results')
  }
}
