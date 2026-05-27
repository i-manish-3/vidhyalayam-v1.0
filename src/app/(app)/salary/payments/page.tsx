'use client'

import { SalaryPaymentsPage } from '@/features/salary/pages/salary-payments-page'
import { PermissionGuard } from '@/components/shared'

export default function SalaryPaymentsRoute() {
  return <PermissionGuard page="salary-payments"><SalaryPaymentsPage /></PermissionGuard>
}
