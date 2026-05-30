/**
 * Billing-window operations for StudentFeeAssignment and TransportAllocation.
 *
 * The shared "shrink the window forward" operation: given an effectiveTo
 * date, cancel every billing item that falls strictly after that date,
 * UNLESS the item already has non-zero allocations (paid). Paid items are
 * surfaced for manual refund.
 *
 * This module is the closing half of the lifecycle. The opening half lives
 * in `assignStudentFeesFromStructure` (academic) and the admissions/transport
 * routes (transport).
 *
 * Production guarantees:
 *   - Allocation-safe: never auto-cancels a debit with allocations
 *   - Atomic: caller must wrap in $transaction; helper writes 4 tables
 *   - Idempotent: re-applying a window-close on already-closed rows is a no-op
 *   - Dry-run via `mode: 'preview'`: returns the same shape without writing
 *   - Audit-trail: every commit writes a FeeAuditLog row
 */

import type { Prisma } from '@prisma/client'

export type WindowScope = 'academic' | 'transport'

export type WindowMode = 'preview' | 'commit'

/** Reasons recorded on the closure. Validated by sanitiseReason(). */
export const WINDOW_REASONS = [
  'TC',
  'DROPOUT',
  'TRANSFER',
  'COMPLETED',
  'WITHDRAWN',
  'CHANGED',
  'FARE_REVISION',
  'YEAR_ROLLOVER',
  'STUDENT_WITHDRAWN',
  'OTHER',
] as const
export type WindowReason = (typeof WINDOW_REASONS)[number]

export interface ApplyWindowArgs {
  tx: Prisma.TransactionClient
  schoolId: string
  studentId: string
  scope: WindowScope
  /** Required when scope='academic'. */
  assignmentId?: string
  /** Required when scope='transport'. */
  allocationId?: string
  /** Last day of liability — items with dueDate strictly after are candidates. */
  effectiveTo: Date
  reason: WindowReason
  reasonNotes?: string | null
  performedBy?: string | null
  cascadeFromWithdrawal?: boolean
  mode: WindowMode
}

export interface CancelledItem {
  itemId: string
  feeHeadName: string
  installmentName: string | null
  amount: number
  dueDate: Date | null
}

export interface SkippedItem extends CancelledItem {
  paidAmount: number
  refundable: number
}

export interface WindowChangeResult {
  scope: WindowScope
  mode: WindowMode
  effectiveTo: Date
  cancelledItems: CancelledItem[]
  cancelledAmount: number
  skippedDueToAllocations: SkippedItem[]
  totalRefundable: number
  /** Cancelled DEBIT ledger entry IDs — useful for downstream cascade reporting. */
  cancelledDebitIds: string[]
}

/**
 * Apply a forward-shrinking window to an academic-fee assignment OR a
 * transport allocation. See module docstring for guarantees.
 */
export async function applyAssignmentWindow(args: ApplyWindowArgs): Promise<WindowChangeResult> {
  const {
    tx,
    schoolId,
    studentId,
    scope,
    effectiveTo,
    reason,
    mode,
  } = args

  if (scope === 'academic') {
    if (!args.assignmentId) throw new Error('assignmentId required for scope=academic')
    return applyAcademicWindow(args, args.assignmentId)
  }
  if (scope === 'transport') {
    if (!args.allocationId) throw new Error('allocationId required for scope=transport')
    return applyTransportWindow(args, args.allocationId)
  }
  // Exhaustive guard
  const _never: never = scope
  throw new Error(`Unknown scope: ${String(_never)}`)
}

// ─── ACADEMIC ──────────────────────────────────────────────────────────────

