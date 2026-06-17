'use client'

import { AdmitCardTemplatePage } from '@/features/exams/pages/admit-card-template-page'
import { PermissionGuard } from '@/components/shared'

export default function AdmitCardTemplateRoute() {
  return (
    <PermissionGuard page="exam-admit-cards">
      <AdmitCardTemplatePage />
    </PermissionGuard>
  )
}
