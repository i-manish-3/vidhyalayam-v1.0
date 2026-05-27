'use client'

import { AttendancePage } from '@/features/attendance/pages/attendance-page'
import { PermissionGuard } from '@/components/shared'

export default function MarkAttendanceRoute() {
  return <PermissionGuard page="mark-attendance"><AttendancePage /></PermissionGuard>
}
