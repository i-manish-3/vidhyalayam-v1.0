'use client'

// Phase 1 placeholder. The legacy ExamResult marks-entry UI was retired with
// the schema migration on 2026-06-02. The new marks-entry grid and computed
// results pages land in Phase 3/4 at src/app/(app)/exams/[id]/marks and
// src/app/(app)/exams/[id]/results.
import { PageHeader, EmptyState } from '@/components/shared'
import { FileText } from 'lucide-react'

export function ExamResultsPage() {
  return (
    <>
      <PageHeader title="Exam Results" description="Computed exam outcomes" />
      <EmptyState
        icon={FileText}
        title="Results are being rebuilt"
        description="The new result-calculation engine (subject summary → exam result → group rollup → final result) ships in Phase 4."
      />
    </>
  )
}
