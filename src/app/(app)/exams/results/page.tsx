'use client'

import { ExamResultsPage } from '@/features/exams/pages/exam-results-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamResultsRoute() {
  return <PermissionGuard page="exam-results"><ExamResultsPage /></PermissionGuard>
}
