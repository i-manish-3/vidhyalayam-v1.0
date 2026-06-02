'use client'

import { ReportCardTemplateEditPage } from '@/features/exams/pages/report-card-template-edit-page'
import { PermissionGuard } from '@/components/shared'

export default function ReportCardTemplateEditRoute() {
  return (
    <PermissionGuard page="exam-report-card-template-edit">
      <ReportCardTemplateEditPage />
    </PermissionGuard>
  )
}
