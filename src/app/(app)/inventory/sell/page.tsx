'use client'

import { InventorySellPage } from '@/features/operations/pages/inventory-sell-page'
import { PermissionGuard } from '@/components/shared'

export default function InventorySellRoute() {
  return <PermissionGuard page="inventory-sell"><InventorySellPage /></PermissionGuard>
}
