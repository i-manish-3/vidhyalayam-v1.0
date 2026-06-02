'use client'

import { useParams } from 'next/navigation'
import { ExamResultPreviewPage } from '@/features/exams/pages/exam-result-preview-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamResultsRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-result-preview">
      <ExamResultPreviewPage examId={params.id} />
    </PermissionGuard>
  )
}
