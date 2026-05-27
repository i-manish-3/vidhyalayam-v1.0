'use client'

import { useParams } from 'next/navigation'
import { StaffEditPage } from '@/features/people/pages/staff-edit-page'
import { PermissionGuard } from '@/components/shared'

export default function EditStaffRoute() {
  const params = useParams<{ id: string }>()
  return <PermissionGuard page="staff-detail"><StaffEditPage staffId={params.id} /></PermissionGuard>
}
