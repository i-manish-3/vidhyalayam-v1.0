import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasPermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import { validateMarksEntry, type MarksEntryInput } from '@/features/exams/lib/marks-validation'
import { canEditMarks, type EditChecks } from '@/features/exams/lib/can-edit-marks'

const MARKS_EDIT_PERMISSION_ALIASES = ['exam:marks', 'exam:marks:enter', 'exam:marks:submit']
const MARKS_VIEW_PERMISSION_ALIASES = [
  ...MARKS_EDIT_PERMISSION_ALIASES,
  'exam:manage',
  'exam:configure',
  'exam:marks:lock',
  'exam:marks:unlock',
]

type AuthUser = NonNullable<ReturnType<typeof getAuthUser>>

interface StudentRow {
  id: string
  firstName: string
  lastName: string
  rollNumber: string | null
  admissionNumber: string | null
  sectionId: string | null
  marks: Record<string, {
    id: string
    numericValue: number | null
    gradeValue: string | null
    status: string
    graceMarks: number
    remarks: string | null
    submittedAt: string | null
    lockedAt: string | null
    version: number
  }>
}

async function findSubjectConfig(args: {
  examId: string
  schoolId: string
  classId: string
  sectionId?: string | null
  subjectId: string
}) {
  const configs = await db.examSubjectConfig.findMany({
    where: {
      examId: args.examId,
      classId: args.classId,
      subjectId: args.subjectId,
      schoolId: args.schoolId,
      deletedAt: null,
      OR: args.sectionId ? [{ sectionId: args.sectionId }, { sectionId: null }] : [{ sectionId: null }],
    },
    include: { components: { orderBy: { sequence: 'asc' } } },
  })

  return configs.sort((a, b) => {
    if (a.sectionId === args.sectionId && b.sectionId !== args.sectionId) return -1
    if (b.sectionId === args.sectionId && a.sectionId !== args.sectionId) return 1
    return 0
  })[0] ?? null
}

async function hasAnyPermission(user: AuthUser, codes: string[]) {
  const checks = await Promise.all(codes.map((code) => hasPermission(user, code)))
  return checks.some(Boolean)
}

async function canAccessMarksScope(args: {
  user: AuthUser
  exam: { academicYear: string }
  classId: string
  sectionId: string | null
  subjectId: string
  permissionCodes: string[]
  allowManagementScope?: boolean
}) {
  if (!(await hasAnyPermission(args.user, args.permissionCodes))) return false

  const isSchoolAdmin = args.user.role === 'SCHOOL_ADMIN'
  if (isSchoolAdmin) return true
  if (args.allowManagementScope) {
    const hasManagementScope = await hasAnyPermission(args.user, [
      'exam:manage',
      'exam:configure',
      'exam:marks:lock',
      'exam:marks:unlock',
    ])
    if (hasManagementScope) return true
  }
  if (!args.user.schoolId) return false

  const teacher = await db.teacher.findFirst({
    where: { userId: args.user.userId, schoolId: args.user.schoolId, deletedAt: null },
    select: { id: true },
  })
  if (!teacher) return false

  const sectionWhere = args.sectionId
    ? { OR: [{ sectionId: args.sectionId }, { sectionId: null }] }
    : { sectionId: null }

  const [classTeacher, subjectTeacher] = await Promise.all([
    db.classTeacherAssignment.findFirst({
      where: {
        schoolId: args.user.schoolId,
        academicYear: args.exam.academicYear,
        classId: args.classId,
        ...sectionWhere,
        deletedAt: null,
        teacherId: teacher.id,
      },
      select: { id: true },
    }),
    db.teacherSubjectAssignment.findFirst({
      where: {
        schoolId: args.user.schoolId,
        academicYear: args.exam.academicYear,
        classId: args.classId,
        subjectId: args.subjectId,
        ...sectionWhere,
        deletedAt: null,
        teacherId: teacher.id,
      },
      select: { id: true },
    }),
  ])

  const editChecks: EditChecks = {
    isSchoolAdmin,
    isClassTeacher: Boolean(classTeacher),
    isSubjectTeacher: Boolean(subjectTeacher),
  }
  return canEditMarks(editChecks)
}

