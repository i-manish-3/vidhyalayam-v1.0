'use client'

import { AnnualHostelSetupPage } from '@/features/hostel/pages/annual-hostel-setup-page'
import { PermissionGuard } from '@/components/shared'

export default function AnnualHostelSetupRoute() {
  return <PermissionGuard page="hostel-annual-setup"><AnnualHostelSetupPage /></PermissionGuard>
}
