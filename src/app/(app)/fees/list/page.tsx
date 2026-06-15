'use client'

import { FeeListPage } from '@/features/fees/pages/fee-list-page'
import { PermissionGuard } from '@/components/shared'

export default function FeeListRoute() {
  return (
    <PermissionGuard page="fee-list">
      <FeeListPage />
    </PermissionGuard>
  )
}
