import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, requirePermission } from '@/lib/api-auth'
import {
  apiError,
  forbiddenError,
  internalError,
  notFoundError,
  unauthorizedError,
} from '@/lib/api-errors'
import { assignStudentFeesFromStructure } from '@/lib/fees'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // SUPER_ADMIN is intentionally excluded — only SCHOOL_ADMIN (or delegated users via permission) can change fee groups.
    const user = requireRole(request, ['SCHOOL_ADMIN', 'TEACHER', 'STAFF'])
    if (!user || !user.schoolId) {
      return unauthorizedError()
    }

    if (user.role !== 'SCHOOL_ADMIN') {
      const authorized = await requirePermission(request, 'fees:change-group')
      if (!authorized) {
        return forbiddenError("You don't have permission to change fee groups. Contact your school administrator.")
      }
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const newFeesGroupId = typeof body.newFeesGroupId === 'string' ? body.newFeesGroupId.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!newFeesGroupId) {
      return apiError(400, 'Please select the new fee group.')
    }

    const assignment = await db.studentFeeAssignment.findFirst({
      where: { id, schoolId: user.schoolId, deletedAt: null },
      include: {
        invoices: { where: { deletedAt: null }, select: { id: true } },
        feesGroup: { select: { id: true, name: true } },
        student: {
          select: { id: true, firstName: true, lastName: true, admissionNumber: true },
        },
      },
    })

    if (!assignment) {
      return notFoundError('StudentFeeAssignment')
    }

    if (assignment.feesGroupId === newFeesGroupId) {
      return apiError(400, 'This student is already on the selected fee group.')
    }

    // Validate target fees group belongs to school and is active
    const targetGroup = await db.feesGroup.findFirst({
      where: {
        id: newFeesGroupId,
        schoolId: user.schoolId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true, name: true },
    })
    if (!targetGroup) {
      return apiError(400, "The selected fee group doesn't exist or is inactive. Please refresh and try again.")
    }

    // Zero-payment guard
    const invoiceIds = assignment.invoices.map((invoice) => invoice.id)
    if (invoiceIds.length > 0) {
      const paidAgg = await db.feeCollection.aggregate({
        where: {
          studentFeeInvoiceId: { in: invoiceIds },
          deletedAt: null,
        },
        _sum: { paidAmount: true },
      })
      const paidTotal = paidAgg._sum.paidAmount || 0
      if (paidTotal > 0) {
        return apiError(
          400,
          'This student has already paid against this fee group. Group change for partially-paid students is not supported yet.'
        )
      }
    }

    // Resolve target fee structure (prefer section-specific, else class-level)
    const candidateStructures = await db.feesStructure.findMany({
      where: {
        schoolId: user.schoolId,
        classId: assignment.classId,
        feesGroupId: newFeesGroupId,
        academicYear: assignment.academicYear,
        isActive: true,
        status: 'active',
        deletedAt: null,
        OR: [{ sectionId: assignment.sectionId || null }, { sectionId: null }],
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, sectionId: true },
    })

    const targetStructure =
      candidateStructures.find((structure) => structure.sectionId === (assignment.sectionId || null)) ||
      candidateStructures[0]

    if (!targetStructure) {
      return apiError(
        400,
        `No active fee structure exists for "${targetGroup.name}" in ${assignment.academicYear} for this class. Please create one before changing the group.`
      )
    }

    // Guard against unique-constraint collision (studentId, feeStructureId, academicYear)
    const existingTarget = await db.studentFeeAssignment.findFirst({
      where: {
        studentId: assignment.studentId,
        feeStructureId: targetStructure.id,
        academicYear: assignment.academicYear,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (existingTarget) {
      return apiError(
        400,
        'A fee assignment for this student already exists with the selected group. Please refresh the page.'
      )
    }

    let result
    try {
      result = await db.$transaction(async (tx) => {
        const now = new Date()

        if (invoiceIds.length > 0) {
          await tx.feeCollection.updateMany({
            where: {
              studentFeeInvoiceId: { in: invoiceIds },
              schoolId: user.schoolId!,
              deletedAt: null,
            },
            data: { paymentStatus: 'cancelled', deletedAt: now },
          })

          await tx.studentFeeInvoiceLine.updateMany({
            where: { invoiceId: { in: invoiceIds } },
            data: { status: 'cancelled' },
          })

          await tx.studentFeeInvoice.updateMany({
            where: { id: { in: invoiceIds } },
            data: {
              status: 'cancelled',
              lockedAt: now,
              lockedBy: user.userId,
              deletedAt: now,
            },
          })
        }

        await tx.studentFeeLedgerEntry.updateMany({
          where: {
            assignmentId: assignment.id,
            schoolId: user.schoolId!,
            entryType: 'DEBIT',
            deletedAt: null,
          },
          data: { status: 'cancelled', balanceAmount: 0 },
        })

        await tx.studentFeeAssignmentItem.updateMany({
          where: { assignmentId: assignment.id },
          data: { status: 'cancelled' },
        })

        await tx.studentFeeAssignment.update({
          where: { id: assignment.id },
          data: {
            status: 'closed',
            effectiveTo: now,
            deletedAt: now,
          },
        })

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentFeeAssignment',
            entityId: assignment.id,
            action: 'cancelled_for_group_change',
            oldValue: JSON.stringify({
              feesGroupId: assignment.feesGroupId,
              feesGroupName: assignment.feesGroup?.name || null,
              feeStructureId: assignment.feeStructureId,
            }),
            newValue: JSON.stringify({
              targetFeesGroupId: newFeesGroupId,
              targetFeesGroupName: targetGroup.name,
              reason: reason || null,
            }),
            changedBy: user.userId,
          },
        })

        const newAssignment = await assignStudentFeesFromStructure({
          tx,
          schoolId: user.schoolId!,
          studentId: assignment.studentId,
          classId: assignment.classId,
          sectionId: assignment.sectionId,
          feesGroupId: newFeesGroupId,
          academicYear: assignment.academicYear,
          assignedBy: user.userId,
          source: 'group-change',
          effectiveFrom: now,
        })

        if (!newAssignment) {
          throw new Error('FEE_STRUCTURE_NOT_FOUND')
        }

        await tx.feeAuditLog.create({
          data: {
            schoolId: user.schoolId!,
            entityType: 'StudentFeeAssignment',
            entityId: newAssignment.id,
            action: 'created_via_group_change',
            oldValue: JSON.stringify({ previousAssignmentId: assignment.id }),
            newValue: JSON.stringify({
              feesGroupId: newFeesGroupId,
              feesGroupName: targetGroup.name,
            }),
            changedBy: user.userId,
          },
        })

        return newAssignment
      })
    } catch (txError) {
      if (txError instanceof Error && txError.message === 'FEE_STRUCTURE_NOT_FOUND') {
        return apiError(
          400,
          `No active fee structure exists for "${targetGroup.name}" in ${assignment.academicYear}. Please create one and try again.`
        )
      }
      throw txError
    }

    return NextResponse.json({
      assignment: result,
      message: `Fee group changed to "${targetGroup.name}".`,
    })
  } catch (error) {
    console.error('Change fee group error:', error)
    return internalError('changing the fee group')
  }
}
