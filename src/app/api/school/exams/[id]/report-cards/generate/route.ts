import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import {
  buildExamReportCard,
  buildMultiExamReportCard,
  type SchoolDef,
  type StudentDef,
  type TemplateDef,
  type ExamResultDef,
  type AttendanceSnapshot,
} from '@/features/exams/lib/report-card-generator'

const MAX_STUDENTS_PER_BATCH = 200

// POST /api/school/exams/[id]/report-cards/generate
// body: { templateId, studentIds[], action?: 'preview' | 'print' | 'download', examIds?: string[] }
// Returns: { template, school, exam, termExams, selectedExamIds, cards: ReportCardData[] }
//
// Mirrors the id-cards generate endpoint: single trip, all data the renderer
// needs. Supports single exam or dynamic multi-exam aggregation across term exams.
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
    const examIdsInput: unknown = body?.examIds

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
        group: { include: { paradigm: { select: { name: true, academicYear: true } } } },
      },
    })
    if (!exam) return notFoundError('Exam')

    // Find all sibling exams in this term (ExamGroup)
    const termExams = await db.exam.findMany({
      where: {
        schoolId,
        examGroupId: exam.examGroupId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        startDate: true,
        publishedAt: true,
      },
      orderBy: { startDate: 'asc' },
    })

    const termExamMap = new Map(termExams.map((e) => [e.id, e]))

    // Filter requested exams to those that belong to this term
    let selectedExamIds: string[] = []
    if (Array.isArray(examIdsInput) && examIdsInput.length > 0) {
      selectedExamIds = examIdsInput
        .filter((id): id is string => typeof id === 'string' && termExamMap.has(id))
    }
    if (selectedExamIds.length === 0) {
      selectedExamIds = [examId]
    }

    const isMultiExam = selectedExamIds.length > 1

    const [school, students, results, gradeScale, highestMarksRows, subjectConfigs] = await Promise.all([
      db.school.findUnique({
        where: { id: schoolId },
        select: {
          name: true,
          logo: true,
          printHeader: true,
          board: true,
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
          profileImage: true,
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
          examId: { in: selectedExamIds },
          studentId: { in: studentIds },
          deletedAt: null,
        },
        include: {
          subjectSummaries: true,
        },
      }),
      db.gradeScale.findFirst({
        where: { schoolId, isActive: true, isDefault: true, deletedAt: null },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      }),
      db.resultSubjectSummary.groupBy({
        by: ['subjectId'],
        where: {
          result: {
            schoolId,
            examId: { in: selectedExamIds },
            deletedAt: null,
          },
          status: { not: 'absent' },
        },
        _max: {
          obtainedMarks: true,
        },
      }),
      db.examSubjectConfig.findMany({
        where: {
          schoolId,
          examId: { in: selectedExamIds },
          deletedAt: null,
        },
        select: {
          subjectId: true,
          totalMarks: true,
          passingPercentage: true,
        },
      }),
    ])

    if (!school) return notFoundError('School')

    const highestMarksBySubject = new Map<string, number>()
    for (const h of highestMarksRows) {
      if (h._max.obtainedMarks != null) {
        highestMarksBySubject.set(h.subjectId, h._max.obtainedMarks)
      }
    }

    const passMarksBySubject = new Map<string, number>()
    for (const sc of subjectConfigs) {
      const passM = Math.round((sc.totalMarks * (sc.passingPercentage || 33)) / 100)
      passMarksBySubject.set(sc.subjectId, passM)
    }

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
      printHeader: school.printHeader,
      board: school.board,
      address: [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', '),
      city: school.city,
      state: school.state,
      pincode: school.pincode,
      phone: school.contactPhone,
      email: school.contactEmail,
      contactPhone: school.contactPhone,
      contactEmail: school.contactEmail,
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

    // Map student results by studentId -> array of ExamResultDef
    const resultsByStudent = new Map<string, ExamResultDef[]>()
    for (const r of results) {
      const curExam = termExamMap.get(r.examId) || exam
      const resultDef: ExamResultDef = {
        examId: r.examId,
        examName: curExam.name,
        examGroupName: exam.group.name,
        paradigmName: exam.group.paradigm?.name ?? null,
        academicYear: r.academicYear,
        totalMarks: r.totalMarks,
        obtainedMarks: r.obtainedMarks,
        percentage: r.percentage,
        grade: r.grade,
        gradePoint: r.gradePoint,
        rankInClass: r.rankInClass,
        rankInSection: r.rankInSection,
        status: r.status,
        remarks: r.remarks,
        failedSubjects: r.failedSubjects,
        publishedAt: curExam.publishedAt ?? exam.publishedAt,
        subjectSummaries: r.subjectSummaries.map((sm) => ({
          subjectId: sm.subjectId,
          subjectName: sm.subjectName,
          totalMarks: sm.totalMarks,
          obtainedMarks: sm.obtainedMarks,
          percentage: sm.percentage,
          grade: sm.grade,
          gradePoint: sm.gradePoint,
          status: sm.status,
          componentsJson: sm.componentsJson,
          passMarks: passMarksBySubject.get(sm.subjectId) ?? (sm.totalMarks === 100 ? 30 : Math.round(sm.totalMarks * 0.33)),
          highestMarks: highestMarksBySubject.get(sm.subjectId) ?? sm.obtainedMarks,
        })),
      }
      const existing = resultsByStudent.get(r.studentId) ?? []
      existing.push(resultDef)
      resultsByStudent.set(r.studentId, existing)
    }

    const selectedTermExams = selectedExamIds
      .map((id) => termExamMap.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))

    // Preserve user-selected order so the print sheet matches what they picked.
    const cards = studentIds
      .map((sid) => {
        const stu = studentMap.get(sid)
        const studentResults = resultsByStudent.get(sid)
        if (!stu || !studentResults || studentResults.length === 0) return null

        const enrollment = stu.academicEnrollments[0]
        const primaryParent = stu.parentLinks.find((l) => l.isPrimary) || stu.parentLinks[0]
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
          profileImage: stu.profileImage,
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

        let data
        if (isMultiExam) {
          data = buildMultiExamReportCard({
            template: templateDef,
            school: schoolDef,
            student: studentDef,
            examGroup: {
              id: exam.examGroupId,
              name: exam.group.name,
              paradigmName: exam.group.paradigm?.name ?? null,
              academicYear: exam.academicYear,
            },
            exams: selectedTermExams,
            examResults: studentResults,
            attendance: attendanceByStudent.get(sid) ?? null,
            gradeScaleBands: gradeScale?.bands,
          })
        } else {
          data = buildExamReportCard({
            template: templateDef,
            school: schoolDef,
            student: studentDef,
            result: studentResults[0],
            attendance: attendanceByStudent.get(sid) ?? null,
            gradeScaleBands: gradeScale?.bands,
          })
        }

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
        newValue: { examId, studentId: c.studentId, action, selectedExamIds },
        examId,
        studentId: c.studentId,
      }))
      logExamChangesBatch(db, schoolId, entries, auditCtx).catch((e) =>
        console.error('Report card audit log failed:', e),
      )
    }

    return NextResponse.json({
      template: { id: template.id, name: template.name, format: template.format },
      exam: {
        id: exam.id,
        name: exam.name,
        academicYear: exam.academicYear,
        groupName: exam.group.name,
        paradigmName: exam.group.paradigm?.name ?? null,
      },
      school: { name: school.name, academicYear: school.academicYear },
      termExams,
      selectedExamIds,
      cards,
    })
  } catch (error) {
    console.error('Generate report cards error:', error)
    return internalError('generating the report cards')
  }
}
