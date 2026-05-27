'use client'

import { ChangeFeeGroupPage } from '@/features/fees/pages/change-fee-group-page'
import { PermissionGuard } from '@/components/shared'

export default function ChangeFeeGroupRoute() {
  return <PermissionGuard page="fee-change-group"><ChangeFeeGroupPage /></PermissionGuard>
}
