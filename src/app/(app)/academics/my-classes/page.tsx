'use client'

import { MyClassesPage } from '@/features/academics/pages/my-classes-page'
import { PermissionGuard } from '@/components/shared'

export default function MyClassesRoute() {
  return <PermissionGuard page="my-classes"><MyClassesPage /></PermissionGuard>
}
