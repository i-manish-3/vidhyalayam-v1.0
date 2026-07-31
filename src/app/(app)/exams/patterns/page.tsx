'use client'

import { ExamParadigmsPage } from '@/features/exams/pages/paradigms-page'
import { PermissionGuard } from '@/components/shared'

export default function ParadigmsRoute() {
  return <PermissionGuard page="exam-paradigms"><ExamParadigmsPage /></PermissionGuard>
}
