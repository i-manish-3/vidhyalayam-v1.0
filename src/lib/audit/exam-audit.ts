/**
 * Exam Audit Logging Utilities
 *
 * Centralized writes to ExamAuditLog. Mirrors src/lib/audit/fee-audit.ts in
 * shape (snapshot before / snapshot after / diff summary) so the audit viewer
 * in Phase 6 can reuse the same components. Unlike fees we keep a single audit
 * table covering both data mutations (MarksEntry, ExamResult) and config
 * mutations (Exam, ExamSubjectConfig, GradeScale, ReportCardTemplate, etc.).
 */

import type { PrismaClient, Prisma } from '@prisma/client'
import { calculateDiff, generateDetailedDescription } from './diff-helpers'
import { snapshotGeneric } from './snapshot-generators'

// Dev DB is WIN1252 (see project memory). Strings that contain ₹, em-dashes,
// arrows, or emoji can't round-trip and Prisma rejects the insert. Replace
// anything outside ASCII + Latin-1 Supplement before writing.
function sanitizeForDb(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')
}

export interface ExamAuditContext {
  userId?: string
  ipAddress?: string
  userAgent?: string
  // examId and studentId are top-level columns on ExamAuditLog, so they're
  // pulled out of metadata for fast filtering on the viewer.
  examId?: string
  studentId?: string
  metadata?: Record<string, unknown>
}

// Entity types we audit. Used by the viewer's filter dropdown.
export type ExamAuditEntityType =
  | 'ExamParadigm'
  | 'ExamGroup'
  | 'Exam'
  | 'ExamSubjectConfig'
  | 'ExamComponent'
  | 'ExamSchedule'
  | 'StudentSubjectMapping'
  | 'TeacherSubjectAssignment'
  | 'MarksEntry'
  | 'ExamResult'
  | 'ExamGroupResult'
  | 'FinalResult'
  | 'GradeScale'
  | 'GradeBand'
  | 'ReportCardTemplate'

export type ExamAuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'status_changed'
  | 'marks_entered'
  | 'marks_submitted'
  | 'marks_locked'
  | 'marks_unlocked'
  | 'result_calculated'
  | 'result_published'
  | 'result_unpublished'
  | 'report_downloaded'

// PrismaClient for non-transactional calls, Prisma.TransactionClient (the
// callback param type from interactive `$transaction(async tx => ...)`) for
// bundled mutation + audit writes.
type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Write one row to ExamAuditLog. Accepts either a Prisma client or a
 * transaction handle, so audit writes can be bundled inside the same tx that
 * mutates the row (rolls back together on failure).
 */
export async function logExamChange(
  tx: DbClient,
  schoolId: string,
  entityType: ExamAuditEntityType,
  entityId: string,
  action: ExamAuditAction,
  oldValue: unknown,
  newValue: unknown,
  context: ExamAuditContext = {},
): Promise<void> {
  const oldSnapshot = oldValue ? snapshotGeneric(oldValue) : null
  const newSnapshot = newValue ? snapshotGeneric(newValue) : null

  const diff = calculateDiff(oldSnapshot, newSnapshot)
  const diffSummary = generateDetailedDescription(entityType, action, diff, context.metadata)

  await tx.examAuditLog.create({
    data: {
      schoolId,
      entityType,
      entityId,
      action,
      examId: context.examId ?? null,
      studentId: context.studentId ?? null,
      userId: context.userId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: sanitizeForDb(context.userAgent),
      oldValue: oldSnapshot ? sanitizeForDb(JSON.stringify(oldSnapshot)) : null,
      newValue: newSnapshot ? sanitizeForDb(JSON.stringify(newSnapshot)) : null,
      diffSummary: sanitizeForDb(diffSummary),
      metadata: context.metadata ? sanitizeForDb(JSON.stringify(context.metadata)) : null,
    },
  })
}

/**
 * Extract audit context (IP, user agent) from a NextRequest.
 */
export function extractExamAuditContext(
  request: { headers: Headers },
  userId?: string,
): ExamAuditContext {
  return {
    userId,
    ipAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      undefined,
    userAgent: request.headers.get('user-agent') || undefined,
  }
}

/**
 * Batch insert for bulk operations (e.g. marks-grid PUT writes one row per
 * changed component for traceability).
 */
export async function logExamChangesBatch(
  tx: DbClient,
  schoolId: string,
  entries: ReadonlyArray<{
    entityType: ExamAuditEntityType
    entityId: string
    action: ExamAuditAction
    oldValue: unknown
    newValue: unknown
    examId?: string
    studentId?: string
    metadata?: Record<string, unknown>
  }>,
  context: ExamAuditContext = {},
): Promise<void> {
  if (entries.length === 0) return
  const rows = entries.map((entry) => {
    const oldSnapshot = entry.oldValue ? snapshotGeneric(entry.oldValue) : null
    const newSnapshot = entry.newValue ? snapshotGeneric(entry.newValue) : null
    const diff = calculateDiff(oldSnapshot, newSnapshot)
    const diffSummary = generateDetailedDescription(entry.entityType, entry.action, diff, entry.metadata)

    return {
      schoolId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      examId: entry.examId ?? context.examId ?? null,
      studentId: entry.studentId ?? context.studentId ?? null,
      userId: context.userId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: sanitizeForDb(context.userAgent),
      oldValue: oldSnapshot ? sanitizeForDb(JSON.stringify(oldSnapshot)) : null,
      newValue: newSnapshot ? sanitizeForDb(JSON.stringify(newSnapshot)) : null,
      diffSummary: sanitizeForDb(diffSummary),
      metadata: entry.metadata
        ? sanitizeForDb(JSON.stringify(entry.metadata))
        : context.metadata
          ? sanitizeForDb(JSON.stringify(context.metadata))
          : null,
    }
  })
  await tx.examAuditLog.createMany({ data: rows })
}
