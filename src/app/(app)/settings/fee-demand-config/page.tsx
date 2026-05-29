'use client'

import { FeeDemandConfigPage } from '@/features/settings/pages/fee-demand-config-page'
import { PermissionGuard } from '@/components/shared'

export default function FeeDemandConfigRoute() {
  return (
    <PermissionGuard page="fee-demand-config">
      <FeeDemandConfigPage />
    </PermissionGuard>
  )
}
