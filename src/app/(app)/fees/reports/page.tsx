'use client'

import { FeeReportsPage } from '@/features/fees/pages/fee-reports-page'
import { PermissionGuard } from '@/components/shared'

export default function FeeReportsRoute() {
  return (
    <PermissionGuard page="fee-reports">
      <FeeReportsPage />
    </PermissionGuard>
  )
}
