'use client'

import { PettyCashPage } from '@/features/operations/pages/petty-cash-page'
import { PermissionGuard } from '@/components/shared'

export default function PettyCashRoute() {
  return <PermissionGuard page="petty-cash"><PettyCashPage /></PermissionGuard>
}
