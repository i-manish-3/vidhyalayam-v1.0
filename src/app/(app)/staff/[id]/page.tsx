'use client'

import { use } from 'react'
import { StaffDetailPage } from '@/features/people/pages/staff-detail-page'
import { PermissionGuard } from '@/components/shared'

export default function StaffDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PermissionGuard page="staff-detail"><StaffDetailPage staffId={id} /></PermissionGuard>
}
