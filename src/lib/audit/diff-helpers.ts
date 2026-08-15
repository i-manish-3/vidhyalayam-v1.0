/**
 * Diff Calculation Helpers for Audit Trail
 *
 * Generate human-readable diff summaries from before/after snapshots.
 */

/**
 * Calculate the difference between two snapshots
 */
export function calculateDiff(oldSnapshot: any, newSnapshot: any): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};

  if (!oldSnapshot && !newSnapshot) {
    return diff;
  }

  // If only new snapshot exists, it's a creation
  if (!oldSnapshot && newSnapshot) {
    Object.keys(newSnapshot).forEach(key => {
      if (key !== 'id' && key !== 'createdAt') {
        diff[key] = { old: null, new: newSnapshot[key] };
      }
    });
    return diff;
  }

  // If only old snapshot exists, it's a deletion
  if (oldSnapshot && !newSnapshot) {
    Object.keys(oldSnapshot).forEach(key => {
      if (key !== 'id' && key !== 'createdAt') {
        diff[key] = { old: oldSnapshot[key], new: null };
      }
    });
    return diff;
  }

  // Compare both snapshots
  const allKeys = new Set([...Object.keys(oldSnapshot), ...Object.keys(newSnapshot)]);

  allKeys.forEach(key => {
    // Skip metadata fields
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      return;
    }

    const oldValue = oldSnapshot[key];
    const newValue = newSnapshot[key];

    // Deep comparison for objects and arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      diff[key] = { old: oldValue, new: newValue };
    }
  });

  return diff;
}

/**
 * Format a diff summary into a human-readable string
 */
export function formatDiffSummary(diff: Record<string, { old: any; new: any }>, entityType: string): string {
  const changes: string[] = [];

  Object.entries(diff).forEach(([field, { old: oldValue, new: newValue }]) => {
    const fieldName = formatFieldName(field);

    if (oldValue === null || oldValue === undefined) {
      changes.push(`Set ${fieldName} to ${formatValue(newValue)}`);
    } else if (newValue === null || newValue === undefined) {
      changes.push(`Cleared ${fieldName}`);
    } else {
      changes.push(`Changed ${fieldName} from ${formatValue(oldValue)} to ${formatValue(newValue)}`);
    }
  });

  if (changes.length === 0) {
    return 'No changes detected';
  }

  if (changes.length === 1) {
    return changes[0];
  }

  // For multiple changes, return a summary
  return `${changes.length} changes: ${changes.slice(0, 3).join('; ')}${changes.length > 3 ? '...' : ''}`;
}

/**
 * Format a field name for display (camelCase to Title Case)
 */
