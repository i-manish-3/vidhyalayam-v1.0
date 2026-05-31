/**
 * Audit Retention Utility
 *
 * Cleanup function for old audit logs based on env config.
 * Prevents unbounded audit table growth while respecting soft-delete and recent logs.
 */

import { db } from '@/lib/db'

/**
 * Default retention period in days
 */
const DEFAULT_RETENTION_DAYS = 365

/**
 * Get retention days from environment or use default
 */
function getRetentionDays(): number {
  const envValue = process.env.AUDIT_RETENTION_DAYS
  if (!envValue) return DEFAULT_RETENTION_DAYS

  const parsed = parseInt(envValue, 10)
  if (isNaN(parsed) || parsed < 1) {
    console.warn(`Invalid AUDIT_RETENTION_DAYS: ${envValue}, using default: ${DEFAULT_RETENTION_DAYS}`)
    return DEFAULT_RETENTION_DAYS
  }

  return parsed
}

/**
 * Check if archiving is enabled
 */
function isArchivingEnabled(): boolean {
  return process.env.AUDIT_ARCHIVE_ENABLED === 'true'
}

/**
 * Get archive path from environment
 */
function getArchivePath(): string | null {
  return process.env.AUDIT_ARCHIVE_PATH || null
}

/**
 * Clean up old audit logs for a specific school
 */
export async function cleanupOldAuditLogs(
  schoolId: string,
  retentionDays?: number
): Promise<{ deletedCount: number; archivedCount: number }> {
  const days = retentionDays || getRetentionDays()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  console.log(`[Audit Cleanup] Starting cleanup for school ${schoolId}`)
  console.log(`[Audit Cleanup] Retention: ${days} days, cutoff: ${cutoffDate.toISOString()}`)

  let archivedCount = 0

  // Archive before deletion if enabled
  if (isArchivingEnabled()) {
    const archivePath = getArchivePath()
    if (archivePath) {
      archivedCount = await archiveAuditLogs(schoolId, cutoffDate, archivePath)
      console.log(`[Audit Cleanup] Archived ${archivedCount} logs`)
    } else {
      console.warn('[Audit Cleanup] Archiving enabled but no AUDIT_ARCHIVE_PATH configured')
    }
  }

  // Delete old fee audit logs
  const feeAuditResult = await db.feeAuditLog.deleteMany({
    where: {
      schoolId,
      createdAt: {
        lt: cutoffDate,
      },
    },
  })

  // Delete old fee config audit logs
  const feeConfigAuditResult = await db.feeConfigAuditLog.deleteMany({
    where: {
      schoolId,
      createdAt: {
        lt: cutoffDate,
      },
    },
  })

  const totalDeleted = feeAuditResult.count + feeConfigAuditResult.count

  console.log(`[Audit Cleanup] Deleted ${totalDeleted} logs (${feeAuditResult.count} fee, ${feeConfigAuditResult.count} config)`)

  return {
    deletedCount: totalDeleted,
    archivedCount,
  }
}

/**
 * Clean up old audit logs for all schools
 */
export async function cleanupAllSchoolsAuditLogs(
  retentionDays?: number
): Promise<{ totalDeleted: number; totalArchived: number; schoolsProcessed: number }> {
  console.log('[Audit Cleanup] Starting cleanup for all schools')

  // Get all active schools
  const schools = await db.school.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
    },
  })

  console.log(`[Audit Cleanup] Found ${schools.length} schools to process`)

  let totalDeleted = 0
  let totalArchived = 0

  for (const school of schools) {
    try {
      const result = await cleanupOldAuditLogs(school.id, retentionDays)
      totalDeleted += result.deletedCount
      totalArchived += result.archivedCount
    } catch (error) {
      console.error(`[Audit Cleanup] Error cleaning up school ${school.id} (${school.name}):`, error)
    }
  }

  console.log(`[Audit Cleanup] Completed: ${totalDeleted} deleted, ${totalArchived} archived across ${schools.length} schools`)

  return {
    totalDeleted,
    totalArchived,
    schoolsProcessed: schools.length,
  }
}

/**
 * Archive audit logs to external storage (S3, file system, etc.)
 */
async function archiveAuditLogs(
  schoolId: string,
  beforeDate: Date,
  archivePath: string
): Promise<number> {
  // Fetch logs to archive
  const [feeAuditLogs, feeConfigAuditLogs] = await Promise.all([
    db.feeAuditLog.findMany({
      where: {
        schoolId,
        createdAt: {
          lt: beforeDate,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    db.feeConfigAuditLog.findMany({
      where: {
        schoolId,
        createdAt: {
          lt: beforeDate,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ])

  const totalLogs = feeAuditLogs.length + feeConfigAuditLogs.length

  if (totalLogs === 0) {
    return 0
  }

  // Prepare archive data
  const archiveData = {
    schoolId,
    archivedAt: new Date().toISOString(),
    beforeDate: beforeDate.toISOString(),
    feeAuditLogs,
    feeConfigAuditLogs,
  }

  // Archive based on path type
  if (archivePath.startsWith('s3://')) {
    // S3 archiving (requires AWS SDK)
    await archiveToS3(archivePath, schoolId, beforeDate, archiveData)
  } else {
    // File system archiving
    await archiveToFileSystem(archivePath, schoolId, beforeDate, archiveData)
  }

  return totalLogs
}

/**
 * Archive to S3 bucket
 */
async function archiveToS3(
  s3Path: string,
  schoolId: string,
  beforeDate: Date,
  data: any
): Promise<void> {
  // TODO: Implement S3 archiving using AWS SDK
  // This is a placeholder for future implementation
  console.warn('[Audit Archive] S3 archiving not yet implemented')
  throw new Error('S3 archiving not yet implemented')
}

/**
 * Archive to file system
 */
async function archiveToFileSystem(
  basePath: string,
  schoolId: string,
  beforeDate: Date,
  data: any
): Promise<void> {
  const fs = await import('fs/promises')
  const path = await import('path')

  // Create archive directory if it doesn't exist
  await fs.mkdir(basePath, { recursive: true })

  // Generate filename with timestamp
  const timestamp = beforeDate.toISOString().split('T')[0]
  const filename = `audit-archive-${schoolId}-${timestamp}.json`
  const filepath = path.join(basePath, filename)

  // Write archive file
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8')

  console.log(`[Audit Archive] Archived to ${filepath}`)
}

/**
 * Get audit log statistics for a school
 */
export async function getAuditLogStats(schoolId: string): Promise<{
  feeAuditCount: number
  feeConfigAuditCount: number
  oldestFeeAudit: Date | null
  oldestFeeConfigAudit: Date | null
  estimatedSizeMB: number
}> {
  const [feeAuditCount, feeConfigAuditCount, oldestFeeAudit, oldestFeeConfigAudit] = await Promise.all([
    db.feeAuditLog.count({ where: { schoolId } }),
    db.feeConfigAuditLog.count({ where: { schoolId } }),
    db.feeAuditLog.findFirst({
      where: { schoolId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.feeConfigAuditLog.findFirst({
      where: { schoolId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])

  // Rough estimate: 2KB per audit log on average
  const estimatedSizeMB = ((feeAuditCount + feeConfigAuditCount) * 2) / 1024

  return {
    feeAuditCount,
    feeConfigAuditCount,
    oldestFeeAudit: oldestFeeAudit?.createdAt || null,
    oldestFeeConfigAudit: oldestFeeConfigAudit?.createdAt || null,
    estimatedSizeMB,
  }
}
