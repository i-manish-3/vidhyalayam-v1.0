'use client'

import { use } from 'react'
import { SchoolDetailPage } from '@/features/admin/pages/school-detail-page'
import { RoleGuard } from '@/components/shared'

export default function SchoolDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RoleGuard role="SUPER_ADMIN">
      <SchoolDetailPage schoolId={id} />
    </RoleGuard>
  )
}
