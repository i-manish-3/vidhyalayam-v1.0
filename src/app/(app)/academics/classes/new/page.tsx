'use client'

import { AddClassPage } from '@/features/academics/pages/add-class-page'
import { PermissionGuard } from '@/components/shared'

export default function AddClassRoute() {
  return <PermissionGuard page="add-class"><AddClassPage /></PermissionGuard>
}