function buildConfigRef(config: NonNullable<Awaited<ReturnType<typeof findSubjectConfig>>>) {
  return {
    id: config.id,
    totalMarks: config.totalMarks,
    passingMarks: config.passingMarks,
    graceMarksMax: config.graceMarksMax,
    gradeOnly: config.gradeOnly,
    components: config.components.map((c) => ({
      id: c.id,
      name: c.name,
      maxMarks: c.maxMarks,
      passingMarks: c.passingMarks,
      gradeOnly: c.gradeOnly,
    })),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUser(request)
    if (!user || !user.schoolId) return unauthorizedError()
    const { id: examId } = await params

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get('classId')
    const sectionId = searchParams.get('sectionId') ?? undefined
    const subjectId = searchParams.get('subjectId')

    if (!classId || !subjectId) {
      return apiError(400, 'classId and subjectId are required.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')

    const config = await findSubjectConfig({
      examId,
      classId,
      sectionId,
      subjectId,
      schoolId: user.schoolId,
    })

    if (!config) {
      return NextResponse.json({
        grid: {
          subjectConfig: null,
          students: [] as StudentRow[],
          message: 'No subject config found for this class/section/subject. Add it on the Configure page first.',
        },
      })
    }

    const canAccess = await canAccessMarksScope({
      user,
      exam,
      classId,
      sectionId: sectionId ?? null,
      subjectId,
      permissionCodes: MARKS_VIEW_PERMISSION_ALIASES,
      allowManagementScope: true,
    })
    if (!canAccess) {
      return apiError(403, "You don't have permission to view marks for this class and subject.")
    }

    const students = await db.student.findMany({
      where: {
        schoolId: user.schoolId,
        classId,
        deletedAt: null,
        isActive: true,
        ...(sectionId ? { sectionId } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        admissionNumber: true,
        sectionId: true,
        admissionDate: true,
      },
      orderBy: [{ rollNumber: 'asc' }, { firstName: 'asc' }],
    })

    const examStart = exam.startDate ? new Date(exam.startDate).getTime() : null

    const existingMarks = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: config.id,
        studentId: { in: students.map((s) => s.id) },
        deletedAt: null,
      },
    })

    const marksByStudent = new Map<string, Map<string, typeof existingMarks[number]>>()
    for (const mark of existingMarks) {
      const studentMap = marksByStudent.get(mark.studentId) ?? new Map()
      studentMap.set(mark.componentId ?? '__config__', mark)
      marksByStudent.set(mark.studentId, studentMap)
    }

    const studentRows: StudentRow[] = students.map((student) => {
      const saved = marksByStudent.get(student.id)
      const marks: StudentRow['marks'] = {}
      const keys = new Set<string>()

      if (saved) {
        for (const key of saved.keys()) keys.add(key)
      }
      for (const component of config.components) keys.add(component.id)
      if (config.components.length === 0) keys.add('__config__')

      for (const key of keys) {
        const existing = saved?.get(key)
        marks[key] = existing
          ? {
              id: existing.id,
              numericValue: existing.numericValue,
              gradeValue: existing.gradeValue,
              status: existing.status,
              graceMarks: existing.graceMarks,
              remarks: existing.remarks,
              submittedAt: existing.submittedAt?.toISOString() ?? null,
              lockedAt: existing.lockedAt?.toISOString() ?? null,
              version: existing.version,
            }
          : {
              id: '',
              numericValue: null,
              gradeValue: null,
              status:
                examStart && student.admissionDate && new Date(student.admissionDate).getTime() > examStart
                  ? 'not_applicable'
                  : 'entered',
              graceMarks: 0,
              remarks: null,
              submittedAt: null,
              lockedAt: null,
              version: 0,
            }
      }

      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber,
        admissionNumber: student.admissionNumber,
        sectionId: student.sectionId,
        marks,
      }
    })

    return NextResponse.json({
      grid: {
        subjectConfig: {
          id: config.id,
          totalMarks: config.totalMarks,
          passingMarks: config.passingMarks,
          graceMarksMax: config.graceMarksMax,
          gradeOnly: config.gradeOnly,
          components: config.components.map((c) => ({
            id: c.id,
            name: c.name,
            shortCode: c.shortCode,
            maxMarks: c.maxMarks,
            passingMarks: c.passingMarks,
            gradeOnly: c.gradeOnly,
            sequence: c.sequence,
          })),
        },
        students: studentRows,
      },
    })
  } catch (error) {
    console.error('Load marks grid error:', error)
    return internalError('loading the marks grid')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUser(request)
    if (!user || !user.schoolId) return unauthorizedError()
    const { id: examId } = await params

    const body = await request.json()
    const { classId, sectionId, subjectId, entries, submit } = body as {
      classId?: string
      sectionId?: string | null
      subjectId?: string
      entries?: MarksEntryInput[]
      submit?: boolean
    }

    if (!classId || !subjectId) return apiError(400, 'classId and subjectId are required.')
    if (!Array.isArray(entries) || entries.length === 0) {
      return apiError(400, 'entries must be a non-empty array.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')
    if (exam.lockedAt) return apiError(423, 'This exam is locked. Unlock the exam before changing marks.')
    if (exam.status === 'result_published' || exam.visibleToParent) {
      return apiError(409, 'Results are published. Unpublish before changing marks.')
    }

    const config = await findSubjectConfig({
      examId,
      classId,
      sectionId,
      subjectId,
      schoolId: user.schoolId,
    })
    if (!config) {
      return apiError(404, 'Subject config not found. Add it on the Configure page first.')
    }

    const canAccess = await canAccessMarksScope({
      user,
      exam,
      classId,
      sectionId: sectionId ?? null,
      subjectId,
      permissionCodes: MARKS_EDIT_PERMISSION_ALIASES,
    })
    if (!canAccess) {
      return apiError(403, "You don't have permission to edit marks for this class and subject.")
    }

    const configRef = buildConfigRef(config)
    const componentById = new Map(config.components.map((component) => [component.id, component]))
    const errors: { index: number; message: string }[] = []

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry.studentId) {
        errors.push({ index: i, message: 'Each entry needs a studentId.' })
        continue
      }

      const hasComponent = config.components.length > 0
      if (hasComponent && !entry.componentId) {
        errors.push({ index: i, message: 'componentId is required for component-based subjects.' })
        continue
      }
      if (hasComponent && entry.componentId && !componentById.has(entry.componentId)) {
        errors.push({ index: i, message: `Unknown component "${entry.componentId}".` })
        continue
      }
      if (!hasComponent && entry.componentId) {
        errors.push({ index: i, message: `Unknown component "${entry.componentId}".` })
        continue
      }

      const err = validateMarksEntry(entry, configRef)
      if (err) {
        errors.push({ index: i, message: err.message })
        continue
      }

      if (submit) {
        const component = entry.componentId ? componentById.get(entry.componentId) : null
        const gradeOnly = component?.gradeOnly ?? config.gradeOnly
        const status = entry.status ?? 'entered'
        if (status === 'entered' && gradeOnly && !entry.gradeValue?.trim()) {
          errors.push({ index: i, message: 'Grade is required before submitting marks.' })
        }
        if (status === 'entered' && !gradeOnly && (entry.numericValue === null || entry.numericValue === undefined)) {
          errors.push({ index: i, message: 'Marks are required before submitting.' })
        }
      }
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { message: `Validation failed: ${errors[0].message}`, errors },
        { status: 422 },
      )
    }

    const schoolId = user.schoolId
    const studentIds = Array.from(new Set(entries.map((entry) => entry.studentId)))
    const validStudents = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId,
        classId,
        ...(sectionId ? { sectionId } : {}),
        deletedAt: null,
      },
      select: { id: true },
    })
    const validStudentSet = new Set(validStudents.map((student) => student.id))
    const invalidIds = studentIds.filter((id) => !validStudentSet.has(id))
    if (invalidIds.length > 0) {
      return apiError(400, 'One or more students do not belong to this school/class/section.')
    }

    const existingRows = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: config.id,
        studentId: { in: studentIds },
        deletedAt: null,
      },
    })
    const existingByKey = new Map<string, typeof existingRows[number]>()
    for (const row of existingRows) {
      existingByKey.set(`${row.studentId}::${row.componentId ?? '__config__'}`, row)
    }

    const auditCtx = extractExamAuditContext(request, user.userId)
    const result = await db.$transaction(async (tx) => {
      const upserted: typeof existingRows = []
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []

      for (const entry of entries) {
        const componentId = entry.componentId ?? null
        const key = `${entry.studentId}::${componentId ?? '__config__'}`
        const existing = existingByKey.get(key)

        if (existing?.lockedAt) {
          throw { status: 423, message: `Marks for student ${entry.studentId} are locked and cannot be edited.` }
        }

        const status = entry.status ?? 'entered'
        const row = existing
          ? await tx.marksEntry.update({
              where: { id: existing.id },
              data: {
                numericValue: entry.numericValue,
                gradeValue: entry.gradeValue ?? null,
                status,
                graceMarks: entry.graceMarks ?? 0,
                remarks: entry.remarks ?? null,
                version: { increment: 1 },
                enteredBy: user.userId,
                enteredAt: new Date(),
                submittedAt: submit ? new Date() : existing.submittedAt,
              },
            })
          : await tx.marksEntry.create({
              data: {
                schoolId,
                examId,
                subjectConfigId: config.id,
                componentId,
                studentId: entry.studentId,
                numericValue: entry.numericValue,
                gradeValue: entry.gradeValue ?? null,
                status,
                graceMarks: entry.graceMarks ?? 0,
                remarks: entry.remarks ?? null,
                enteredBy: user.userId,
                enteredAt: new Date(),
                submittedAt: submit ? new Date() : null,
              },
            })

        upserted.push(row)
        auditEntries.push({
          entityType: 'MarksEntry',
          entityId: row.id,
          action: submit ? 'marks_submitted' : 'marks_entered',
          oldValue: existing,
          newValue: row,
          examId,
          studentId: row.studentId,
        })
      }

      if (auditEntries.length > 0) {
        await logExamChangesBatch(tx, schoolId, auditEntries, { ...auditCtx, examId })
      }

      return upserted
    })

    return NextResponse.json({
      saved: result.length,
      submitted: submit ? result.filter((row) => row.submittedAt).length : 0,
      message: submit ? `Saved and submitted ${result.length} entries.` : `${result.length} entries saved.`,
    })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const e = error as { status: number; message: string }
      return apiError(e.status, e.message)
    }
    console.error('Save marks error:', error)
    return internalError('saving the marks')
  }
}
