'use client'

import { RfidAuditPage } from '@/features/rfid/pages/rfid-audit-page'
import { PermissionGuard } from '@/components/shared'

export default function RfidAuditRoute() {
  return (
    <PermissionGuard page="rfid-audit">
      <RfidAuditPage />
    </PermissionGuard>
  )
}
