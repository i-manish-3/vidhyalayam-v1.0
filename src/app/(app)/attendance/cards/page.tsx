'use client'

import { BulkCardAssignPage } from '@/features/rfid/pages/bulk-card-assign-page'
import { PermissionGuard } from '@/components/shared'

export default function BulkCardAssignRoute() {
  return (
    <PermissionGuard page="rfid-card-assign">
      <BulkCardAssignPage />
    </PermissionGuard>
  )
}
