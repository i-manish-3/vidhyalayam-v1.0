'use client'

import { AcademicYearsPage } from '@/features/settings/pages/academic-years-page'
import { PermissionGuard } from '@/components/shared'

export default function AcademicYearsRoute() {
  return <PermissionGuard page="academic-years"><AcademicYearsPage /></PermissionGuard>
}
