'use client'

import { useParams } from 'next/navigation'
import { AddTeacherPage } from '@/features/people/pages/add-teacher-page'
import { PermissionGuard } from '@/components/shared'

export default function EditTeacherRoute() {
  const params = useParams<{ id: string }>()
  return <PermissionGuard page="add-teacher"><AddTeacherPage teacherId={params.id} /></PermissionGuard>
}
