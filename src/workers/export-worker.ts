import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import type { ExportJobData } from '@/lib/queue'
import { processExportJob } from '@/lib/process-export-job'

// Mirrors the notification/demand-slip workers. Run with: bun run worker:exports
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

// ZIP/dump jobs are heavy and disk-bound; keep concurrency low.
const concurrency = parseInt(process.env.EXPORT_QUEUE_CONCURRENCY || '2')

export const exportWorker = new Worker<ExportJobData, void>(
  'tenant-export',
  async (job: Job<ExportJobData>) => {
    await processExportJob(job.data.jobId)
  },
  {
    connection: redisConnection,
    concurrency,
  },
)

exportWorker.on('completed', (job) => {
  console.log(`[ExportWorker] Job ${job.id} completed`)
})

exportWorker.on('failed', (job, err) => {
  console.error(`[ExportWorker] Job ${job?.id} failed:`, err.message)
})

exportWorker.on('error', (err) => {
  console.error('[ExportWorker] Worker error:', err)
})

console.log(`[ExportWorker] Tenant export worker started (concurrency=${concurrency})`)
