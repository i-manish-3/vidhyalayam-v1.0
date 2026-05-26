'use client'

import { use } from 'react'
import { EditClassPage } from '@/features/academics/pages/edit-class-page'

export default function EditClassRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditClassPage classId={id} />
}
