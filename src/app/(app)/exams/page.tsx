'use client'

import { ExamsPage } from '@/features/exams/pages/exams-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamsRoute() {
  return <PermissionGuard page="exams"><ExamsPage /></PermissionGuard>
}
