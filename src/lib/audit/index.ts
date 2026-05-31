/**
 * Audit Trail System
 *
 * Centralized audit logging for fee management operations.
 * Tracks all changes to payments, invoices, ledger entries, refunds, and configurations.
 */

export {
  logFeeTransaction,
  logConfigChange,
  extractAuditContext,
  sanitizeSnapshot,
  logBatchFeeTransactions,
  type AuditContext,
} from './fee-audit';

export {
  snapshotPayment,
  snapshotInvoice,
  snapshotLedgerEntry,
  snapshotRefund,
  snapshotFeeStructure,
  snapshotDemandConfig,
  snapshotFeeHead,
  snapshotFeeGroup,
  snapshotGeneric,
} from './snapshot-generators';

export {
  calculateDiff,
  formatDiffSummary,
  highlightChangedFields,
  generateDetailedDescription,
} from './diff-helpers';
