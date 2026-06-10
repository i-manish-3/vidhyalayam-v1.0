'use client'

import { PlatformBrandingPage } from '@/features/admin/pages/platform-branding-page'
import { RoleGuard } from '@/components/shared'

export default function PlatformBrandingRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <PlatformBrandingPage />
    </RoleGuard>
  )
}
