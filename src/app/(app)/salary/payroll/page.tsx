'use client'

import { PayrollRunPage } from '@/features/salary/pages/payroll-run-page'
import { PermissionGuard } from '@/components/shared'

export default function SalaryPayrollRoute() {
  return (
    <PermissionGuard page="salary-payroll">
      <PayrollRunPage />
    </PermissionGuard>
  )
}
