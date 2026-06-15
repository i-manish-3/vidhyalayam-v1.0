import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { logExamChange, extractExamAuditContext } from '@/lib/audit/exam-audit'

const VALID_MAPPING_TYPES = ['optional', 'additional', 'replacing_compulsory']

// GET /api/school/exams/student-subject-mappings?studentId=...&classId=...
export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') ?? undefined
    const classId = searchParams.get('classId') ?? undefined
    const academicYear = searchParams.get('academicYear') ?? undefined
    const subjectId = searchParams.get('subjectId') ?? undefined

    // class scoping requires a join through Student.classId — we resolve via Student where if classId is given.
    const classScopedStudentIds = classId
      ? (
          await db.student.findMany({
            where: { classId, schoolId: user.schoolId, deletedAt: null },
            select: { id: true },
          })
        ).map((student) => student.id)
      : null

    if (classScopedStudentIds && classScopedStudentIds.length === 0) {
      return NextResponse.json({ mappings: [] })
    }
    if (classScopedStudentIds && studentId && !classScopedStudentIds.includes(studentId)) {
      return NextResponse.json({ mappings: [] })
    }

    const mappings = await db.studentSubjectMapping.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        ...(studentId ? { studentId } : classScopedStudentIds ? { studentId: { in: classScopedStudentIds } } : {}),
        ...(academicYear ? { academicYear } : {}),
        ...(subjectId ? { subjectId } : {}),
      },
      orderBy: [{ academicYear: 'desc' }, { studentId: 'asc' }],
    })

    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('List student subject mappings error:', error)
    return internalError('loading student subject mappings')
  }
}

// POST /api/school/exams/student-subject-mappings
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'exam:configure')
    if (!user || !user.schoolId) {
      return apiError(403, "You don't have permission to manage student subject mappings.")
    }

    const body = await request.json()
    const {
      studentId,
      academicYear,
      subjectId,
      mappingType,
      replacesSubjectId,
      effectiveFrom,
      effectiveTo,
    } = body

    if (!studentId || typeof studentId !== 'string') return apiError(400, 'studentId is required.')
    if (!academicYear || typeof academicYear !== 'string') return apiError(400, 'academicYear is required.')
    if (!subjectId || typeof subjectId !== 'string') return apiError(400, 'subjectId is required.')
    if (!mappingType || !VALID_MAPPING_TYPES.includes(mappingType)) {
      return apiError(400, `mappingType must be one of: ${VALID_MAPPING_TYPES.join(', ')}.`)
    }
    if (mappingType === 'replacing_compulsory' && !replacesSubjectId) {
      return apiError(400, 'replacesSubjectId is required when mappingType is replacing_compulsory.')
    }

    // Tenant check: student belongs to this school.
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!student) return apiError(404, "We couldn't find that student.")

    const subject = await db.subject.findFirst({
      where: { id: subjectId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    })
    if (!subject) return apiError(404, "We couldn't find that subject.")

    const duplicate = await db.studentSubjectMapping.findFirst({
      where: { studentId, academicYear, subjectId, deletedAt: null },
    })
    if (duplicate) {
      return apiError(409, 'This subject is already mapped for the student in this academic year.')
    }

    let effectiveFromDate: Date | null = null
    if (effectiveFrom) {
      const d = new Date(String(effectiveFrom))
      if (Number.isNaN(d.getTime())) return apiError(400, 'effectiveFrom is not a valid date.')
      effectiveFromDate = d
    }
    let effectiveToDate: Date | null = null
    if (effectiveTo) {
      const d = new Date(String(effectiveTo))
      if (Number.isNaN(d.getTime())) return apiError(400, 'effectiveTo is not a valid date.')
      effectiveToDate = d
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    const mapping = await db.$transaction(async (tx) => {
      const created = await tx.studentSubjectMapping.create({
        data: {
          schoolId,
          studentId,
          academicYear,
          subjectId,
          mappingType,
          replacesSubjectId: replacesSubjectId ? String(replacesSubjectId) : null,
          effectiveFrom: effectiveFromDate,
          effectiveTo: effectiveToDate,
        },
      })
      await logExamChange(
        tx,
        schoolId,
        'StudentSubjectMapping',
        created.id,
        'created',
        null,
        created,
        { ...auditCtx, studentId },
      )
      return created
    })

    return NextResponse.json({ mapping }, { status: 201 })
  } catch (error) {
    console.error('Create student subject mapping error:', error)
    return internalError('creating the subject mapping')
  }
}
