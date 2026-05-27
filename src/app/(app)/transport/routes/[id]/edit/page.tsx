'use client'

import { use } from 'react'
import { EditTransportRoutePage } from '@/features/transport/pages/edit-transport-route-page'
import { PermissionGuard } from '@/components/shared'

export default function EditTransportRouteRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PermissionGuard page="edit-transport-route"><EditTransportRoutePage routeId={id} /></PermissionGuard>
}
