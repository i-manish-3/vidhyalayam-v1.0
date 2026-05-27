'use client'

import { StudentsPage } from '@/features/students/pages/students-page'
import { PermissionGuard } from '@/components/shared'

export default function StudentsRoute() {
  return <PermissionGuard page="students"><StudentsPage /></PermissionGuard>
}
