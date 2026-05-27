'use client'

import { ParentsPage } from '@/features/people/pages/parents-page'
import { PermissionGuard } from '@/components/shared'

export default function ParentsRoute() {
  return <PermissionGuard page="parents"><ParentsPage /></PermissionGuard>
}
