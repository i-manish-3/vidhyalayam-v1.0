import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError, notFoundError } from '@/lib/api-errors'

/**
 * GET /api/school/exams/[id]/reports/subject-stats?classId=&topN=5
 *
 * Per subject, returns:
 *  - average %
 *  - pass count / fail count
 *  - top N performers
 *  - bottom N performers
 *
 * Reads from ResultSubjectSummary (computed by Phase 4 engine). Caller
 * usually narrows by class so subjects from other classes don't bleed in.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) return apiError(403, "You don't have permission to view reports.")
    const { id: examId } = await params

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, name: true, academicYear: true },
    })
    if (!exam) return notFoundError('Exam')

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') ?? undefined
    const sectionId = searchParams.get('sectionId') ?? undefined
    const topN = Math.min(20, Math.max(1, parseInt(searchParams.get('topN') ?? '5', 10)))

    const examResults = await db.examResult.findMany({
      where: {
        examId,
        schoolId: user.schoolId,
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
    })

    interface SubjectGroup {
      subjectId: string
      subjectName: string
      total: number
      pass: number
      fail: number
      absent: number
      sumPct: number
      entries: Array<{
        studentId: string
        firstName: string
        lastName: string | null
        rollNumber: string | null
        obtainedMarks: number
        totalMarks: number
        percentage: number
        grade: string | null
        status: string
      }>
    }
    const bySubject = new Map<string, SubjectGroup>()

    for (const er of examResults) {
      for (const sm of er.subjectSummaries) {
        const cur = bySubject.get(sm.subjectId) ?? {
          subjectId: sm.subjectId,
          subjectName: sm.subjectName,
          total: 0,
          pass: 0,
          fail: 0,
          absent: 0,
          sumPct: 0,
          entries: [],
        }
        cur.total += 1
        if (sm.status === 'pass') cur.pass += 1
        else if (sm.status === 'fail') cur.fail += 1
        else if (sm.status === 'absent') cur.absent += 1
        if (sm.status !== 'absent' && sm.status !== 'not_applicable') {
          cur.sumPct += sm.percentage
        }
        cur.entries.push({
          studentId: er.student.id,
          firstName: er.student.firstName,
          lastName: er.student.lastName,
          rollNumber: er.student.rollNumber,
          obtainedMarks: sm.obtainedMarks,
          totalMarks: sm.totalMarks,
          percentage: sm.percentage,
          grade: sm.grade,
          status: sm.status,
        })
        bySubject.set(sm.subjectId, cur)
      }
    }

    const subjects = Array.from(bySubject.values())
      .map((g) => {
        const scored = g.total - g.absent
        const eligible = g.entries.filter((e) => e.status !== 'absent' && e.status !== 'not_applicable')
        const sortedDesc = [...eligible].sort(
          (a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks,
        )
        const sortedAsc = [...eligible].sort(
          (a, b) => a.percentage - b.percentage || a.obtainedMarks - b.obtainedMarks,
        )
        return {
          subjectId: g.subjectId,
          subjectName: g.subjectName,
          total: g.total,
          pass: g.pass,
          fail: g.fail,
          absent: g.absent,
          averagePercentage: scored > 0 ? Math.round((g.sumPct / scored) * 100) / 100 : 0,
          passRate: g.total > 0 ? Math.round((g.pass / g.total) * 10000) / 100 : 0,
          topPerformers: sortedDesc.slice(0, topN),
          bottomPerformers: sortedAsc.slice(0, topN),
        }
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName))

    return NextResponse.json({ exam, subjects })
  } catch (error) {
    console.error('Subject stats report error:', error)
    return internalError('building the subject stats')
  }
}
