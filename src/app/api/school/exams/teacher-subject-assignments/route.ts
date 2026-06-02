import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

// GET /api/school/exams/teacher-subject-assignments?teacherId=...
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const teacherId = searchParams.get('teacherId') ?? undefined
    const academicYear = searchParams.get('academicYear') ?? undefined
    const classId = searchParams.get('classId') ?? undefined
    const sectionId = searchParams.get('sectionId') ?? undefined
    const subjectId = searchParams.get('subjectId') ?? undefined

    const assignments = await db.teacherSubjectAssignment.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(teacherId ? { teacherId } : {}),
        ...(academicYear ? { academicYear } : {}),
        ...(classId ? { classId } : {}),
        ...(sectionId === 'null' ? { sectionId: null } : sectionId ? { sectionId } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      orderBy: [{ academicYear: 'desc' }, { teacherId: 'asc' }],
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('List teacher subject assignments error:', error)
    return internalError('loading teacher subject assignments')
  }
}

// POST /api/school/exams/teacher-subject-assignments
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to assign teachers to subjects.")
    }

    const body = await request.json()
    const { teacherId, academicYear, classId, sectionId, subjectId } = body

    if (!teacherId || typeof teacherId !== 'string') return apiError(400, 'teacherId is required.')
    if (!academicYear || typeof academicYear !== 'string') return apiError(400, 'academicYear is required.')
    if (!classId || typeof classId !== 'string') return apiError(400, 'classId is required.')
    if (!subjectId || typeof subjectId !== 'string') return apiError(400, 'subjectId is required.')

    const resolvedSectionId = sectionId && typeof sectionId === 'string' && sectionId !== ''
      ? sectionId
      : null

    // Validate teacher/class/subject belong to this school.
    const [teacher, klass, subject] = await Promise.all([
      db.teacher.findFirst({
        where: { id: teacherId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      }),
      db.class.findFirst({
        where: { id: classId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      }),
      db.subject.findFirst({
        where: { id: subjectId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      }),
    ])
    if (!teacher) return apiError(404, "We couldn't find that teacher.")
    if (!klass) return apiError(404, "We couldn't find that class.")
    if (!subject) return apiError(404, "We couldn't find that subject.")
    if (resolvedSectionId) {
      const section = await db.section.findFirst({
        where: { id: resolvedSectionId, schoolId: user.schoolId, classId, deletedAt: null },
        select: { id: true },
      })
      if (!section) return apiError(404, "We couldn't find that section.")
    }

    const duplicate = await db.teacherSubjectAssignment.findFirst({
      where: {
        schoolId: user.schoolId,
        academicYear,
        teacherId,
        classId,
        sectionId: resolvedSectionId,
        subjectId,
        deletedAt: null,
      },
    })
    if (duplicate) {
      return apiError(409, 'This teacher is already assigned to that subject and section.')
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const assignment = await db.$transaction(async (tx) => {
      const created = await tx.teacherSubjectAssignment.create({
        data: {
          schoolId,
          academicYear,
          teacherId,
          classId,
          sectionId: resolvedSectionId,
          subjectId,
        },
      })
      await logExamChange(
        tx,
        schoolId,
        'TeacherSubjectAssignment',
        created.id,
        'created',
        null,
        created,
        auditCtx,
      )
      return created
    })

    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    console.error('Create teacher subject assignment error:', error)
    return internalError('creating the teacher subject assignment')
  }
}
