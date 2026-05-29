// In-process bulk WhatsApp send worker.
//
// Single setInterval, but each tick uses *fair per-school scheduling* — at most
// one in-flight message per school per tick, with up to MAX_CONCURRENT_SCHOOLS
// schools running in parallel. This means:
//
//   - One school queueing 1000 rows does NOT starve another school that just
//     queued 5 rows: both schools get their first message in the same tick.
//   - One school's Meta token failing or Baileys disconnect only fails its own
//     rows — other schools keep moving.
//   - No per-school timer overhead. Stays single Node process; works for the
//     200-school range. Beyond that, swap to BullMQ + Redis.
//
// Persistent Node hosting assumed (start-pg.mjs / next start). On serverless
// or multi-instance deployments, multiple workers can race; the optimistic
// `updateMany WHERE status='pending'` claim narrows the window but does not
// eliminate it. For multi-instance, move to a real queue.

import { db } from '@/lib/db'
import pLimit from 'p-limit'
import { sendSlipViaWhatsApp } from './send-slip'

const POLL_INTERVAL_MS = Number(process.env.WHATSAPP_WORKER_POLL_MS) || 1500
const MAX_CONCURRENT_SCHOOLS = Number(process.env.WHATSAPP_WORKER_MAX_SCHOOLS) || 20

let started = false
let timer: NodeJS.Timeout | null = null
let busy = false

export function ensureBulkWorker() {
  if (started) return
  started = true
  timer = setInterval(() => {
    if (busy) return
    busy = true
    processTick().catch((err) => {
      console.error('[whatsapp bulk-worker] tick failed', err)
    }).finally(() => { busy = false })
  }, POLL_INTERVAL_MS)
}

export function stopBulkWorker() {
  if (timer) clearInterval(timer)
  timer = null
  started = false
}

// Pick the oldest pending row per school, up to MAX_CONCURRENT_SCHOOLS schools.
// We do this in two queries to keep it portable across Postgres versions
// without DISTINCT ON / window functions through Prisma.
async function pickFairBatch(): Promise<Array<{ id: string; schoolId: string; invoiceId: string }>> {
  const activeSchools = await db.feeNotification.groupBy({
    by: ['schoolId'],
    where: { channel: 'WHATSAPP', status: 'pending' },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: 'asc' } },
    take: MAX_CONCURRENT_SCHOOLS,
  })

  if (activeSchools.length === 0) return []

  const rows = await Promise.all(
    activeSchools.map(({ schoolId }) =>
      db.feeNotification.findFirst({
        where: { schoolId, channel: 'WHATSAPP', status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, schoolId: true, invoiceId: true },
      })
    )
  )

  return rows.filter((r): r is { id: string; schoolId: string; invoiceId: string } => r !== null)
}

async function processOne(row: { id: string; schoolId: string; invoiceId: string }) {
  // Optimistic claim — narrows the race window if a second worker instance
  // exists (dev hot reload, or accidental multi-process). Not a hard barrier.
  const claimed = await db.feeNotification.updateMany({
    where: { id: row.id, status: 'pending' },
    data: { status: 'sending' },
  })
  if (claimed.count === 0) return

  try {
    const sent = await sendSlipViaWhatsApp({
      schoolId: row.schoolId,
      invoiceId: row.invoiceId,
      triggeredBy: null,
    })
    // sendSlipViaWhatsApp creates its own FeeNotification row. Mirror its
    // outcome onto our queued row, then drop the duplicate.
    await db.feeNotification.update({
      where: { id: row.id },
      data: {
        status: sent.status,
        providerMsgId: sent.providerMsgId,
        recipient: sent.recipient,
        errorMessage: sent.errorMessage,
        sentAt: sent.sentAt,
      },
    })
    await db.feeNotification.delete({ where: { id: sent.id } }).catch(() => { /* race ok */ })
  } catch (err) {
    await db.feeNotification.update({
      where: { id: row.id },
      data: {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

async function processTick() {
  const batch = await pickFairBatch()
  if (batch.length === 0) return

  // Each row in the batch belongs to a different school, so running them in
  // parallel can't cross-contaminate per-school state (Meta token, Baileys
  // socket). p-limit caps concurrency to avoid hammering Postgres if
  // MAX_CONCURRENT_SCHOOLS is set very high.
  const limit = pLimit(Math.min(batch.length, MAX_CONCURRENT_SCHOOLS))
  await Promise.all(batch.map((row) => limit(() => processOne(row))))
}

// Synchronously process a few pending rows so the bulk-send API can return
// non-empty progress on first call (before the worker's next tick).
export async function drainImmediate(maxTicks = 5): Promise<{ processed: number }> {
  let processed = 0
  for (let i = 0; i < maxTicks; i++) {
    const before = await db.feeNotification.count({
      where: { channel: 'WHATSAPP', status: 'pending' },
    })
    if (before === 0) break
    await processTick()
    processed += 1
  }
  return { processed }
}
