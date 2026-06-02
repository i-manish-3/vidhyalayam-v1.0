import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import { validateMarksEntry, type MarksEntryInput } from '@/features/exams/lib/marks-validation'
import { canEditMarks, type EditScope, type EditChecks } from '@/features/exams/lib/can-edit-marks'

// ---------- GET: load the marks grid for one (exam, class, section, subject) ----------

interface StudentRow {
  id: string
  firstName: string
  lastName: string
  rollNumber: string | null
  admissionNumber: string | null
  sectionId: string | null
  // Marks already saved for this student, keyed by componentId or '__config__'.
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

    // Find the subject config for this exam/class/section/subject
    const config = await db.examSubjectConfig.findFirst({
      where: {
        examId,
        classId,
        subjectId,
        schoolId: user.schoolId,
        deletedAt: null,
        // Match section exactly — if sectionId param is null/undefined, we match
        // configs where sectionId is null (applies to all sections).
        sectionId: sectionId ?? null,
      },
      include: {
        components: { orderBy: { sequence: 'asc' } },
      },
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

    // Resolve students in scope
    const students = await db.student.findMany({
      where: {
        schoolId: user.schoolId,
        classId,
        deletedAt: null,
        isActive: true,
        ...(sectionId ? { sectionId } : {}),
        ...(exam.academicYear
          ? {
              // Include students whose admission date predates the exam, so
              // mid-session joiners show NA automatically.
              // Falls back gracefully for exams without a startDate.
            }
          : {}),
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

    // Mark students who joined after the exam start as not_applicable
    const examStart = exam.startDate ? new Date(exam.startDate).getTime() : null

    // Load existing marks for all these students under this exam + subjectConfig
    const existingMarks = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: config.id,
        studentId: { in: students.map((s) => s.id) },
        deletedAt: null,
      },
    })

    const marksByStudent = new Map<string, Map<string, typeof existingMarks[number]>>()
    for (const m of existingMarks) {
      const studentMap = marksByStudent.get(m.studentId) ?? new Map()
      studentMap.set(m.componentId ?? '__config__', m)
      marksByStudent.set(m.studentId, studentMap)
    }

    const studentRows: StudentRow[] = students.map((s) => {
      const saved = marksByStudent.get(s.id)
      const marks: StudentRow['marks'] = {}

      // Add entries for each component
      const allKeys = new Set<string>()
      if (saved) {
        for (const key of saved.keys()) allKeys.add(key)
      }
      for (const comp of config.components) {
        allKeys.add(comp.id)
      }
      if (config.components.length === 0) {
        allKeys.add('__config__')
      }

      for (const key of allKeys) {
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
                examStart && s.admissionDate && new Date(s.admissionDate).getTime() > examStart
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
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        rollNumber: s.rollNumber,
        admissionNumber: s.admissionNumber,
        sectionId: s.sectionId,
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

// ---------- PUT: bulk upsert marks ----------

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

    if (!classId || !subjectId) {
      return apiError(400, 'classId and subjectId are required.')
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return apiError(400, 'entries must be a non-empty array.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
    })
    if (!exam) return notFoundError('Exam')

    const config = await db.examSubjectConfig.findFirst({
      where: {
        examId,
        classId,
        subjectId,
        schoolId: user.schoolId,
        deletedAt: null,
        sectionId: sectionId ?? null,
      },
      include: {
        components: { orderBy: { sequence: 'asc' } },
      },
    })
    if (!config) {
      return apiError(404, 'Subject config not found. Add it on the Configure page first.')
    }

    // Permission check — inline DB lookups for ClassTeacherAssignment + TeacherSubjectAssignment
    const scope: EditScope = {
      schoolId: user.schoolId,
      academicYear: exam.academicYear,
      classId,
      sectionId: sectionId ?? null,
      subjectId,
    }
    const isSchoolAdmin = user.role === 'SCHOOL_ADMIN'

    // Resolve teacherId from userId. TeacherSubjectAssignment doesn't carry a
    // Teacher relation, so we look up teacherId first and query both tables by id.
    const teacher = isSchoolAdmin
      ? null
      : await db.teacher.findFirst({
          where: { userId: user.userId, schoolId: scope.schoolId, deletedAt: null },
          select: { id: true },
        })

    const [classTeacher, subjectTeacher] = teacher
      ? await Promise.all([
          db.classTeacherAssignment.findFirst({
            where: {
              schoolId: scope.schoolId,
              academicYear: scope.academicYear,
              sectionId: scope.sectionId,
              deletedAt: null,
              teacherId: teacher.id,
            },
            select: { id: true },
          }),
          db.teacherSubjectAssignment.findFirst({
            where: {
              schoolId: scope.schoolId,
              academicYear: scope.academicYear,
              classId: scope.classId,
              sectionId: scope.sectionId,
              subjectId: scope.subjectId,
              deletedAt: null,
              teacherId: teacher.id,
            },
            select: { id: true },
          }),
        ])
      : [null, null]

    const editChecks: EditChecks = {
      isSchoolAdmin,
      isClassTeacher: Boolean(classTeacher),
      isSubjectTeacher: Boolean(subjectTeacher),
    }
    if (!canEditMarks(editChecks)) {
      return apiError(403, "You don't have permission to edit marks for this class and subject.")
    }

    const schoolId = user.schoolId
    const auditCtx = extractExamAuditContext(request, user.userId)

    // Build a component lookup map (typed for the flat subset we need).
    type FlatComp = { id: string; name: string; shortCode: string | null; maxMarks: number; passingMarks: number; gradeOnly: boolean; sequence: number }
    const compLookup: Map<string, FlatComp> = new Map()
    if (config.components.length > 0) {
      for (const c of config.components) {
        compLookup.set(c.id, {
          id: c.id,
          name: c.name,
          shortCode: c.shortCode,
          maxMarks: c.maxMarks,
          passingMarks: c.passingMarks,
          gradeOnly: c.gradeOnly,
          sequence: c.sequence,
        })
      }
    } else {
      // Config-level entry — a single synthetic channel.
      compLookup.set('__config__', {
        id: '__config__',
        name: config.gradeOnly ? 'Grade' : 'Total',
        shortCode: null,
        maxMarks: config.totalMarks,
        passingMarks: config.passingMarks,
        gradeOnly: config.gradeOnly,
        sequence: 0,
      })
    }

    // Validate all entries
    const errors: { index: number; message: string }[] = []
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (!entry.studentId) {
        errors.push({ index: i, message: 'Each entry needs a studentId.' })
        continue
      }
      const comp = compLookup.get(entry.componentId ?? '__config__')
      const cfgRef = {
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
      if (!comp) {
        errors.push({ index: i, message: `Unknown component "${entry.componentId}".` })
        continue
      }
      const err = validateMarksEntry(entry, cfgRef)
      if (err) {
        errors.push({ index: i, message: err.message })
      }
    }
    if (errors.length > 0) {
      return NextResponse.json(
        { message: `Validation failed: ${errors[0].message}`, errors },
        { status: 422 },
      )
    }

    // Verify all studentIds belong to this school + class.
    const studentIds = Array.from(new Set(entries.map((e) => e.studentId)))
    const validStudents = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId,
        classId,
        deletedAt: null,
      },
      select: { id: true },
    })
    const validStudentSet = new Set(validStudents.map((s) => s.id))
    const invalidIds = studentIds.filter((id) => !validStudentSet.has(id))
    if (invalidIds.length > 0) {
      return apiError(400, 'One or more students do not belong to this school/class.')
    }

    // Fetch existing rows we're about to update so we can diff for audit.
    const existingById = new Map<string, typeof existingRows[number]>()
    const existingRows = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: config.id,
        studentId: { in: studentIds },
        deletedAt: null,
      },
    })
    for (const row of existingRows) {
      const key = `${row.studentId}::${row.componentId ?? '__config__'}`
      existingById.set(key, row)
    }

    const result = await db.$transaction(async (tx) => {
      const upserted: typeof existingRows = []
      const auditEntries: Parameters<typeof logExamChangesBatch>[2][number][] = []

      for (const entry of entries) {
        const componentId = entry.componentId ?? null
        const key = `${entry.studentId}::${componentId ?? '__config__'}`
        const existing = existingById.get(key)

        // Reject writes on locked rows (admin freeze).
        if (existing?.lockedAt) {
          throw { status: 423, message: `Marks for student ${entry.studentId} are locked and cannot be edited.` }
        }

        const status = entry.status ?? 'entered'
        const now = submit ? new Date() : undefined

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
                enteredAt: now ?? new Date(),
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
          action: existing
            ? submit && !existing.submittedAt
              ? 'marks_submitted'
              : 'marks_entered'
            : 'marks_entered',
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
      submitted: submit ? result.filter((r) => r.submittedAt).length : 0,
      message: submit
        ? `Saved and submitted ${result.length} entries.`
        : `${result.length} entries saved.`,
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
