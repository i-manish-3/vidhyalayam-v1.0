'use client'

import { FeeAuditTrailPage } from '@/features/fees/pages/fee-audit-trail-page'
import { PermissionGuard } from '@/components/shared'

export default function FeeAuditLogRoute() {
  return (
    <PermissionGuard page="fee-audit-log">
      <FeeAuditTrailPage />
    </PermissionGuard>
  )
}
