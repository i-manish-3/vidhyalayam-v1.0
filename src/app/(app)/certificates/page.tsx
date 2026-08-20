'use client'

import { CertificatesDashboardPage } from '@/features/certificates/pages/dashboard-page'
import { PermissionGuard } from '@/components/shared'

export default function CertificatesRoute() {
  return (
    <PermissionGuard page="certificates"><CertificatesDashboardPage /></PermissionGuard>
  )
}