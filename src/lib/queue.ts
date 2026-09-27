import { Queue } from 'bullmq'
import Redis from 'ioredis'

// Redis connection configuration
// Lazily created singletons so module evaluation during `next build` static page
// generation does not attempt TCP connections or raise unhandled ECONNREFUSED errors.
const globalForQueue = globalThis as unknown as {
  __redisConnection?: Redis
  __demandSlipQueue?: Queue
  __notificationQueue?: Queue
  __exportQueue?: Queue
}

export function getRedisConnection(): Redis {
  if (!globalForQueue.__redisConnection) {
    const connection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableOfflineQueue: false,
    })
    connection.on('error', (err) => {
      console.warn('[queue] Redis connection warning:', err?.message || err)
    })
    globalForQueue.__redisConnection = connection
  }
  return globalForQueue.__redisConnection
}

// Demand slip generation queue getter
export function getDemandSlipQueue(): Queue {
  if (!globalForQueue.__demandSlipQueue) {
    const q = new Queue('demand-slip-generation', {
      connection: getRedisConnection() as any,
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
    q.on('error', (err) => {
      console.warn('[queue] demandSlipQueue warning:', err?.message || err)
    })
    globalForQueue.__demandSlipQueue = q
  }
  return globalForQueue.__demandSlipQueue
}

// Backward-compatible proxy export
export const demandSlipQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    return (getDemandSlipQueue() as any)[prop]
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
  const queue = getDemandSlipQueue()
  const job = await queue.add('generate-bulk', data, {
    jobId: data.runId, // Use runId as jobId for easy lookup
  })
  return job
}

// Helper to get job status
export async function getDemandSlipJobStatus(runId: string) {
  try {
    const queue = getDemandSlipQueue()
    const job = await queue.getJob(runId)
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
  } catch (err) {
    console.warn('[queue] getDemandSlipJobStatus error:', err)
    return null
  }
}

// ============================================
// NOTIFICATION DELIVERY QUEUE
// ============================================
export function getNotificationQueue(): Queue {
  if (!globalForQueue.__notificationQueue) {
    const q = new Queue('notification-delivery', {
      connection: getRedisConnection() as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 24 * 3600, count: 5000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    })
    q.on('error', (err) => {
      console.warn('[queue] notificationQueue warning:', err?.message || err)
    })
    globalForQueue.__notificationQueue = q
  }
  return globalForQueue.__notificationQueue
}

export const notificationQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    return (getNotificationQueue() as any)[prop]
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
  const queue = getNotificationQueue()
  return queue.add('deliver', data, {
    delay: opts?.delayMs,
  })
}

// ============================================
// TENANT EXPORT QUEUE
// ============================================
export function getExportQueue(): Queue {
  if (!globalForQueue.__exportQueue) {
    const q = new Queue('tenant-export', {
      connection: getRedisConnection() as any,
      defaultJobOptions: {
        attempts: 1, // a partial export is worse than a clean retry by the operator
        removeOnComplete: { age: 24 * 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    })
    q.on('error', (err) => {
      console.warn('[queue] exportQueue warning:', err?.message || err)
    })
    globalForQueue.__exportQueue = q
  }
  return globalForQueue.__exportQueue
}

export const exportQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    return (getExportQueue() as any)[prop]
  },
})

export interface ExportJobData {
  jobId: string
  schoolId: string
  requestedBy: string | null
}

export async function enqueueTenantExport(data: ExportJobData) {
  const queue = getExportQueue()
  return queue.add('export', data, { jobId: data.jobId })
}

