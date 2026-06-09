import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  enqueueNotificationDelivery,
  isQueueEnabled,
  type NotificationDeliveryJobData,
} from '@/lib/queue'
import { dispatchChannel, type NotificationChannel } from './channels'
import {
  publishToUser,
  publishToSchool,
  userChannel,
  schoolChannel,
  SYSTEM_CHANNEL,
  publish,
} from './realtime'

/**
 * Core notification service — the reusable surface every module calls.
 *
 * Design rules:
 *  - Tenant isolation: every recipient query is scoped to schoolId.
 *  - Fire-and-forget safe: public methods never throw into callers; failures
 *    are logged + recorded so a notification can never break a core flow.
 *  - IN_APP is written synchronously (instant) and published over the realtime
 *    bus. External channels are enqueued (BullMQ) or, when Redis is absent,
 *    dispatched synchronously as a fallback.
 */

const EXTERNAL_CHANNELS: ReadonlyArray<NotificationChannel> = [
  'EMAIL',
  'SMS',
  'WHATSAPP',
  'WEB_PUSH',
  'MOBILE_PUSH',
]

export interface NotificationTarget {
  all?: boolean
  roles?: string[] // canonical User.role strings, e.g. ['PARENT','TEACHER']
  userIds?: string[]
  classIds?: string[]
  sectionIds?: string[]
  studentIds?: string[] // resolves to the mapped PARENT users of those students
  feeStatus?: 'unpaid' | 'partial' | 'overdue'
}

export interface CreateNotificationInput {
  schoolId: string | null
  userId: string // recipient
  title: string
  message: string
  type?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  module?: string | null
  entityId?: string | null
  recipientRole?: string | null
  actionUrl?: string | null
  channels?: NotificationChannel[]
  metadata?: Record<string, unknown> | null
  mandatory?: boolean
  expiresAt?: Date | null
  createdBy?: string | null
  announcementId?: string | null
  /** When set, the external-channel jobs are delayed (scheduled send). */
  delayMs?: number
}

// --- Recipient resolution -------------------------------------------------

/** Resolve PARENT user accounts mapped to the given students, tenant-scoped. */
async function resolveParentUserIds(schoolId: string, studentIds: string[]): Promise<string[]> {
  if (studentIds.length === 0) return []
  const links = await db.studentParent.findMany({
    where: {
      studentId: { in: studentIds },
      parent: { schoolId, isActive: true, userId: { not: null } },
    },
    select: { parent: { select: { userId: true } } },
  })
  return links.map((l) => l.parent.userId).filter((id): id is string => Boolean(id))
}

/**
 * Resolve a target spec into a deduped, tenant-scoped list of recipient userIds.
 * Only active, non-deleted users in the school are returned.
 */
export async function calculateRecipients(
  schoolId: string,
  target: NotificationTarget,
): Promise<string[]> {
  const ids = new Set<string>()

  if (target.all) {
    const users = await db.user.findMany({
      where: { schoolId, isActive: true, deletedAt: null },
      select: { id: true },
    })
    users.forEach((u) => ids.add(u.id))
  }

  if (target.roles?.length) {
    const users = await db.user.findMany({
      where: { schoolId, isActive: true, deletedAt: null, role: { in: target.roles } },
      select: { id: true },
    })
    users.forEach((u) => ids.add(u.id))
  }

  if (target.userIds?.length) {
    // Validate membership in the tenant before trusting caller-supplied ids.
    const users = await db.user.findMany({
      where: { id: { in: target.userIds }, schoolId, isActive: true, deletedAt: null },
      select: { id: true },
    })
    users.forEach((u) => ids.add(u.id))
  }

  // Class / section / explicit students all resolve to the students' PARENT users.
  const studentIds = new Set<string>(target.studentIds ?? [])
  if (target.classIds?.length || target.sectionIds?.length) {
    const students = await db.student.findMany({
      where: {
        schoolId,
        isActive: true,
        deletedAt: null,
        OR: [
          ...(target.classIds?.length ? [{ classId: { in: target.classIds } }] : []),
          ...(target.sectionIds?.length ? [{ sectionId: { in: target.sectionIds } }] : []),
        ],
      },
      select: { id: true },
    })
    students.forEach((s) => studentIds.add(s.id))
  }

  if (target.feeStatus) {
    const statusFilter =
      target.feeStatus === 'overdue'
        ? { status: 'unpaid', dueDate: { lt: new Date() } }
        : { status: target.feeStatus }
    const invoices = await db.studentFeeInvoice.findMany({
      where: { schoolId, deletedAt: null, ...statusFilter },
      select: { studentId: true },
      distinct: ['studentId'],
    })
    invoices.forEach((i) => studentIds.add(i.studentId))
  }

  if (studentIds.size > 0) {
    const parentUserIds = await resolveParentUserIds(schoolId, [...studentIds])
    parentUserIds.forEach((id) => ids.add(id))
  }

  return [...ids]
}

