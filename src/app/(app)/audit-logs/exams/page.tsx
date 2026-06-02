'use client'

import { ExamAuditLogPage } from '@/features/exams/pages/exam-audit-log-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamAuditLogRoute() {
  return (
    <PermissionGuard page="exam-audit-log">
      <ExamAuditLogPage />
    </PermissionGuard>
  )
}
