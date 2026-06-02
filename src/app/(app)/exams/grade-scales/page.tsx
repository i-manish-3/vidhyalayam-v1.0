'use client'

import { GradeScalesPage } from '@/features/exams/pages/grade-scales-page'
import { PermissionGuard } from '@/components/shared'

export default function GradeScalesRoute() {
  return <PermissionGuard page="exam-grade-scales"><GradeScalesPage /></PermissionGuard>
}
