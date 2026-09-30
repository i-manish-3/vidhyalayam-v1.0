import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'
import {
  buildExamReportCard,
  buildMultiExamReportCard,
  resolveBandGrade,
  type AttendanceSnapshot,
  type ExamResultDef,
  type SubjectSummaryDef,
  type SchoolDef,
  type StudentDef,
  type TemplateDef,
} from '@/features/exams/lib/report-card-generator'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

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
    const examIdsInput: unknown = body?.examIds
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
        group: { include: { paradigm: { select: { name: true, academicYear: true } } } },
      },
    })
    if (!exam) return apiError(404, 'This report card is not published yet.')

    // Find all published sibling exams in this term (ExamGroup) or academic year
    const termExams = await db.exam.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { examGroupId: exam.examGroupId },
          { academicYear: exam.academicYear },
          ...(Array.isArray(examIdsInput) && examIdsInput.length > 0
            ? [{ id: { in: examIdsInput.filter((id): id is string => typeof id === 'string') } }]
            : []),
        ],
        deletedAt: null,
        visibleToParent: true,
        publishedAt: { not: null },
      },
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        startDate: true,
        publishedAt: true,
        academicYear: true,
        group: { select: { name: true, paradigm: { select: { name: true } } } },
      },
      orderBy: { startDate: 'asc' },
    })

    const termExamMap = new Map(termExams.map((e) => [e.id, e]))

    let selectedExamIds: string[] = []
    if (Array.isArray(examIdsInput) && examIdsInput.length > 0) {
      selectedExamIds = examIdsInput.filter((id): id is string => typeof id === 'string' && termExamMap.has(id))
    }
    if (selectedExamIds.length === 0) {
      selectedExamIds = [examId]
    } else if (!selectedExamIds.includes(examId)) {
      selectedExamIds = [examId, ...selectedExamIds]
    }

    const isMultiExam = selectedExamIds.length > 1

    const template = await db.reportCardTemplate.findFirst({
      where: { schoolId: user.schoolId, isDefault: true, deletedAt: null },
    })
    if (!template) return apiError(400, 'No report card template is configured yet.')

    const [
      school,
      students,
      results,
      gradeScale,
      highestMarksRows,
      subjectConfigs,
      marksEntries,
      fullSubjectConfigs,
      schoolSubjects,
    ] = await Promise.all([
      db.school.findUnique({
        where: { id: user.schoolId },
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
        where: { id: { in: studentIds }, schoolId: user.schoolId, deletedAt: null },
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
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          academicEnrollments: {
            where: { academicYear: exam.academicYear, deletedAt: null },
            select: {
              rollNumber: true,
              class: { select: { id: true, name: true } },
              section: { select: { id: true, name: true } },
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
          examId: { in: selectedExamIds },
          studentId: { in: studentIds },
          deletedAt: null,
        },
        include: { subjectSummaries: true },
      }),
      db.gradeScale.findFirst({
        where: { schoolId: user.schoolId, isActive: true, isDefault: true, deletedAt: null },
        include: { bands: { orderBy: { sequence: 'asc' } } },
      }),
      db.resultSubjectSummary.groupBy({
        by: ['subjectId'],
        where: {
          result: {
            schoolId: user.schoolId,
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
          schoolId: user.schoolId,
          examId: { in: selectedExamIds },
          deletedAt: null,
        },
        select: {
          subjectId: true,
          totalMarks: true,
          passingPercentage: true,
        },
      }),
      db.marksEntry.findMany({
        where: {
          schoolId: user.schoolId,
          examId: { in: selectedExamIds },
          studentId: { in: studentIds },
          deletedAt: null,
        },
        include: {
          component: true,
          subjectConfig: true,
        },
      }),
      db.examSubjectConfig.findMany({
        where: {
          schoolId: user.schoolId,
          examId: { in: selectedExamIds },
          deletedAt: null,
        },
        include: {
          components: true,
        },
      }),
      db.subject.findMany({
        where: { schoolId: user.schoolId },
        select: { id: true, name: true },
      }),
    ])

    if (!school) return notFoundError('School')

    const subjectNameMap = new Map(schoolSubjects.map((s) => [s.id, s.name]))

    const highestMarksBySubject = new Map<string, number>()
    for (const h of highestMarksRows) {
      if (h._max.obtainedMarks != null) {
        highestMarksBySubject.set(h.subjectId, h._max.obtainedMarks)
      }
    }
    for (const m of marksEntries) {
      const subId = m.subjectConfig?.subjectId
      if (subId && m.numericValue != null && m.status !== 'absent') {
        const curMax = highestMarksBySubject.get(subId) ?? 0
        if (m.numericValue > curMax) {
          highestMarksBySubject.set(subId, m.numericValue)
        }
      }
    }

    const passMarksBySubject = new Map<string, number>()
    for (const sc of subjectConfigs) {
      const passM = Math.round((sc.totalMarks * (sc.passingPercentage || 33)) / 100)
      passMarksBySubject.set(sc.subjectId, passM)
    }

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

    const studentMap = new Map(students.map((student) => [student.id, student]))

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
        subjectSummaries: r.subjectSummaries.map((summary) => ({
          subjectId: summary.subjectId,
          subjectName: summary.subjectName,
          totalMarks: summary.totalMarks,
          obtainedMarks: summary.obtainedMarks,
          percentage: summary.percentage,
          grade: summary.grade,
          gradePoint: summary.gradePoint,
          status: summary.status,
          componentsJson: summary.componentsJson,
          passMarks: passMarksBySubject.get(summary.subjectId) ?? (summary.totalMarks === 100 ? 30 : Math.round(summary.totalMarks * 0.33)),
          highestMarks: highestMarksBySubject.get(summary.subjectId) ?? summary.obtainedMarks,
        })),
      }
      const existing = resultsByStudent.get(r.studentId) ?? []
      existing.push(resultDef)
      resultsByStudent.set(r.studentId, existing)
    }

    const selectedTermExams = selectedExamIds
      .map((id) => termExamMap.get(id))
      .filter((e): e is NonNullable<typeof e> => Boolean(e))

    // Ensure every selected exam has an ExamResultDef for every student.
    // If an exam result was never calculated/computed or has missing summaries, synthesize it from marksEntries + examSubjectConfig.
    for (const stu of students) {
      const studentResults = resultsByStudent.get(stu.id) ?? []

      for (const curExam of selectedTermExams) {
        const existingResultDef = studentResults.find((r) => r.examId === curExam.id)
        const studentExamMarks = marksEntries.filter(
          (m) => m.studentId === stu.id && m.examId === curExam.id,
        )

        const stuClassId = stu.class?.id || stu.academicEnrollments[0]?.class?.id
        const stuSectionId = stu.section?.id || stu.academicEnrollments[0]?.section?.id

        let applicableConfigs = fullSubjectConfigs.filter((cfg) => {
          if (cfg.examId !== curExam.id) return false
          if (stuClassId && cfg.classId) {
            return cfg.classId === stuClassId
          }
          return !cfg.classId
        })

        if (applicableConfigs.length === 0 && studentExamMarks.length > 0) {
          const markConfigIds = new Set(studentExamMarks.map((m) => m.subjectConfigId).filter(Boolean))
          applicableConfigs = fullSubjectConfigs.filter((cfg) => markConfigIds.has(cfg.id))
        }

        const uniqueConfigsBySubject = new Map<string, typeof fullSubjectConfigs[0]>()
        for (const cfg of applicableConfigs) {
          if (!uniqueConfigsBySubject.has(cfg.subjectId)) {
            uniqueConfigsBySubject.set(cfg.subjectId, cfg)
          }
        }
        applicableConfigs = Array.from(uniqueConfigsBySubject.values())

        if (!existingResultDef || existingResultDef.subjectSummaries.length === 0) {
          if (applicableConfigs.length === 0 && studentExamMarks.length === 0) {
            continue
          }

          const synthesizedSummaries: SubjectSummaryDef[] = []

          if (applicableConfigs.length > 0) {
            for (const cfg of applicableConfigs) {
              const cfgMarks = studentExamMarks.filter((m) => m.subjectConfigId === cfg.id)
              const subName = subjectNameMap.get(cfg.subjectId) || 'Subject'

              let obtMarks = 0
              let isAbsent = false
              let isMedicalLeave = false
              let isEntered = false
              const compBreakdown: Record<string, { obtained: number; max: number }> = {}

              if (cfg.components && cfg.components.length > 0) {
                for (const comp of cfg.components) {
                  const m = cfgMarks.find((x) => x.componentId === comp.id)
                  if (m?.status === 'absent') {
                    isAbsent = true
                    compBreakdown[comp.name] = { obtained: 0, max: comp.maxMarks }
                  } else if (m?.status === 'medical_leave') {
                    isMedicalLeave = true
                    compBreakdown[comp.name] = { obtained: 0, max: comp.maxMarks }
                  } else if (m && m.numericValue != null) {
                    isEntered = true
                    obtMarks += m.numericValue
                    compBreakdown[comp.name] = { obtained: m.numericValue, max: comp.maxMarks }
                  } else {
                    compBreakdown[comp.name] = { obtained: 0, max: comp.maxMarks }
                  }
                }
              } else {
                const m = cfgMarks.find((x) => x.componentId === null) || cfgMarks[0]
                if (m?.status === 'absent') {
                  isAbsent = true
                } else if (m?.status === 'medical_leave') {
                  isMedicalLeave = true
                } else if (m && m.numericValue != null) {
                  isEntered = true
                  obtMarks = m.numericValue
                }
              }

              const tot = cfg.totalMarks || 100
              const passPct = cfg.passingPercentage || 33
              const passM = passMarksBySubject.get(cfg.subjectId) ?? Math.round((tot * passPct) / 100)
              const pct = tot > 0 ? (obtMarks / tot) * 100 : 0
              const subGrade = resolveBandGrade(pct, gradeScale?.bands)
              const status = isAbsent
                ? 'absent'
                : isMedicalLeave
                  ? 'medical_leave'
                  : isEntered
                    ? pct >= passPct
                      ? 'pass'
                      : 'fail'
                    : 'not_applicable'

              synthesizedSummaries.push({
                subjectId: cfg.subjectId,
                subjectName: subName,
                totalMarks: tot,
                obtainedMarks: obtMarks,
                percentage: round2(pct),
                grade: subGrade,
                gradePoint: null,
                status,
                passMarks: passM,
                highestMarks: highestMarksBySubject.get(cfg.subjectId) ?? obtMarks,
                componentsJson: Object.keys(compBreakdown).length > 0 ? JSON.stringify(compBreakdown) : null,
              })
            }
          }

          const totSum = synthesizedSummaries.reduce((acc, s) => acc + s.totalMarks, 0)
          const obtSum = synthesizedSummaries.reduce(
            (acc, s) => (s.status !== 'absent' && s.status !== 'medical_leave' && s.status !== 'not_applicable' ? acc + s.obtainedMarks : acc),
            0,
          )
          const pct = totSum > 0 ? round2((obtSum / totSum) * 100) : 0
          const ovGrade = resolveBandGrade(pct, gradeScale?.bands)
          const failedCount = synthesizedSummaries.filter((s) => s.status === 'fail').length

          const synthesizedResultDef: ExamResultDef = {
            examId: curExam.id,
            examName: curExam.name,
            examGroupName: curExam.group?.name || exam.group.name,
            paradigmName: curExam.group?.paradigm?.name ?? exam.group.paradigm?.name ?? null,
            academicYear: curExam.academicYear || exam.academicYear,
            totalMarks: totSum,
            obtainedMarks: obtSum,
            percentage: pct,
            grade: ovGrade,
            gradePoint: null,
            rankInClass: null,
            rankInSection: null,
            status: failedCount > 0 ? 'fail' : 'pass',
            remarks: null,
            failedSubjects: failedCount > 0 ? JSON.stringify(synthesizedSummaries.filter((s) => s.status === 'fail').map((s) => s.subjectName)) : null,
            publishedAt: curExam.publishedAt ?? exam.publishedAt,
            subjectSummaries: synthesizedSummaries,
          }

          if (existingResultDef) {
            Object.assign(existingResultDef, synthesizedResultDef)
          } else {
            studentResults.push(synthesizedResultDef)
            resultsByStudent.set(stu.id, studentResults)
          }
        }
      }
    }

    const cards = studentIds
      .map((studentId) => {
        const student = studentMap.get(studentId)
        const studentResults = resultsByStudent.get(studentId)
        if (!student || !studentResults || studentResults.length === 0) return null

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
          profileImage: student.profileImage,
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
            attendance: attendanceByStudent.get(studentId) ?? null,
            gradeScaleBands: gradeScale?.bands,
          })
        } else {
          data = buildExamReportCard({
            template: templateDef,
            school: schoolDef,
            student: studentDef,
            result: studentResults[0],
            attendance: attendanceByStudent.get(studentId) ?? null,
            gradeScaleBands: gradeScale?.bands,
          })
        }

        return {
          studentId,
          data,
        }
      })
      .filter((card): card is { studentId: string; data: ReturnType<typeof buildExamReportCard> } => card !== null)

    if (cards.length === 0) return apiError(404, 'No published report card is available for the selected student.')

    void action
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
    console.error('Parent report card error:', error)
    return internalError('generating the report card')
  }
}
