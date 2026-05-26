'use client'

import { use } from 'react'
import { EditSubjectPage } from '@/features/academics/pages/edit-subject-page'

export default function EditSubjectRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditSubjectPage subjectId={id} />
}
