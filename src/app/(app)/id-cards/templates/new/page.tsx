'use client'

import { TemplateEditorPage } from '@/features/id-cards/pages/template-editor-page'
import { PermissionGuard } from '@/components/shared'

export default function NewIdCardTemplateRoute() {
  return (
    <PermissionGuard page="id-card-templates"><TemplateEditorPage /></PermissionGuard>
  )
}
