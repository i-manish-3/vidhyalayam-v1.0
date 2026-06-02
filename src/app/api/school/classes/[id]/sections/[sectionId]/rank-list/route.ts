import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError } from '@/lib/api-errors'

// GET /api/school/classes/[id]/sections/[sectionId]/rank-list?paradigmId=...
// Returns the rank list for one class/section under a paradigm (final results).
// Use sectionId='__all' to skip the section narrowing.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sectionId: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to view rank lists.")
    }
    const { id: classId, sectionId: sectionIdRaw } = await params
    const sectionId = sectionIdRaw === '__all' ? null : sectionIdRaw

    const { searchParams } = new URL(request.url)
    const paradigmId = searchParams.get('paradigmId') ?? undefined
    const examId = searchParams.get('examId') ?? undefined

    if (!paradigmId && !examId) {
      return apiError(400, 'paradigmId or examId is required.')
    }

    // Resolve students in scope
    const students = await db.student.findMany({
      where: {
        schoolId: user.schoolId,
        classId,
        ...(sectionId ? { sectionId } : {}),
        deletedAt: null,
        // Exclude withdrawn students from the rank list
        admissionStatus: { not: 'withdrawn' },
      },
      select: { id: true, firstName: true, lastName: true, rollNumber: true, sectionId: true },
    })
    const studentMap = new Map(students.map((s) => [s.id, s]))

    if (paradigmId) {
      const finals = await db.finalResult.findMany({
        where: {
          schoolId: user.schoolId,
          paradigmId,
          deletedAt: null,
          studentId: { in: students.map((s) => s.id) },
        },
        orderBy: [{ rankInClass: 'asc' }],
      })
      return NextResponse.json({
        scope: 'paradigm',
        ranks: finals.map((f) => ({ ...f, student: studentMap.get(f.studentId) })),
      })
    }

    // Per-exam rank list
    const examResults = await db.examResult.findMany({
      where: {
        schoolId: user.schoolId,
        examId: examId!,
        deletedAt: null,
        studentId: { in: students.map((s) => s.id) },
      },
      orderBy: [{ rankInClass: 'asc' }],
    })
    return NextResponse.json({
      scope: 'exam',
      ranks: examResults.map((r) => ({ ...r, student: studentMap.get(r.studentId) })),
    })
  } catch (error) {
    console.error('Rank list error:', error)
    return internalError('loading the rank list')
  }
}
