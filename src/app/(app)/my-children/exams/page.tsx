'use client'

import { ParentExamDetailsPage } from '@/features/exams/pages/parent-exam-details-page'
import { PermissionGuard } from '@/components/shared'

export default function ParentExamsRoute() {
  return (
    <PermissionGuard page="parent-exams">
      <ParentExamDetailsPage />
    </PermissionGuard>
  )
}
