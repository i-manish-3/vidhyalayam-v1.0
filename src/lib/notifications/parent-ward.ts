import { db } from '@/lib/db'
import { createNotification, type CreateNotificationInput } from './service'
import type { NotificationChannel } from './channels'

/**
 * Parent-ward notification. Resolves the guardian user account(s) mapped to a
 * student and notifies ONLY them. Strict tenant + relationship isolation:
 *  - the student must belong to `schoolId`
 *  - parents must belong to the same school and be active with a user account
 *  - primary guardian first, then others
 * A mismatch returns 0 sent and logs — it never notifies the wrong family.
 */

export interface NotifyParentArgs {
  schoolId: string
  studentId: string
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
  /** Notify only the primary guardian (default: all linked guardians). */
  primaryOnly?: boolean
}

export interface NotifyParentResult {
  sent: number
  studentName: string | null
}

export async function notifyParentOfStudent(args: NotifyParentArgs): Promise<NotifyParentResult> {
  try {
    const student = await db.student.findFirst({
      where: { id: args.studentId, schoolId: args.schoolId, deletedAt: null },
      select: {
        firstName: true,
        lastName: true,
        parentLinks: {
          include: {
            parent: { select: { id: true, schoolId: true, userId: true, isActive: true } },
          },
        },
      },
    })

    // Tenant guard: unknown student in this school → notify nobody.
    if (!student) {
      console.warn(`[notif] notifyParentOfStudent: student ${args.studentId} not in school ${args.schoolId}`)
      return { sent: 0, studentName: null }
    }

    const studentName = `${student.firstName} ${student.lastName}`.trim()

    // Primary guardian first, then the rest. Only active, same-school, mapped users.
    const links = [...student.parentLinks].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    const targetUserIds: string[] = []
    for (const link of links) {
      const p = link.parent
      if (p.schoolId !== args.schoolId) continue // hard isolation
      if (!p.isActive || !p.userId) continue
      if (!targetUserIds.includes(p.userId)) targetUserIds.push(p.userId)
      if (args.primaryOnly) break
    }

    if (targetUserIds.length === 0) {
      return { sent: 0, studentName }
    }

    let sent = 0
    for (const userId of targetUserIds) {
      const id = await createNotification({
        schoolId: args.schoolId,
        userId,
        title: args.title,
        message: args.message,
        type: args.type ?? 'info',
        priority: args.priority,
        module: args.module,
        entityId: args.entityId ?? args.studentId,
        recipientRole: 'PARENT',
        actionUrl: args.actionUrl,
        channels: args.channels,
        metadata: { ...(args.metadata ?? {}), studentId: args.studentId, studentName },
        mandatory: args.mandatory,
        createdBy: args.createdBy,
      })
      if (id) sent++
    }
    return { sent, studentName }
  } catch (err) {
    console.error('[notif] notifyParentOfStudent failed:', err instanceof Error ? err.message : err)
    return { sent: 0, studentName: null }
  }
}
