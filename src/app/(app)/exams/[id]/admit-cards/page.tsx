'use client'

import { useParams } from 'next/navigation'
import { AdmitCardPage } from '@/features/exams/pages/admit-card-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamAdmitCardsRoute() {
  const params = useParams<{ id: string }>()
  return (
    <PermissionGuard page="exam-admit-cards">
      <AdmitCardPage examId={params.id} />
    </PermissionGuard>
  )
}
