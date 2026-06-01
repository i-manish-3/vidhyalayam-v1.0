'use client'

import { AttendanceKioskPage } from '@/features/rfid/pages/attendance-kiosk-page'
import { PermissionGuard } from '@/components/shared'

export default function AttendanceKioskRoute() {
  return (
    <PermissionGuard page="attendance-kiosk">
      <AttendanceKioskPage />
    </PermissionGuard>
  )
}
