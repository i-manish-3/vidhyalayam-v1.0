import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser, hasPermission } from '@/lib/api-auth'
import { unauthorizedError, notFoundError, internalError, apiError } from '@/lib/api-errors'
import {
  computeSubjectSummaries,
  computeExamResult,
  parsePassingRule,
  type SubjectConfigDef,
  type MarksEntryDef,
  type GradeScaleDef,
} from '@/features/exams/lib/result-calculator'
import { canEditMarks, type EditChecks } from '@/features/exams/lib/can-edit-marks'

const MARKS_VIEW_PERMISSION_ALIASES = [
  'exam:marks',
  'exam:marks:enter',
  'exam:marks:submit',
  'exam:manage',
  'exam:configure',
  'exam:marks:lock',
  'exam:marks:unlock',
  'exam:result:view',
]

type AuthUser = NonNullable<ReturnType<typeof getAuthUser>>

async function hasAnyPermission(user: AuthUser, codes: string[]) {
  const checks = await Promise.all(codes.map((code) => hasPermission(user, code)))
  return checks.some(Boolean)
}

// GET /api/school/exams/[id]/marksheet-class?classId=&sectionId=&search=
// Returns a class-wise marksheet matrix: every student × every subject with
// obtained marks, subject status, and exam-level totals/percentage/grade.
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
    const search = searchParams.get('search')?.trim().toLowerCase()
    if (!classId) {
      return apiError(400, 'classId is required.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
      include: {
        examClasses: true,
        group: { include: { paradigm: true } },
      },
    })
    if (!exam) return notFoundError('Exam')

    // Enrolled scope: restrict students to examClasses scopes for this class.
    const scope = exam.examClasses.find((s) => s.classId === classId)
    const scopeSectionIds = scope?.sectionIds ? (JSON.parse(scope.sectionIds) as string[]) : null
    if (exam.examClasses.length > 0 && !scope) {
      return apiError(400, 'This class is not part of the exam.')
    }

    // Permission: any marks/results view alias, or a class teacher of this class.
    const hasViewAlias = await hasAnyPermission(user, MARKS_VIEW_PERMISSION_ALIASES)
    const isSchoolAdmin = user.role === 'SCHOOL_ADMIN'
    if (!hasViewAlias && !isSchoolAdmin) {
      const teacher = await db.teacher.findFirst({
        where: { userId: user.userId, schoolId: user.schoolId, deletedAt: null },
        select: { id: true },
      })
      if (!teacher) {
        return apiError(403, "You don't have permission to view this marksheet.")
      }
      const sectionWhere = sectionId
        ? { OR: [{ sectionId: sectionId as string }, { sectionId: null }] }
        : { sectionId: null }
      const classTeacher = await db.classTeacherAssignment.findFirst({
        where: {
          schoolId: user.schoolId,
          academicYear: exam.academicYear,
          classId: classId as string,
          ...sectionWhere,
          deletedAt: null,
          teacherId: teacher.id,
        },
        select: { id: true },
      })
      const editChecks: EditChecks = {
        isSchoolAdmin: false,
        isClassTeacher: Boolean(classTeacher),
        isSubjectTeacher: false,
      }
      if (!canEditMarks(editChecks)) {
        return apiError(403, "You don't have permission to view this marksheet.")
      }
    }

    // Students of the class (within exam scope sections).
    const students = await db.student.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
        classId,
        ...(sectionId ? { sectionId } : {}),
        ...(scopeSectionIds?.length
          ? { OR: [{ sectionId: { in: scopeSectionIds } }, { sectionId: null }] }
          : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { rollNumber: { contains: search } },
                { admissionNumber: { contains: search } },
              ],
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
        section: { select: { id: true, name: true } },
      },
      orderBy: [{ sectionId: 'asc' }, { rollNumber: 'asc' }],
    })

    const className = (
      await db.class.findFirst({
        where: { id: classId, schoolId: user.schoolId, deletedAt: null },
        select: { name: true },
      })
    )?.name

    const subjectConfigs = await db.examSubjectConfig.findMany({
      where: { examId, schoolId: user.schoolId, classId, deletedAt: null },
      include: { components: { orderBy: { sequence: 'asc' } } },
    })
    if (subjectConfigs.length === 0) {
      return apiError(400, 'No subject configs found for this class.')
    }

    const subjectIds = Array.from(new Set(subjectConfigs.map((c) => c.subjectId)))
    const subjects = await db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    })
    const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]))

    const studentIds = students.map((s) => s.id)
    const marks = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: { in: subjectConfigs.map((c) => c.id) },
        studentId: { in: studentIds },
        deletedAt: null,
      },
    })

    const mappings = await db.studentSubjectMapping.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear: exam.academicYear,
        studentId: { in: studentIds },
        deletedAt: null,
      },
    })
    const mappingsByStudent = new Map<string, (typeof mappings)[number][]>()
    for (const mapping of mappings) {
      const arr = mappingsByStudent.get(mapping.studentId) ?? []
      arr.push(mapping)
      mappingsByStudent.set(mapping.studentId, arr)
    }

    const examStartTime = exam.startDate ? new Date(exam.startDate).getTime() : null
    const examEndTime = exam.endDate ? new Date(exam.endDate).getTime() : examStartTime

    const mappingIsActive = (mapping: (typeof mappings)[number]) => {
      const from = mapping.effectiveFrom?.getTime() ?? null
      const to = mapping.effectiveTo?.getTime() ?? null
      if (examEndTime && from && from > examEndTime) return false
      if (examStartTime && to && to < examStartTime) return false
      return true
    }

    const configAppliesToStudent = (
      config: (typeof subjectConfigs)[number],
      student: (typeof students)[number],
    ) => {
      const activeMappings = (mappingsByStudent.get(student.id) ?? []).filter(mappingIsActive)
      if (
        activeMappings.some(
          (mapping) =>
            mapping.mappingType === 'replacing_compulsory' &&
            mapping.replacesSubjectId === config.subjectId,
        )
      ) {
        return false
      }
      if (config.isOptional || config.isAdditional) {
        return activeMappings.some(
          (mapping) =>
            mapping.subjectId === config.subjectId &&
            ['optional', 'additional', 'replacing_compulsory'].includes(mapping.mappingType),
        )
      }
      return true
    }

    const studentIdsByConfig = new Map<string, string[]>()
    for (const student of students) {
      const bestConfigBySubject = new Map<string, (typeof subjectConfigs)[number]>()
      for (const config of subjectConfigs) {
        if (config.sectionId && student.sectionId !== config.sectionId) continue
        const previous = bestConfigBySubject.get(config.subjectId)
        const isExactSection = config.sectionId !== null && config.sectionId === student.sectionId
        const previousIsExactSection =
          previous?.sectionId !== null && previous?.sectionId === student.sectionId
        if (!previous || (isExactSection && !previousIsExactSection)) {
          bestConfigBySubject.set(config.subjectId, config)
        }
      }
      for (const config of bestConfigBySubject.values()) {
        if (!configAppliesToStudent(config, student)) continue
        const ids = studentIdsByConfig.get(config.id) ?? []
        ids.push(student.id)
        studentIdsByConfig.set(config.id, ids)
      }
    }

    // Late admissions get not_applicable marks (mirrors compute-result).
    const marksByConfig = new Map<string, MarksEntryDef[]>()
    for (const m of marks) {
      const arr = marksByConfig.get(m.subjectConfigId) ?? []
      arr.push({
        studentId: m.studentId,
        subjectConfigId: m.subjectConfigId,
        componentId: m.componentId,
        numericValue: m.numericValue,
        gradeValue: m.gradeValue,
        status: m.status,
      })
      marksByConfig.set(m.subjectConfigId, arr)
    }
    for (const config of subjectConfigs) {
      const ids = studentIdsByConfig.get(config.id) ?? []
      if (ids.length === 0) continue
      const configMarks = marksByConfig.get(config.id) ?? []
      for (const student of students) {
        if (!ids.includes(student.id)) continue
        const admissionDate = student.admissionDate ?? null
        const isLateAdmission =
          examStartTime !== null && admissionDate !== null && admissionDate.getTime() > examStartTime
        if (!isLateAdmission) continue
        if (configMarks.some((mark) => mark.studentId === student.id)) continue
        if (config.components.length > 0) {
          for (const component of config.components) {
            configMarks.push({
              studentId: student.id,
              subjectConfigId: config.id,
              componentId: component.id,
              numericValue: null,
              gradeValue: null,
              status: 'not_applicable',
            })
          }
        } else {
          configMarks.push({
            studentId: student.id,
            subjectConfigId: config.id,
            componentId: null,
            numericValue: null,
            gradeValue: null,
            status: 'not_applicable',
          })
        }
      }
      marksByConfig.set(config.id, configMarks)
    }

    // Grade scale + passing rule (mirrors compute-result).
    const gradeScale =
      (await db.gradeScale.findFirst({
        where: {
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
          paradigmId: exam.group.paradigmId,
        },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      })) ??
      (await db.gradeScale.findFirst({
        where: {
          schoolId: user.schoolId,
          deletedAt: null,
          isActive: true,
          paradigmId: null,
          isDefault: true,
        },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      }))

    const scale: GradeScaleDef | null = gradeScale
      ? {
          scaleType: gradeScale.scaleType as 'percentage' | 'marks' | 'cgpa',
          bands: gradeScale.bands.map((b) => ({
            code: b.code,
            minValue: b.minValue,
            maxValue: b.maxValue,
            gradePoint: b.gradePoint,
            sequence: b.sequence,
          })),
        }
      : null

    const passingRule = parsePassingRule(exam.group.paradigm.passingRule)

    const configDefs: SubjectConfigDef[] = subjectConfigs.map((c) => ({
      id: c.id,
      examId: c.examId,
      subjectId: c.subjectId,
      subjectName: subjectNameMap.get(c.subjectId) ?? c.subjectId,
      classId: c.classId,
      sectionId: c.sectionId,
      totalMarks: c.totalMarks,
      passingPercentage: c.passingPercentage,
      gradeOnly: c.gradeOnly,
      isCompulsory: c.isCompulsory,
      components: c.components.map((comp) => ({
        id: comp.id,
        name: comp.name,
        maxMarks: comp.maxMarks,
        gradeOnly: comp.gradeOnly,
      })),
    }))

    const summariesByStudent = computeSubjectSummaries(
      configDefs,
      marksByConfig,
      passingRule,
      studentIdsByConfig,
    )

    // Column order: best config per subject for this class, sorted by name.
    const columnSubjects = subjectConfigs
      .filter((c) => !c.sectionId || !sectionId || c.sectionId === sectionId)
      .reduce<Map<string, (typeof subjectConfigs)[number]>>((acc, c) => {
        const prev = acc.get(c.subjectId)
        const exact = c.sectionId !== null && c.sectionId === sectionId
        const prevExact = prev?.sectionId !== null && prev?.sectionId === sectionId
        if (!prev || (exact && !prevExact)) acc.set(c.subjectId, c)
        return acc
      }, new Map())

    const columnList = [...columnSubjects.values()].sort((a, b) =>
      (subjectNameMap.get(a.subjectId) ?? a.subjectId).localeCompare(
        subjectNameMap.get(b.subjectId) ?? b.subjectId,
      ),
    )

    // Persisted ranks (when results were computed).
    const persistedResults = studentIds.length > 0
      ? await db.examResult.findMany({
          where: { examId, studentId: { in: studentIds }, schoolId: user.schoolId, deletedAt: null },
          select: { studentId: true, rankInClass: true, rankInSection: true, computedAt: true },
        })
      : []
    const persistedByStudent = new Map(
      persistedResults.map((r) => [r.studentId, r]),
    )

    const studentsPayload = students.map((student) => {
      const summaries = summariesByStudent.get(student.id) ?? []
      const examResult = scale
        ? computeExamResult(student.id, examId, exam.academicYear, summaries, scale, passingRule)
        : null
      const persisted = persistedByStudent.get(student.id)

      const marksBySubject = new Map<string, (typeof summaries)[number]>()
      for (const sm of summaries) {
        marksBySubject.set(sm.subjectId, sm)
      }

      return {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber,
        admissionNumber: student.admissionNumber,
        sectionId: student.sectionId,
        sectionName: student.section?.name ?? null,
        marks: Object.fromEntries(
          columnList.map((config) => {
            const sm = marksBySubject.get(config.subjectId)
            return [
              config.subjectId,
              sm
                ? {
                    obtainedMarks: sm.obtainedMarks,
                    totalMarks: sm.totalMarks,
                    percentage: sm.percentage,
                    status: sm.status,
                    grade: sm.grade,
                    gradeOnly: config.gradeOnly,
                  }
                : null,
            ]
          }),
        ),
        totalMarks: examResult?.totalMarks ?? null,
        obtainedMarks: examResult?.obtainedMarks ?? null,
        percentage: examResult?.percentage ?? null,
        grade: examResult?.grade ?? null,
        status: examResult?.status ?? null,
        rankInClass: persisted?.rankInClass ?? null,
        computedAt: persisted?.computedAt ? new Date(persisted.computedAt).toISOString() : null,
      }
    })

    return NextResponse.json({
      exam: {
        id: exam.id,
        name: exam.name,
        academicYear: exam.academicYear,
        status: exam.status,
      },
      classId,
      className: className ?? null,
      sectionId: sectionId ?? null,
      subjects: columnList.map((c) => ({
        subjectId: c.subjectId,
        subjectName: subjectNameMap.get(c.subjectId) ?? c.subjectId,
        totalMarks: c.totalMarks,
        passingPercentage: c.passingPercentage,
        gradeOnly: c.gradeOnly,
      })),
      students: studentsPayload,
      resultComputed: persistedResults.length > 0,
      gradeScaleConfigured: Boolean(gradeScale),
    })
  } catch (error) {
    console.error('Load class marksheet error:', error)
    return internalError('loading the class marksheet')
  }
}
