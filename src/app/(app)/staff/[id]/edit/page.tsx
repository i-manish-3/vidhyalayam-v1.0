'use client'

import { useParams } from 'next/navigation'
import { StaffEditPage } from '@/features/people/pages/staff-edit-page'

export default function EditStaffRoute() {
  const params = useParams<{ id: string }>()
  return <StaffEditPage staffId={params.id} />
}
