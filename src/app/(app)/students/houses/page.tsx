'use client'

import { PermissionGuard } from '@/components/shared'
import { StudentHousesPage } from '@/features/students/pages/student-houses-page'

export default function StudentHousesRoute() {
  return <PermissionGuard page="student-houses"><StudentHousesPage /></PermissionGuard>
}
