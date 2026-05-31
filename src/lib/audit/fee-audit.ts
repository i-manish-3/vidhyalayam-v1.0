/**
 * Fee Audit Logging Utilities
 *
 * Centralized functions for creating audit logs with snapshots.
 * All fee-related operations should use these functions to maintain audit trail.
 */

import type { PrismaClient } from '@prisma/client';
import { calculateDiff, formatDiffSummary, generateDetailedDescription } from './diff-helpers';
import {
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

// Dev DB is WIN1252 (see project memory). Strings that contain ₹, em-dashes,
// arrows, or emoji can't round-trip and Prisma rejects the insert. Replace
// anything outside ASCII + Latin-1 Supplement before writing.
function sanitizeForDb(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')
}

/**
 * Context information for audit logs
 */
export interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Log a fee transaction (payment, refund, ledger entry, etc.)
 */
export async function logFeeTransaction(
  tx: PrismaClient | any, // Prisma transaction or client
  schoolId: string,
  entityType: string,
  entityId: string,
  action: string,
  oldValue: any,
  newValue: any,
  context: AuditContext = {}
) {
  // Generate snapshots based on entity type
  const oldSnapshot = oldValue ? generateSnapshot(entityType, oldValue) : null;
  const newSnapshot = newValue ? generateSnapshot(entityType, newValue) : null;

  // Calculate diff and generate summary
  const diff = calculateDiff(oldSnapshot, newSnapshot);
  const diffSummary = generateDetailedDescription(entityType, action, diff, context.metadata);

  // Extract studentId if present
  const studentId = newValue?.studentId || oldValue?.studentId || context.metadata?.studentId;

  // Create audit log
  await tx.feeAuditLog.create({
    data: {
      schoolId,
      entityType,
      entityId,
      action,
      studentId,
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: sanitizeForDb(context.userAgent),
      oldValue: oldSnapshot ? sanitizeForDb(JSON.stringify(oldSnapshot)) : null,
      newValue: newSnapshot ? sanitizeForDb(JSON.stringify(newSnapshot)) : null,
      diffSummary: sanitizeForDb(diffSummary),
      metadata: context.metadata ? sanitizeForDb(JSON.stringify(context.metadata)) : null,
    },
  });
}

/**
 * Log a configuration change (fee structure, demand config, etc.)
 */
export async function logConfigChange(
  tx: PrismaClient | any,
  schoolId: string,
  configType: string,
  configId: string,
  action: string,
  oldValue: any,
  newValue: any,
  context: AuditContext = {}
) {
  // Generate snapshots based on config type
  const oldSnapshot = oldValue ? generateConfigSnapshot(configType, oldValue) : null;
  const newSnapshot = newValue ? generateConfigSnapshot(configType, newValue) : null;

  // Calculate diff and generate summary
  const diff = calculateDiff(oldSnapshot, newSnapshot);
  const diffSummary = generateDetailedDescription(configType, action, diff, context.metadata);

  // Create config audit log
  await tx.feeConfigAuditLog.create({
    data: {
      schoolId,
      configType,
      configId,
      action,
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: sanitizeForDb(context.userAgent),
      oldValue: oldSnapshot ? sanitizeForDb(JSON.stringify(oldSnapshot)) : null,
      newValue: newSnapshot ? sanitizeForDb(JSON.stringify(newSnapshot)) : null,
      diffSummary: sanitizeForDb(diffSummary),
      metadata: context.metadata ? sanitizeForDb(JSON.stringify(context.metadata)) : null,
    },
  });
}

/**
 * Generate snapshot based on entity type
 */
function generateSnapshot(entityType: string, entity: any): any {
  switch (entityType) {
    case 'StudentFeePayment':
      return snapshotPayment(entity);
    case 'StudentFeeInvoice':
      return snapshotInvoice(entity);
    case 'StudentFeeLedgerEntry':
      return snapshotLedgerEntry(entity);
    case 'StudentFeeRefund':
      return snapshotRefund(entity);
    default:
      return snapshotGeneric(entity);
  }
}

/**
 * Generate snapshot based on config type
 */
function generateConfigSnapshot(configType: string, config: any): any {
  switch (configType) {
    case 'FeesStructure':
      return snapshotFeeStructure(config);
    case 'FeeDemandConfig':
      return snapshotDemandConfig(config);
    case 'FeesHead':
      return snapshotFeeHead(config);
    case 'FeesGroup':
      return snapshotFeeGroup(config);
    default:
      return snapshotGeneric(config);
  }
}

/**
 * Helper to extract audit context from Next.js request
 */
export function extractAuditContext(req: any, userId?: string): AuditContext {
  return {
    userId,
    ipAddress: extractIpAddress(req),
    userAgent: req.headers?.get?.('user-agent') || req.headers?.['user-agent'] || undefined,
  };
}

/**
 * Extract IP address from request (handles proxies)
 */
function extractIpAddress(req: any): string | undefined {
  // Try various headers that might contain the real IP
  const headers = req.headers;

  if (typeof headers?.get === 'function') {
    // Next.js 13+ App Router
    return (
      headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headers.get('x-real-ip') ||
      headers.get('cf-connecting-ip') || // Cloudflare
      undefined
    );
  } else if (headers) {
    // Next.js Pages Router or older
    return (
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      headers['x-real-ip'] ||
      headers['cf-connecting-ip'] ||
      undefined
    );
  }

  return undefined;
}

/**
 * Sanitize snapshot by removing sensitive fields
 */
export function sanitizeSnapshot(snapshot: any, sensitiveFields: string[] = []): any {
  if (!snapshot) return null;

  const sanitized = { ...snapshot };

  // Default sensitive fields
  const defaultSensitive = [
    'password',
    'token',
    'secret',
    'apiKey',
    'accessToken',
    'refreshToken',
    'metaAccessToken',
  ];

  const allSensitive = [...defaultSensitive, ...sensitiveFields];

  allSensitive.forEach(field => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Batch log multiple audit entries (for bulk operations)
 */
export async function logBatchFeeTransactions(
  tx: PrismaClient | any,
  schoolId: string,
  entries: Array<{
    entityType: string;
    entityId: string;
    action: string;
    oldValue: any;
    newValue: any;
    studentId?: string;
  }>,
  context: AuditContext = {}
) {
  const auditLogs = entries.map(entry => {
    const oldSnapshot = entry.oldValue ? generateSnapshot(entry.entityType, entry.oldValue) : null;
    const newSnapshot = entry.newValue ? generateSnapshot(entry.entityType, entry.newValue) : null;
    const diff = calculateDiff(oldSnapshot, newSnapshot);
    const diffSummary = generateDetailedDescription(entry.entityType, entry.action, diff);

    return {
      schoolId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      studentId: entry.studentId || entry.newValue?.studentId || entry.oldValue?.studentId,
      userId: context.userId,
      ipAddress: context.ipAddress,
      userAgent: sanitizeForDb(context.userAgent),
      oldValue: oldSnapshot ? sanitizeForDb(JSON.stringify(oldSnapshot)) : null,
      newValue: newSnapshot ? sanitizeForDb(JSON.stringify(newSnapshot)) : null,
      diffSummary: sanitizeForDb(diffSummary),
      metadata: context.metadata ? sanitizeForDb(JSON.stringify(context.metadata)) : null,
    };
  });

  await tx.feeAuditLog.createMany({
    data: auditLogs,
  });
}
