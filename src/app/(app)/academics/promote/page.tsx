'use client'

import { PromoteStudentPage } from '@/features/academics/pages/promote-student-page'
import { PermissionGuard } from '@/components/shared'

export default function PromoteStudentRoute() {
  return <PermissionGuard page="promote-student"><PromoteStudentPage /></PermissionGuard>
}
