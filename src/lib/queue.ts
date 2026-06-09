import { Queue } from 'bullmq'
import Redis from 'ioredis'

// Redis connection configuration
// For development: use local Redis (localhost:6379)
// For production: use environment variables
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

// Demand slip generation queue
export const demandSlipQueue = new Queue('demand-slip-generation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 second delay
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
})

// Job data types
export interface DemandSlipJobData {
  runId: string
  schoolId: string
  month: number
  year: number
  studentIds: string[]
  generatedBy: string | null
  force: boolean
  upToMonth: number | null
}

export interface DemandSlipJobProgress {
  total: number
  processed: number
  successCount: number
  skippedCount: number
  failedCount: number
  currentStudentId?: string
}

// Helper to add job to queue
export async function enqueueDemandSlipGeneration(data: DemandSlipJobData) {
  const job = await demandSlipQueue.add('generate-bulk', data, {
    jobId: data.runId, // Use runId as jobId for easy lookup
  })
  return job
}

// Helper to get job status
export async function getDemandSlipJobStatus(runId: string) {
  const job = await demandSlipQueue.getJob(runId)
  if (!job) return null

  const state = await job.getState()
  const progress = (job.progress as DemandSlipJobProgress) || {
    total: 0,
    processed: 0,
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
  }

  return {
    id: job.id,
    state, // 'waiting' | 'active' | 'completed' | 'failed'
    progress,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
  }
}

// ============================================
// NOTIFICATION DELIVERY QUEUE
// ============================================
// External-channel (EMAIL / WHATSAPP / SMS / ...) delivery for a single
// notification recipient. IN_APP is written synchronously by the service and
// never enqueued. Mirrors the demand-slip queue conventions.
export const notificationQueue = new Queue('notification-delivery', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
})

export interface NotificationDeliveryJobData {
  notificationId: string
  schoolId: string | null
  userId: string
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'WEB_PUSH' | 'MOBILE_PUSH'
  title: string
  body: string
  actionUrl?: string | null
}

/** Returns true if a Redis-backed queue is available; false means sync fallback. */
export function isQueueEnabled(): boolean {
  return Boolean(process.env.REDIS_HOST || process.env.USE_QUEUE)
}

export async function enqueueNotificationDelivery(data: NotificationDeliveryJobData, opts?: { delayMs?: number }) {
  return notificationQueue.add('deliver', data, {
    delay: opts?.delayMs,
  })
}
