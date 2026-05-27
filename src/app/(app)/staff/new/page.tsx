'use client'

import { StaffCreatePage } from '@/features/people/pages/staff-create-page'
import { PermissionGuard } from '@/components/shared'

export default function StaffCreateRoute() {
  return <PermissionGuard page="staff-create"><StaffCreatePage /></PermissionGuard>
}
