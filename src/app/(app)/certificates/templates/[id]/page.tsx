'use client'

import { CertificateTemplateEditorPage } from '@/features/certificates/pages/template-editor-page'
import { PermissionGuard } from '@/components/shared'

export default function CertificateTemplateEditRoute() {
  return (
    <PermissionGuard page="certificate-template-edit"><CertificateTemplateEditorPage /></PermissionGuard>
  )
}