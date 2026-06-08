'use client'

import { InventorySalesPage } from '@/features/operations/pages/inventory-sales-page'
import { PermissionGuard } from '@/components/shared'

export default function InventorySalesRoute() {
  return <PermissionGuard page="inventory-sales"><InventorySalesPage /></PermissionGuard>
}
