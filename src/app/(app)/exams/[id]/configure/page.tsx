'use client'

import { useParams } from 'next/navigation'
import { ExamConfigurePage } from '@/features/exams/pages/exam-configure-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamConfigureRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-configure">
      <ExamConfigurePage examId={params.id} />
    </PermissionGuard>
  )
}
