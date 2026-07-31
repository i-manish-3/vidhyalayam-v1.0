'use client'

import { useParams } from 'next/navigation'
import { ParadigmGroupsPage } from '@/features/exams/pages/paradigm-groups-page'
import { PermissionGuard } from '@/components/shared'

export default function ParadigmGroupsRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-groups">
      <ParadigmGroupsPage paradigmId={params.id} />
    </PermissionGuard>
  )
}
