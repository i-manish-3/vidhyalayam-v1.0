'use client'

import { use } from 'react'
import { EditSubjectPage } from '@/features/academics/pages/edit-subject-page'
import { PermissionGuard } from '@/components/shared'

export default function EditSubjectRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PermissionGuard page="edit-subject"><EditSubjectPage subjectId={id} /></PermissionGuard>
}
