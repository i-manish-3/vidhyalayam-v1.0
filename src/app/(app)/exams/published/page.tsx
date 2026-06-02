'use client'

import { PublishedResultsPage } from '@/features/exams/pages/published-results-page'
import { PermissionGuard } from '@/components/shared'

export default function PublishedResultsRoute() {
  return (
    <PermissionGuard page="exam-published-results">
      <PublishedResultsPage />
    </PermissionGuard>
  )
}
