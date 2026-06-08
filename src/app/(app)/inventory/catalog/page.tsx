'use client'

import { InventoryCatalogPage } from '@/features/operations/pages/inventory-catalog-page'
import { PermissionGuard } from '@/components/shared'

export default function InventoryCatalogRoute() {
  return <PermissionGuard page="inventory-catalog"><InventoryCatalogPage /></PermissionGuard>
}