// --- Channel dispatch -----------------------------------------------------

/** Returns the channels a user has NOT disabled (mandatory bypasses prefs). */
async function filterByPreferences(
  userId: string,
  channels: NotificationChannel[],
  module: string | null,
  mandatory: boolean,
): Promise<NotificationChannel[]> {
  if (mandatory) return channels
  const prefs = await db.notificationPreference.findMany({
    where: { userId, channel: { in: channels }, category: { in: ['all', module ?? 'all'] }, enabled: false },
    select: { channel: true },
  })
  const disabled = new Set(prefs.map((p) => p.channel))
  return channels.filter((c) => !disabled.has(c))
}

async function dispatchExternalChannels(args: {
  notificationId: string
  schoolId: string | null
  userId: string
  channels: NotificationChannel[]
  title: string
  body: string
  actionUrl?: string | null
  delayMs?: number
}): Promise<void> {
  const external = args.channels.filter((c) => EXTERNAL_CHANNELS.includes(c))
  for (const channel of external) {
    const job: NotificationDeliveryJobData = {
      notificationId: args.notificationId,
      schoolId: args.schoolId,
      userId: args.userId,
      channel: channel as NotificationDeliveryJobData['channel'],
      title: args.title,
      body: args.body,
      actionUrl: args.actionUrl,
    }
    try {
      if (isQueueEnabled()) {
        await enqueueNotificationDelivery(job, { delayMs: args.delayMs })
      } else {
        // Sync fallback: never let a provider failure bubble into the caller.
        await dispatchChannel(job).catch((err) =>
          console.error('[notif] sync dispatch failed:', err instanceof Error ? err.message : err),
        )
      }
    } catch (err) {
      console.error('[notif] enqueue failed:', err instanceof Error ? err.message : err)
    }
  }
}

// --- Public API -----------------------------------------------------------

/**
 * Create a single in-app notification for one recipient, publish it in
 * real-time, and fan out any external channels. Returns the created row id, or
 * null on failure (logged).
 */
export async function createNotification(input: CreateNotificationInput): Promise<string | null> {
  const channels = input.channels?.length ? input.channels : (['IN_APP'] as NotificationChannel[])
  try {
    // External channels respect per-user preferences (unless mandatory). The
    // in-app row is always written: it's the canonical record the inbox reads
    // and the parent that NotificationDelivery rows reference.
    const channelsToSend = await filterByPreferences(
      input.userId,
      channels,
      input.module ?? null,
      Boolean(input.mandatory),
    )

    const notification = await db.notification.create({
      data: {
        schoolId: input.schoolId,
        userId: input.userId,
        title: input.title,
        message: input.message,
        type: input.type ?? 'info',
        priority: input.priority ?? 'normal',
        status: 'sent',
        module: input.module ?? null,
        entityId: input.entityId ?? null,
        recipientRole: input.recipientRole ?? null,
        actionUrl: input.actionUrl ?? null,
        channels,
        mandatory: Boolean(input.mandatory),
        expiresAt: input.expiresAt ?? null,
        createdBy: input.createdBy ?? null,
        announcementId: input.announcementId ?? null,
        metadata: input.metadata == null ? undefined : (input.metadata as Prisma.InputJsonValue),
      },
      select: { id: true },
    })
    const notificationId = notification.id

    const unreadCount = await db.notification.count({
      where: { userId: input.userId, isRead: false },
    })
    await publishToUser(input.userId, {
      event: 'notification:new',
      data: {
        id: notification.id,
        title: input.title,
        message: input.message,
        type: input.type ?? 'info',
        priority: input.priority ?? 'normal',
        actionUrl: input.actionUrl ?? null,
        createdAt: new Date().toISOString(),
      },
    })
    await publishToUser(input.userId, { event: 'notification:unread_count', data: { unreadCount } })

    await dispatchExternalChannels({
      notificationId,
      schoolId: input.schoolId,
      userId: input.userId,
      channels: channelsToSend,
      title: input.title,
      body: input.message,
      actionUrl: input.actionUrl,
      delayMs: input.delayMs,
    })
    return notificationId
  } catch (err) {
    console.error('[notif] createNotification failed:', err instanceof Error ? err.message : err)
    return null
  }
}