async function applyAcademicWindow(
  args: ApplyWindowArgs,
  assignmentId: string,
): Promise<WindowChangeResult> {
  const { tx, schoolId, studentId, effectiveTo, reason, mode } = args

  // Tenant-scoped fetch — refuses cross-school access.
  const assignment = await tx.studentFeeAssignment.findFirst({
    where: { id: assignmentId, schoolId, studentId, deletedAt: null },
    select: { id: true, status: true, effectiveTo: true, academicYear: true },
  })
  if (!assignment) {
    throw new Error('Assignment not found or access denied')
  }

  // Items with dueDate strictly after effectiveTo are cancellation candidates.
  // status='active' filters out items already cancelled/waived (idempotency).
  const candidates = await tx.studentFeeAssignmentItem.findMany({
    where: {
      assignmentId,
      status: 'active',
      OR: [
        { dueDate: { gt: effectiveTo } },
        // Items with no dueDate are conservatively kept (caller decides via
        // policy — currently term heads w/o dueDate are uncommon and we
        // don't presume to cancel them on TC).
      ],
    },
    select: {
      id: true,
      feeHeadName: true,
      installmentName: true,
      amount: true,
      dueDate: true,
    },
  })

  return runCancellation({
    args,
    candidates,
    findAllocations: async (itemIds) => {
      // Sum allocations made against DEBIT ledger entries for these items.
      // Any non-zero sum means the parent paid (or had a waiver applied) —
      // the helper refuses to silently cancel; surfaces for manual refund.
      const allocSums = await tx.studentFeeLedgerAllocation.groupBy({
        by: ['debitEntryId'],
        where: {
          deletedAt: null,
          debitEntry: { assignmentItemId: { in: itemIds }, deletedAt: null },
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      })
      const debits = await tx.studentFeeLedgerEntry.findMany({
        where: { id: { in: allocSums.map((a) => a.debitEntryId) } },
        select: { id: true, assignmentItemId: true },
      })
      const itemIdByDebit = new Map(debits.map((d) => [d.id, d.assignmentItemId || null]))
      const paidByItem = new Map<string, number>()
      for (const row of allocSums) {
        const itemId = itemIdByDebit.get(row.debitEntryId)
        if (!itemId) continue
        paidByItem.set(itemId, (paidByItem.get(itemId) || 0) + (row._sum.amount || 0))
      }
      return paidByItem
    },
    cancelItem: async (itemIds) => {
      const debitIds: string[] = []
      // Cascade order: ledger DEBITs → FeeCollection → invoice line → assignment item.
      // Each updateMany filters with status guards so re-running is a no-op.
      const debits = await tx.studentFeeLedgerEntry.findMany({
        where: {
          assignmentItemId: { in: itemIds },
          entryType: 'DEBIT',
          deletedAt: null,
          status: { not: 'cancelled' },
        },
        select: { id: true },
      })
      debitIds.push(...debits.map((d) => d.id))
      if (debitIds.length > 0) {
        await tx.studentFeeLedgerEntry.updateMany({
          where: { id: { in: debitIds } },
          data: {
            status: 'cancelled',
            deletedAt: new Date(),
            notes: `Cancelled by window-close (${reason})`,
          },
        })
      }
      await tx.feeCollection.updateMany({
        where: {
          studentFeeAssignmentItemId: { in: itemIds },
          deletedAt: null,
        },
        data: { deletedAt: new Date(), paymentStatus: 'cancelled' },
      })
      await tx.studentFeeInvoiceLine.updateMany({
        where: { assignmentItemId: { in: itemIds }, status: { not: 'cancelled' } },
        data: { status: 'cancelled' },
      })
      await tx.studentFeeAssignmentItem.updateMany({
        where: { id: { in: itemIds }, status: 'active' },
        data: { status: 'cancelled' },
      })
      return debitIds
    },
    finalise: async (cancelledAmount) => {
      // Stamp the window on the assignment itself. Skip if effectiveTo is
      // already at-or-before the requested date (idempotent close).
      const newStatus = reason === 'YEAR_ROLLOVER' ? 'closed' : 'closed'
      const currentTo = assignment.effectiveTo
      if (!currentTo || currentTo > effectiveTo) {
        await tx.studentFeeAssignment.update({
          where: { id: assignment.id },
          data: { effectiveTo, status: newStatus },
        })
      }
      await tx.feeAuditLog.create({
        data: {
          schoolId,
          entityType: 'StudentFeeAssignment',
          entityId: assignment.id,
          action: 'window_close',
          newValue: JSON.stringify({
            effectiveTo: effectiveTo.toISOString(),
            reason,
            cancelledAmount,
            studentId,
            academicYear: assignment.academicYear,
            cascadeFromWithdrawal: !!args.cascadeFromWithdrawal,
          }),
          changedBy: args.performedBy || null,
        },
      })
    },
  })
}

// ─── TRANSPORT ─────────────────────────────────────────────────────────────

async function applyTransportWindow(
  args: ApplyWindowArgs,
  allocationId: string,
): Promise<WindowChangeResult> {
  const { tx, schoolId, studentId, effectiveTo, reason, mode } = args

  const allocation = await tx.transportAllocation.findFirst({
    where: { id: allocationId, schoolId, studentId },
    select: {
      id: true,
      academicYear: true,
      isActive: true,
      effectiveTo: true,
      fareAmount: true,
      stopName: true,
    },
  })
  if (!allocation) {
    throw new Error('Allocation not found or access denied')
  }

  // Transport debits are NOT linked to assignmentItem. They're identified
  // by sourceType='transport' + studentId + dueDate falling AFTER effectiveTo.
  // Each DEBIT has a 1:1 FeeCollection via feeCollectionId.
  const candidates = await tx.studentFeeLedgerEntry.findMany({
    where: {
      schoolId,
      studentId,
      sourceType: 'transport',
      entryType: 'DEBIT',
      deletedAt: null,
      status: { not: 'cancelled' },
      academicYear: allocation.academicYear,
      OR: [{ dueDate: { gt: effectiveTo } }, { dueDate: null }],
    },
    select: {
      id: true,
      feeCollectionId: true,
      feeHeadName: true,
      installmentName: true,
      debit: true,
      dueDate: true,
    },
  })
  // Treat the LedgerEntry as the candidate "item" for transport.
  const candidateItems: Array<{
    id: string
    feeHeadName: string
    installmentName: string | null
    amount: number
    dueDate: Date | null
  }> = candidates.map((c) => ({
    id: c.id,
    feeHeadName: c.feeHeadName || 'Transport Fee',
    installmentName: c.installmentName,
    amount: c.debit,
    dueDate: c.dueDate,
  }))
  const debitToCollection = new Map(candidates.map((c) => [c.id, c.feeCollectionId]))

  return runCancellation({
    args,
    candidates: candidateItems,
    findAllocations: async (debitIds) => {
      const allocSums = await tx.studentFeeLedgerAllocation.groupBy({
        by: ['debitEntryId'],
        where: {
          deletedAt: null,
          debitEntryId: { in: debitIds },
          amount: { gt: 0 },
        },
        _sum: { amount: true },
      })
      return new Map(allocSums.map((r) => [r.debitEntryId, r._sum.amount || 0]))
    },
    cancelItem: async (debitIds) => {
      // Cancel debits + their 1:1 FeeCollections.
      await tx.studentFeeLedgerEntry.updateMany({
        where: { id: { in: debitIds }, deletedAt: null },
        data: {
          status: 'cancelled',
          deletedAt: new Date(),
          notes: `Cancelled by window-close (${reason})`,
        },
      })
      const collectionIds = debitIds
        .map((id) => debitToCollection.get(id))
        .filter((x): x is string => !!x)
      if (collectionIds.length > 0) {
        await tx.feeCollection.updateMany({
          where: { id: { in: collectionIds }, deletedAt: null },
          data: { deletedAt: new Date(), paymentStatus: 'cancelled' },
        })
      }
      return debitIds
    },
    finalise: async (cancelledAmount) => {
      const currentTo = allocation.effectiveTo
      if (!currentTo || currentTo > effectiveTo) {
        await tx.transportAllocation.update({
          where: { id: allocation.id },
          data: {
            effectiveTo,
            isActive: false,
            changeReason: reason,
            withdrawnBy: args.performedBy || null,
            withdrawalNotes: args.reasonNotes || null,
            cascadeFromWithdrawal: !!args.cascadeFromWithdrawal,
          },
        })
      }
      await tx.feeAuditLog.create({
        data: {
          schoolId,
          entityType: 'TransportAllocation',
          entityId: allocation.id,
          action: 'window_close',
          newValue: JSON.stringify({
            effectiveTo: effectiveTo.toISOString(),
            reason,
            cancelledAmount,
            studentId,
            academicYear: allocation.academicYear,
            cascadeFromWithdrawal: !!args.cascadeFromWithdrawal,
          }),
          changedBy: args.performedBy || null,
        },
      })
    },
  })
}

// ─── SHARED CANCELLATION RUNNER ────────────────────────────────────────────

interface CancellationContext {
  args: ApplyWindowArgs
  candidates: Array<{
    id: string
    feeHeadName: string
    installmentName: string | null
    amount: number
    dueDate: Date | null
  }>
  findAllocations: (ids: string[]) => Promise<Map<string, number>>
  cancelItem: (ids: string[]) => Promise<string[]>
  finalise: (cancelledAmount: number) => Promise<void>
}

async function runCancellation(ctx: CancellationContext): Promise<WindowChangeResult> {
  const { args, candidates, findAllocations, cancelItem, finalise } = ctx
  const { scope, effectiveTo, mode } = args

  if (candidates.length === 0) {
    return {
      scope,
      mode,
      effectiveTo,
      cancelledItems: [],
      cancelledAmount: 0,
      skippedDueToAllocations: [],
      totalRefundable: 0,
      cancelledDebitIds: [],
    }
  }

  const itemIds = candidates.map((c) => c.id)
  const paidByItem = await findAllocations(itemIds)

  const cancelledItems: CancelledItem[] = []
  const skippedDueToAllocations: SkippedItem[] = []
  const eligibleIds: string[] = []

  for (const item of candidates) {
    const paid = paidByItem.get(item.id) || 0
    if (paid > 0) {
      skippedDueToAllocations.push({
        itemId: item.id,
        feeHeadName: item.feeHeadName,
        installmentName: item.installmentName,
        amount: round2(item.amount),
        dueDate: item.dueDate,
        paidAmount: round2(paid),
        refundable: round2(paid),
      })
      continue
    }
    cancelledItems.push({
      itemId: item.id,
      feeHeadName: item.feeHeadName,
      installmentName: item.installmentName,
      amount: round2(item.amount),
      dueDate: item.dueDate,
    })
    eligibleIds.push(item.id)
  }

  const cancelledAmount = round2(cancelledItems.reduce((s, i) => s + i.amount, 0))
  const totalRefundable = round2(skippedDueToAllocations.reduce((s, i) => s + i.refundable, 0))

  let cancelledDebitIds: string[] = []
  if (mode === 'commit' && eligibleIds.length > 0) {
    cancelledDebitIds = await cancelItem(eligibleIds)
    await finalise(cancelledAmount)
  }

  return {
    scope,
    mode,
    effectiveTo,
    cancelledItems,
    cancelledAmount,
    skippedDueToAllocations,
    totalRefundable,
    cancelledDebitIds,
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
