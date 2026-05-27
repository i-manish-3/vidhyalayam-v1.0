'use client'

import { SchoolUsersPage } from '@/features/admin/pages/school-users-page'
import { PermissionGuard } from '@/components/shared'

export default function SchoolUsersRoute() {
  return <PermissionGuard page="school-users"><SchoolUsersPage /></PermissionGuard>
}
