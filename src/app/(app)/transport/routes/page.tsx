'use client'

import { TransportPage } from '@/features/transport/pages/transport-page'
import { PermissionGuard } from '@/components/shared'

export default function TransportRoutesRoute() {
  return <PermissionGuard page="transport"><TransportPage /></PermissionGuard>
}
