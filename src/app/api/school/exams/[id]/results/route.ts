import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/exams/[id]/results?classId=&sectionId=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view exam results.")
    }
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
      include: {
        group: { include: { paradigm: { select: { name: true, academicYear: true } } } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') ?? undefined
    const sectionId = searchParams.get('sectionId') ?? undefined

    const results = await db.examResult.findMany({
      where: {
        schoolId: user.schoolId,
        examId,
        deletedAt: null,
        ...(classId || sectionId
          ? {
              student: {
                ...(classId ? { classId } : {}),
                ...(sectionId ? { sectionId } : {}),
                deletedAt: null,
              },
            }
          : {}),
      },
      include: {
        subjectSummaries: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            classId: true,
            sectionId: true,
          },
        },
      },
      orderBy: [{ rankInClass: 'asc' }, { percentage: 'desc' }],
    })

    return NextResponse.json({ results, exam })
  } catch (error) {
    console.error('List exam results error:', error)
    return internalError('loading the exam results')
  }
}
