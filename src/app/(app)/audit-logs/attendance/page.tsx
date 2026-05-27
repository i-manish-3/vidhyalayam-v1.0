'use client'

import { AttendanceAuditLogPage } from '@/features/attendance/pages/attendance-audit-log-page'
import { PermissionGuard } from '@/components/shared'

export default function AttendanceAuditLogRoute() {
  return <PermissionGuard page="attendance-audit-log"><AttendanceAuditLogPage /></PermissionGuard>
}
