'use client'

import { Suspense } from 'react'
import { FeeDemandSlipsPage } from '@/features/fees/pages/fee-demand-slips-page'
import { PermissionGuard } from '@/components/shared'

export default function FeeDemandSlipsRoute() {
  return (
    <PermissionGuard page="fee-demand-slips">
      <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
        <FeeDemandSlipsPage />
      </Suspense>
    </PermissionGuard>
  )
}
