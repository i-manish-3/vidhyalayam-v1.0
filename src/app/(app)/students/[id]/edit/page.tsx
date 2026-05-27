'use client'

import { use } from 'react'
import { EditStudentPage } from '@/features/students/pages/edit-student-page'
import { PermissionGuard } from '@/components/shared'

export default function EditStudentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PermissionGuard page="edit-student"><EditStudentPage studentId={id} /></PermissionGuard>
}
