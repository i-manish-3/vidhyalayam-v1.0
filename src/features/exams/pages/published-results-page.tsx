'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState, EmptyState } from '@/components/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Award, BarChart3, ExternalLink } from 'lucide-react'

interface PublishedExam {
  id: string
  name: string
  academicYear: string
  publishedAt: string | null
  group: { name: string; paradigm: { name: string } | null } | null
}

/**
 * Admin-side view of all exams that have been published to parents/students.
 * Read-only; the per-exam Results page hosts the publish/unpublish actions.
 */
export function PublishedResultsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<PublishedExam[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ exams: PublishedExam[] }>(
        '/api/school/exams?status=result_published',
      )
      setExams(res.exams ?? [])
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load published results',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Published results"
        description="Exams whose results are currently visible to parents and students."
        backAction={{ onClick: () => router.push('/exams') }}
      />

      {exams.length === 0 ? (
        <EmptyState
          icon={Award}
          title="Nothing published yet"
          description="Compute exam results, review them, then click Publish on the results screen to surface them to parents."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {exams.map((e) => (
            <Card key={e.id} className="transition hover:border-primary/40">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm">{e.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {e.group?.paradigm?.name ? `${e.group.paradigm.name} · ` : ''}
                      {e.group?.name} · AY {e.academicYear}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">PUBLISHED</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {e.publishedAt
                    ? `Published ${new Date(e.publishedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}`
                    : '—'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/exams/${e.id}/results`)}
                >
                  <BarChart3 className="mr-1.5 size-3.5" /> View
                  <ExternalLink className="ml-1 size-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
