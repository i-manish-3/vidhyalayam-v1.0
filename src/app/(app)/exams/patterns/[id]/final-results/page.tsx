'use client'

import { useParams } from 'next/navigation'
import { FinalResultsPage } from '@/features/exams/pages/final-results-page'
import { PermissionGuard } from '@/components/shared'

export default function FinalResultsRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-paradigms">
      <FinalResultsPage paradigmId={params.id} />
    </PermissionGuard>
  )
}
