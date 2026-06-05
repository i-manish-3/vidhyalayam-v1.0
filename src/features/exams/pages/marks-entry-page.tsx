'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { MarksGrid } from '@/features/exams/components/marks-grid'
import { ExamInstructionsButton } from '@/features/exams/components/exam-instructions-button'
import { Settings2, Calendar as CalIcon } from 'lucide-react'

interface ExamInfo {
  id: string
  name: string
  status: string
  academicYear: string
  lockedAt: string | null
  group: { name: string; paradigm: { name: string; academicYear: string } }
  subjectConfigs: unknown[]
}

interface Props {
  examId: string
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  ongoing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  result_published: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
}

export function MarksEntryPage({ examId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
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

  const statusTone = STATUS_TONE[exam.status] ?? STATUS_TONE.draft

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Marks: ${exam.name}`}
        description={`${exam.group.paradigm.name} · ${exam.group.name}`}
        backAction={{ onClick: () => router.push('/exams/list') }}
        secondaryAction={{
          label: 'Configure',
          icon: Settings2,
          onClick: () => router.push(`/exams/${examId}/configure`),
        }}
      />

      <div className="flex items-center gap-3">
        <Badge className={statusTone}>{exam.status.replace('_', ' ')}</Badge>
        <Badge variant="outline">
          {exam.subjectConfigs.length} subject{exam.subjectConfigs.length === 1 ? '' : 's'} configured
        </Badge>
        {exam.lockedAt && (
          <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Exam is locked — marks cannot be changed
          </Badge>
        )}
        <div className="ml-auto">
          <ExamInstructionsButton />
        </div>
      </div>

      {exam.subjectConfigs.length === 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
          No subjects have been configured for this exam yet.{' '}
          <Button variant="link" size="sm" className="h-auto p-0 text-sm" onClick={() => router.push(`/exams/${examId}/configure`)}>
            Add them on the Configure page
          </Button>{' '}
          first.
        </div>
      )}

      <MarksGrid examId={examId} examStatus={exam.status} academicYear={exam.academicYear} />
    </div>
  )
}
