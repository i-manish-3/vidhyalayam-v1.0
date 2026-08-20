'use client'

import { CertificateTemplateEditorPage } from '@/features/certificates/pages/template-editor-page'
import { PermissionGuard } from '@/components/shared'

export default function CertificateTemplateNewRoute() {
  return (
    <PermissionGuard page="certificate-template-new"><CertificateTemplateEditorPage /></PermissionGuard>
  )
}