'use client'

import { AddDriverPage } from '@/features/transport/pages/add-driver-page'
import { PermissionGuard } from '@/components/shared'

export default function AddDriverRoute() {
  return <PermissionGuard page="add-driver"><AddDriverPage /></PermissionGuard>
}
