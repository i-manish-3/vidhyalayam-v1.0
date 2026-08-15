import { db } from '@/lib/db'
import { assignStudentFeesFromStructure } from '@/lib/fees'

export type ChangeGroupErrorCode =
  | 'not_found'
  | 'invalid_target'
  | 'already_on_group'
  | 'has_payments'
  | 'no_structure'
  | 'already_has_target'

export class ChangeGroupError extends Error {
  constructor(
    public readonly code: ChangeGroupErrorCode,
    message: string,
    public readonly student?: { id: string; name: string } | null,
  ) {
    super(message)
    this.name = 'ChangeGroupError'
  }
}

export type ChangeGroupResult = {
  assignmentId: string
  studentId: string
  studentName: string
}

// Moves one zero-paid fee assignment onto a different fee group: cancels the
// old demand tree (invoices, ledgers, items), then rebuilds it via the shared
// assignStudentFeesFromStructure helper with the new group, so the result is
// byte-for-byte what an original assignment to that group would have produced.
//
// Scoped to schoolId at every query, so assignments from other schools can
// never be touched. Throws ChangeGroupError for expected business-rule
// failures so a caller can map them to HTTP responses (single) or per-student
// results (bulk).
export async function changeFeeGroupForAssignment(input: {
  assignmentId: string
  newFeesGroupId: string
  schoolId: string
  assignedBy: string
  reason: string
}): Promise<ChangeGroupResult> {
  const { assignmentId, newFeesGroupId, schoolId, assignedBy, reason } = input

  if (!newFeesGroupId) {
    throw new ChangeGroupError('invalid_target', 'Please select the new fee group.')
  }

  const assignment = await db.studentFeeAssignment.findFirst({
    where: { id: assignmentId, schoolId, deletedAt: null },
    include: {
      invoices: { where: { deletedAt: null }, select: { id: true } },
      feesGroup: { select: { id: true, name: true } },
      student: {
        select: { id: true, firstName: true, lastName: true, admissionNumber: true },
      },
    },
  })

  if (!assignment) {
    throw new ChangeGroupError('not_found', 'Student fee assignment not found.')
  }

  const studentName = `${assignment.student?.firstName || ''} ${assignment.student?.lastName || ''}`.trim()
  const studentRef = { id: assignment.studentId, name: studentName }

  if (assignment.feesGroupId === newFeesGroupId) {
    throw new ChangeGroupError('already_on_group', 'This student is already on the selected fee group.', studentRef)
  }

  // Validate target fees group belongs to school and is active
  const targetGroup = await db.feesGroup.findFirst({
    where: {
      id: newFeesGroupId,
      schoolId,
      deletedAt: null,
      isActive: true,
    },
    select: { id: true, name: true },
  })
  if (!targetGroup) {
    throw new ChangeGroupError(
      'invalid_target',
      "The selected fee group doesn't exist or is inactive. Please refresh and try again.",
      studentRef,
    )
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
      throw new ChangeGroupError(
        'has_payments',
        'This student has already paid against this fee group. Group change for partially-paid students is not supported yet.',
        studentRef,
      )
    }
  }

  // Resolve target fee structure (prefer section-specific, else class-level)
  const candidateStructures = await db.feesStructure.findMany({
    where: {
      schoolId,
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
    throw new ChangeGroupError(
      'no_structure',
      `No active fee structure exists for "${targetGroup.name}" in ${assignment.academicYear} for this class. Please create one before changing the group.`,
      studentRef,
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
    throw new ChangeGroupError(
      'already_has_target',
      'A fee assignment for this student already exists with the selected group. Please refresh the page.',
      studentRef,
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
            schoolId,
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
            lockedBy: assignedBy,
            deletedAt: now,
          },
        })
      }

      await tx.studentFeeLedgerEntry.updateMany({
        where: {
          assignmentId: assignment.id,
          schoolId,
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
          schoolId,
          entityType: 'StudentFeeAssignment',
          entityId: assignment.id,
          action: 'cancelled_for_group_change',
          studentId: assignment.studentId,
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
          userId: assignedBy,
        },
      })

      const newAssignment = await assignStudentFeesFromStructure({
        tx,
        schoolId,
        studentId: assignment.studentId,
        classId: assignment.classId,
        sectionId: assignment.sectionId,
        feesGroupId: newFeesGroupId,
        academicYear: assignment.academicYear,
        assignedBy,
        source: 'group-change',
        effectiveFrom: now,
      })

      if (!newAssignment) {
        throw new Error('FEE_STRUCTURE_NOT_FOUND')
      }

      await tx.feeAuditLog.create({
        data: {
          schoolId,
          entityType: 'StudentFeeAssignment',
          entityId: newAssignment.id,
          action: 'created_via_group_change',
          studentId: assignment.studentId,
          oldValue: JSON.stringify({ previousAssignmentId: assignment.id }),
          newValue: JSON.stringify({
            feesGroupId: newFeesGroupId,
            feesGroupName: targetGroup.name,
          }),
          userId: assignedBy,
        },
      })

      return newAssignment
    })
  } catch (txError) {
    if (txError instanceof Error && txError.message === 'FEE_STRUCTURE_NOT_FOUND') {
      throw new ChangeGroupError(
        'no_structure',
        `No active fee structure exists for "${targetGroup.name}" in ${assignment.academicYear}. Please create one and try again.`,
        studentRef,
      )
    }
    throw txError
  }

  return {
    assignmentId: result.id,
    studentId: assignment.studentId,
    studentName,
  }
}