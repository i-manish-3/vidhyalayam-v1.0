'use client'

import { AnnouncementsPage } from '@/features/communications/pages/announcements-page'
import { PermissionGuard } from '@/components/shared'

export default function AnnouncementsRoute() {
  return <PermissionGuard page="announcements"><AnnouncementsPage /></PermissionGuard>
}
