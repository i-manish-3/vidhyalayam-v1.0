'use client'

import { HostelPage } from '@/features/hostel/pages/hostel-page'
import { PermissionGuard } from '@/components/shared'

export default function HostelListRoute() {
  return <PermissionGuard page="hostel"><HostelPage /></PermissionGuard>
}
