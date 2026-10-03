import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// POST /api/school/homework/[id]/submit
// Allows students to submit their homework online
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['STUDENT', 'PARENT', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'TEACHER'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params
    const body = await request.json()
    const { content = '', attachments = [], studentId: reqStudentId } = body

    const homework = await db.homework.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, dueDate: true, classId: true, sectionId: true, submissionType: true, status: true },
    })

    if (!homework) {
      return notFoundError('Homework assignment')
    }

    if (homework.status === 'CLOSED' || homework.status === 'ARCHIVED') {
      return apiError(400, 'This homework assignment is closed for submissions.')
    }

    // Determine target student ID
    let studentId = reqStudentId

    if (!studentId && user.role === 'STUDENT') {
      // Find parent or student linkage
      const parent = await db.parent.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        include: { children: { take: 1, select: { studentId: true } } },
      })
      if (parent && parent.children.length > 0) {
        studentId = parent.children[0].studentId
      }
    }

    if (!studentId) {
      return apiError(400, 'Student identifier is required for homework submission.')
    }

    const now = new Date()
    const isLate = now > new Date(homework.dueDate)
    const status = isLate ? 'LATE' : 'SUBMITTED'

    const submission = await db.homeworkSubmission.upsert({
      where: {
        homeworkId_studentId: {
          homeworkId: id,
          studentId,
        },
      },
      update: {
        status,
        submittedAt: now,
        content: content.trim(),
        attachments: Array.isArray(attachments) ? attachments : [],
      },
      create: {
        schoolId: user.schoolId,
        homeworkId: id,
        studentId,
        status,
        submittedAt: now,
        content: content.trim(),
        attachments: Array.isArray(attachments) ? attachments : [],
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json({
      success: true,
      submission,
      message: isLate
        ? 'Homework submitted (marked as Late).'
        : 'Homework submitted successfully!',
    })
  } catch (error) {
    console.error('Error submitting homework:', error)
    return internalError('submitting homework')
  }
}
