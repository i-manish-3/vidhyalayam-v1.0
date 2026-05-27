'use client'

import { BulkAdmissionPage } from '@/features/students/pages/bulk-admission-page'
import { PermissionGuard } from '@/components/shared'

export default function BulkAdmissionRoute() {
  return <PermissionGuard page="bulk-admission"><BulkAdmissionPage /></PermissionGuard>
}
