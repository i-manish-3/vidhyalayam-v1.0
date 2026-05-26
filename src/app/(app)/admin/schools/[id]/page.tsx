'use client'

import { use } from 'react'
import { SchoolDetailPage } from '@/features/admin/pages/school-detail-page'

export default function SchoolDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <SchoolDetailPage schoolId={id} />
}
