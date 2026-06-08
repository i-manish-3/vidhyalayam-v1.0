'use client'

import { AlumniPage } from '@/features/alumni/pages/alumni-page'
import { PermissionGuard } from '@/components/shared'

export default function AlumniRoute() {
  return <PermissionGuard page="alumni"><AlumniPage /></PermissionGuard>
}
