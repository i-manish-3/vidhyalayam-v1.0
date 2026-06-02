'use client'

import { use } from 'react'
import { TemplateEditorPage } from '@/features/id-cards/pages/template-editor-page'
import { PermissionGuard } from '@/components/shared'

export default function EditIdCardTemplateRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <PermissionGuard page="id-card-templates">
      <TemplateEditorPage templateId={id} />
    </PermissionGuard>
  )
}
