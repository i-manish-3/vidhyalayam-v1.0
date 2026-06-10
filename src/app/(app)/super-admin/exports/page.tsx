'use client'

import { TenantExportsPage } from '@/features/admin/pages/tenant-exports-page'
import { RoleGuard } from '@/components/shared'

export default function TenantExportsRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <TenantExportsPage />
    </RoleGuard>
  )
}
