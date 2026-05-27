import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'

// GET /api/school/exams - List exams
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId') || ''
    const subjectId = searchParams.get('subjectId') || ''

    const where: Record<string, unknown> = {
      schoolId: user.schoolId,
      deletedAt: null,
    }
    if (classId) where.classId = classId
    if (subjectId) where.subjectId = subjectId

    const exams = await db.exam.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        _count: { select: { results: true } },
      },
      orderBy: { examDate: 'desc' },
    })

    return NextResponse.json({ exams })
  } catch (error) {
    console.error('List exams error:', error)
    return internalError('listing exams')
  }
}

// POST /api/school/exams - Create exam
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:create')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to create exams.")
    }

    const body = await request.json()
    const {
      name,
      subjectId,
      classId,
      sectionId,
      examDate,
      totalMarks,
      passingMarks,
      duration,
      academicYear,
    } = body

    if (!name || !subjectId || !classId) {
      return apiError(400, 'Please enter the exam name, subject, and class.')
    }

    // Verify subject and class belong to this school
    const [subject, classRecord] = await Promise.all([
      db.subject.findFirst({
        where: { id: subjectId, schoolId: user.schoolId, deletedAt: null },
      }),
      db.class.findFirst({
        where: { id: classId, schoolId: user.schoolId, deletedAt: null },
      }),
    ])

    if (!subject) {
      return apiError(400, "The subject you selected doesn't exist anymore. It may have been removed. Please refresh and try again.")
    }
    if (!classRecord) {
      return apiError(400, "The class you selected doesn't exist anymore. It may have been removed. Please refresh and try again.")
    }

    const exam = await db.exam.create({
      data: {
        schoolId: user.schoolId,
        name,
        subjectId,
        classId,
        sectionId: sectionId || null,
        examDate: examDate ? new Date(examDate) : null,
        totalMarks: totalMarks || 100,
        passingMarks: passingMarks || 35,
        duration,
        academicYear,
      },
      include: {
        subject: { select: { name: true, code: true } },
      },
    })

    return NextResponse.json(exam, { status: 201 })
  } catch (error) {
    console.error('Create exam error:', error)
    return internalError('creating the exam')
  }
}
