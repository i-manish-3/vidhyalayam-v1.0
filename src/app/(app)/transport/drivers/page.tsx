'use client'

import { DriverDirectoryPage } from '@/features/transport/pages/driver-directory-page'
import { PermissionGuard } from '@/components/shared'

export default function DriversRoute() {
  return <PermissionGuard page="drivers"><DriverDirectoryPage /></PermissionGuard>
}
