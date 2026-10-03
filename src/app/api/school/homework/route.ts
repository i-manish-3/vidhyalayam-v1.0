import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { createNotification } from '@/lib/notifications'

// GET /api/school/homework
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const { searchParams } = new URL(request.url)
    const academicYear = searchParams.get('academicYear')
    const classId = searchParams.get('classId')
    const sectionId = searchParams.get('sectionId')
    const subjectId = searchParams.get('subjectId')
    const teacherId = searchParams.get('teacherId')
    const status = searchParams.get('status')
    const search = searchParams.get('search')?.trim()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)))
    const skip = (page - 1) * limit

    const where: any = {
      schoolId: user.schoolId,
      deletedAt: null,
    }

    if (academicYear) where.academicYear = academicYear
    if (classId && classId !== 'all') where.classId = classId
    if (sectionId && sectionId !== 'all') where.sectionId = sectionId
    if (subjectId && subjectId !== 'all') where.subjectId = subjectId
    if (teacherId && teacherId !== 'all') where.teacherId = teacherId
    if (status && status !== 'all') where.status = status

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { subject: { name: { contains: search, mode: 'insensitive' } } },
        { class: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    // Role-specific scoping: If TEACHER, filter to either created by this teacher or in their classes
    if (user.role === 'TEACHER') {
      const teacher = await db.teacher.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        select: { id: true },
      })
      if (teacher && (!teacherId || teacherId === 'all')) {
        where.teacherId = teacher.id
      }
    }

    const [total, homeworkList] = await Promise.all([
      db.homework.count({ where }),
      db.homework.findMany({
        where,
        include: {
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacher: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
          submissions: {
            select: {
              id: true,
              status: true,
              marksObtained: true,
            },
          },
        },
        orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
    ])

    const items = homeworkList.map((hw) => {
      const totalStudents = hw.submissions.length
      const submittedCount = hw.submissions.filter((s) =>
        ['SUBMITTED', 'LATE', 'EVALUATED'].includes(s.status)
      ).length
      const evaluatedCount = hw.submissions.filter((s) => s.status === 'EVALUATED').length
      const pendingCount = hw.submissions.filter((s) => s.status === 'PENDING').length

      const { submissions, ...hwRest } = hw

      return {
        ...hwRest,
        stats: {
          totalStudents,
          submittedCount,
          evaluatedCount,
          pendingCount,
        },
      }
    })

    return NextResponse.json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Error fetching homework list:', error)
    return internalError('loading homework assignments')
  }
}

