'use client'

import { StudentWipePage } from '@/features/admin/pages/student-wipe-page'
import { RoleGuard } from '@/components/shared'

export default function SuperAdminStudentWipeRoute() {
  return (
    <RoleGuard role="SUPER_ADMIN">
      <StudentWipePage />
    </RoleGuard>
  )
}