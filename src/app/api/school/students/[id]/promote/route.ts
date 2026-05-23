import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError, forbiddenError } from '@/lib/api-errors'
import { assignStudentFeesFromStructure } from '@/lib/fees'

const ACADEMIC_YEAR_PATTERN = /^\d{4}-\d{4}$/

async function resolveActiveAcademicYear(schoolId: string, value: string | null) {
  const academicYear = (value || '').trim()
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = requireRole(request, ['SCHOOL_ADMIN', 'STAFF'])
    if (!user?.schoolId) return unauthorizedError()

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:update')
      if (!authorized) return forbiddenError("You don't have permission to promote students.")
    }

    const { id } = await params
    const body = await request.json()
    const targetAcademicYear = await resolveActiveAcademicYear(user.schoolId, body.academicYear || null)
    const classId = typeof body.classId === 'string' ? body.classId.trim() : ''
    const sectionId = typeof body.sectionId === 'string' && body.sectionId.trim() ? body.sectionId.trim() : null
    const feesGroupId = typeof body.feesGroupId === 'string' && body.feesGroupId.trim() ? body.feesGroupId.trim() : null
    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date()
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : ''
    const carryForwardTransport = body.carryForwardTransport !== false

    if (!targetAcademicYear || !classId) {
      return apiError(400, 'Please select target academic year and class for promotion.')
    }
    if (!feesGroupId) {
      return apiError(400, 'Please select a fee group for the new session.')
    }
    if (Number.isNaN(effectiveFrom.getTime())) {
      return apiError(400, 'Please select a valid promotion date.')
    }

    const [student, classRecord, sectionRecord, feesGroup] = await Promise.all([
      db.student.findFirst({
        where: { id, schoolId: user.schoolId, deletedAt: null },
        include: {
          admission: { select: { id: true, academicYear: true, classId: true, sectionId: true } },
        },
      }),
      db.class.findFirst({
        where: { id: classId, schoolId: user.schoolId, deletedAt: null, isActive: true },
        select: { id: true, name: true },
      }),
      sectionId
        ? db.section.findFirst({
            where: { id: sectionId, schoolId: user.schoolId, classId, deletedAt: null, isActive: true },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      feesGroupId
        ? db.feesGroup.findFirst({
            where: { id: feesGroupId, schoolId: user.schoolId, deletedAt: null, isActive: true },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ])

    if (!student) return apiError(404, 'Student not found.')
    if (!classRecord) return apiError(400, "The target class doesn't exist anymore. Please refresh and try again.")
    if (sectionId && !sectionRecord) return apiError(400, "The target section doesn't exist for this class. Please refresh and try again.")
    if (!feesGroup) return apiError(400, "The selected fees group doesn't exist anymore. Please refresh and try again.")

    const feeStructure = await db.feesStructure.findFirst({
      where: {
        schoolId: user.schoolId,
        classId,
        feesGroupId: feesGroupId!,
        academicYear: targetAcademicYear,
        isActive: true,
        status: 'active',
        deletedAt: null,
        OR: [{ sectionId: sectionId || null }, { sectionId: null }],
      },
      select: { id: true },
    })
    if (!feeStructure) {
      return apiError(
        400,
        `No active fee structure exists for "${feesGroup.name}" in ${targetAcademicYear} for this class. Please configure one in Fees > Structures.`
      )
    }

    const existingTargetEnrollment = await db.studentAcademicEnrollment.findFirst({
      where: { studentId: id, academicYear: targetAcademicYear, deletedAt: null },
      select: { id: true },
    })
    if (existingTargetEnrollment) {
      return apiError(400, `This student already has an enrollment for ${targetAcademicYear}.`)
    }

    const previousAcademicYear = student.admission?.academicYear || null
    if (previousAcademicYear && previousAcademicYear === targetAcademicYear) {
      return apiError(400, 'Promote-to session cannot be the same as the current session. Please select a different session.')
    }
    const [previousSessionDue, totalOutstanding] = await Promise.all([
      previousAcademicYear ? getStudentOutstanding(user.schoolId, id, previousAcademicYear) : Promise.resolve(0),
      getStudentOutstanding(user.schoolId, id),
    ])

    // Pre-load transport plan for the source academic year. Fare is always read
    // from the target year's TransportStopFare so any fare increase flows
    // through automatically — never copied from the old allocation.
    let transportPlan: {
      sourceAllocationId: string
      routeId: string
      stopName: string | null
      pickupPoint: string | null
      dropPoint: string | null
      newFare: number
      newFeeMonths: string
    } | null = null
    let transportWarning: string | null = null
    let transportCarriedFlag = false

    if (carryForwardTransport && previousAcademicYear) {
      const existingTarget = await db.transportAllocation.findFirst({
        where: {
          schoolId: user.schoolId,
          studentId: id,
          academicYear: targetAcademicYear,
          isActive: true,
        },
        select: { id: true },
      })
      if (existingTarget) {
        transportWarning = `Transport allocation already exists for ${targetAcademicYear} — left untouched.`
      } else {
        const sourceAlloc = await db.transportAllocation.findFirst({
          where: {
            schoolId: user.schoolId,
            studentId: id,
            academicYear: previousAcademicYear,
            isActive: true,
          },
          orderBy: { updatedAt: 'desc' },
        })
        if (sourceAlloc) {
          if (!sourceAlloc.stopName) {
            transportWarning = `Source allocation has no stop name — transport could not be carried forward. Please allocate manually.`
          } else {
            const stopFare = await db.transportStopFare.findFirst({
              where: {
                schoolId: user.schoolId,
                routeId: sourceAlloc.routeId,
                academicYear: targetAcademicYear,
                stopName: sourceAlloc.stopName,
                isActive: true,
              },
              select: { fare: true, feeMonths: true },
            })
            if (!stopFare) {
              transportWarning = `No matching stop fare in ${targetAcademicYear} for "${sourceAlloc.stopName}". Please allocate manually.`
            } else {
              transportPlan = {
                sourceAllocationId: sourceAlloc.id,
                routeId: sourceAlloc.routeId,
                stopName: sourceAlloc.stopName,
                pickupPoint: sourceAlloc.pickupPoint,
                dropPoint: sourceAlloc.dropPoint,
                newFare: stopFare.fare,
                newFeeMonths: stopFare.feeMonths,
              }
            }
          }
        }
      }
    }

    const result = await db.$transaction(async (tx) => {
      let previousEnrollment = await tx.studentAcademicEnrollment.findFirst({
        where: {
          schoolId: user.schoolId!,
          studentId: id,
          academicYear: previousAcademicYear || undefined,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!previousEnrollment && previousAcademicYear && student.classId) {
        previousEnrollment = await tx.studentAcademicEnrollment.create({
          data: {
            schoolId: user.schoolId!,
            studentId: id,
            academicYear: previousAcademicYear,
            classId: student.classId,
            sectionId: student.sectionId,
            rollNumber: student.rollNumber,
            status: 'active',
            source: 'admission',
            effectiveFrom: student.admissionDate || student.createdAt,
            createdBy: user.userId,
          },
        })
      }

      if (previousEnrollment) {
        await tx.studentAcademicEnrollment.update({
          where: { id: previousEnrollment.id },
          data: {
            status: 'promoted',
            effectiveTo: effectiveFrom,
            remarks: previousSessionDue > 0
              ? `Promoted with pending dues ${previousSessionDue.toFixed(2)} from ${previousAcademicYear}.`
              : previousEnrollment.remarks,
          },
        })
      }

      const enrollment = await tx.studentAcademicEnrollment.create({
        data: {
          schoolId: user.schoolId!,
          studentId: id,
          academicYear: targetAcademicYear,
          classId,
          sectionId,
          rollNumber: student.rollNumber,
          status: 'active',
          source: 'promotion',
          effectiveFrom,
          promotedFromId: previousEnrollment?.id || null,
          remarks: remarks || (previousSessionDue > 0 ? `Previous session dues carried forward: ${previousSessionDue.toFixed(2)}.` : null),
          createdBy: user.userId,
        },
      })

      await tx.student.update({
        where: { id },
        data: {
          classId,
          sectionId,
          admissionStatus: 'promoted',
        },
      })

      const feeAssignment = feesGroupId
        ? await assignStudentFeesFromStructure({
            tx,
            schoolId: user.schoolId!,
            studentId: id,
            classId,
            sectionId,
            feesGroupId,
            academicYear: targetAcademicYear,
            assignedBy: user.userId,
            source: 'promotion',
            effectiveFrom,
          })
        : null

      let transportAllocation: Awaited<ReturnType<typeof tx.transportAllocation.create>> | null = null
      if (transportPlan) {
        transportAllocation = await tx.transportAllocation.create({
          data: {
            schoolId: user.schoolId!,
            studentId: id,
            routeId: transportPlan.routeId,
            academicYear: targetAcademicYear,
            pickupPoint: transportPlan.pickupPoint,
            dropPoint: transportPlan.dropPoint,
            stopName: transportPlan.stopName,
            fareAmount: transportPlan.newFare,
            feeMonths: transportPlan.newFeeMonths ?? '[]',
            isActive: true,
          },
        })
      }

      return { enrollment, feeAssignment, transportAllocation }
    })

    transportCarriedFlag = !!result.transportAllocation

    const transportSummary = carryForwardTransport
      ? {
          carried: transportCarriedFlag,
          warning: transportWarning,
          newFare: result.transportAllocation?.fareAmount ?? null,
        }
      : null

    const dueLine = previousSessionDue > 0
      ? `Student promoted. Previous dues of ${previousSessionDue.toFixed(2)} remain payable separately.`
      : 'Student promoted successfully.'
    const transportLine = transportCarriedFlag
      ? ` Transport carried forward at ₹${result.transportAllocation?.fareAmount?.toFixed(2)} for ${targetAcademicYear}.`
      : transportWarning
        ? ` Transport: ${transportWarning}`
        : ''

    return NextResponse.json({
      ...result,
      previousAcademicYear,
      targetAcademicYear,
      previousSessionDue,
      totalOutstanding,
      transport: transportSummary,
      message: dueLine + transportLine,
    }, { status: 201 })
  } catch (error) {
    console.error('Promote student error:', error)
    return internalError('promoting the student')
  }
}
