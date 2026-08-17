'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { PERMISSIONS, usePermissions } from '@/hooks/use-permissions'
import { MarksGrid } from '@/features/exams/components/marks-grid'
import { ExamInstructionsButton } from '@/features/exams/components/exam-instructions-button'
import { Settings2, ClipboardCheck, Lock, BookOpen } from 'lucide-react'
import { examStatusMeta } from '@/features/exams/lib/status-meta'

interface ExamInfo {
  id: string
  name: string
  status: string
  academicYear: string
  lockedAt: string | null
  group: { name: string; paradigm: { name: string; academicYear: string } }
  subjectConfigs: Array<{ id: string; classId: string; sectionId: string | null; subjectId: string }>
}

interface Props {
  examId: string
}

export function MarksEntryPage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const { hasAnyPermission } = usePermissions()
  const [exam, setExam] = useState<ExamInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const res = await api.get<{ exam: ExamInfo }>(`/api/school/exams/${examId}`)
        setExam(res.exam)
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Could not load exam',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [examId, toast])

  if (loading) return <LoadingState />
  if (!exam) return null

  const status = examStatusMeta(exam.status)
  const canManageExam = hasAnyPermission([
    PERMISSIONS.EXAM_MANAGE,
    'exam:configure',
    'exam:schedule',
  ])

  return (
    <div className="space-y-4">
      <GradientHero
        icon={ClipboardCheck}
        title={`Marks: ${exam.name}`}
        badge={exam.academicYear}
        description={`${exam.group.paradigm.name} / ${exam.group.name}`}
        secondaryAction={canManageExam
          ? {
              label: 'Configure',
              icon: Settings2,
              onClick: () => router.push(`/exams/${examId}/configure`),
            }
          : undefined}
        extraActions={<ExamInstructionsButton />}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 px-3 py-2 shadow-sm dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10">
        <Badge variant="outline" className={status.tone}>{status.label}</Badge>
        <Badge variant="outline" className="gap-1.5">
          <BookOpen className="size-3" />
          {exam.subjectConfigs.length} subject{exam.subjectConfigs.length === 1 ? '' : 's'}
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <ClipboardCheck className="size-3" />
          {exam.group.paradigm.name} / {exam.group.name}
        </Badge>
        {exam.lockedAt && (
          <Badge variant="outline" className="gap-1.5 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
            <Lock className="size-3" />
            Locked
          </Badge>
        )}
      </div>

      {exam.subjectConfigs.length === 0 && (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50/60 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/20 dark:text-amber-200">
          No subjects have been configured for this exam yet.
          {canManageExam && (
            <>
              {' '}
              <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => router.push(`/exams/${examId}/configure`)}>
                Add subjects
              </Button>
            </>
          )}
        </div>
      )}

      <MarksGrid examId={examId} examStatus={exam.status} academicYear={exam.academicYear} subjectConfigs={exam.subjectConfigs} />
    </div>
  )
}
