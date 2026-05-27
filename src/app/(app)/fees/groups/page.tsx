'use client'

import { FeesGroupsPage } from '@/features/fees/pages/fees-groups-page'
import { PermissionGuard } from '@/components/shared'

export default function FeesGroupsRoute() {
  return <PermissionGuard page="fees-groups"><FeesGroupsPage /></PermissionGuard>
}
