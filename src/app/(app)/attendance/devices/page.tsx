'use client'

import { RfidDevicesPage } from '@/features/rfid/pages/rfid-devices-page'
import { PermissionGuard } from '@/components/shared'

export default function RfidDevicesRoute() {
  return (
    <PermissionGuard page="rfid-devices">
      <RfidDevicesPage />
    </PermissionGuard>
  )
}
