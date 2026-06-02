'use client'

import { useParams } from 'next/navigation'
import { ExamSchedulePage } from '@/features/exams/pages/exam-schedule-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamScheduleRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-schedule">
      <ExamSchedulePage examId={params.id} />
    </PermissionGuard>
  )
}
