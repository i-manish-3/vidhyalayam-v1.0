'use client'

// Phase 1 placeholder. The legacy ExamResult marks-entry UI was retired with
// the schema migration on 2026-06-02. The new marks-entry grid and computed
// results pages land in Phase 3/4 at src/app/(app)/exams/[id]/marks and
// src/app/(app)/exams/[id]/results.
import { GradientHero, GradientEmptyState } from '@/components/shared'
import { BarChart3 } from 'lucide-react'

export function ExamResultsPage() {
  return (
    <div className="space-y-4">
      <GradientHero
        icon={BarChart3}
        title="Exam Results"
        description="Computed exam outcomes"
      />
      <GradientEmptyState
        icon={BarChart3}
        title="Results are being rebuilt"
        description="The new result-calculation engine (subject summary → exam result → term rollup → final result) ships in Phase 4."
      />
    </div>
  )
}
