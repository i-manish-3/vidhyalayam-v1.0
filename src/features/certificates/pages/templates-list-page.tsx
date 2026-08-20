'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GradientHero, LoadingState, GradientEmptyState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, LayoutTemplate, Pencil, Trash2, Loader2, Braces, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { certificateTypeDef } from '../lib/certificate-types'
import { CARD_TONES } from '../lib/certificate-ui'

interface TemplateRow {
  id: string
  type: string
  name: string
  description: string | null
  numberPrefix: string
  isDefault: boolean
  isActive: boolean
  updatedAt: string
}

export function CertificateTemplatesListPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ templates: TemplateRow[] }>('/api/school/certificates/templates')
      .then((res) => setTemplates(res.templates))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(t: TemplateRow) {
    if (!window.confirm(`Delete template "${t.name}"? Issued certificates keep their records.`)) return
    setDeletingId(t.id)
    try {
      await api.delete(`/api/school/certificates/templates/${t.id}`)
      setTemplates((prev) => prev.filter((x) => x.id !== t.id))
      toast({ title: 'Template deleted' })
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-4">
      <GradientHero
        icon={LayoutTemplate}
        title="Certificate Templates"
        badge={`${templates.length} template${templates.length === 1 ? '' : 's'}`}
        description="Pre-designed certificate bodies with {{placeholders}} for student and school data."
        primaryAction={{
          label: 'New Template',
          icon: Plus,
          onClick: () => router.push('/certificates/templates/new'),
        }}
      />

      {templates.length === 0 ? (
        <GradientEmptyState
          icon={LayoutTemplate}
          title="No templates yet"
          description="Create your first certificate template to get started."
          actionLabel="Create template"
          onAction={() => router.push('/certificates/templates/new')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t, index) => {
            const tone = CARD_TONES[index % CARD_TONES.length]
            return (
              <Card
                key={t.id}
                className={cn('group gap-0 overflow-hidden border bg-gradient-to-br py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', tone.card)}
              >
                <div className={cn('flex items-start gap-3 border-b border-current/10 bg-gradient-to-r p-3.5', tone.header)}>
                  <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', tone.icon)}>
                    <LayoutTemplate className="size-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <h3 className="mr-1 truncate text-base font-semibold leading-tight">{t.name}</h3>
                      {t.isDefault && (
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 rounded-md px-1.5 text-[10px] border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300"
                        >
                          Default
                        </Badge>
                      )}
                      {!t.isActive && (
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 rounded-md px-1.5 text-[10px] border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300"
                        >
                          Inactive
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{certificateTypeDef(t.type).label}</p>
                  </div>
                </div>
                <CardContent className="flex flex-1 flex-col gap-2 p-3">
                  {t.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <p className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <FileText className="size-3" />
                    Numbers as{' '}
                    <span className="font-mono">{t.numberPrefix}-{new Date().getFullYear()}-0001</span>
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 gap-1.5 border-sky-200 bg-sky-50 text-sky-700 text-xs hover:bg-sky-100 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300"
                      onClick={() => router.push(`/certificates/templates/${t.id}`)}
                    >
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 text-xs hover:bg-emerald-100 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                      onClick={() => router.push(`/certificates/issue?templateId=${t.id}`)}
                    >
                      <Braces className="size-3.5" /> Use
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                      disabled={deletingId === t.id}
                      onClick={() => handleDelete(t)}
                    >
                      {deletingId === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}