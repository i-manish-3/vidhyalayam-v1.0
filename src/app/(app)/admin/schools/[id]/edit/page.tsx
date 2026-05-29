'use client'

import { use } from 'react'
import { EditSchoolPage } from '@/features/admin/pages/edit-school-page'
import { RoleGuard } from '@/components/shared'

export default function EditSchoolRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RoleGuard role="SUPER_ADMIN">
      <EditSchoolPage schoolId={id} />
    </RoleGuard>
  )
}
