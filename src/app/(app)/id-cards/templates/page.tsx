'use client'

import { IdCardTemplatesPage } from '@/features/id-cards/pages/templates-list-page'
import { PermissionGuard } from '@/components/shared'

export default function IdCardTemplatesRoute() {
  return (
    <PermissionGuard page="id-card-templates"><IdCardTemplatesPage /></PermissionGuard>
  )
}
