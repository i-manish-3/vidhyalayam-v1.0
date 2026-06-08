'use client'

import { InventoryReportsPage } from '@/features/operations/pages/inventory-reports-page'
import { PermissionGuard } from '@/components/shared'

export default function InventoryReportsRoute() {
  return <PermissionGuard page="inventory-reports"><InventoryReportsPage /></PermissionGuard>
}
