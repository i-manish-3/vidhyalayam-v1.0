'use client'

import { StaffPage } from '@/features/people/pages/staff-page'
import { PermissionGuard } from '@/components/shared'

export default function StaffRoute() {
  return <PermissionGuard page="staff"><StaffPage /></PermissionGuard>
}
