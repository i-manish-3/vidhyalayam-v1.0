/**
 * Snapshot Generators for Audit Trail
 *
 * Entity-specific snapshot functions that extract relevant fields for audit logs.
 * Snapshots are stored as JSON and used to generate before/after comparisons.
 */

import type { Prisma } from '@prisma/client';

/**
 * Maximum snapshot size in bytes (10KB)
 * Prevents bloat from large arrays or text fields
 */
const MAX_SNAPSHOT_SIZE = 10 * 1024;

/**
 * Truncate snapshot if it exceeds max size
 */
function truncateSnapshot(snapshot: any): any {
  const json = JSON.stringify(snapshot);
  if (json.length <= MAX_SNAPSHOT_SIZE) {
    return snapshot;
  }

  // If too large, return a summary
  return {
    _truncated: true,
    _originalSize: json.length,
    _summary: 'Snapshot truncated due to size',
    ...Object.keys(snapshot).reduce((acc, key) => {
      const value = snapshot[key];
      if (Array.isArray(value)) {
        acc[key] = `[Array: ${value.length} items]`;
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = '[Object]';
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as any),
  };
}

/**
 * Snapshot a StudentFeePayment record
 */
export function snapshotPayment(payment: any) {
  return truncateSnapshot({
    id: payment.id,
    studentId: payment.studentId,
    invoiceId: payment.invoiceId,
    amount: payment.amount,
    paymentMethod: payment.paymentMethod,
    transactionRef: payment.transactionRef,
    receiptNumber: payment.receiptNumber,
    paymentDate: payment.paymentDate?.toISOString(),
    notes: payment.notes,
    receivedBy: payment.receivedBy,
    cancelledAt: payment.cancelledAt?.toISOString(),
    cancelledBy: payment.cancelledBy,
    cancellationReason: payment.cancellationReason,
    createdAt: payment.createdAt?.toISOString(),
  });
}

/**
 * Snapshot a StudentFeeInvoice record
 */
export function snapshotInvoice(invoice: any) {
  return truncateSnapshot({
    id: invoice.id,
    studentId: invoice.studentId,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate?.toISOString(),
    dueDate: invoice.dueDate?.toISOString(),
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    concession: invoice.concession,
    scholarship: invoice.scholarship,
    fine: invoice.fine,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    status: invoice.status,
    billingMonth: invoice.billingMonth,
    billingYear: invoice.billingYear,
    isMonthlyDemand: invoice.isMonthlyDemand,
    previousBalance: invoice.previousBalance,
    demandRunId: invoice.demandRunId,
    lockedAt: invoice.lockedAt?.toISOString(),
    lockedBy: invoice.lockedBy,
    notes: invoice.notes,
    // Truncate lines array if present
    lines: invoice.lines ? `[${invoice.lines.length} lines]` : undefined,
  });
}

/**
 * Snapshot a StudentFeeLedgerEntry record
 */
export function snapshotLedgerEntry(entry: any) {
  return truncateSnapshot({
    id: entry.id,
    studentId: entry.studentId,
    academicYear: entry.academicYear,
    entryType: entry.entryType,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    feeHeadName: entry.feeHeadName,
    installmentName: entry.installmentName,
    description: entry.description,
    debit: entry.debit,
    credit: entry.credit,
    balanceAmount: entry.balanceAmount,
    dueDate: entry.dueDate?.toISOString(),
    transactionDate: entry.transactionDate?.toISOString(),
    paymentMethod: entry.paymentMethod,
    transactionRef: entry.transactionRef,
    receiptNumber: entry.receiptNumber,
    status: entry.status,
    version: entry.version,
    notes: entry.notes,
  });
}

/**
 * Snapshot a StudentFeeRefund record
 */
export function snapshotRefund(refund: any) {
  return truncateSnapshot({
    id: refund.id,
    studentId: refund.studentId,
    withdrawalId: refund.withdrawalId,
    scope: refund.scope,
    academicYear: refund.academicYear,
    amount: refund.amount,
    paymentMethod: refund.paymentMethod,
    receiptNumber: refund.receiptNumber,
    issuedDate: refund.issuedDate?.toISOString(),
    issuedBy: refund.issuedBy,
    notes: refund.notes,
    voidedAt: refund.voidedAt?.toISOString(),
    voidedBy: refund.voidedBy,
    voidReason: refund.voidReason,
  });
}

/**
 * Snapshot a FeesStructure record
 */
export function snapshotFeeStructure(structure: any) {
  return truncateSnapshot({
    id: structure.id,
    feesGroupId: structure.feesGroupId,
    classId: structure.classId,
    sectionId: structure.sectionId,
    academicYear: structure.academicYear,
    name: structure.name,
    version: structure.version,
    status: structure.status,
    effectiveFrom: structure.effectiveFrom?.toISOString(),
    effectiveTo: structure.effectiveTo?.toISOString(),
    lockedAt: structure.lockedAt?.toISOString(),
    lockedBy: structure.lockedBy,
    isActive: structure.isActive,
    // Truncate items array if present
    items: structure.items ? `[${structure.items.length} items]` : undefined,
  });
}

/**
 * Snapshot a FeeDemandConfig record
 */
export function snapshotDemandConfig(config: any) {
  return truncateSnapshot({
    id: config.id,
    schoolId: config.schoolId,
    dueDay: config.dueDay,
    slipNumberFormat: config.slipNumberFormat,
    lateFeeEnabled: config.lateFeeEnabled,
    lateFeeType: config.lateFeeType,
    lateFeeAmount: config.lateFeeAmount,
    lateFeeGraceDays: config.lateFeeGraceDays,
    whatsappEnabled: config.whatsappEnabled,
    whatsappProvider: config.whatsappProvider,
    // Exclude sensitive fields
    metaPhoneNumberId: config.metaPhoneNumberId ? '[REDACTED]' : undefined,
    metaAccessToken: config.metaAccessToken ? '[REDACTED]' : undefined,
    metaBusinessId: config.metaBusinessId ? '[REDACTED]' : undefined,
    metaTemplateName: config.metaTemplateName,
    baileysConnected: config.baileysConnected,
    baileysPhoneNumber: config.baileysPhoneNumber,
    baileysLastActiveAt: config.baileysLastActiveAt?.toISOString(),
  });
}

/**
 * Snapshot a FeesHead record
 */
export function snapshotFeeHead(head: any) {
  return truncateSnapshot({
    id: head.id,
    name: head.name,
    frequency: head.frequency,
    headType: head.headType,
    isOptional: head.isOptional,
    applicability: head.applicability,
    isActive: head.isActive,
  });
}

/**
 * Snapshot a FeesGroup record
 */
export function snapshotFeeGroup(group: any) {
  return truncateSnapshot({
    id: group.id,
    name: group.name,
    description: group.description,
    isActive: group.isActive,
    // Truncate items array if present
    items: group.items ? `[${group.items.length} items]` : undefined,
  });
}

/**
 * Generic snapshot function - attempts to extract common fields
 */
export function snapshotGeneric(entity: any) {
  if (!entity) return null;

  // Extract common fields that most entities have
  const snapshot: any = {
    id: entity.id,
  };

  // Add common audit fields if present
  const commonFields = [
    'schoolId', 'studentId', 'userId', 'status', 'amount', 'createdAt',
    'updatedAt', 'deletedAt', 'isActive', 'name', 'description'
  ];

  commonFields.forEach(field => {
    if (entity[field] !== undefined) {
      const value = entity[field];
      snapshot[field] = value instanceof Date ? value.toISOString() : value;
    }
  });

  return truncateSnapshot(snapshot);
}
