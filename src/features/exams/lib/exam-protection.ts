export interface ExamProtectionInfo {
  isProtected: boolean
  canDelete: boolean
  reasons: string[]
  marksCount: number
  resultsCount: number
  isConducted: boolean
  isLocked: boolean
  isPublished: boolean
}

export interface ExamCheckTarget {
  status: string
  startDate?: string | Date | null
  endDate?: string | Date | null
  lockedAt?: string | Date | null
  publishedAt?: string | Date | null
  _count?: {
    marks?: number
    results?: number
    schedules?: number
    subjectConfigs?: number
  }
}

/**
 * Checks whether an exam is protected from deletion.
 * An exam CANNOT be deleted if:
 * 1. It has student marks entered (marksCount > 0).
 * 2. It has computed or published results.
 * 3. It has already been conducted (status = completed, ongoing, or past schedule/end date).
 * 4. It is locked by administration.
 */
export function evaluateExamProtection(exam: ExamCheckTarget): ExamProtectionInfo {
  const reasons: string[] = []
  const marksCount = exam._count?.marks ?? 0
  const resultsCount = exam._count?.results ?? 0
  const isLocked = Boolean(exam.lockedAt)
  const isPublished = exam.status === 'result_published' || Boolean(exam.publishedAt)

  // 1. Marks entered check
  if (marksCount > 0) {
    reasons.push(
      `Marks recorded: ${marksCount} student mark ${marksCount === 1 ? 'entry exists' : 'entries exist'} for this exam.`,
    )
  }

  // 2. Results computed or published check
  if (resultsCount > 0) {
    reasons.push(
      `Results calculated: Report results have already been generated for ${resultsCount} student${resultsCount === 1 ? '' : 's'}.`,
    )
  }
  if (isPublished) {
    reasons.push('Results published: Results for this exam have already been published.')
  }

  // 3. Conducted check
  let isConducted = false
  if (exam.status === 'completed') {
    isConducted = true
    reasons.push('Exam conducted: Exam status is marked as Completed.')
  } else if (exam.status === 'ongoing') {
    isConducted = true
    reasons.push('Exam ongoing: Exam is currently in progress.')
  }

  const now = new Date()
  if (exam.endDate) {
    const end = new Date(exam.endDate)
    const endOfDay = new Date(end)
    endOfDay.setHours(23, 59, 59, 999)
    if (!Number.isNaN(end.getTime()) && endOfDay < now) {
      isConducted = true
      reasons.push(
        `Exam conducted: Timetable ended on ${end.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}.`,
      )
    }
  } else if (exam.startDate && exam.status !== 'draft') {
    const start = new Date(exam.startDate)
    if (!Number.isNaN(start.getTime()) && start < now) {
      isConducted = true
      reasons.push(
        `Exam conducted: Exam commenced on ${start.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}.`,
      )
    }
  }

  // 4. Admin lock check
  if (isLocked) {
    reasons.push('Exam locked: This exam has been locked by an administrator.')
  }

  return {
    isProtected: reasons.length > 0,
    canDelete: reasons.length === 0,
    reasons,
    marksCount,
    resultsCount,
    isConducted,
    isLocked,
    isPublished,
  }
}
