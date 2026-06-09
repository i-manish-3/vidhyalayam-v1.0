/**
 * Notification service public surface.
 *
 * Usage:
 *   import { notificationService } from '@/lib/notifications'
 *   await notificationService.notifyParentOfStudent({ schoolId, studentId, ... })
 *   await notificationService.triggerEvent({ schoolId, eventType: 'FEE_SUBMITTED', studentId, metadata })
 *   await notificationService.sendBulk({ schoolId, target: { roles: ['PARENT'] }, title, message, channels: ['IN_APP','EMAIL'] })
 */

import {
  createNotification,
  sendBulk,
  notifyRole,
  notifyClassSection,
  notifyTenantUsers,
  calculateRecipients,
  broadcastToSchool,
} from './service'
import { notifyParentOfStudent } from './parent-ward'
import { triggerEvent } from './events'

export const notificationService = {
  createNotification,
  sendBulk,
  notifyRole,
  notifyClassSection,
  notifyTenantUsers,
  notifyParentOfStudent,
  triggerEvent,
  calculateRecipients,
  broadcastToSchool,
}

export type {
  CreateNotificationInput,
  SendBulkInput,
  SendBulkResult,
  NotificationTarget,
} from './service'
export type { NotifyParentArgs, NotifyParentResult } from './parent-ward'
export type { TriggerEventArgs, TriggerEventResult } from './events'
export type { NotificationChannel } from './channels'

// Direct named exports for callers that prefer them.
export {
  createNotification,
  sendBulk,
  notifyRole,
  notifyClassSection,
  notifyTenantUsers,
  calculateRecipients,
  broadcastToSchool,
  notifyParentOfStudent,
  triggerEvent,
}
