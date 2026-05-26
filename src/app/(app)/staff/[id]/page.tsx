'use client'

import { use } from 'react'
import { StaffDetailPage } from '@/features/people/pages/staff-detail-page'

export default function StaffDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <StaffDetailPage staffId={id} />
}
