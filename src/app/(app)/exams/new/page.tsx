'use client'

import { ExamFormPage } from '@/features/exams/pages/exam-form-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamCreateRoute() {
  return <PermissionGuard page="exam-create"><ExamFormPage /></PermissionGuard>
}
