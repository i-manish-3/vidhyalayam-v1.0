import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/parent/homework
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    let studentId = searchParams.get('studentId')

    // Find parent's children
    let children: any[] = []
    if (user.role === 'PARENT') {
      const parentRecords = await db.parent.findMany({
        where: { userId: user.userId, schoolId: user.schoolId },
        select: { id: true },
      })
      if (parentRecords.length > 0) {
        const studentLinks = await db.studentParent.findMany({
          where: { parentId: { in: parentRecords.map((p) => p.id) } },
          select: { studentId: true },
        })
        const studentIds = studentLinks.map((sl) => sl.studentId)
        if (studentIds.length > 0) {
          children = await db.student.findMany({
            where: { id: { in: studentIds }, deletedAt: null },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
              rollNumber: true,
              profileImage: true,
              class: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
            },
          })
        }
      }
    }

    // Fallback children for testing / admin preview
    if (children.length === 0) {
      children = await db.student.findMany({
        where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
        take: 5,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          profileImage: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
        },
      })
    }

    if (children.length === 0) {
      return NextResponse.json({ children: [], homework: [], selectedChild: null })
    }

    if (!studentId || !children.some((c) => c.id === studentId)) {
      studentId = children[0].id
    }

    const selectedChild = children.find((c) => c.id === studentId) || children[0]

    const homeworkList = await db.homework.findMany({
      where: {
        schoolId: user.schoolId,
        classId: selectedChild.class.id,
        deletedAt: null,
        status: { not: 'DRAFT' },
        OR: [
          { sectionId: null },
          { sectionId: selectedChild.section?.id },
        ],
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
        submissions: {
          where: studentId ? { studentId } : undefined,
          take: 1,
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    })

    const homework = homeworkList.map((hw) => {
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
        teacher: hw.teacher,
        isPastDue,
        submission: mySubmission,
        status: submissionStatus,
      }
    })

    return NextResponse.json({
      children,
      selectedChild,
      homework,
      stats: {
        total: homework.length,
        pending: homework.filter((h) => h.status === 'PENDING' || h.status === 'OVERDUE').length,
        submitted: homework.filter((h) => h.status === 'SUBMITTED' || h.status === 'LATE').length,
        evaluated: homework.filter((h) => h.status === 'EVALUATED').length,
      },
    })
  } catch (error) {
    console.error('Error in parent homework route:', error)
    return internalError('loading homework diary')
  }
}
