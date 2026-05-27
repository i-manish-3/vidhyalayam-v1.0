'use client'

import { TeachersPage } from '@/features/people/pages/teachers-page'
import { PermissionGuard } from '@/components/shared'

export default function TeachersRoute() {
  return <PermissionGuard page="teachers"><TeachersPage /></PermissionGuard>
}
