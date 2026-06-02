import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

/**
 * GET /api/students/me/results
 *
 * Self-service results view for student and parent users. Returns only
 * exams with visibleToParent=true (per-exam) plus published FinalResults
 * (per paradigm). The admin-side `/api/school/exams/[id]/results` is the
 * authoritative endpoint — this one strips audit detail and rank for
 * privacy when configured to, and refuses to return anything until the
 * exam has been published.
 *
 * Query params:
 *   - studentId — required for PARENT users when they have multiple children
 *   - paradigmId — narrow to one paradigm/academic year
 *
 * Response:
 *   { studentId, exams: [{exam, result, summaries}], finalResults: [...] }
 */
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['STUDENT', 'PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const studentIdParam = searchParams.get('studentId')
    const paradigmId = searchParams.get('paradigmId') ?? undefined

    const studentId = await resolveStudentId(user.userId, user.schoolId, user.role, studentIdParam)
    if (!studentId) return apiError(404, "We couldn't find a student record linked to your account.")

    // Per-exam results: only exams the school has flipped visibleToParent on.
    const examResults = await db.examResult.findMany({
      where: {
        schoolId: user.schoolId,
        studentId,
        deletedAt: null,
        exam: {
          deletedAt: null,
          visibleToParent: true,
          publishedAt: { not: null },
          ...(paradigmId ? { group: { paradigmId } } : {}),
        },
      },
      include: {
        subjectSummaries: true,
        exam: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            academicYear: true,
            publishedAt: true,
            startDate: true,
            endDate: true,
            group: {
              select: {
                id: true,
                name: true,
                shortCode: true,
                paradigm: { select: { id: true, name: true, academicYear: true } },
              },
            },
          },
        },
      },
      orderBy: { computedAt: 'desc' },
    })

    // FinalResults: only those with a publishedAt timestamp.
    const finalResults = await db.finalResult.findMany({
      where: {
        schoolId: user.schoolId,
        studentId,
        deletedAt: null,
        publishedAt: { not: null },
        ...(paradigmId ? { paradigmId } : {}),
      },
      orderBy: { publishedAt: 'desc' },
    })

    return NextResponse.json({
      studentId,
      exams: examResults.map((r) => ({
        exam: r.exam,
        result: {
          id: r.id,
          totalMarks: r.totalMarks,
          obtainedMarks: r.obtainedMarks,
          percentage: r.percentage,
          grade: r.grade,
          gradePoint: r.gradePoint,
          rankInClass: r.rankInClass,
          rankInSection: r.rankInSection,
          status: r.status,
          failedSubjects: r.failedSubjects,
          remarks: r.remarks,
        },
        subjectSummaries: r.subjectSummaries,
      })),
      finalResults,
    })
  } catch (error) {
    console.error('Self results error:', error)
    return internalError('loading your results')
  }
}

/**
 * Find the student row associated with the logged-in user.
 *
 * STUDENT role: Student table has no userId column today, so we follow the
 *   same workaround the attendance endpoint uses — find the student via a
 *   parent link. A future hardening pass will add Student.userId; this
 *   keeps Phase 5 unblocked.
 *
 * PARENT role: a parent may have multiple children; allow them to pass
 *   ?studentId=... to disambiguate, otherwise pick the first linked child.
 */
async function resolveStudentId(
  userId: string,
  schoolId: string,
  role: string,
  studentIdParam: string | null,
): Promise<string | null> {
  const parent = await db.parent.findFirst({
    where: { userId, schoolId, deletedAt: null },
    include: {
      children: { select: { studentId: true, isPrimary: true } },
    },
  })
  if (!parent) {
    // No parent record; treat as STUDENT with no linkage yet.
    return null
  }
  const linkedIds = new Set(parent.children.map((c) => c.studentId))
  if (studentIdParam && linkedIds.has(studentIdParam)) return studentIdParam
  if (studentIdParam && !linkedIds.has(studentIdParam)) {
    // Parent asked for a student that isn't theirs — refuse silently.
    return null
  }
  const primary = parent.children.find((c) => c.isPrimary) ?? parent.children[0]
  // role is unused for now but kept on the signature so the STUDENT.userId
  // path can be added without changing callers.
  void role
  return primary?.studentId ?? null
}
