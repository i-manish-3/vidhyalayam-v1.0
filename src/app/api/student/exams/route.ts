import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError } from '@/lib/api-errors'

// GET /api/student/exams - Get exam results for the logged-in student
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['STUDENT'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''

    // Find parent record for this user
    const parent = await db.parent.findFirst({
      where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
      include: {
        children: {
          where: { student: { isActive: true } },
          select: { studentId: true },
        },
      },
    })

    if (!parent || parent.children.length === 0) {
      return NextResponse.json({ exams: [], results: [] })
    }

    const targetId = studentId || parent.children[0].studentId

    // Verify access
    if (!parent.children.some(c => c.studentId === targetId)) {
      return unauthorizedError()
    }

    // Get exam results for this student
    const results = await db.examResult.findMany({
      where: { schoolId: user.schoolId, studentId: targetId },
      include: {
        exam: {
          include: {
            subject: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Get upcoming exams for student's class
    const student = await db.student.findUnique({
      where: { id: targetId },
      select: { classId: true },
    })

    const upcomingExams = student?.classId ? await db.exam.findMany({
      where: {
        schoolId: user.schoolId,
        classId: student.classId,
        examDate: { gte: new Date() },
        deletedAt: null,
      },
      include: {
        subject: { select: { name: true } },
      },
      orderBy: { examDate: 'asc' },
      take: 10,
    }) : []

    return NextResponse.json({
      results: results.map(r => ({
        id: r.id,
        examName: r.exam?.name || 'Unknown',
        subject: r.exam?.subject?.name || 'Unknown',
        totalMarks: r.exam?.totalMarks || 100,
        marksObtained: r.marksObtained,
        grade: r.grade,
        remarks: r.remarks,
        passingMarks: r.exam?.passingMarks || 35,
        status: r.marksObtained >= (r.exam?.passingMarks || 35) ? 'pass' : 'fail',
      })),
      upcomingExams: upcomingExams.map(e => ({
        id: e.id,
        name: e.name,
        subject: e.subject?.name || 'Unknown',
        examDate: e.examDate ? new Date(e.examDate).toLocaleDateString() : null,
        totalMarks: e.totalMarks,
        duration: e.duration,
      })),
    })
  } catch (error) {
    console.error('Student exams error:', error)
    return internalError('loading your exam details')
  }
}
