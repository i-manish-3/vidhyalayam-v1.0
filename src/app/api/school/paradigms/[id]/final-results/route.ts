import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/paradigms/[id]/final-results?classId=&sectionId=
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view final results.")
    }
    const { id: paradigmId } = await params

    const paradigm = await db.examParadigm.findFirst({
      where: { id: paradigmId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!paradigm) return notFoundError('ExamParadigm')

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') ?? undefined
    const sectionId = searchParams.get('sectionId') ?? undefined

    // Final results don't carry classId directly — pull through student
    const finals = await db.finalResult.findMany({
      where: {
        schoolId: user.schoolId,
        paradigmId,
        deletedAt: null,
      },
    })

    if (finals.length === 0) {
      return NextResponse.json({ paradigm, results: [], message: 'No final results yet. Run compute-final first.' })
    }

    const studentIds = finals.map((f) => f.studentId)
    const students = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: user.schoolId,
        deletedAt: null,
        ...(classId ? { classId } : {}),
        ...(sectionId ? { sectionId } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        classId: true,
        sectionId: true,
        admissionStatus: true,
      },
    })
    const studentMap = new Map(students.map((s) => [s.id, s]))

    // Filter finals by the requested class/section (drop those whose student isn't in the filtered set)
    const visibleFinals = finals
      .filter((f) => studentMap.has(f.studentId))
      .map((f) => ({
        ...f,
        student: studentMap.get(f.studentId)!,
      }))
      .sort((a, b) => (a.rankInClass ?? 9999) - (b.rankInClass ?? 9999))

    return NextResponse.json({ paradigm, results: visibleFinals })
  } catch (error) {
    console.error('List final results error:', error)
    return internalError('loading the final results')
  }
}
