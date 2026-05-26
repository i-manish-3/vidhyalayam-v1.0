'use client'

import { use } from 'react'
import { EditTransportRoutePage } from '@/features/transport/pages/edit-transport-route-page'

export default function EditTransportRouteRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditTransportRoutePage routeId={id} />
}
