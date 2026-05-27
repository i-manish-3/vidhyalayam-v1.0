'use client'

import { SalaryAdvancePage } from '@/features/salary/pages/salary-advance-page'
import { PermissionGuard } from '@/components/shared'

export default function SalaryAdvanceRoute() {
  return <PermissionGuard page="salary-advance"><SalaryAdvancePage /></PermissionGuard>
}
