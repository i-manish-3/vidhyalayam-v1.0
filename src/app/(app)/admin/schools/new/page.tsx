'use client'

import { AddSchoolPage } from '@/features/admin/pages/add-school-page'
import { RoleGuard } from '@/components/shared'

export default function AddSchoolRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <AddSchoolPage />
    </RoleGuard>
  )
}
