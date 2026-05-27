'use client'

import { AnnualTransportSetupPage } from '@/features/transport/pages/annual-transport-setup-page'
import { PermissionGuard } from '@/components/shared'

export default function AnnualTransportSetupRoute() {
  return <PermissionGuard page="transport-annual-setup"><AnnualTransportSetupPage /></PermissionGuard>
}
