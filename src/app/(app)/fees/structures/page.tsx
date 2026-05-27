'use client'

import { FeesStructuresPage } from '@/features/fees/pages/fees-structures-page'
import { PermissionGuard } from '@/components/shared'

export default function FeesStructuresRoute() {
  return <PermissionGuard page="fees-structures"><FeesStructuresPage /></PermissionGuard>
}
