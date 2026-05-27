'use client'

import { ClassesPage } from '@/features/academics/pages/classes-page'
import { PermissionGuard } from '@/components/shared'

export default function ClassesRoute() {
  return <PermissionGuard page="classes"><ClassesPage /></PermissionGuard>
}