function formatFieldName(field: string): string {
  // Convert camelCase to Title Case
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Format a value for display in diff summary
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return value.toString();
  }

  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 50) {
      return `"${value.substring(0, 47)}..."`;
    }
    return `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === 'object') {
    return '[Object]';
  }

  return String(value);
}

/**
 * Highlight changed fields in a snapshot
 * Returns an object with only the changed fields
 */
export function highlightChangedFields(diff: Record<string, { old: any; new: any }>): Record<string, any> {
  const highlighted: Record<string, any> = {};

  Object.entries(diff).forEach(([field, { new: newValue }]) => {
    highlighted[field] = newValue;
  });

  return highlighted;
}

/**
 * Generate a detailed change description for specific entity types
 */
export function generateDetailedDescription(
  entityType: string,
  action: string,
  diff: Record<string, { old: any; new: any }>,
  metadata?: any
): string {
  switch (entityType) {
    case 'StudentFeePayment':
      return generatePaymentDescription(action, diff, metadata);
    case 'StudentFeeInvoice':
      return generateInvoiceDescription(action, diff, metadata);
    case 'StudentFeeLedgerEntry':
      return generateLedgerDescription(action, diff, metadata);
    case 'StudentFeeRefund':
      return generateRefundDescription(action, diff, metadata);
    case 'FeesStructure':
      return generateStructureDescription(action, diff, metadata);
    case 'FeeDemandConfig':
      return generateConfigDescription(action, diff, metadata);
    default:
      return formatDiffSummary(diff, entityType);
  }
}

function generatePaymentDescription(action: string, diff: Record<string, any>, metadata?: any): string {
  if (action === 'created' || action === 'payment_recorded') {
    const amount = diff.amount?.new ?? metadata?.amount;
    const method = diff.paymentMethod?.new ?? metadata?.paymentMethod;
    const receipt = diff.receiptNumber?.new ?? metadata?.receiptNumber;

    let description = 'Recorded payment';
    if (isPresent(amount)) description += ` of ₹${amount}`;
    if (isPresent(method)) description += ` via ${method}`;
    if (isPresent(receipt)) description += ` (Receipt: ${receipt})`;
    return description;
  }
  if (action === 'payment_cancelled') {
    const receipt = diff.receiptNumber?.new ?? metadata?.receiptNumber;
    const reason = diff.cancellationReason?.new ?? metadata?.cancellationReason;
    return `Cancelled payment receipt ${receipt}${reason ? `: ${reason}` : ''}`;
  }
  return formatDiffSummary(diff, 'Payment');
}

function generateInvoiceDescription(action: string, diff: Record<string, any>, metadata?: any): string {
  if (action === 'created') {
    const invoiceNumber = diff.invoiceNumber?.new ?? metadata?.invoiceNumber;
    const amount = diff.totalAmount?.new ?? metadata?.totalAmount;

    let description = 'Created invoice';
    if (isPresent(invoiceNumber)) description += ` ${invoiceNumber}`;
    if (isPresent(amount)) description += ` for ₹${amount}`;
    return description;
  }
  if (action === 'locked') {
    return 'Locked invoice';
  }
  return formatDiffSummary(diff, 'Invoice');
}

function generateLedgerDescription(action: string, diff: Record<string, any>, metadata?: any): string {
  if (action === 'created') {
    const entryType = diff.entryType?.new || metadata?.entryType;
    const debit = diff.debit?.new || 0;
    const credit = diff.credit?.new || 0;
    const balance = diff.balanceAmount?.new || metadata?.balanceAmount;

    if (entryType === 'DEBIT') {
      let description = 'Added debit entry';
      if (isPresent(debit)) description += ` of ₹${debit}`;
      if (isPresent(balance)) description += ` (Balance: ₹${balance})`;
      return description;
    } else if (entryType === 'CREDIT') {
      let description = 'Added credit entry';
      if (isPresent(credit)) description += ` of ₹${credit}`;
      if (isPresent(balance)) description += ` (Balance: ₹${balance})`;
      return description;
    }
    return `Created ${entryType} ledger entry`;
  }
  return formatDiffSummary(diff, 'Ledger Entry');
}

function generateRefundDescription(action: string, diff: Record<string, any>, metadata?: any): string {
  if (action === 'refund_issued') {
    const amount = diff.amount?.new ?? metadata?.amount;
    const receipt = diff.receiptNumber?.new ?? metadata?.receiptNumber;

    let description = 'Issued refund';
    if (isPresent(amount)) description += ` of ₹${amount}`;
    if (isPresent(receipt)) description += ` (Receipt: ${receipt})`;
    return description;
  }
  if (action === 'refund_voided') {
    const reason = diff.voidReason?.new ?? metadata?.voidReason;
    return `Voided refund${reason ? `: ${reason}` : ''}`;
  }
  return formatDiffSummary(diff, 'Refund');
}

function generateStructureDescription(action: string, diff: Record<string, any>, metadata?: any): string {
  if (action === 'created') {
    const name = diff.name?.new ?? metadata?.name;
    return isPresent(name) ? `Created fee structure: ${name}` : 'Created fee structure';
  }
  if (action === 'locked') {
    return 'Locked fee structure';
  }
  if (action === 'archived') {
    return 'Archived fee structure';
  }
  return formatDiffSummary(diff, 'Fee Structure');
}

function generateConfigDescription(action: string, diff: Record<string, any>, metadata?: any): string {
  if (action === 'updated') {
    const changes: string[] = [];
    if (diff.dueDay) {
      changes.push(`due day from ${diff.dueDay.old} to ${diff.dueDay.new}`);
    }
    if (diff.lateFeeEnabled) {
      changes.push(`late fee ${diff.lateFeeEnabled.new ? 'enabled' : 'disabled'}`);
    }
    if (diff.whatsappEnabled) {
      changes.push(`WhatsApp ${diff.whatsappEnabled.new ? 'enabled' : 'disabled'}`);
    }
    if (changes.length > 0) {
      return `Updated demand config: ${changes.join(', ')}`;
    }
  }
  return formatDiffSummary(diff, 'Demand Config');
}

/**
 * True when a value is usable for display (not null / undefined / empty).
 */
function isPresent(value: any): boolean {
  return value !== null && value !== undefined && value !== '';
}
