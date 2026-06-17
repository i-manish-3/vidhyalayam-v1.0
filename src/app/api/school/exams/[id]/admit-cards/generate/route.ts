import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { logExamChangesBatch, extractExamAuditContext } from '@/lib/audit/exam-audit'
import { buildAdmitCardQrPayload } from '@/lib/admit-card-qr'
import {
  buildAdmitCard,
  type AdmitCardSchoolDef,
  type AdmitCardStudentDef,
  type AdmitCardExamDef,
  type AdmitCardScheduleRowDef,
} from '@/features/exams/lib/admit-card-generator'
import { parseAdmitCardInstructions } from '@/features/exams/lib/admit-card-utils'
import { parseAdmitCardTemplate } from '@/features/exams/lib/admit-card-template'

const MAX_STUDENTS_PER_BATCH = 200

// POST /api/school/exams/[id]/admit-cards/generate
// body: { studentIds[], action?: 'preview' | 'print' | 'download' }
// Returns: { exam, school, cards: [{ studentId, data: AdmitCardData }] }
//
// Mirrors the report-cards generate endpoint: single trip, all data the
// renderer needs. The datesheet is built from ExamSchedule rows, narrowed per
// student to their class and (section || all-sections) rows.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) return unauthorizedError()
    const allowed = await requirePermission(request, 'exam:admitcard:download')
    if (!allowed) return apiError(403, "You don't have permission to download admit cards.")

    const { id: examId } = await params
    const body = await request.json().catch(() => ({}))
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

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId, deletedAt: null },
      include: {
        group: { include: { paradigm: { select: { name: true } } } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const [school, students, scheduleRows] = await Promise.all([
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
          udiseNumber: true,
          principalSignature: true,
          academicYear: true,
          board: true,
          registrationNumber: true,
          establishedYear: true,
          principalName: true,
          trustName: true,
          admitCardInstructions: true,
          admitCardTemplate: true,
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
          profileImage: true,
          classId: true,
          sectionId: true,
          class: { select: { id: true, name: true } },
          section: { select: { id: true, name: true } },
          academicEnrollments: {
            where: { academicYear: exam.academicYear, deletedAt: null },
            select: {
              rollNumber: true,
              classId: true,
              sectionId: true,
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
                },
              },
            },
          },
        },
      }),
      db.examSchedule.findMany({
        where: { schoolId, examId },
        orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
      }),
    ])

    if (!school) return notFoundError('School')

    const schoolDef: AdmitCardSchoolDef = {
      name: school.name,
      logo: school.logo,
      address: [school.address, school.city, school.state, school.pincode].filter(Boolean).join(', '),
      phone: school.contactPhone,
      email: school.contactEmail,
      website: school.website,
      affiliationNumber: school.affiliationNumber,
      udiseNumber: school.udiseNumber,
      principalSignature: school.principalSignature,
      academicYear: school.academicYear || exam.academicYear,
      board: school.board,
      registrationNumber: school.registrationNumber,
      establishedYear: school.establishedYear,
      trustName: school.trustName,
      principalName: school.principalName,
    }

    // Per-school custom instructions (JSON array of strings); falls back to the
    // generator's defaults when unset or invalid.
    const customInstructions = parseAdmitCardInstructions(school.admitCardInstructions)

    const examDef: AdmitCardExamDef = {
      id: exam.id,
      name: exam.name,
      examGroupName: exam.group?.name ?? null,
      paradigmName: exam.group?.paradigm?.name ?? null,
      academicYear: exam.academicYear,
      startDate: exam.startDate,
      endDate: exam.endDate,
    }

    // Subject-name lookup for the datesheet (schedule rows store subjectId).
    const subjectIds = Array.from(new Set(scheduleRows.map((r) => r.subjectId)))
    const subjects =
      subjectIds.length > 0
        ? await db.subject.findMany({
            where: { id: { in: subjectIds }, schoolId },
            select: { id: true, name: true },
          })
        : []
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]))

    const studentMap = new Map(students.map((s) => [s.id, s]))

    // Preserve user-selected order so the print sheet matches what they picked.
    const builtCards = studentIds
      .map((sid) => {
        const stu = studentMap.get(sid)
        if (!stu) return null

        const enrollment = stu.academicEnrollments[0]
        // Resolve the student's class/section for this academic year, falling
        // back to the student record's current class/section.
        const effectiveClassId = enrollment?.classId || stu.classId
        const effectiveSectionId = enrollment?.sectionId ?? stu.sectionId ?? null

        // Datesheet: schedule rows for this student's class where the row is
        // either section-agnostic (sectionId null = all sections) or matches
        // the student's section.
        const schedule: AdmitCardScheduleRowDef[] = scheduleRows
          .filter(
            (r) =>
              r.classId === effectiveClassId &&
              (r.sectionId === null || r.sectionId === effectiveSectionId),
          )
          .map((r) => ({
            subjectName: subjectName.get(r.subjectId) || 'Subject',
            examDate: r.examDate,
            startTime: r.startTime,
            endTime: r.endTime,
            roomNumber: r.roomNumber,
            durationMinutes: r.durationMinutes,
          }))

        const primaryParent = stu.parentLinks.find((l) => l.isPrimary) || stu.parentLinks[0]

        const studentDef: AdmitCardStudentDef = {
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
          profileImage: stu.profileImage,
        }

        const qrPayload = buildAdmitCardQrPayload({
          studentId: stu.id,
          examId: exam.id,
          admissionNumber: stu.admissionNumber,
          schoolId,
          academicYear: exam.academicYear,
        })

        const data = buildAdmitCard({
          school: schoolDef,
          student: studentDef,
          exam: examDef,
          schedule,
          qrPayload,
          instructions: customInstructions,
        })

        return { studentId: sid, data }
      })
      .filter((c): c is { studentId: string; data: ReturnType<typeof buildAdmitCard> } => c !== null)

    // Best-effort audit; never block the response.
    if (action === 'download' || action === 'print') {
      const auditCtx = extractExamAuditContext(request, user.userId)
      const entries = builtCards.map((c) => ({
        entityType: 'Exam' as const,
        entityId: exam.id,
        action: 'admit_card_downloaded' as const,
        oldValue: null,
        newValue: { examId, studentId: c.studentId, action },
        examId,
        studentId: c.studentId,
      }))
      logExamChangesBatch(db, schoolId, entries, auditCtx).catch((e) =>
        console.error('Admit card audit log failed:', e),
      )
    }

    return NextResponse.json({
      exam: { id: exam.id, name: exam.name, academicYear: exam.academicYear },
      school: { name: school.name, academicYear: school.academicYear },
      template: parseAdmitCardTemplate(school.admitCardTemplate),
      cards: builtCards,
    })
  } catch (error) {
    console.error('Generate admit cards error:', error)
    return internalError('generating the admit cards')
  }
}