export interface SendBulkInput {
  schoolId: string
  target: NotificationTarget
  title: string
  message: string
  type?: string
  priority?: CreateNotificationInput['priority']
  module?: string | null
  entityId?: string | null
  actionUrl?: string | null
  channels?: NotificationChannel[]
  metadata?: Record<string, unknown> | null
  mandatory?: boolean
  createdBy?: string | null
  announcementId?: string | null
  delayMs?: number
}

export interface SendBulkResult {
  recipientCount: number
  createdCount: number
}

/**
 * Resolve a target into recipients and create a notification for each. Errors
 * per-recipient are swallowed (logged) so one bad recipient never aborts the
 * batch. For very large audiences the announcement worker (deferred) will take
 * over batching; here we cap the inline fan-out defensively.
 */
export async function sendBulk(input: SendBulkInput): Promise<SendBulkResult> {
  const recipients = await calculateRecipients(input.schoolId, input.target)
  let created = 0
  for (const userId of recipients) {
    const id = await createNotification({
      schoolId: input.schoolId,
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      priority: input.priority,
      module: input.module,
      entityId: input.entityId,
      actionUrl: input.actionUrl,
      channels: input.channels,
      metadata: input.metadata,
      mandatory: input.mandatory,
      createdBy: input.createdBy,
      announcementId: input.announcementId,
      delayMs: input.delayMs,
    })
    if (id) created++
  }
  return { recipientCount: recipients.length, createdCount: created }
}

export function notifyRole(
  schoolId: string,
  role: string,
  payload: Omit<SendBulkInput, 'schoolId' | 'target'>,
): Promise<SendBulkResult> {
  return sendBulk({ schoolId, target: { roles: [role] }, ...payload })
}

export function notifyClassSection(
  schoolId: string,
  args: { classId?: string; sectionId?: string },
  payload: Omit<SendBulkInput, 'schoolId' | 'target'>,
): Promise<SendBulkResult> {
  return sendBulk({
    schoolId,
    target: {
      classIds: args.classId ? [args.classId] : undefined,
      sectionIds: args.sectionId ? [args.sectionId] : undefined,
    },
    ...payload,
  })
}

export function notifyTenantUsers(
  schoolId: string,
  payload: Omit<SendBulkInput, 'schoolId' | 'target'>,
): Promise<SendBulkResult> {
  return sendBulk({ schoolId, target: { all: true }, ...payload })
}

/**
 * Lightweight school-wide IN_APP broadcast that does NOT enumerate users —
 * reuses the existing userId=null semantics (visible to everyone in the
 * school). Cheap; no per-user delivery rows or external channels. Used by the
 * legacy create-notification route to preserve current behavior.
 */
export async function broadcastToSchool(input: {
  schoolId: string | null
  title: string
  message: string
  type?: string
  createdBy?: string | null
}): Promise<string | null> {
  try {
    const notification = await db.notification.create({
      data: {
        schoolId: input.schoolId,
        userId: null,
        title: input.title,
        message: input.message,
        type: input.type ?? 'info',
        status: 'sent',
        createdBy: input.createdBy ?? null,
      },
      select: { id: true },
    })
    const channel = input.schoolId ? schoolChannel(input.schoolId) : SYSTEM_CHANNEL
    await publish([channel], {
      event: 'notification:new',
      data: { id: notification.id, title: input.title, message: input.message, type: input.type ?? 'info', broadcast: true },
    })
    return notification.id
  } catch (err) {
    console.error('[notif] broadcastToSchool failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// Re-export for convenience.
export { userChannel, schoolChannel }
