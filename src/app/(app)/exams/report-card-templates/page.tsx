'use client'

import { ReportCardTemplatesPage } from '@/features/exams/pages/report-card-templates-page'
import { PermissionGuard } from '@/components/shared'

export default function ReportCardTemplatesRoute() {
  return (
    <PermissionGuard page="exam-report-card-templates">
      <ReportCardTemplatesPage />
    </PermissionGuard>
  )
}
