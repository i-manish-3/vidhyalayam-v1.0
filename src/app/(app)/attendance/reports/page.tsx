'use client'

import { AttendanceReportsPage } from '@/features/attendance/pages/attendance-reports-page'
import { PermissionGuard } from '@/components/shared'

export default function AttendanceReportsRoute() {
  return <PermissionGuard page="attendance-reports"><AttendanceReportsPage /></PermissionGuard>
}
