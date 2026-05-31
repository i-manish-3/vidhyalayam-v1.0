import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { db } from '@/lib/db'
import { generateMonthlyDemandSlip } from '@/lib/fee-demand'
import type { DemandSlipJobData, DemandSlipJobProgress } from '@/lib/queue'

// Redis connection for worker
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

// Worker to process demand slip generation jobs
export const demandSlipWorker = new Worker<DemandSlipJobData, void>(
  'demand-slip-generation',
  async (job: Job<DemandSlipJobData>) => {
    const { runId, schoolId, month, year, studentIds, generatedBy, force, upToMonth } = job.data

    console.log(`[Worker] Starting demand slip generation for run ${runId}`)
    console.log(`[Worker] Total students: ${studentIds.length}`)

    let successCount = 0
    let skippedCount = 0
    let failedCount = 0
    const errors: Array<{ studentId: string; error: string }> = []

    // Update run status to 'running'
    await db.feeDemandRun.update({
      where: { id: runId },
      data: { status: 'running' },
    })

    // Process each student
    for (let i = 0; i < studentIds.length; i++) {
      const studentId = studentIds[i]

      try {
        // Update progress
        const progress: DemandSlipJobProgress = {
          total: studentIds.length,
          processed: i + 1,
          successCount,
          skippedCount,
          failedCount,
          currentStudentId: studentId,
        }
        await job.updateProgress(progress)

        // Generate slip in transaction with retry logic
        let result = null
        let lastErr: unknown = null
        const maxRetries = 3

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            result = await db.$transaction((tx) =>
              generateMonthlyDemandSlip(tx, {
                schoolId,
                studentId,
                month,
                year,
                generatedBy,
                demandRunId: runId,
                force,
                upToMonth,
              })
            )
            break // Success, exit retry loop
          } catch (err: unknown) {
            lastErr = err
            // Check if it's a unique constraint error (slip number collision)
            const errMsg = err instanceof Error ? err.message : String(err)
            if (errMsg.includes('Unique constraint') && attempt < maxRetries - 1) {
              // Retry after a short delay
              await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
              continue
            }
            throw err // Not a retryable error or max retries reached
          }
        }

        if (!result) {
          throw lastErr || new Error('Failed to generate slip after retries')
        }

        // Update counts based on result
        if (result.status === 'created') {
          successCount++
        } else if (result.status === 'skipped') {
          skippedCount++
        } else {
          failedCount++
          errors.push({
            studentId,
            error: result.status === 'failed' ? result.error : `Skipped: ${result.reason}`,
          })
        }
      } catch (error: unknown) {
        failedCount++
        const errorMsg = error instanceof Error ? error.message : String(error)
        errors.push({ studentId, error: errorMsg })
        console.error(`[Worker] Error generating slip for student ${studentId}:`, errorMsg)
      }
    }

    // Update run status to 'completed'
    await db.feeDemandRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        successCount,
        skippedCount,
        failedCount,
        completedAt: new Date(),
        errorLog: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    })

    console.log(`[Worker] Completed run ${runId}`)
    console.log(`[Worker] Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`)

    // Final progress update
    const finalProgress: DemandSlipJobProgress = {
      total: studentIds.length,
      processed: studentIds.length,
      successCount,
      skippedCount,
      failedCount,
    }
    await job.updateProgress(finalProgress)
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process 5 jobs in parallel
  }
)

// Worker event handlers
demandSlipWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`)
})

demandSlipWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message)
})

demandSlipWorker.on('error', (err) => {
  console.error('[Worker] Worker error:', err)
})

console.log('[Worker] Demand slip worker started')