// POST /api/school/homework
export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['TEACHER', 'SCHOOL_ADMIN', 'SUPER_ADMIN', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    const body = await request.json()
    const {
      title,
      description,
      classId,
      sectionId,
      subjectId,
      assignedDate,
      dueDate,
      submissionType = 'ONLINE',
      maxMarks,
      attachments = [],
      status = 'PUBLISHED',
      notifyStudents = true,
      notifyParents = true,
    } = body

    if (!title?.trim()) {
      return apiError(400, 'Homework title is required.')
    }
    if (!classId) {
      return apiError(400, 'Please select a Class.')
    }
    if (!subjectId) {
      return apiError(400, 'Please select a Subject.')
    }
    if (!dueDate) {
      return apiError(400, 'Please specify a Due Date / Deadline.')
    }

    // Resolve academic year
    let academicYear = body.academicYear
    if (!academicYear) {
      const school = await db.school.findUnique({
        where: { id: user.schoolId },
        select: { academicYear: true },
      })
      academicYear = school?.academicYear || '2026-2027'
    }

    // Determine teacherId
    let teacherId = body.teacherId
    if (user.role === 'TEACHER') {
      let teacher = await db.teacher.findFirst({
        where: { schoolId: user.schoolId, userId: user.userId, deletedAt: null },
        select: { id: true },
      })
      if (!teacher) {
        const u = await db.user.findUnique({
          where: { id: user.userId },
          select: { employeeId: true },
        })
        if (u?.employeeId) {
          teacher = await db.teacher.findFirst({
            where: { schoolId: user.schoolId, employeeId: u.employeeId, deletedAt: null },
            select: { id: true },
          })
        }
      }
      if (!teacher) {
        // Fallback to first teacher in school if not linked
        const fallbackTeacher = await db.teacher.findFirst({
          where: { schoolId: user.schoolId, deletedAt: null },
          select: { id: true },
        })
        if (!fallbackTeacher) {
          return apiError(400, 'Teacher profile not found. Please contact administration.')
        }
        teacherId = fallbackTeacher.id
      } else {
        teacherId = teacher.id
      }
    } else if (!teacherId) {
      // Admin didn't pick teacher, pick class teacher or first teacher
      const sectionTeacher = sectionId
        ? await db.section.findUnique({ where: { id: sectionId }, select: { teacherId: true } })
        : null
      if (sectionTeacher?.teacherId) {
        teacherId = sectionTeacher.teacherId
      } else {
        const firstTeacher = await db.teacher.findFirst({
          where: { schoolId: user.schoolId, deletedAt: null },
          select: { id: true },
        })
        teacherId = firstTeacher?.id || null
      }
    }

    if (!teacherId) {
      return apiError(400, 'Please select or assign a Teacher for this homework.')
    }

    // Verify class and subject exist
    const [cls, sub] = await Promise.all([
      db.class.findFirst({
        where: { id: classId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true, name: true },
      }),
      db.subject.findFirst({
        where: { id: subjectId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true, name: true },
      }),
    ])

    if (!cls) return apiError(404, 'Selected Class not found.')
    if (!sub) return apiError(404, 'Selected Subject not found.')

    // Create Homework record
    const homework = await db.homework.create({
      data: {
        schoolId: user.schoolId,
        academicYear,
        classId,
        sectionId: sectionId && sectionId !== 'all' ? sectionId : null,
        subjectId,
        teacherId,
        title: title.trim(),
        description: description?.trim() || '',
        assignedDate: assignedDate ? new Date(assignedDate) : new Date(),
        dueDate: new Date(dueDate),
        submissionType,
        maxMarks: maxMarks !== undefined && maxMarks !== null && maxMarks !== '' ? Number(maxMarks) : null,
        attachments: Array.isArray(attachments) ? attachments : [],
        status,
        notifyStudents: Boolean(notifyStudents),
        notifyParents: Boolean(notifyParents),
      },
      include: {
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true } },
        teacher: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Find all active enrolled students in this class/section
    const studentWhere: any = {
      schoolId: user.schoolId,
      classId,
      isActive: true,
      deletedAt: null,
      admissionStatus: { notIn: ['withdrawn', 'alumni', 'transferred'] },
    }
    if (sectionId && sectionId !== 'all') {
      studentWhere.sectionId = sectionId
    }

    const students = await db.student.findMany({
      where: studentWhere,
      select: { id: true },
    })

    // Create initial submission records for students
    if (students.length > 0) {
      await db.homeworkSubmission.createMany({
        data: students.map((s) => ({
          schoolId: user.schoolId as string,
          homeworkId: homework.id,
          studentId: s.id,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      })
    }

    // Optional notification trigger
    if (status === 'PUBLISHED' && (notifyStudents || notifyParents) && user.userId) {
      try {
        const secLabel = homework.section?.name ? ` (Sec ${homework.section.name})` : ''
        await createNotification({
          schoolId: user.schoolId as string,
          userId: user.userId,
          type: 'homework',
          title: `New Homework: ${sub.name}`,
          message: `${cls.name}${secLabel}: "${title}" assigned by ${homework.teacher.firstName} ${homework.teacher.lastName}. Due on ${new Date(dueDate).toLocaleDateString()}.`,
          actionUrl: '/student/homework',
        })
      } catch (err) {
        console.error('Failed to trigger homework notification:', err)
      }
    }

    return NextResponse.json({
      success: true,
      homework,
      totalEnrolled: students.length,
    })
  } catch (error) {
    console.error('Error creating homework:', error)
    return internalError('creating homework assignment')
  }
}
