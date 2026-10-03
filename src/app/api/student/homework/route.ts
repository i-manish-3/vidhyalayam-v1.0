import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/student/homework
// Returns homework assignments for the logged-in student
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['STUDENT', 'PARENT', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    let studentId = searchParams.get('studentId')
    const filterStatus = searchParams.get('status') // 'all', 'pending', 'submitted', 'evaluated'
    const subjectId = searchParams.get('subjectId')

    if (!studentId && user.role === 'STUDENT') {
      const parent = await db.parent.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        include: { children: { take: 1, select: { studentId: true } } },
      })
      if (parent && parent.children.length > 0) {
        studentId = parent.children[0].studentId
      }
    }

    if (!studentId) {
      // Find the first active student in school to preview
      const fallbackStudent = await db.student.findFirst({
        where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
        select: { id: true },
      })
      if (fallbackStudent) {
        studentId = fallbackStudent.id
      } else {
        return NextResponse.json({ homework: [], stats: { total: 0, pending: 0, submitted: 0, evaluated: 0 } })
      }
    }

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, classId: true, sectionId: true },
    })

    if (!student || !student.classId) {
      return NextResponse.json({ homework: [], stats: { total: 0, pending: 0, submitted: 0, evaluated: 0 } })
    }

    const hwWhere: any = {
      schoolId: user.schoolId,
      classId: student.classId,
      deletedAt: null,
      status: { not: 'DRAFT' },
      OR: [
        { sectionId: null },
        { sectionId: student.sectionId },
      ],
    }

    if (subjectId && subjectId !== 'all') {
      hwWhere.subjectId = subjectId
    }

    const homeworkList = await db.homework.findMany({
      where: hwWhere,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        submissions: {
          where: { studentId: student.id },
          take: 1,
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    })

    const formattedList = homeworkList.map((hw) => {
      const mySubmission = hw.submissions[0] || null
      const isPastDue = new Date() > new Date(hw.dueDate)
      const submissionStatus = mySubmission ? mySubmission.status : isPastDue ? 'OVERDUE' : 'PENDING'

      return {
        id: hw.id,
        title: hw.title,
        description: hw.description,
        assignedDate: hw.assignedDate,
        dueDate: hw.dueDate,
        submissionType: hw.submissionType,
        maxMarks: hw.maxMarks,
        attachments: hw.attachments,
        subject: hw.subject,
        class: hw.class,
        section: hw.section,
        teacher: hw.teacher,
        isPastDue,
        submission: mySubmission,
        status: submissionStatus,
      }
    })

    // Filter by status if requested
    let filtered = formattedList
    if (filterStatus === 'pending') {
      filtered = formattedList.filter((h) => h.status === 'PENDING' || h.status === 'OVERDUE')
    } else if (filterStatus === 'submitted') {
      filtered = formattedList.filter((h) => h.status === 'SUBMITTED' || h.status === 'LATE')
    } else if (filterStatus === 'evaluated') {
      filtered = formattedList.filter((h) => h.status === 'EVALUATED')
    }

    const stats = {
      total: formattedList.length,
      pending: formattedList.filter((h) => h.status === 'PENDING' || h.status === 'OVERDUE').length,
      submitted: formattedList.filter((h) => h.status === 'SUBMITTED' || h.status === 'LATE').length,
      evaluated: formattedList.filter((h) => h.status === 'EVALUATED').length,
    }

    return NextResponse.json({
      student,
      homework: filtered,
      stats,
    })
  } catch (error) {
    console.error('Error fetching student homework:', error)
    return internalError('loading your homework assignments')
  }
}
