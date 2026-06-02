import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requirePermission } from '@/lib/api-auth'
import { internalError, apiError, notFoundError } from '@/lib/api-errors'

/**
 * GET /api/school/exams/paradigms/[id]/reports/term-comparison?classId=&studentId=
 *
 * Per student, for every exam under the paradigm: percentage + grade + rank.
 * The UI renders this as a line/heatmap so a class teacher can see trend
 * direction across terms.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission(request, 'exam:result:view')
    if (!user || !user.schoolId) return apiError(403, "You don't have permission to view reports.")
    const { id: paradigmId } = await params

    const paradigm = await db.examParadigm.findFirst({
      where: { id: paradigmId, schoolId: user.schoolId, deletedAt: null },
      include: {
        examGroups: {
          where: { deletedAt: null },
          orderBy: { sequence: 'asc' },
          include: {
            exams: {
              where: { deletedAt: null },
              orderBy: { startDate: 'asc' },
              select: {
                id: true,
                name: true,
                shortCode: true,
                academicYear: true,
                startDate: true,
              },
            },
          },
        },
      },
    })
    if (!paradigm) return notFoundError('Paradigm')

    const exams = paradigm.examGroups.flatMap((g) =>
      g.exams.map((e) => ({ ...e, groupName: g.name })),
    )
    if (exams.length === 0) {
      return NextResponse.json({ paradigm: { id: paradigm.id, name: paradigm.name }, exams: [], rows: [] })
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') ?? undefined
    const sectionId = searchParams.get('sectionId') ?? undefined
    const studentId = searchParams.get('studentId') ?? undefined

    const results = await db.examResult.findMany({
      where: {
        schoolId: user.schoolId,
        examId: { in: exams.map((e) => e.id) },
        deletedAt: null,
        ...(studentId
          ? { studentId }
          : classId || sectionId
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
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
          },
        },
      },
    })

    interface StudentRow {
      studentId: string
      firstName: string
      lastName: string | null
      rollNumber: string | null
      byExam: Record<
        string,
        {
          percentage: number
          grade: string | null
          status: string
          rankInClass: number | null
        }
      >
      averagePercentage: number
      examsAppeared: number
    }
    const rowMap = new Map<string, StudentRow>()
    for (const r of results) {
      const cur = rowMap.get(r.studentId) ?? {
        studentId: r.studentId,
        firstName: r.student.firstName,
        lastName: r.student.lastName,
        rollNumber: r.student.rollNumber,
        byExam: {},
        averagePercentage: 0,
        examsAppeared: 0,
      }
      cur.byExam[r.examId] = {
        percentage: r.percentage,
        grade: r.grade,
        status: r.status,
        rankInClass: r.rankInClass,
      }
      if (r.status !== 'absent') {
        cur.examsAppeared += 1
        cur.averagePercentage += r.percentage
      }
      rowMap.set(r.studentId, cur)
    }
    const rows = Array.from(rowMap.values())
      .map((r) => ({
        ...r,
        averagePercentage:
          r.examsAppeared > 0 ? Math.round((r.averagePercentage / r.examsAppeared) * 100) / 100 : 0,
      }))
      .sort((a, b) => {
        const aRoll = a.rollNumber ?? ''
        const bRoll = b.rollNumber ?? ''
        if (aRoll && bRoll) return aRoll.localeCompare(bRoll, undefined, { numeric: true })
        return `${a.firstName} ${a.lastName ?? ''}`.localeCompare(`${b.firstName} ${b.lastName ?? ''}`)
      })

    return NextResponse.json({
      paradigm: { id: paradigm.id, name: paradigm.name, academicYear: paradigm.academicYear },
      exams,
      rows,
    })
  } catch (error) {
    console.error('Term comparison report error:', error)
    return internalError('building the term comparison')
  }
}
