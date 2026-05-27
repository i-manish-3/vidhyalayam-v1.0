'use client'

import { SchoolPermissionsPage } from '@/features/admin/pages/school-permissions-page'
import { PermissionGuard } from '@/components/shared'

export default function SchoolPermissionsRoute() {
  return <PermissionGuard page="school-permissions"><SchoolPermissionsPage /></PermissionGuard>
}
