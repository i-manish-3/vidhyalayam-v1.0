'use client'

import { useState } from 'react'
import { FeeListPage } from '@/features/fees/pages/fee-list-page'
import { FeePaymentCancellation } from './fee-payment-cancellation'
import { PermissionGuard } from '@/components/shared'

export default function FeeListRoute() {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <PermissionGuard page="fee-list">
      <FeeListPage
        key={refreshKey}
        headerActions={<FeePaymentCancellation onCancelled={() => setRefreshKey((value) => value + 1)} />}
      />
    </PermissionGuard>
  )
}
