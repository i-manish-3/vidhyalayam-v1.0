'use client'

import { CertificateTemplatesListPage } from '@/features/certificates/pages/templates-list-page'
import { PermissionGuard } from '@/components/shared'

export default function CertificateTemplatesRoute() {
  return (
    <PermissionGuard page="certificate-templates"><CertificateTemplatesListPage /></PermissionGuard>
  )
}