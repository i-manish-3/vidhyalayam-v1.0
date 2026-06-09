import { Worker, Job } from 'bullmq'
import Redis from 'ioredis'
import { dispatchChannel } from '@/lib/notifications/channels'
import type { NotificationDeliveryJobData } from '@/lib/queue'

// Redis connection for worker (mirrors demand-slip-worker.ts).
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
})

const concurrency = parseInt(process.env.NOTIFICATION_QUEUE_CONCURRENCY || '10')

// Worker to deliver external-channel notifications (EMAIL / WHATSAPP / ...).
// Throwing propagates to BullMQ which retries per the queue's backoff policy.
export const notificationWorker = new Worker<NotificationDeliveryJobData, void>(
  'notification-delivery',
  async (job: Job<NotificationDeliveryJobData>) => {
    const { notificationId, schoolId, userId, channel, title, body, actionUrl } = job.data
    await dispatchChannel({ notificationId, schoolId, userId, channel, title, body, actionUrl })
  },
  {
    connection: redisConnection,
    concurrency,
  },
)

notificationWorker.on('completed', (job) => {
  console.log(`[NotifWorker] Job ${job.id} (${job.data.channel}) delivered`)
})

notificationWorker.on('failed', (job, err) => {
  console.error(`[NotifWorker] Job ${job?.id} failed:`, err.message)
})

notificationWorker.on('error', (err) => {
  console.error('[NotifWorker] Worker error:', err)
})

console.log(`[NotifWorker] Notification delivery worker started (concurrency=${concurrency})`)
