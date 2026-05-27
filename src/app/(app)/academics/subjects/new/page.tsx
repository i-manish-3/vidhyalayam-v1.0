'use client'

import { AddSubjectPage } from '@/features/academics/pages/add-subject-page'
import { PermissionGuard } from '@/components/shared'

export default function AddSubjectRoute() {
  return <PermissionGuard page="add-subject"><AddSubjectPage /></PermissionGuard>
}
