'use client'

import { Suspense } from 'react'
import { ParentFeeDetailsPage } from '@/features/fees/pages/parent-fee-details-page'
import { PermissionGuard } from '@/components/shared'

export default function ParentFeesRoute() {
  return (
    <PermissionGuard page="parent-fees">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <ParentFeeDetailsPage />
      </Suspense>
    </PermissionGuard>
  )
}
