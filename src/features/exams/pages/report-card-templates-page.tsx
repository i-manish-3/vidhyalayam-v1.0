'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { LayoutTemplate, MoreVertical, Pencil, Plus, Copy, Star, Trash2 } from 'lucide-react'

interface ReportCardTemplate {
  id: string
  name: string
  description: string | null
  format: string
  appliesToParadigmId: string | null
  includeAttendance: boolean
  includeRank: boolean
  includeCoScholastic: boolean
  showPrincipalRemarks: boolean
  showTeacherRemarks: boolean
  isDefault: boolean
  isActive: boolean
}

const FORMAT_BADGES: Record<string, { label: string; cls: string }> = {
  cbse: { label: 'CBSE', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  simple: { label: 'Simple', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  term_wise: { label: 'Term-wise', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  grade_only: { label: 'Grade-only', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  coaching: { label: 'Coaching', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
}

export function ReportCardTemplatesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<ReportCardTemplate[]>([])
  const [deleteTarget, setDeleteTarget] = useState<ReportCardTemplate | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ templates: ReportCardTemplate[] }>(
        '/api/school/exams/report-card-templates',
      )
      setTemplates(res.templates)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not load templates',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleCreate() {
    setBusy(true)
    try {
      const res = await api.post<{ template: { id: string } }>(
        '/api/school/exams/report-card-templates',
        { name: `Untitled Template ${new Date().toLocaleDateString('en-IN')}` },
      )
      router.push(`/exams/report-card-templates/${res.template.id}/edit`)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not create',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleClone(target: ReportCardTemplate) {
    setBusy(true)
    try {
      const res = await api.post<{ template: { id: string } }>(
        '/api/school/exams/report-card-templates',
        {
          name: `${target.name} (copy)`,
          cloneFromId: target.id,
          description: target.description,
        },
      )
      toast({ title: 'Template cloned' })
      router.push(`/exams/report-card-templates/${res.template.id}/edit`)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not clone',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleSetDefault(target: ReportCardTemplate) {
    setBusy(true)
    try {
      await api.patch(`/api/school/exams/report-card-templates/${target.id}`, { isDefault: true })
      toast({ title: 'Default template updated' })
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not update',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api.delete(`/api/school/exams/report-card-templates/${deleteTarget.id}`)
      toast({ title: 'Template deleted' })
      setDeleteTarget(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <GradientHero
        icon={LayoutTemplate}
        title="Report card templates"
        description="Per-school layouts that drive report card generation. Clone the default and tweak — never edit the original to keep a safe fallback."
        primaryAction={{
          label: 'New template',
          icon: Plus,
          onClick: handleCreate,
        }}
      />

      {templates.length === 0 ? (
        <GradientEmptyState
          icon={LayoutTemplate}
          title="No report card templates yet"
          description="Create one or seed the defaults (CBSE, Simple, Coaching) to start generating report cards."
          actionLabel="Create template"
          onAction={handleCreate}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const fmt = FORMAT_BADGES[t.format] ?? FORMAT_BADGES.simple
            return (
              <Card
                key={t.id}
                className="gap-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-violet-50 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-sky-500/25 dark:from-sky-500/12 dark:via-card dark:to-violet-500/10"
              >
                <CardHeader className="border-b border-current/10 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-sm">{t.name}</CardTitle>
                        {t.isDefault && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Star className="size-2.5 fill-current" /> Default
                          </Badge>
                        )}
                        {!t.isActive && (
                          <Badge variant="outline" className="text-[10px] text-amber-600">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className={`text-[10px] ${fmt.cls}`}>
                          {fmt.label}
                        </Badge>
                        {t.includeAttendance && (
                          <Badge variant="outline" className="text-[10px]">Attendance</Badge>
                        )}
                        {t.includeRank && (
                          <Badge variant="outline" className="text-[10px]">Rank</Badge>
                        )}
                        {t.includeCoScholastic && (
                          <Badge variant="outline" className="text-[10px]">Co-scholastic</Badge>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/exams/report-card-templates/${t.id}/edit`)}
                        >
                          <Pencil className="mr-2 size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleClone(t)} disabled={busy}>
                          <Copy className="mr-2 size-4" /> Clone
                        </DropdownMenuItem>
                        {!t.isDefault && (
                          <DropdownMenuItem
                            onClick={() => void handleSetDefault(t)}
                            disabled={busy}
                          >
                            <Star className="mr-2 size-4" /> Set as default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                          disabled={t.isDefault}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  {t.description ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  ) : (
                    <p className="text-xs italic text-muted-foreground/70">No description</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; will be soft-deleted. Existing report cards already generated stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
