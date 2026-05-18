import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/exams/results - Get exam results
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const examId = searchParams.get('examId') || ''
    const studentId = searchParams.get('studentId') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
    }
    if (examId) where.examId = examId
    if (studentId) where.studentId = studentId

    const results = await db.examResult.findMany({
      where,
      include: {
        exam: {
          select: {
            id: true,
            name: true,
            totalMarks: true,
            passingMarks: true,
            subject: { select: { name: true } },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: { student: { rollNumber: 'asc' } },
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Get exam results error:', error)
    return internalError('loading exam results')
  }
}

// POST /api/school/exams/results - Submit exam result
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const { examId, results } = body

    if (!examId || !results || !Array.isArray(results)) {
      return apiError(400, 'Please select an exam and enter the results for at least one student.')
    }

    // Verify exam belongs to this school
    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) {
      return notFoundError('Exam')
    }

    const created = []
    for (const result of results) {
      const { studentId, marksObtained, grade, remarks } = result

      // Verify student belongs to this school
      const student = await db.student.findFirst({
        where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      })
      if (!student) continue

      const examResult = await db.examResult.upsert({
        where: {
          examId_studentId: { examId, studentId },
        },
        create: {
          schoolId: user.schoolId!,
          examId,
          studentId,
          marksObtained,
          grade,
          remarks,
        },
        update: {
          marksObtained,
          grade,
          remarks,
        },
      })
      created.push(examResult)
    }

    return NextResponse.json({
      message: `${created.length} exam results submitted`,
      count: created.length,
    })
  } catch (error) {
    console.error('Submit exam results error:', error)
    return internalError('submitting exam results')
  }
}
