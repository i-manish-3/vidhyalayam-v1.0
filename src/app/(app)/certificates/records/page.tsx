'use client'

import { CertificateRecordsPage } from '@/features/certificates/pages/records-page'
import { PermissionGuard } from '@/components/shared'

export default function CertificateRecordsRoute() {
  return (
    <PermissionGuard page="certificate-records"><CertificateRecordsPage /></PermissionGuard>
  )
}