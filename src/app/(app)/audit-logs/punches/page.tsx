'use client'

import { AttendancePunchLogsPage } from '@/features/attendance/pages/attendance-punch-logs-page'
import { PermissionGuard } from '@/components/shared'

export default function DevicePunchLogsRoute() {
  return (
    <PermissionGuard page="rfid-audit">
      <AttendancePunchLogsPage />
    </PermissionGuard>
  )
}