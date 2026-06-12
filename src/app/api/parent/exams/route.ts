import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'

function parseSectionIds(value: string | null): string[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null
  } catch {
    return null
  }
}

function sectionMatches(sectionIds: string | null, studentSectionId: string | null) {
  const ids = parseSectionIds(sectionIds)
  if (!ids || ids.length === 0) return true
  return !!studentSectionId && ids.includes(studentSectionId)
}

export async function GET(request: NextRequest) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { searchParams } = new URL(request.url)
    const requestedStudentId = searchParams.get('studentId')
    const childIds = await getParentChildStudentIds(user.userId, user.schoolId)

    if (childIds.length === 0) {
      return NextResponse.json({ children: [], selectedStudentId: null, exams: [] })
    }

    if (requestedStudentId && !childIds.includes(requestedStudentId)) {
      return apiError(403, "You don't have access to this student's exams.")
    }

    const selectedStudentId = requestedStudentId || childIds[0]

    const children = await db.student.findMany({
      where: { id: { in: childIds }, schoolId: user.schoolId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        rollNumber: true,
        isActive: true,
        classId: true,
        sectionId: true,
        class: { select: { name: true } },
        section: { select: { name: true } },
        academicEnrollments: {
          where: { deletedAt: null },
          select: {
            academicYear: true,
            classId: true,
            sectionId: true,
            rollNumber: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    const selected = children.find((child) => child.id === selectedStudentId)
    if (!selected) return apiError(404, "We couldn't find that student.")

    const classIds = Array.from(new Set([
      selected.classId,
      ...selected.academicEnrollments.map((enrollment) => enrollment.classId),
    ].filter((id): id is string => !!id)))

    if (classIds.length === 0) {
      return NextResponse.json({
        children: children.map((child) => ({
          id: child.id,
          fullName: `${child.firstName} ${child.lastName}`,
          admissionNumber: child.admissionNumber,
          rollNumber: child.rollNumber,
          isActive: child.isActive,
          className: child.class?.name || null,
          sectionName: child.section?.name || null,
        })),
        selectedStudentId,
        exams: [],
      })
    }

    const exams = await db.exam.findMany({
      where: {
        schoolId: user.schoolId,
        deletedAt: null,
        status: { in: ['scheduled', 'ongoing', 'completed', 'result_published'] },
        examClasses: { some: { classId: { in: classIds } } },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            paradigm: { select: { id: true, name: true, academicYear: true } },
          },
        },
        examClasses: { select: { classId: true, sectionIds: true } },
        schedules: {
          where: { classId: { in: classIds } },
          orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
        },
        results: {
          where: { studentId: selectedStudentId, deletedAt: null },
          include: { subjectSummaries: true },
          take: 1,
        },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    })

    const subjectIds = Array.from(new Set(exams.flatMap((exam) => exam.schedules.map((row) => row.subjectId))))
    const subjects = subjectIds.length
      ? await db.subject.findMany({
          where: { id: { in: subjectIds }, schoolId: user.schoolId },
          select: { id: true, name: true },
        })
      : []
    const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]))

    const examsForChild = exams.flatMap((exam) => {
      const enrollment = selected.academicEnrollments.find((row) => row.academicYear === exam.academicYear)
      const effectiveClassId = enrollment?.classId || selected.classId
      const effectiveSectionId = enrollment?.sectionId ?? selected.sectionId ?? null

      const examClass = exam.examClasses.find((row) => row.classId === effectiveClassId)
      if (!examClass || !sectionMatches(examClass.sectionIds, effectiveSectionId)) return []

      const schedule = exam.schedules
        .filter((row) => row.classId === effectiveClassId && (row.sectionId === null || row.sectionId === effectiveSectionId))
        .map((row) => ({
          id: row.id,
          subjectId: row.subjectId,
          subjectName: subjectName.get(row.subjectId) || 'Subject',
          examDate: row.examDate,
          startTime: row.startTime,
          endTime: row.endTime,
          roomNumber: row.roomNumber,
          maxMarks: row.maxMarks,
          durationMinutes: row.durationMinutes,
        }))

      const result = exam.results[0]
      const resultVisible = !!exam.visibleToParent && !!exam.publishedAt && !!result

      return [{
        id: exam.id,
        name: exam.name,
        shortCode: exam.shortCode,
        academicYear: exam.academicYear,
        examType: exam.examType,
        status: exam.status,
        startDate: exam.startDate,
        endDate: exam.endDate,
        publishedAt: exam.publishedAt,
        visibleToParent: exam.visibleToParent,
        group: exam.group,
        schedule,
        canDownloadAdmitCard: schedule.length > 0 && exam.status !== 'draft',
        canDownloadReportCard: resultVisible,
        result: resultVisible
          ? {
              id: result.id,
              totalMarks: result.totalMarks,
              obtainedMarks: result.obtainedMarks,
              percentage: result.percentage,
              grade: result.grade,
              gradePoint: result.gradePoint,
              rankInClass: result.rankInClass,
              rankInSection: result.rankInSection,
              status: result.status,
              failedSubjects: result.failedSubjects,
              remarks: result.remarks,
              subjectSummaries: result.subjectSummaries,
            }
          : null,
      }]
    })

    return NextResponse.json({
      children: children.map((child) => ({
        id: child.id,
        fullName: `${child.firstName} ${child.lastName}`,
        admissionNumber: child.admissionNumber,
        rollNumber: child.rollNumber,
        isActive: child.isActive,
        className: child.class?.name || null,
        sectionName: child.section?.name || null,
      })),
      selectedStudentId,
      exams: examsForChild,
    })
  } catch (error) {
    console.error('Parent exams error:', error)
    return internalError('loading exam details')
  }
}
