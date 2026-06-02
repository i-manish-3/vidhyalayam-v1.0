'use client'

import { IdCardDashboardPage } from '@/features/id-cards/pages/dashboard-page'
import { PermissionGuard } from '@/components/shared'

export default function IdCardsRoute() {
  return (
    <PermissionGuard page="id-cards"><IdCardDashboardPage /></PermissionGuard>
  )
}
