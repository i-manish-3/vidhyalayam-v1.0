'use client'

import { SchoolsPage } from '@/features/admin/pages/schools-page'
import { RoleGuard } from '@/components/shared'

export default function SchoolsRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <SchoolsPage />
    </RoleGuard>
  )
}
