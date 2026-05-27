'use client'

import { NotificationsPage } from '@/features/communications/pages/notifications-page'
import { PermissionGuard } from '@/components/shared'

export default function NotificationsRoute() {
  return <PermissionGuard page="notifications"><NotificationsPage /></PermissionGuard>
}
