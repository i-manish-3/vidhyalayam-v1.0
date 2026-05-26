'use client'

import { use } from 'react'
import { EditSchoolPage } from '@/features/admin/pages/edit-school-page'

export default function EditSchoolRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditSchoolPage schoolId={id} />
}
