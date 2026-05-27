'use client'

import { AddTeacherPage } from '@/features/people/pages/add-teacher-page'
import { PermissionGuard } from '@/components/shared'

export default function AddTeacherRoute() {
  return <PermissionGuard page="add-teacher"><AddTeacherPage /></PermissionGuard>
}
