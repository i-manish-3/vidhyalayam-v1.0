'use client'

import { SalaryReportsPage } from '@/features/salary/pages/salary-reports-page'
import { PermissionGuard } from '@/components/shared'

export default function SalaryReportsRoute() {
  return (
    <PermissionGuard page="salary-reports">
      <SalaryReportsPage />
    </PermissionGuard>
  )
}
