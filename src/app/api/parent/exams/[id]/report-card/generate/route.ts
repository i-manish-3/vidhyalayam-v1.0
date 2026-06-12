import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'
import {
  buildExamReportCard,
  type AttendanceSnapshot,
  type ExamResultDef,
  type SchoolDef,
  type StudentDef,
  type TemplateDef,
} from '@/features/exams/lib/report-card-generator'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['PARENT'])
    if (!user || !user.schoolId) return unauthorizedError()

    const { id: examId } = await params
    const body = await request.json().catch(() => ({}))
    const action = ['preview', 'print', 'download'].includes(body?.action) ? body.action : 'preview'
    const input = Array.isArray(body?.studentIds) ? body.studentIds : []
    const studentIds = input.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10)
    if (studentIds.length === 0) return apiError(400, 'Please select a student.')

    const childIds = await getParentChildStudentIds(user.userId, user.schoolId)
    if (studentIds.some((id) => !childIds.includes(id))) {
      return apiError(403, "You don't have access to this report card.")
    }

    const exam = await db.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId,
        deletedAt: null,
        visibleToParent: true,
        publishedAt: { not: null },
      },
      include: {
        group: { include: { paradigm: { select: { name: true } } } },
      },
    })
    if (!exam) return apiError(404, 'This report card is not published yet.')

    const template = await db.reportCardTemplate.findFirst({
      where: { schoolId: user.schoolId, isDefault: true, deletedAt: null },
    })
    if (!template) return apiError(400, 'No report card template is configured yet.')

    const [school, students, results] = await Promise.all([
      db.school.findUnique({
        where: { id: user.schoolId },
        select: {
          name: true,
          logo: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          contactPhone: true,
          contactEmail: true,
          website: true,
          affiliationNumber: true,
          registrationNumber: true,
          udiseNumber: true,
          principalSignature: true,
          academicYear: true,
        },
      }),
      db.student.findMany({
        where: { id: { in: studentIds }, schoolId: user.schoolId, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          dateOfBirth: true,
          gender: true,
          admissionDate: true,
          class: { select: { name: true } },
          section: { select: { name: true } },
          academicEnrollments: {
            where: { academicYear: exam.academicYear, deletedAt: null },
            select: {
              rollNumber: true,
              class: { select: { name: true } },
              section: { select: { name: true } },
            },
            take: 1,
          },
          parentLinks: {
            select: {
              isPrimary: true,
              parent: {
                select: {
                  fatherName: true,
                  motherName: true,
                  phone: true,
                  alternatePhone: true,
                },
              },
            },
          },
          withdrawals: {
            where: { academicYear: exam.academicYear, deletedAt: null, reversedAt: null },
            select: { effectiveDate: true, reason: true },
            orderBy: { effectiveDate: 'desc' },
            take: 1,
          },
        },
      }),
      db.examResult.findMany({
        where: {
          schoolId: user.schoolId,
          examId,
          studentId: { in: studentIds },
          deletedAt: null,
        },
        include: { subjectSummaries: true },
      }),
    ])

    if (!school) return notFoundError('School')

    const attendanceRows = template.includeAttendance
      ? await db.attendance.findMany({
          where: {
            schoolId: user.schoolId,
            studentId: { in: studentIds },
            academicYear: exam.academicYear,
          },
          select: { studentId: true, status: true },
        })
      : []

    const attendanceByStudent = new Map<string, AttendanceSnapshot>()
    const totals = new Map<string, { total: number; present: number }>()
    for (const row of attendanceRows) {
      const cur = totals.get(row.studentId) ?? { total: 0, present: 0 }
      cur.total += 1
      if (row.status === 'present' || row.status === 'late' || row.status === 'half_day') {
        cur.present += row.status === 'half_day' ? 0.5 : 1
      }
      totals.set(row.studentId, cur)
    }
    for (const [studentId, value] of totals) {
      attendanceByStudent.set(studentId, {
        totalDays: value.total,
        presentDays: Math.round(value.present * 10) / 10,
        percentage: value.total > 0 ? (value.present / value.total) * 100 : 0,
      })
    }

    const schoolDef: SchoolDef = {
      name: school.name,
      logo: school.logo,
      address: [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', '),
      phone: school.contactPhone,
      email: school.contactEmail,
      website: school.website,
      affiliationNumber: school.affiliationNumber,
      registrationNumber: school.registrationNumber,
      udiseNumber: school.udiseNumber,
      principalSignature: school.principalSignature,
      academicYear: school.academicYear || exam.academicYear,
    }

    const templateDef: TemplateDef = {
      id: template.id,
      name: template.name,
      format: template.format,
      layoutJson: template.layoutJson,
      includeAttendance: template.includeAttendance,
      includeRank: template.includeRank,
      includeCoScholastic: template.includeCoScholastic,
      showPrincipalRemarks: template.showPrincipalRemarks,
      showTeacherRemarks: template.showTeacherRemarks,
    }

    const studentMap = new Map(students.map((student) => [student.id, student]))
    const resultMap = new Map(results.map((result) => [result.studentId, result]))

    const cards = studentIds
      .map((studentId) => {
        const student = studentMap.get(studentId)
        const result = resultMap.get(studentId)
        if (!student || !result) return null

        const enrollment = student.academicEnrollments[0]
        const primaryParent = student.parentLinks.find((link) => link.isPrimary) || student.parentLinks[0]
        const joinedMidSession =
          !!student.admissionDate &&
          !!exam.startDate &&
          student.admissionDate.getTime() > exam.startDate.getTime()
        const withdrawal = student.withdrawals[0] ?? null

        const studentDef: StudentDef = {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName ?? null,
          admissionNumber: student.admissionNumber,
          rollNumber: enrollment?.rollNumber || student.rollNumber,
          dateOfBirth: student.dateOfBirth,
          gender: student.gender,
          className: enrollment?.class?.name || student.class?.name || null,
          sectionName: enrollment?.section?.name || student.section?.name || null,
          fatherName: primaryParent?.parent.fatherName || null,
          motherName: primaryParent?.parent.motherName || null,
          parentPhone: primaryParent?.parent.phone || primaryParent?.parent.alternatePhone || null,
          admissionDate: student.admissionDate,
          joinedMidSession,
          withdrawal: withdrawal ? { effectiveDate: withdrawal.effectiveDate, reason: withdrawal.reason } : null,
        }

        const resultDef: ExamResultDef = {
          examId: result.examId,
          examName: exam.name,
          examGroupName: exam.group.name,
          paradigmName: exam.group.paradigm?.name ?? null,
          academicYear: result.academicYear,
          totalMarks: result.totalMarks,
          obtainedMarks: result.obtainedMarks,
          percentage: result.percentage,
          grade: result.grade,
          gradePoint: result.gradePoint,
          rankInClass: result.rankInClass,
          rankInSection: result.rankInSection,
          status: result.status,
          failedSubjects: result.failedSubjects,
          publishedAt: exam.publishedAt,
          subjectSummaries: result.subjectSummaries.map((summary) => ({
            subjectId: summary.subjectId,
            subjectName: summary.subjectName,
            totalMarks: summary.totalMarks,
            obtainedMarks: summary.obtainedMarks,
            percentage: summary.percentage,
            grade: summary.grade,
            gradePoint: summary.gradePoint,
            status: summary.status,
            componentsJson: summary.componentsJson,
          })),
        }

        return {
          studentId,
          data: buildExamReportCard({
            template: templateDef,
            school: schoolDef,
            student: studentDef,
            result: resultDef,
            attendance: attendanceByStudent.get(studentId) ?? null,
          }),
        }
      })
      .filter((card): card is { studentId: string; data: ReturnType<typeof buildExamReportCard> } => card !== null)

    if (cards.length === 0) return apiError(404, 'No published report card is available for the selected student.')

    void action
    return NextResponse.json({
      template: { id: template.id, name: template.name, format: template.format },
      exam: { id: exam.id, name: exam.name, academicYear: exam.academicYear },
      school: { name: school.name, academicYear: school.academicYear },
      cards,
    })
  } catch (error) {
    console.error('Parent report card error:', error)
    return internalError('generating the report card')
  }
}
