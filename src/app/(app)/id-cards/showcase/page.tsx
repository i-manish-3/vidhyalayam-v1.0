'use client'

import { IdCardShowcasePage } from '@/features/id-cards/pages/showcase-page'
import { PermissionGuard } from '@/components/shared'

export default function ShowcaseRoute() {
  return (
    <PermissionGuard page="id-cards">
      <IdCardShowcasePage />
    </PermissionGuard>
  )
}
