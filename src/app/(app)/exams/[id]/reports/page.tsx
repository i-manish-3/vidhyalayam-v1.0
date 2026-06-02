'use client'

import { ExamReportsPage } from '@/features/exams/pages/exam-reports-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamReportsRoute() {
  return (
    <PermissionGuard page="exam-result-preview">
      <ExamReportsPage />
    </PermissionGuard>
  )
}
