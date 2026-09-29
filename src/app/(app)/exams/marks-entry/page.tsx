'use client'

import { PermissionGuard } from '@/components/shared'
import { MarksEntryHubPage } from '@/features/exams/pages/marks-entry-hub-page'

export default function MarksEntryRoute() {
  return (
    <PermissionGuard page="exam-marks-entry">
      <MarksEntryHubPage />
    </PermissionGuard>
  )
}
