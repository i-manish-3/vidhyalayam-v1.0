'use client'

import { SupportPage } from '@/features/communications/pages/support-page'
import { RoleGuard } from '@/components/shared'

export default function SupportRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <SupportPage />
    </RoleGuard>
  )
}
