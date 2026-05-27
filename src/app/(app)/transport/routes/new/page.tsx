'use client'

import { AddTransportRoutePage } from '@/features/transport/pages/add-transport-route-page'
import { PermissionGuard } from '@/components/shared'

export default function AddTransportRouteRoute() {
  return <PermissionGuard page="add-transport-route"><AddTransportRoutePage /></PermissionGuard>
}
