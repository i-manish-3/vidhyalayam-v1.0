'use client'

import { useParams } from 'next/navigation'
import { ExamFormPage } from '@/features/exams/pages/exam-form-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamEditRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-edit">
      <ExamFormPage examId={params.id} />
    </PermissionGuard>
  )
}
