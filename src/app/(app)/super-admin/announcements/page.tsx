'use client'

import { PlatformAnnouncementsPage } from '@/features/admin/pages/platform-announcements-page'
import { RoleGuard } from '@/components/shared'

export default function PlatformAnnouncementsRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <PlatformAnnouncementsPage />
    </RoleGuard>
  )
}
