'use client'

import { FeesHeadsPage } from '@/features/fees/pages/fees-heads-page'
import { PermissionGuard } from '@/components/shared'

export default function FeesHeadsRoute() {
  return <PermissionGuard page="fees-heads"><FeesHeadsPage /></PermissionGuard>
}
