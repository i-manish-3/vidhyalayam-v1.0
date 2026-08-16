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

// GET /api/school/exams/[id]/marksheet?studentId=
// Returns one student's marksheet: per-subject component breakdown + live totals,
// plus the persisted result (rank) when the exam result has been computed.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = getAuthUser(request)
    if (!user || !user.schoolId) return unauthorizedError()
    const { id: examId } = await params

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId')
    if (!studentId) {
      return apiError(400, 'studentId is required.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId: user.schoolId, deletedAt: null },
      include: {
        examClasses: true,
        group: { include: { paradigm: true } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        admissionNumber: true,
        classId: true,
        sectionId: true,
        admissionDate: true,
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
      },
    })
    if (!student) return notFoundError('Student')

    // Enrolled scope: examClasses restrict which classes/sections take this exam.
    const scopes = exam.examClasses.map((scope) => ({
      classId: scope.classId,
      sectionIds: scope.sectionIds ? (JSON.parse(scope.sectionIds) as string[]) : null,
    }))
    if (scopes.length > 0) {
      const inScope = scopes.some(
        (scope) =>
          scope.classId === student.classId &&
          (!scope.sectionIds?.length || scope.sectionIds.includes(student.sectionId ?? '')),
      )
      if (!inScope) {
        return apiError(400, 'This student is not enrolled in the exam.')
      }
    }

    // Permission: any marks/results view alias, or a class teacher of this student.
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
      const classTeacher = await db.classTeacherAssignment.findFirst({
        where: {
          schoolId: user.schoolId,
          academicYear: exam.academicYear,
classId: student.classId as string,
          ...(student.sectionId
            ? { OR: [{ sectionId: student.sectionId as string }, { sectionId: null }] }
            : { sectionId: null }),
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

    // Subject configs + components for the exam.
    const subjectConfigs = await db.examSubjectConfig.findMany({
      where: { examId, schoolId: user.schoolId, deletedAt: null },
      include: { components: { orderBy: { sequence: 'asc' } } },
    })

    const subjectIds = Array.from(new Set(subjectConfigs.map((c) => c.subjectId)))
    const subjects = await db.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, name: true },
    })
    const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]))

    const marks = await db.marksEntry.findMany({
      where: {
        examId,
        subjectConfigId: { in: subjectConfigs.map((c) => c.id) },
        studentId,
        deletedAt: null,
      },
    })

    const mappings = await db.studentSubjectMapping.findMany({
      where: {
        schoolId: user.schoolId,
        academicYear: exam.academicYear,
        studentId,
        deletedAt: null,
      },
    })

    const examStartTime = exam.startDate ? new Date(exam.startDate).getTime() : null
    const examEndTime = exam.endDate ? new Date(exam.endDate).getTime() : examStartTime

    const mappingIsActive = (mapping: (typeof mappings)[number]) => {
      const from = mapping.effectiveFrom?.getTime() ?? null
      const to = mapping.effectiveTo?.getTime() ?? null
      if (examEndTime && from && from > examEndTime) return false
      if (examStartTime && to && to < examStartTime) return false
      return true
    }

    const activeMappings = mappings.filter(mappingIsActive)

    const configAppliesToStudent = (config: (typeof subjectConfigs)[number]) => {
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

    // Best config per subject for this student's class/section.
    const bestConfigBySubject = new Map<string, (typeof subjectConfigs)[number]>()
    for (const config of subjectConfigs) {
      if (student.classId !== config.classId) continue
      if (config.sectionId && student.sectionId !== config.sectionId) continue
      const previous = bestConfigBySubject.get(config.subjectId)
      const isExactSection = config.sectionId !== null && config.sectionId === student.sectionId
      const previousIsExactSection =
        previous?.sectionId !== null && previous?.sectionId === student.sectionId
      if (!previous || (isExactSection && !previousIsExactSection)) {
        bestConfigBySubject.set(config.subjectId, config)
      }
    }

    const applicableConfigs = [...bestConfigBySubject.values()].filter(configAppliesToStudent)
    const studentIdsByConfig = new Map<string, string[]>()
    for (const config of applicableConfigs) {
      studentIdsByConfig.set(config.id, [studentId])
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
        graceMarks: m.graceMarks,
      })
      marksByConfig.set(m.subjectConfigId, arr)
    }
    const rawMarksByConfig = new Map<string, typeof marks>()
    for (const m of marks) {
      const arr = rawMarksByConfig.get(m.subjectConfigId) ?? []
      arr.push(m)
      rawMarksByConfig.set(m.subjectConfigId, arr)
    }
    const isLateAdmission =
      examStartTime !== null &&
      student.admissionDate !== null &&
      student.admissionDate.getTime() > examStartTime
    if (isLateAdmission) {
      for (const config of applicableConfigs) {
        const configMarks = marksByConfig.get(config.id) ?? []
        if (configMarks.some((mark) => mark.studentId === studentId)) continue
        if (config.components.length > 0) {
          for (const component of config.components) {
            configMarks.push({
              studentId,
              subjectConfigId: config.id,
              componentId: component.id,
              numericValue: null,
              gradeValue: null,
              status: 'not_applicable',
              graceMarks: 0,
            })
          }
        } else {
          configMarks.push({
            studentId,
            subjectConfigId: config.id,
            componentId: null,
            numericValue: null,
            gradeValue: null,
            status: 'not_applicable',
            graceMarks: 0,
          })
        }
        marksByConfig.set(config.id, configMarks)
      }
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

    const configDefs: SubjectConfigDef[] = applicableConfigs.map((c) => ({
      id: c.id,
      examId: c.examId,
      subjectId: c.subjectId,
      subjectName: subjectNameMap.get(c.subjectId) ?? c.subjectId,
      classId: c.classId,
      sectionId: c.sectionId,
      totalMarks: c.totalMarks,
      passingMarks: c.passingMarks,
      graceMarksMax: c.graceMarksMax,
      gradeOnly: c.gradeOnly,
      isCompulsory: c.isCompulsory,
      components: c.components.map((comp) => ({
        id: comp.id,
        name: comp.name,
        maxMarks: comp.maxMarks,
        passingMarks: comp.passingMarks,
        gradeOnly: comp.gradeOnly,
      })),
    }))

    const summariesByStudent = computeSubjectSummaries(
      configDefs,
      marksByConfig,
      passingRule,
      studentIdsByConfig,
    )
    const summaries = summariesByStudent.get(studentId) ?? []

    const liveResult = scale
      ? computeExamResult(studentId, examId, exam.academicYear, summaries, scale, passingRule)
      : null

    const persistedResult = await db.examResult.findFirst({
      where: { examId, studentId, schoolId: user.schoolId, deletedAt: null },
      select: {
        rankInClass: true,
        rankInSection: true,
        status: true,
        computedAt: true,
      },
    })

    const subjectsPayload = applicableConfigs
      .map((c) => {
        const summary = summaries.find((sm) => sm.subjectId === c.subjectId)
        return {
          configId: c.id,
          subjectId: c.subjectId,
          subjectName: subjectNameMap.get(c.subjectId) ?? c.subjectId,
          totalMarks: c.totalMarks,
          passingMarks: c.passingMarks,
          gradeOnly: c.gradeOnly,
          isCompulsory: c.isCompulsory,
          isOptional: c.isOptional,
          isAdditional: c.isAdditional,
          components: c.components.map((comp) => {
            const entry = rawMarksByConfig.get(c.id)?.find((m) => m.componentId === comp.id)
            return {
              id: comp.id,
              name: comp.name,
              shortCode: comp.shortCode,
              maxMarks: comp.maxMarks,
              passingMarks: comp.passingMarks,
              gradeOnly: comp.gradeOnly,
              sequence: comp.sequence,
              numericValue: entry?.numericValue ?? null,
              gradeValue: entry?.gradeValue ?? null,
              status: entry?.status ?? null,
              graceMarks: entry?.graceMarks ?? 0,
              submittedAt: entry?.submittedAt ? new Date(entry.submittedAt).toISOString() : null,
              lockedAt: entry?.lockedAt ? new Date(entry.lockedAt).toISOString() : null,
            }
          }),
          singleEntry: c.components.length === 0
            ? (() => {
                const entry = rawMarksByConfig.get(c.id)?.find((m) => m.componentId === null) ?? null
                return entry
                  ? {
                      numericValue: entry.numericValue,
                      gradeValue: entry.gradeValue,
                      status: entry.status,
                      graceMarks: entry.graceMarks,
                      submittedAt: entry.submittedAt ? new Date(entry.submittedAt).toISOString() : null,
                      lockedAt: entry.lockedAt ? new Date(entry.lockedAt).toISOString() : null,
                    }
                  : null
              })()
            : null,
          summary: summary
            ? {
                obtainedMarks: summary.obtainedMarks,
                totalMarks: summary.totalMarks,
                percentage: summary.percentage,
                grade: summary.grade,
                gradePoint: summary.gradePoint,
                status: summary.status,
                graceApplied: summary.graceApplied,
              }
            : null,
        }
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName))

    return NextResponse.json({
      exam: {
        id: exam.id,
        name: exam.name,
        academicYear: exam.academicYear,
        status: exam.status,
      },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        rollNumber: student.rollNumber,
        admissionNumber: student.admissionNumber,
        classId: student.classId,
        className: student.class?.name ?? null,
        sectionId: student.sectionId,
        sectionName: student.section?.name ?? null,
      },
      subjects: subjectsPayload,
      result: {
        totalMarks: liveResult?.totalMarks ?? null,
        obtainedMarks: liveResult?.obtainedMarks ?? null,
        percentage: liveResult?.percentage ?? null,
        grade: liveResult?.grade ?? null,
        gradePoint: liveResult?.gradePoint ?? null,
        status: liveResult?.status ?? null,
        rankInClass: persistedResult?.rankInClass ?? null,
        rankInSection: persistedResult?.rankInSection ?? null,
        computedAt: persistedResult?.computedAt ? new Date(persistedResult.computedAt).toISOString() : null,
        persisted: Boolean(persistedResult),
      },
      gradeScaleConfigured: Boolean(gradeScale),
    })
  } catch (error) {
    console.error('Load marksheet error:', error)
    return internalError('loading the marksheet')
  }
}
