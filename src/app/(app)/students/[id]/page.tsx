'use client'

import { use } from 'react'
import { StudentDetailPage } from '@/features/students/pages/student-detail-page'
import { PermissionGuard } from '@/components/shared'

export default function StudentDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PermissionGuard page="student-detail"><StudentDetailPage studentId={id} /></PermissionGuard>
}
