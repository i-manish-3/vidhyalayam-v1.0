'use client'

import { SalaryStructurePage } from '@/features/salary/pages/salary-structure-page'
import { PermissionGuard } from '@/components/shared'

export default function SalaryStructureRoute() {
  return <PermissionGuard page="salary-structure"><SalaryStructurePage /></PermissionGuard>
}
