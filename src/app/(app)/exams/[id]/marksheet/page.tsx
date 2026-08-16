'use client'

import { useParams } from 'next/navigation'
import { MarksheetPage } from '@/features/exams/pages/marksheet-page'
import { PermissionGuard } from '@/components/shared'

export default function MarksheetRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-marks-entry">
      <MarksheetPage examId={params.id} />
    </PermissionGuard>
  )
}
