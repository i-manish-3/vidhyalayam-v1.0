'use client'

import { InventoryPage } from '@/features/operations/pages/inventory-page'
import { PermissionGuard } from '@/components/shared'

export default function InventoryRoute() {
  return <PermissionGuard page="inventory"><InventoryPage /></PermissionGuard>
}
