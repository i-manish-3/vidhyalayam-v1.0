'use client'

import { use } from 'react'
import { EditClassPage } from '@/features/academics/pages/edit-class-page'
import { PermissionGuard } from '@/components/shared'

export default function EditClassRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PermissionGuard page="edit-class"><EditClassPage classId={id} /></PermissionGuard>
}
