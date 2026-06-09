'use client'

import { NotificationPreferencesPage } from '@/features/communications/pages/notification-preferences-page'
import { PermissionGuard } from '@/components/shared'

export default function NotificationPreferencesRoute() {
  return (
    <PermissionGuard page="notification-preferences">
      <NotificationPreferencesPage />
    </PermissionGuard>
  )
}
