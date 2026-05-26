'use client'

import { use } from 'react'
import { StudentDetailPage } from '@/features/students/pages/student-detail-page'

export default function StudentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <StudentDetailPage studentId={id} />
}
