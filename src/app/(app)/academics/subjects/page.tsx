'use client'

import { SubjectsPage } from '@/features/academics/pages/subjects-page'
import { PermissionGuard } from '@/components/shared'

export default function SubjectsRoute() {
  return <PermissionGuard page="subjects"><SubjectsPage /></PermissionGuard>
}
