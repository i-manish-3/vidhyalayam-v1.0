'use client'

import { SuperAdminRolesPage } from '@/features/admin/pages/super-admin-roles-page'
import { RoleGuard } from '@/components/shared'

export default function SuperAdminRolesRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <SuperAdminRolesPage />
    </RoleGuard>
  )
}
