'use client'

import { SuperAdminPermissionsPage } from '@/features/admin/pages/super-admin-permissions-page'
import { RoleGuard } from '@/components/shared'

export default function SuperAdminPermissionsRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <SuperAdminPermissionsPage />
    </RoleGuard>
  )
}
