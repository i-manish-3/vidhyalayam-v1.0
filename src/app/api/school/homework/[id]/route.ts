import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/homework/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF', 'STUDENT', 'PARENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    const homework = await db.homework.findFirst({
      where: {
        id,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true, type: true } },
        teacher: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
        submissions: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                admissionNumber: true,
                rollNumber: true,
                profileImage: true,
                section: { select: { name: true } },
              },
            },
          },
          orderBy: [
            { student: { rollNumber: 'asc' } },
            { student: { firstName: 'asc' } },
          ],
        },
      },
    })

    if (!homework) {
      return notFoundError('Homework assignment')
    }

    // Compute metrics
    const totalStudents = homework.submissions.length
    const submittedCount = homework.submissions.filter((s) =>
      ['SUBMITTED', 'LATE', 'EVALUATED'].includes(s.status)
    ).length
    const evaluatedCount = homework.submissions.filter((s) => s.status === 'EVALUATED').length
    const pendingCount = homework.submissions.filter((s) => s.status === 'PENDING').length

    let totalMarksObtained = 0
    let evaluatedWithMarksCount = 0
    homework.submissions.forEach((s) => {
      if (s.status === 'EVALUATED' && s.marksObtained !== null && s.marksObtained !== undefined) {
        totalMarksObtained += Number(s.marksObtained)
        evaluatedWithMarksCount++
      }
    })

    const averageMarks =
      evaluatedWithMarksCount > 0
        ? Number((totalMarksObtained / evaluatedWithMarksCount).toFixed(1))
        : null

    return NextResponse.json({
      homework,
      stats: {
        totalStudents,
        submittedCount,
        evaluatedCount,
        pendingCount,
        averageMarks,
      },
    })
  } catch (error) {
    console.error('Error fetching homework details:', error)
    return internalError('loading homework assignment details')
  }
}

// PATCH /api/school/homework/[id]
export async function PATCH(
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

    const existing = await db.homework.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, teacherId: true },
    })

    if (!existing) {
      return notFoundError('Homework assignment')
    }

    // Teachers can only edit their own homework unless admin
    if (user.role === 'TEACHER') {
      const teacher = await db.teacher.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        select: { id: true },
      })
      if (teacher && existing.teacherId !== teacher.id) {
        return apiError(403, 'You can only edit homework assignments created by you.')
      }
    }

    const data: any = {}
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.description !== undefined) data.description = body.description.trim()
    if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate)
    if (body.submissionType !== undefined) data.submissionType = body.submissionType
    if (body.maxMarks !== undefined) {
      data.maxMarks = body.maxMarks !== null && body.maxMarks !== '' ? Number(body.maxMarks) : null
    }
    if (body.attachments !== undefined) data.attachments = body.attachments
    if (body.status !== undefined) data.status = body.status
    if (body.notifyStudents !== undefined) data.notifyStudents = Boolean(body.notifyStudents)
    if (body.notifyParents !== undefined) data.notifyParents = Boolean(body.notifyParents)

    const updated = await db.homework.update({
      where: { id },
      data,
      include: {
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json({ success: true, homework: updated })
  } catch (error) {
    console.error('Error updating homework:', error)
    return internalError('updating homework assignment')
  }
}

// DELETE /api/school/homework/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { id } = await params

    const existing = await db.homework.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, teacherId: true },
    })

    if (!existing) {
      return notFoundError('Homework assignment')
    }

    // Teachers can only delete their own homework
    if (user.role === 'TEACHER') {
      const teacher = await db.teacher.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        select: { id: true },
      })
      if (teacher && existing.teacherId !== teacher.id) {
        return apiError(403, 'You can only delete homework assignments created by you.')
      }
    }

    await db.homework.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true, message: 'Homework deleted successfully.' })
  } catch (error) {
    console.error('Error deleting homework:', error)
    return internalError('deleting homework assignment')
  }
}
