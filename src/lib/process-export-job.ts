import { db } from '@/lib/db'
import { runTenantExport, deleteExportArtifact } from '@/lib/tenant-export'

/**
 * Execute one export job end-to-end: flip the ExportJob row through
 * processing → completed/failed and run the engine. Shared by the BullMQ worker
 * and the synchronous fallback (when no queue is configured), so the lifecycle
 * is identical either way.
 *
 * Default artifact retention: 7 days, after which a sweep can purge it and the
 * download route returns 410.
 */
const RETENTION_DAYS = parseInt(process.env.EXPORT_RETENTION_DAYS || '7')

export async function processExportJob(jobId: string): Promise<void> {
  const job = await db.exportJob.findUnique({ where: { id: jobId } })
  if (!job) {
    console.error(`[export] job ${jobId} not found`)
    return
  }
  if (job.status === 'completed') return // idempotent

  await db.exportJob.update({
    where: { id: jobId },
    data: { status: 'processing', startedAt: new Date(), error: null },
  })

  try {
    const result = await runTenantExport(job.schoolId)
    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 3600 * 1000)

    await db.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        filePath: result.filePath,
        fileSize: result.fileSize,
        tableCount: result.tableCount,
        recordCount: result.recordCount,
        completedAt: new Date(),
        expiresAt,
      },
    })
  } catch (err) {
    console.error(`[export] job ${jobId} failed:`, err instanceof Error ? err.message : err)
    // Clean up any partial artifact the engine may have left.
    if (job.filePath) await deleteExportArtifact(job.filePath)
    await db.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        error: 'The export could not be completed. Please try again.',
      },
    })
  }
}
