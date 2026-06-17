import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { unauthorizedError, internalError, apiError, notFoundError } from '@/lib/api-errors'
import { getParentChildStudentIds } from '@/lib/parent-access'
import { buildAdmitCardQrPayload } from '@/lib/admit-card-qr'
import {
  buildAdmitCard,
  type AdmitCardExamDef,
  type AdmitCardScheduleRowDef,
  type AdmitCardSchoolDef,
  type AdmitCardStudentDef,
} from '@/features/exams/lib/admit-card-generator'
import { parseAdmitCardInstructions } from '@/features/exams/lib/admit-card-utils'
import { parseAdmitCardTemplate } from '@/features/exams/lib/admit-card-template'

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
      return apiError(403, "You don't have access to this admit card.")
    }

    const exam = await db.exam.findFirst({
      where: {
        id: examId,
        schoolId: user.schoolId,
        deletedAt: null,
        status: { in: ['scheduled', 'ongoing', 'completed', 'result_published'] },
      },
      include: {
        group: { include: { paradigm: { select: { name: true } } } },
      },
    })
    if (!exam) return notFoundError('Exam')

    const [school, students, scheduleRows] = await Promise.all([
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
        where: { id: { in: studentIds }, schoolId: user.schoolId, deletedAt: null },
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
              parent: { select: { fatherName: true, motherName: true } },
            },
          },
        },
      }),
      db.examSchedule.findMany({
        where: { schoolId: user.schoolId, examId },
        orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
      }),
    ])

    if (!school) return notFoundError('School')

    const subjectIds = Array.from(new Set(scheduleRows.map((row) => row.subjectId)))
    const subjects = subjectIds.length
      ? await db.subject.findMany({
          where: { id: { in: subjectIds }, schoolId: user.schoolId },
          select: { id: true, name: true },
        })
      : []
    const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]))
    const studentMap = new Map(students.map((student) => [student.id, student]))

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

    const cards = studentIds
      .map((studentId) => {
        const student = studentMap.get(studentId)
        if (!student) return null

        const enrollment = student.academicEnrollments[0]
        const effectiveClassId = enrollment?.classId || student.classId
        const effectiveSectionId = enrollment?.sectionId ?? student.sectionId ?? null
        const schedule: AdmitCardScheduleRowDef[] = scheduleRows
          .filter((row) => row.classId === effectiveClassId && (row.sectionId === null || row.sectionId === effectiveSectionId))
          .map((row) => ({
            subjectName: subjectName.get(row.subjectId) || 'Subject',
            examDate: row.examDate,
            startTime: row.startTime,
            endTime: row.endTime,
            roomNumber: row.roomNumber,
            durationMinutes: row.durationMinutes,
          }))

        if (schedule.length === 0) return null

        const primaryParent = student.parentLinks.find((link) => link.isPrimary) || student.parentLinks[0]
        const studentDef: AdmitCardStudentDef = {
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
          profileImage: student.profileImage,
        }

        const qrPayload = buildAdmitCardQrPayload({
          studentId: student.id,
          examId: exam.id,
          admissionNumber: student.admissionNumber,
          schoolId: user.schoolId!,
          academicYear: exam.academicYear,
        })

        return {
          studentId,
          data: buildAdmitCard({ school: schoolDef, student: studentDef, exam: examDef, schedule, qrPayload, instructions: customInstructions }),
        }
      })
      .filter((card): card is { studentId: string; data: ReturnType<typeof buildAdmitCard> } => card !== null)

    if (cards.length === 0) return apiError(404, 'No admit card is available for the selected student.')

    void action
    return NextResponse.json({
      exam: { id: exam.id, name: exam.name, academicYear: exam.academicYear },
      school: { name: school.name, academicYear: school.academicYear },
      template: parseAdmitCardTemplate(school.admitCardTemplate),
      cards,
    })
  } catch (error) {
    console.error('Parent admit card error:', error)
    return internalError('generating the admit card')
  }
}
