'use client'

import { Suspense } from 'react'
import { FeeCollectionsPage } from '@/features/fees/pages/fee-collections-page'
import { PermissionGuard } from '@/components/shared'

export default function FeeCollectionsRoute() {
  return (
    <PermissionGuard page="fee-collections">
      <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
        <FeeCollectionsPage />
      </Suspense>
    </PermissionGuard>
  )
}
