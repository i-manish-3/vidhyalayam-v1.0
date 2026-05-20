import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError } from '@/lib/api-errors'
import { assignStudentFeesFromStructure } from '@/lib/fees'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveActiveAcademicYear(schoolId: string, value: unknown) {
  const academicYear = typeof value === 'string' ? value.trim() : ''
  if (!ACADEMIC_YEAR_PATTERN.test(academicYear)) return null

  const exists = await db.academicYear.findFirst({
    where: { schoolId, name: academicYear, isActive: true, deletedAt: null },
    select: { id: true },
  })
  return exists ? academicYear : null
}

async function getStudentOutstanding(schoolId: string, studentId: string, academicYear?: string) {
  const result = await db.studentFeeLedgerEntry.aggregate({
    where: {
      schoolId,
      studentId,
      entryType: 'DEBIT',
      deletedAt: null,
      status: { in: ['open', 'partial'] },
      balanceAmount: { gt: 0 },
      ...(academicYear ? { academicYear } : {}),
    },
    _sum: { balanceAmount: true },
  })
  return result._sum.balanceAmount || 0
}

export async function POST(request: NextRequest) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    const body = await request.json()
    const studentIds = Array.isArray(body.studentIds)
      ? body.studentIds.filter((id: unknown): id is string => typeof id === 'string' && !!id.trim())
      : []
    const promotionType = body.promotionType === 'alumni' ? 'alumni' : 'class'
    const fromAcademicYear = await resolveActiveAcademicYear(user.schoolId, body.fromAcademicYear)
    const toAcademicYear = promotionType === 'class'
      ? await resolveActiveAcademicYear(user.schoolId, body.toAcademicYear)
      : fromAcademicYear
    const toClassId = typeof body.toClassId === 'string' ? body.toClassId.trim() : ''
    const toSectionId = typeof body.toSectionId === 'string' && body.toSectionId.trim() ? body.toSectionId.trim() : null
    const feesGroupId = typeof body.feesGroupId === 'string' && body.feesGroupId.trim() ? body.feesGroupId.trim() : null
    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date()
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : ''

    if (!studentIds.length) {
      return apiError(400, 'Please select at least one student to promote.')
    }
    if (!fromAcademicYear || !toAcademicYear) {
      return apiError(400, 'Please select valid active sessions before promoting.')
    }
    if (promotionType === 'class' && !toClassId) {
      return apiError(400, 'Please select the class students will be promoted to.')
    }
    if (promotionType === 'class' && fromAcademicYear === toAcademicYear) {
      return apiError(400, 'Promote-to session cannot be the same as the current session. Please select a different session.')
    }
    if (Number.isNaN(effectiveFrom.getTime())) {
      return apiError(400, 'Please select a valid promotion date.')
    }

    const [toClass, toSection, feesGroup] = await Promise.all([
      promotionType === 'class'
        ? db.class.findFirst({ where: { id: toClassId, schoolId: user.schoolId, deletedAt: null, isActive: true }, select: { id: true, name: true } })
        : Promise.resolve(null),
      promotionType === 'class' && toSectionId
        ? db.section.findFirst({ where: { id: toSectionId, schoolId: user.schoolId, classId: toClassId, deletedAt: null, isActive: true }, select: { id: true, name: true } })
        : Promise.resolve(null),
      promotionType === 'class' && feesGroupId
        ? db.feesGroup.findFirst({ where: { id: feesGroupId, schoolId: user.schoolId, deletedAt: null, isActive: true }, select: { id: true, name: true } })
        : Promise.resolve(null),
    ])

    if (promotionType === 'class' && !toClass) {
      return apiError(400, "The target class doesn't exist anymore. Please refresh and try again.")
    }
    if (toSectionId && !toSection) {
      return apiError(400, "The target section doesn't exist for this class. Please refresh and try again.")
    }
    if (feesGroupId && !feesGroup) {
      return apiError(400, "The selected fees group doesn't exist anymore. Please refresh and try again.")
    }

    const students = await db.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: user.schoolId,
        deletedAt: null,
      },
      include: {
        admission: { select: { id: true, academicYear: true, classId: true, sectionId: true } },
        academicEnrollments: {
          where: { academicYear: fromAcademicYear, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (students.length !== studentIds.length) {
      return apiError(400, 'Some selected students were not found. Please refresh and select again.')
    }

    const alreadyTargetEnrollment = promotionType === 'class'
      ? await db.studentAcademicEnrollment.findMany({
          where: { studentId: { in: studentIds }, academicYear: toAcademicYear, deletedAt: null },
          select: { studentId: true },
        })
      : []
    if (alreadyTargetEnrollment.length > 0) {
      return apiError(400, `${alreadyTargetEnrollment.length} selected student(s) already have enrollment in ${toAcademicYear}. Remove them and try again.`)
    }

    const duesByStudent = new Map<string, number>()
    await Promise.all(students.map(async (student) => {
      duesByStudent.set(student.id, await getStudentOutstanding(user.schoolId!, student.id, fromAcademicYear))
    }))

    const result = await db.$transaction(async (tx) => {
      let feeAssignmentsCreated = 0

      for (const student of students) {
        const previousEnrollment = student.academicEnrollments[0] || (student.classId
          ? await tx.studentAcademicEnrollment.create({
              data: {
                schoolId: user.schoolId!,
                studentId: student.id,
                academicYear: fromAcademicYear,
                classId: student.classId,
                sectionId: student.sectionId,
                rollNumber: student.rollNumber,
                status: 'active',
                source: 'admission',
                effectiveFrom: student.admissionDate || student.createdAt,
                createdBy: user.userId,
              },
            })
          : null)
        const due = duesByStudent.get(student.id) || 0

        if (previousEnrollment) {
          await tx.studentAcademicEnrollment.update({
            where: { id: previousEnrollment.id },
            data: {
              status: promotionType === 'alumni' ? 'alumni' : 'promoted',
              effectiveTo: effectiveFrom,
              remarks: due > 0
                ? `${promotionType === 'alumni' ? 'Moved to alumni' : 'Promoted'} with pending dues ${due.toFixed(2)} from ${fromAcademicYear}.`
                : previousEnrollment.remarks,
            },
          })
        }

        if (promotionType === 'alumni') {
          await tx.student.update({
            where: { id: student.id },
            data: { admissionStatus: 'alumni', isActive: false },
          })
          if (student.admission?.id) {
            await tx.admission.update({
              where: { id: student.admission.id },
              data: { status: 'withdrawn' },
            })
          }
          continue
        }

        const enrollment = await tx.studentAcademicEnrollment.create({
          data: {
            schoolId: user.schoolId!,
            studentId: student.id,
            academicYear: toAcademicYear,
            classId: toClassId,
            sectionId: toSectionId,
            rollNumber: student.rollNumber,
            status: 'active',
            source: 'promotion',
            effectiveFrom,
            promotedFromId: previousEnrollment?.id || null,
            remarks: remarks || (due > 0 ? `Previous session dues carried forward: ${due.toFixed(2)}.` : null),
            createdBy: user.userId,
          },
        })

        await tx.student.update({
          where: { id: student.id },
          data: {
            classId: toClassId,
            sectionId: toSectionId,
            admissionStatus: 'promoted',
            isActive: true,
          },
        })

        if (student.admission?.id) {
          await tx.admission.update({
            where: { id: student.admission.id },
            data: {
              academicYear: toAcademicYear,
              classId: toClassId,
              sectionId: toSectionId,
              status: 'admitted',
            },
          })
        }

        if (feesGroupId) {
          const assignment = await assignStudentFeesFromStructure({
            tx,
            schoolId: user.schoolId!,
            studentId: student.id,
            classId: toClassId,
            sectionId: toSectionId,
            feesGroupId,
            academicYear: toAcademicYear,
            assignedBy: user.userId,
            source: 'promotion',
            effectiveFrom,
          })
          if (assignment && 'feeStructureId' in assignment) feeAssignmentsCreated += 1
        }

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentAcademicEnrollment',
            entityId: enrollment.id,
            action: 'created',
            changedBy: user.userId,
            newValue: JSON.stringify({
              studentId: student.id,
              fromAcademicYear,
              toAcademicYear,
              toClassId,
              toSectionId,
              previousDue: due,
              source: 'bulk-promotion',
            }),
          },
        })
      }

      return { promotedCount: students.length, feeAssignmentsCreated }
    })

    const dueTotal = Array.from(duesByStudent.values()).reduce((sum, due) => sum + due, 0)

    return NextResponse.json({
      ...result,
      promotionType,
      fromAcademicYear,
      toAcademicYear,
      dueTotal,
      message: promotionType === 'alumni'
        ? `${result.promotedCount} student(s) moved to alumni. Previous dues remain payable.`
        : `${result.promotedCount} student(s) promoted to ${toClass?.name || 'selected class'}. Previous dues remain payable.`,
    }, { status: 201 })
  } catch (error) {
    console.error('Bulk promote students error:', error)
    return internalError('promoting students')
  }
}
