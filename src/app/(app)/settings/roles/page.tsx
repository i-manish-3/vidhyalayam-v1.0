'use client'

import { SchoolRolesPage } from '@/features/admin/pages/school-roles-page'
import { PermissionGuard } from '@/components/shared'

export default function SchoolRolesRoute() {
  return <PermissionGuard page="school-roles"><SchoolRolesPage /></PermissionGuard>
}
