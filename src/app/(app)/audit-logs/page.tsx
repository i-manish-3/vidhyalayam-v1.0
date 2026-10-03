'use client'

import { AllAuditLogsPage } from '@/features/audit-logs/pages/all-audit-logs-page'
import { PermissionGuard } from '@/components/shared'

export default function AuditLogsRoute() {
  return (
    <PermissionGuard page="audit-logs">
      <AllAuditLogsPage />
    </PermissionGuard>
  )
}
