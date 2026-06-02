'use client'

import { Suspense } from 'react'
import { IdCardGeneratePage } from '@/features/id-cards/pages/generate-page'
import { PermissionGuard } from '@/components/shared'
import { LoadingState } from '@/components/shared'

export default function IdCardGenerateRoute() {
  return (
    <PermissionGuard page="id-card-generate">
      <Suspense fallback={<LoadingState />}>
        <IdCardGeneratePage />
      </Suspense>
    </PermissionGuard>
  )
}
