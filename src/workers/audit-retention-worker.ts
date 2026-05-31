/**
 * Audit Retention Worker
 *
 * Scheduled job to run retention cleanup for audit logs.
 * Runs monthly to clean up old audit logs based on retention policy.
 */

import { cleanupAllSchoolsAuditLogs } from '@/lib/audit/retention'

/**
 * Main worker function
 * Called by cron scheduler or manual trigger
 */
export async function runAuditRetentionCleanup(): Promise<void> {
  console.log('[Audit Retention Worker] Starting scheduled cleanup')
  const startTime = Date.now()

  try {
    const result = await cleanupAllSchoolsAuditLogs()

    const duration = Date.now() - startTime
    console.log('[Audit Retention Worker] Cleanup completed successfully')
    console.log(`[Audit Retention Worker] Duration: ${duration}ms`)
    console.log(`[Audit Retention Worker] Schools processed: ${result.schoolsProcessed}`)
    console.log(`[Audit Retention Worker] Total deleted: ${result.totalDeleted}`)
    console.log(`[Audit Retention Worker] Total archived: ${result.totalArchived}`)

    // TODO: Send notification to admins if needed
    if (result.totalDeleted > 0 || result.totalArchived > 0) {
      await notifyAdmins(result)
    }
  } catch (error) {
    console.error('[Audit Retention Worker] Cleanup failed:', error)
    // TODO: Send error notification to admins
    throw error
  }
}

/**
 * Notify admins about cleanup results
 */
async function notifyAdmins(result: {
  totalDeleted: number
  totalArchived: number
  schoolsProcessed: number
}): Promise<void> {
  // TODO: Implement admin notification
  // This could be email, Slack, or in-app notification
  console.log('[Audit Retention Worker] Admin notification:', result)
}

/**
 * Manual trigger endpoint
 * Can be called via API for manual cleanup
 */
export async function triggerManualCleanup(
  schoolId?: string,
  retentionDays?: number
): Promise<{
  success: boolean
  deletedCount: number
  archivedCount: number
  error?: string
}> {
  try {
    if (schoolId) {
      // Clean up specific school
      const { cleanupOldAuditLogs } = await import('@/lib/audit/retention')
      const result = await cleanupOldAuditLogs(schoolId, retentionDays)
      return {
        success: true,
        deletedCount: result.deletedCount,
        archivedCount: result.archivedCount,
      }
    } else {
      // Clean up all schools
      const result = await cleanupAllSchoolsAuditLogs(retentionDays)
      return {
        success: true,
        deletedCount: result.totalDeleted,
        archivedCount: result.totalArchived,
      }
    }
  } catch (error) {
    console.error('[Audit Retention Worker] Manual cleanup failed:', error)
    return {
      success: false,
      deletedCount: 0,
      archivedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Health check for the worker
 */
export async function checkWorkerHealth(): Promise<{
  healthy: boolean
  retentionDays: number
  archivingEnabled: boolean
  lastRun?: Date
}> {
  const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10)
  const archivingEnabled = process.env.AUDIT_ARCHIVE_ENABLED === 'true'

  // TODO: Track last run time in database or cache
  return {
    healthy: true,
    retentionDays,
    archivingEnabled,
  }
}

// If running as standalone script
if (require.main === module) {
  runAuditRetentionCleanup()
    .then(() => {
      console.log('[Audit Retention Worker] Script completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('[Audit Retention Worker] Script failed:', error)
      process.exit(1)
    })
}
