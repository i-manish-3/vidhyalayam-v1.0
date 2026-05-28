'use client'

import { HolidaysPage } from '@/features/settings/pages/holidays-page'
import { PermissionGuard } from '@/components/shared'

export default function HolidaysRoute() {
  return <PermissionGuard page="holidays"><HolidaysPage /></PermissionGuard>
}
