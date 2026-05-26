'use client'

import { use } from 'react'
import { EditStudentPage } from '@/features/students/pages/edit-student-page'

export default function EditStudentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditStudentPage studentId={id} />
}
