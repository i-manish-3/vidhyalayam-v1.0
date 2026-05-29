'use client'

import { PricingPlansPage } from '@/features/marketing/pages/pricing-plans-page'
import { RoleGuard } from '@/components/shared'

export default function PricingPlansRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <PricingPlansPage />
    </RoleGuard>
  )
}
