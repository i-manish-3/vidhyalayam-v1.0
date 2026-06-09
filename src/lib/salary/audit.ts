/**
 * Salary audit logging. Mirrors the fee audit trail (src/lib/audit/fee-audit.ts)
 * but writes to SalaryAuditLog and carries the polymorphic (staffType, staffId).
 */

import type { PrismaClient } from '@prisma/client'

// Dev DB is WIN1252 (see project memory). Strip anything outside ASCII +
// Latin-1 Supplement so Prisma can persist the row.
function sanitizeForDb(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  return value.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?')
}

export interface SalaryAuditContext {
  userId?: string
  ipAddress?: string
  userAgent?: string
  staffType?: string
  staffId?: string
  diffSummary?: string
  metadata?: Record<string, unknown>
}

type Db = PrismaClient | any

/**
 * Write one salary audit row. Safe to call inside a transaction (pass `tx`).
 */
export async function logSalaryEvent(
  db: Db,
  schoolId: string,
  entityType: string,
  entityId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown,
  context: SalaryAuditContext = {}
): Promise<void> {
  await db.salaryAuditLog.create({
    data: {
      schoolId,
      entityType,
      entityId,
      action,
      staffType: context.staffType ?? null,
      staffId: context.staffId ?? null,
      userId: context.userId ?? null,
      ipAddress: context.ipAddress ?? null,
      userAgent: sanitizeForDb(context.userAgent),
      oldValue: oldValue ? sanitizeForDb(JSON.stringify(oldValue)) : null,
      newValue: newValue ? sanitizeForDb(JSON.stringify(newValue)) : null,
      diffSummary: sanitizeForDb(context.diffSummary ?? null),
      metadata: context.metadata ? sanitizeForDb(JSON.stringify(context.metadata)) : null,
    },
  })
}

/** Extract IP + user-agent from a Next.js App Router request. */
export function extractSalaryAuditContext(
  req: { headers?: { get?: (k: string) => string | null } },
  userId?: string
): SalaryAuditContext {
  const headers = req.headers
  const get = (k: string) => (typeof headers?.get === 'function' ? headers.get(k) : null)
  const ipAddress =
    get('x-forwarded-for')?.split(',')[0]?.trim() ||
    get('x-real-ip') ||
    get('cf-connecting-ip') ||
    undefined
  return {
    userId,
    ipAddress: ipAddress ?? undefined,
    userAgent: get('user-agent') ?? undefined,
  }
}
