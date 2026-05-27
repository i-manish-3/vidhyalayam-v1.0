'use client'

import { AttendancePage } from '@/features/attendance/pages/attendance-page'
import { PermissionGuard } from '@/components/shared'

export default function MyAttendanceRoute() {
  return <PermissionGuard page="my-attendance"><AttendancePage /></PermissionGuard>
}
