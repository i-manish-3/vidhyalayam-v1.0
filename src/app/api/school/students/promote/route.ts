import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import { apiError, internalError, unauthorizedError, forbiddenError } from '@/lib/api-errors'
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

    if (user.role !== 'SUPER_ADMIN') {
      const authorized = await requirePermission(request, 'admission:update')
      if (!authorized) return forbiddenError("You don't have permission to promote students.")
    }

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
    const carryForwardTransport = body.carryForwardTransport !== false

    if (!studentIds.length) {
      return apiError(400, 'Please select at least one student to promote.')
    }
    if (!fromAcademicYear || !toAcademicYear) {
      return apiError(400, 'Please select valid active sessions before promoting.')
    }
    if (promotionType === 'class' && !toClassId) {
      return apiError(400, 'Please select the class students will be promoted to.')
    }
    if (promotionType === 'class' && !feesGroupId) {
      return apiError(400, 'Please select a fee group for the new session.')
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

    if (promotionType === 'class') {
      const feeStructure = await db.feesStructure.findFirst({
        where: {
          schoolId: user.schoolId,
          classId: toClassId,
          feesGroupId: feesGroupId!,
          academicYear: toAcademicYear!,
          isActive: true,
          status: 'active',
          deletedAt: null,
          OR: [{ sectionId: toSectionId || null }, { sectionId: null }],
        },
        select: { id: true },
      })
      if (!feeStructure) {
        return apiError(
          400,
          `No active fee structure exists for "${feesGroup?.name}" in ${toAcademicYear} for this class. Please configure one in Fees > Structures.`
        )
      }
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

    // Pre-load transport plan: for each student with an active transport
    // allocation in fromAcademicYear, decide whether toAcademicYear has a
    // matching (route, stop) StopFare. fareAmount is always read from the
    // target year's StopFare — never copied from the old allocation, so any
    // fare increase flows through automatically.
    const transportPlan = new Map<string, {
      sourceAllocationId: string
      routeId: string
      stopName: string | null
      pickupPoint: string | null
      dropPoint: string | null
      newFare: number | null
      newFeeMonths: string | null
      stopFareExists: boolean
      reason?: string
    }>()
    const transportWarnings: string[] = []
    let transportCarriedCount = 0

    if (promotionType === 'class' && carryForwardTransport && toAcademicYear) {
      const fromAllocations = await db.transportAllocation.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: { in: studentIds },
          academicYear: fromAcademicYear,
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      })

      // De-dup: keep the most recent allocation per student
      const latestByStudent = new Map<string, typeof fromAllocations[number]>()
      for (const alloc of fromAllocations) {
        if (!latestByStudent.has(alloc.studentId)) {
          latestByStudent.set(alloc.studentId, alloc)
        }
      }

      // Pre-check: any students already have a transport allocation in target year?
      const existingTargetAllocs = await db.transportAllocation.findMany({
        where: {
          schoolId: user.schoolId,
          studentId: { in: Array.from(latestByStudent.keys()) },
          academicYear: toAcademicYear,
          isActive: true,
        },
        select: { studentId: true },
      })
      const alreadyAllocatedStudents = new Set(existingTargetAllocs.map((a) => a.studentId))

      // Resolve StopFare for each (routeId, stopName) in target year
      const fareLookups = await Promise.all(
        Array.from(latestByStudent.values()).map(async (alloc) => {
          if (!alloc.stopName) {
            return { studentId: alloc.studentId, alloc, stopFare: null, reason: 'no-stop-name' as const }
          }
          const stopFare = await db.transportStopFare.findFirst({
            where: {
              schoolId: user.schoolId!,
              routeId: alloc.routeId,
              academicYear: toAcademicYear,
              stopName: alloc.stopName,
              isActive: true,
            },
            select: { fare: true, feeMonths: true },
          })
          return { studentId: alloc.studentId, alloc, stopFare, reason: undefined }
        })
      )

      const studentNameById = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim()]))

      for (const entry of fareLookups) {
        const { studentId, alloc, stopFare, reason } = entry
        const name = studentNameById.get(studentId) || 'Student'

        if (alreadyAllocatedStudents.has(studentId)) {
          transportWarnings.push(`${name}: already has a transport allocation in ${toAcademicYear} — skipped to avoid overwrite.`)
          transportPlan.set(studentId, {
            sourceAllocationId: alloc.id,
            routeId: alloc.routeId,
            stopName: alloc.stopName,
            pickupPoint: alloc.pickupPoint,
            dropPoint: alloc.dropPoint,
            newFare: null,
            newFeeMonths: null,
            stopFareExists: !!stopFare,
            reason: 'already-allocated',
          })
          continue
        }

        if (reason === 'no-stop-name' || !stopFare) {
          transportWarnings.push(
            `${name}: transport could not be carried forward (no matching stop fare for ${toAcademicYear}). Please allocate manually.`
          )
          transportPlan.set(studentId, {
            sourceAllocationId: alloc.id,
            routeId: alloc.routeId,
            stopName: alloc.stopName,
            pickupPoint: alloc.pickupPoint,
            dropPoint: alloc.dropPoint,
            newFare: null,
            newFeeMonths: null,
            stopFareExists: false,
            reason: 'stop-fare-missing',
          })
          continue
        }

        transportPlan.set(studentId, {
          sourceAllocationId: alloc.id,
          routeId: alloc.routeId,
          stopName: alloc.stopName,
          pickupPoint: alloc.pickupPoint,
          dropPoint: alloc.dropPoint,
          newFare: stopFare.fare,
          newFeeMonths: stopFare.feeMonths,
          stopFareExists: true,
        })
      }
    }

    const result = await db.$transaction(async (tx) => {
      let feeAssignmentsCreated = 0
      let transportCarried = 0

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

        const plan = transportPlan.get(student.id)
        if (plan && plan.stopFareExists && plan.newFare !== null && plan.reason !== 'already-allocated') {
          await tx.transportAllocation.create({
            data: {
              schoolId: user.schoolId!,
              studentId: student.id,
              routeId: plan.routeId,
              academicYear: toAcademicYear,
              pickupPoint: plan.pickupPoint,
              dropPoint: plan.dropPoint,
              stopName: plan.stopName,
              fareAmount: plan.newFare,
              feeMonths: plan.newFeeMonths ?? '[]',
              isActive: true,
            },
          })
          transportCarried += 1
        }

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentAcademicEnrollment',
            entityId: enrollment.id,
            action: 'created',
            studentId: student.id,
            userId: user.userId,
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

      return { promotedCount: students.length, feeAssignmentsCreated, transportCarried }
    })

    transportCarriedCount = result.transportCarried

    const dueTotal = Array.from(duesByStudent.values()).reduce((sum, due) => sum + due, 0)

    const transportEligibleCount = transportPlan.size
    const transportSummary = promotionType === 'class' && carryForwardTransport
      ? {
          eligibleCount: transportEligibleCount,
          carriedCount: transportCarriedCount,
          warnings: transportWarnings,
        }
      : null

    let promotionMessage: string
    if (promotionType === 'alumni') {
      promotionMessage = `${result.promotedCount} student(s) moved to alumni. Previous dues remain payable.`
    } else {
      const base = `${result.promotedCount} student(s) promoted to ${toClass?.name || 'selected class'}. Previous dues remain payable.`
      if (transportSummary && transportSummary.eligibleCount > 0) {
        const skipped = transportSummary.eligibleCount - transportSummary.carriedCount
        const transportLine = skipped > 0
          ? ` Transport: ${transportSummary.carriedCount} carried forward, ${skipped} need manual allocation.`
          : ` Transport: ${transportSummary.carriedCount} carried forward.`
        promotionMessage = base + transportLine
      } else {
        promotionMessage = base
      }
    }

    return NextResponse.json({
      ...result,
      promotionType,
      fromAcademicYear,
      toAcademicYear,
      dueTotal,
      transport: transportSummary,
      message: promotionMessage,
    }, { status: 201 })
  } catch (error) {
    console.error('Bulk promote students error:', error)
    return internalError('promoting students')
  }
}
