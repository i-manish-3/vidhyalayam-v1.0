'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, EmptyState, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  IdCard,
  MoreVertical,
  Pencil,
  Trash2,
  Star,
  Printer,
  Sparkles,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react'
import { PresetGalleryDialog } from '@/features/id-cards/components/preset-gallery-dialog'
import {
  IdCardHtmlRenderer,
  DEMO_HTML_CARD,
  type HtmlRenderTemplate,
} from '@/features/id-cards/components/id-card-html-renderer'
import type { IdCardPreset } from '@/features/id-cards/presets'

interface TemplateSummary {
  id: string
  name: string
  description: string | null
  templateMode: 'html' | 'element'
  orientation: 'portrait' | 'landscape'
  widthMm: number
  heightMm: number
  backgroundColor: string
  hasBackSide: boolean
  isDefault: boolean
  isActive: boolean
  frontHtml: string | null
  frontCss: string | null
  createdAt: string
  updatedAt: string
}

// Card thumbnail size: keep the longest edge around 140px so a 4-col grid
// looks dense but readable.
function thumbnailScale(widthMm: number, heightMm: number): number {
  const longest = Math.max(widthMm, heightMm)
  // 86mm × 3.78px/mm = ~325px. We want ~140px → scale ≈ 0.43.
  return Math.min(0.6, 140 / (longest * 3.78))
}

function TemplateThumbnail({ template, schoolLogo }: { template: TemplateSummary; schoolLogo: string | null }) {
  const scale = useMemo(() => thumbnailScale(template.widthMm, template.heightMm), [template.widthMm, template.heightMm])

  const renderTpl: HtmlRenderTemplate = {
    widthMm: template.widthMm,
    heightMm: template.heightMm,
    frontHtml: template.frontHtml || '',
    frontCss: template.frontCss || '',
    backHtml: null,
    backCss: null,
    hasBackSide: false,
  }

  if (template.templateMode !== 'html' || !template.frontHtml) {
    const OrientIcon = template.orientation === 'landscape' ? RectangleHorizontal : RectangleVertical
    return (
      <div
        className="flex h-full w-full items-center justify-center rounded-md border border-dashed"
        style={{ backgroundColor: template.backgroundColor || '#fafafa' }}
      >
        <div className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground">
          <OrientIcon className="size-8 opacity-60" />
          <span>Legacy template</span>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center overflow-hidden">
      <IdCardHtmlRenderer
        template={renderTpl}
        card={DEMO_HTML_CARD}
        schoolLogo={schoolLogo}
        scale={scale}
        side="front"
      />
    </div>
  )
}

export function IdCardTemplatesPage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<TemplateSummary | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [applyingPreset, setApplyingPreset] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ templates: TemplateSummary[] }>('/api/school/id-cards/templates')
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

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/school/id-cards/templates/${deleteTarget.id}`)
      toast({ title: 'Template deleted' })
      setDeleteTarget(null)
      void load()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not delete template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleApplyPreset = async (preset: IdCardPreset) => {
    setApplyingPreset(true)
    try {
      const res = await api.post<{ template: { id: string; name: string } }>(
        '/api/school/id-cards/templates',
        {
          name: preset.name,
          description: preset.description,
          templateMode: 'html',
          orientation: preset.orientation,
          widthMm: preset.widthMm,
          heightMm: preset.heightMm,
          backgroundColor: '#ffffff',
          frontHtml: preset.frontHtml,
          frontCss: preset.frontCss,
          backHtml: preset.backHtml,
          backCss: preset.backCss,
          hasBackSide: preset.hasBackSide,
          isDefault: templates.length === 0,
          isActive: true,
        },
      )
      toast({ title: 'Template created', description: `"${res.template.name}" is ready to use.` })
      setGalleryOpen(false)
      router.push(`/id-cards/templates/${res.template.id}`)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not create template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setApplyingPreset(false)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="ID Card Templates"
        description="Pick a polished starter design or write your own HTML/CSS."
        action={{
          label: 'View Design Gallery',
          icon: Sparkles,
          onClick: () => router.push('/id-cards/showcase'),
        }}
        secondaryAction={{
          label: 'Generate Cards',
          icon: Printer,
          onClick: () => router.push('/id-cards/generate'),
        }}
      />

      {templates.length === 0 ? (
        <div className="rounded-2xl border bg-gradient-to-br from-violet-50 via-fuchsia-50 to-amber-50 p-10 text-center dark:from-violet-950/30 dark:via-fuchsia-950/20 dark:to-amber-950/20">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30">
            <Sparkles className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Start with a polished preset</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Five hand-designed templates ready to use — Aurora, Onyx Elite, Pulse, Spectrum, Editorial.
            Pick one and customise the HTML/CSS to match your brand.
          </p>
          <Button className="mt-5 gap-2" onClick={() => setGalleryOpen(true)}>
            <Sparkles className="size-4" /> Browse Presets
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="group cursor-pointer overflow-hidden border-border/60 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => router.push(`/id-cards/templates/${t.id}`)}
              >
                <div
                  className="relative flex h-44 items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.06), transparent 50%), radial-gradient(circle at 70% 70%, rgba(236,72,153,0.06), transparent 50%)',
                  }}
                >
                  <TemplateThumbnail template={t} schoolLogo={currentSchool?.logo || null} />
                </div>
                <CardContent className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold">{t.name}</h3>
                        {t.isDefault && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Star className="size-2.5 fill-current" /> Default
                          </Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="size-7 shrink-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/id-cards/templates/${t.id}`)}>
                          <Pencil className="mr-2 size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => router.push(`/id-cards/generate?template=${t.id}`)}
                        >
                          <Printer className="mr-2 size-4" /> Generate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="mr-2 size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {t.widthMm}×{t.heightMm}
                    </Badge>
                    {t.hasBackSide && (
                      <Badge variant="outline" className="text-[10px]">
                        F+B
                      </Badge>
                    )}
                    {t.templateMode === 'element' && (
                      <Badge variant="outline" className="text-[10px] text-amber-600">
                        Legacy
                      </Badge>
                    )}
                    {!t.isActive && (
                      <Badge variant="outline" className="text-[10px] text-amber-600">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* "Browse Presets" call-to-action card */}
            <button
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="group relative flex h-full min-h-[300px] flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border-2 border-dashed border-border/70 bg-gradient-to-br from-violet-50/50 via-fuchsia-50/50 to-amber-50/50 p-6 text-center transition hover:border-primary/50 hover:from-violet-50 hover:via-fuchsia-50 hover:to-amber-50 dark:from-violet-950/20 dark:via-fuchsia-950/20 dark:to-amber-950/10"
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/30 transition group-hover:scale-110">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Browse Presets</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  5 hand-designed starter templates
                </div>
              </div>
            </button>
          </div>
        </>
      )}

      <PresetGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onApply={handleApplyPreset}
        busy={applyingPreset}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be removed. Cards already generated remain available — only the
              template will no longer be selectable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete Template'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
