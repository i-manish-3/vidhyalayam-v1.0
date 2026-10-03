import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/homework/[id]/submissions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    const homework = await db.homework.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, title: true, maxMarks: true, classId: true, sectionId: true },
    })

    if (!homework) {
      return notFoundError('Homework assignment')
    }

    const submissions = await db.homeworkSubmission.findMany({
      where: {
        homeworkId: id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            rollNumber: true,
            profileImage: true,
            section: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { student: { rollNumber: 'asc' } },
        { student: { firstName: 'asc' } },
      ],
    })

    return NextResponse.json({
      homework,
      submissions,
    })
  } catch (error) {
    console.error('Error fetching homework submissions:', error)
    return internalError('loading submissions')
  }
}

// POST /api/school/homework/[id]/submissions
// Supports both single evaluation and bulk evaluation
// Body:
// 1. Single: { studentId, status, marksObtained, feedback }
// 2. Bulk: { evaluations: [ { studentId, status, marksObtained, feedback }, ... ] }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()

    const homework = await db.homework.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, maxMarks: true },
    })

    if (!homework) {
      return notFoundError('Homework assignment')
    }

    // Determine evaluator teacher ID or user identifier
    let evaluatorId = user.userId
    if (user.role === 'TEACHER') {
      const teacher = await db.teacher.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        select: { id: true },
      })
      if (teacher) evaluatorId = teacher.id
    }

    const now = new Date()

    // Check if bulk or single
    if (Array.isArray(body.evaluations)) {
      const updates = body.evaluations.map((item: any) => {
        const marks =
          item.marksObtained !== null && item.marksObtained !== undefined && item.marksObtained !== ''
            ? Number(item.marksObtained)
            : null

        const status =
          item.status || (marks !== null ? 'EVALUATED' : 'PENDING')

        return db.homeworkSubmission.upsert({
          where: {
            homeworkId_studentId: {
              homeworkId: id,
              studentId: item.studentId,
            },
          },
          update: {
            status,
            marksObtained: marks,
            feedback: item.feedback !== undefined ? item.feedback : undefined,
            evaluatedAt: status === 'EVALUATED' ? now : undefined,
            evaluatedBy: evaluatorId,
          },
          create: {
            schoolId: user.schoolId!,
            homeworkId: id,
            studentId: item.studentId,
            status,
            marksObtained: marks,
            feedback: item.feedback || '',
            evaluatedAt: status === 'EVALUATED' ? now : null,
            evaluatedBy: evaluatorId,
          },
        })
      })

      await Promise.all(updates)

      return NextResponse.json({
        success: true,
        message: `Successfully evaluated ${updates.length} students.`,
      })
    }

    // Single student evaluation
    const { studentId, status = 'EVALUATED', marksObtained, feedback } = body

    if (!studentId) {
      return apiError(400, 'Student ID is required.')
    }

    const marks =
      marksObtained !== null && marksObtained !== undefined && marksObtained !== ''
        ? Number(marksObtained)
        : null

    if (marks !== null && homework.maxMarks !== null && marks > homework.maxMarks) {
      return apiError(400, `Marks obtained cannot exceed maximum marks (${homework.maxMarks}).`)
    }

    const submission = await db.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: id,
          studentId,
        },
      },
      update: {
        status,
        marksObtained: marks,
        feedback: feedback !== undefined ? feedback : undefined,
        evaluatedAt: status === 'EVALUATED' ? now : undefined,
        evaluatedBy: evaluatorId,
      },
      create: {
        schoolId: user.schoolId!,
        homeworkId: id,
        studentId,
        status,
        marksObtained: marks,
        feedback: feedback || '',
        evaluatedAt: status === 'EVALUATED' ? now : null,
        evaluatedBy: evaluatorId,
      },
      include: {
        student: {
          select: { id: true, firstName: true, lastName: true, admissionNumber: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      submission,
      message: 'Student evaluation saved successfully.',
    })
  } catch (error) {
    console.error('Error saving homework evaluation:', error)
    return internalError('saving evaluation')
  }
}
