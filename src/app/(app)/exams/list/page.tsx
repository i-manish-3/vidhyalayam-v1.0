'use client'

import { Suspense } from 'react'
import { ExamListPage } from '@/features/exams/pages/exam-list-page'
import { PermissionGuard } from '@/components/shared'

export default function ExamListRoute() {
  return (
    <PermissionGuard page="exam-list">
      <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center"><div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
        <ExamListPage />
      </Suspense>
    </PermissionGuard>
  )
}
