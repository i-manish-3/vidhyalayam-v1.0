import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import {
  buildExamReportCard,
  type SchoolDef,
  type StudentDef,
  type TemplateDef,
  type ExamResultDef,
  type AttendanceSnapshot,
} from '@/features/exams/lib/report-card-generator'

const MAX_STUDENTS_PER_BATCH = 200

// POST /api/school/exams/[id]/report-cards/generate
// body: { templateId, studentIds[], action?: 'preview' | 'print' | 'download' }
// Returns: { template, school, exam, cards: ReportCardData[] }
//
// Mirrors the id-cards generate endpoint: single trip, all data the renderer
// needs. We deliberately don't paginate — schools generate per (class, section)
// which caps the batch size naturally.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const allowed = await requirePermission(request, 'exam:reportcard:download')
    if (!allowed) return apiError(403, "You don't have permission to download report cards.")

    const { id: examId } = await params
    const body = await request.json().catch(() => ({}))
    const templateId = typeof body?.templateId === 'string' ? body.templateId : ''
    const action = ['preview', 'print', 'download'].includes(body?.action) ? body.action : 'preview'
    const studentIdsInput: unknown = body?.studentIds

    if (!Array.isArray(studentIdsInput) || studentIdsInput.length === 0) {
      return apiError(400, 'Please select at least one student.')
    }
    const studentIds = studentIdsInput
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .slice(0, MAX_STUDENTS_PER_BATCH)
    if (studentIds.length === 0) return apiError(400, 'Please select at least one valid student.')

    const schoolId = user.schoolId

    // Resolve template: explicit ID or fallback to the school default.
    const templateWhere = templateId
      ? { id: templateId, schoolId, deletedAt: null }
      : { schoolId, isDefault: true, deletedAt: null }
    const template = await db.reportCardTemplate.findFirst({ where: templateWhere })
    if (!template) {
      return apiError(400, 'No report card template found. Configure one on the Report Card Templates page first.')
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId, deletedAt: null },
      include: {
        group: { include: { paradigm: { select: { name: true } } } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const [school, students, results] = await Promise.all([
      db.school.findUnique({
        where: { id: schoolId },
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
        where: { id: { in: studentIds }, schoolId, deletedAt: null },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          rollNumber: true,
          dateOfBirth: true,
          gender: true,
          admissionDate: true,
          admissionStatus: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          academicEnrollments: {
            where: { academicYear: exam.academicYear },
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
          schoolId,
          examId,
          studentId: { in: studentIds },
          deletedAt: null,
        },
        include: {
          subjectSummaries: true,
        },
      }),
    ])

    if (!school) return notFoundError('School')

    // Attendance snapshot per student (this academic year). Empty if no attendance rows.
    const attendanceRows = template.includeAttendance
      ? await db.attendance.findMany({
          where: {
            schoolId,
            studentId: { in: studentIds },
            academicYear: exam.academicYear,
          },
          select: { studentId: true, status: true },
        })
      : []
    const attendanceByStudent = new Map<string, AttendanceSnapshot>()
    if (attendanceRows.length > 0) {
      const totals = new Map<string, { total: number; present: number }>()
      for (const a of attendanceRows) {
        const cur = totals.get(a.studentId) ?? { total: 0, present: 0 }
        cur.total += 1
        if (a.status === 'present' || a.status === 'late' || a.status === 'half_day') {
          cur.present += a.status === 'half_day' ? 0.5 : 1
        }
        totals.set(a.studentId, cur)
      }
      for (const [sid, v] of totals) {
        attendanceByStudent.set(sid, {
          totalDays: v.total,
          presentDays: Math.round(v.present * 10) / 10,
          percentage: v.total > 0 ? (v.present / v.total) * 100 : 0,
        })
      }
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

    const studentMap = new Map(students.map((s) => [s.id, s]))
    const resultMap = new Map(results.map((r) => [r.studentId, r]))

    // Preserve user-selected order so the print sheet matches what they picked.
    const cards = studentIds
      .map((sid) => {
        const stu = studentMap.get(sid)
        const result = resultMap.get(sid)
        if (!stu || !result) return null

        const enrollment = stu.academicEnrollments[0]
        const primaryParent = stu.parentLinks.find((l) => l.isPrimary) || stu.parentLinks[0]
        // Mid-session-joiner heuristic: admissionDate after the exam window
        // starts means the student wasn't yet enrolled when some components
        // were marked, so a true zero on those components is misleading.
        const joinedMidSession =
          !!stu.admissionDate &&
          !!exam.startDate &&
          stu.admissionDate.getTime() > exam.startDate.getTime()
        const withdrawal = stu.withdrawals[0] ?? null
        const studentDef: StudentDef = {
          id: stu.id,
          firstName: stu.firstName,
          lastName: stu.lastName ?? null,
          admissionNumber: stu.admissionNumber,
          rollNumber: enrollment?.rollNumber || stu.rollNumber,
          dateOfBirth: stu.dateOfBirth,
          gender: stu.gender,
          className: enrollment?.class?.name || stu.class?.name || null,
          sectionName: enrollment?.section?.name || stu.section?.name || null,
          fatherName: primaryParent?.parent.fatherName || null,
          motherName: primaryParent?.parent.motherName || null,
          parentPhone: primaryParent?.parent.phone || primaryParent?.parent.alternatePhone || null,
          admissionDate: stu.admissionDate,
          joinedMidSession,
          withdrawal: withdrawal
            ? { effectiveDate: withdrawal.effectiveDate, reason: withdrawal.reason }
            : null,
        }

        const examResultDef: ExamResultDef = {
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
          subjectSummaries: result.subjectSummaries.map((sm) => ({
            subjectId: sm.subjectId,
            subjectName: sm.subjectName,
            totalMarks: sm.totalMarks,
            obtainedMarks: sm.obtainedMarks,
            percentage: sm.percentage,
            grade: sm.grade,
            gradePoint: sm.gradePoint,
            status: sm.status,
            componentsJson: sm.componentsJson,
          })),
        }

        const data = buildExamReportCard({
          template: templateDef,
          school: schoolDef,
          student: studentDef,
          result: examResultDef,
          attendance: attendanceByStudent.get(sid) ?? null,
        })

        return { studentId: sid, data }
      })
      .filter((c): c is { studentId: string; data: ReturnType<typeof buildExamReportCard> } => c !== null)

    // Best-effort audit; never block the response.
    if (action === 'download' || action === 'print') {
      const auditCtx = extractExamAuditContext(request, user.userId)
      const entries = cards.map((c) => ({
        entityType: 'ReportCardTemplate' as const,
        entityId: template.id,
        action: 'report_downloaded' as const,
        oldValue: null,
        newValue: { examId, studentId: c.studentId, action },
        examId,
        studentId: c.studentId,
      }))
      logExamChangesBatch(db, schoolId, entries, auditCtx).catch((e) =>
        console.error('Report card audit log failed:', e),
      )
    }

    return NextResponse.json({
      template: { id: template.id, name: template.name, format: template.format },
      exam: { id: exam.id, name: exam.name, academicYear: exam.academicYear },
      school: { name: school.name, academicYear: school.academicYear },
      cards,
    })
  } catch (error) {
    console.error('Generate report cards error:', error)
    return internalError('generating the report cards')
  }
}
