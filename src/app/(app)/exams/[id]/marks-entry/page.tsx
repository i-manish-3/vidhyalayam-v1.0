'use client'

import { useParams } from 'next/navigation'
import { MarksEntryPage } from '@/features/exams/pages/marks-entry-page'
import { PermissionGuard } from '@/components/shared'

export default function MarksEntryRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-marks-entry">
      <MarksEntryPage examId={params.id} />
    </PermissionGuard>
  )
}
