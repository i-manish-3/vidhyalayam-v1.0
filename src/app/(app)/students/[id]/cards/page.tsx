'use client'

import { use } from 'react'
import { StudentRfidCardsPage } from '@/features/rfid/pages/student-cards-page'
import { PermissionGuard } from '@/components/shared'

export default function StudentCardsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <PermissionGuard page="student-rfid-cards">
      <StudentRfidCardsPage studentId={id} />
    </PermissionGuard>
  )
}
