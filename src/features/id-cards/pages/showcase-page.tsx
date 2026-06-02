'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader, LoadingState } from '@/components/shared'
import { api } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ArrowRight, Loader2, Sparkles, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import {
  IdCardHtmlRenderer,
  DEMO_HTML_CARD,
  type HtmlRenderTemplate,
} from '@/features/id-cards/components/id-card-html-renderer'
import type { IdCardPreset } from '@/features/id-cards/presets'

const CATEGORY_GRADIENT: Record<IdCardPreset['category'], string> = {
  modern: 'from-violet-500 to-fuchsia-500',
  classic: 'from-amber-600 to-orange-600',
  vibrant: 'from-pink-500 to-orange-500',
  corporate: 'from-slate-700 to-slate-900',
  compact: 'from-emerald-500 to-teal-600',
}

const CATEGORY_LABEL: Record<IdCardPreset['category'], string> = {
  modern: 'Modern',
  classic: 'Classic',
  vibrant: 'Vibrant',
  corporate: 'Corporate',
  compact: 'Compact',
}

function presetToTemplate(preset: IdCardPreset): HtmlRenderTemplate {
  return {
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    frontHtml: preset.frontHtml,
    frontCss: preset.frontCss,
    backHtml: preset.backHtml,
    backCss: preset.backCss,
    hasBackSide: preset.hasBackSide,
  }
}

export function IdCardShowcasePage() {
  const router = useRouter()
  const { toast } = useToast()
  const currentSchool = useAppStore((s) => s.currentSchool)
  const [presets, setPresets] = useState<IdCardPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ presets: IdCardPreset[] }>('/api/school/id-cards/presets')
      .then((res) => setPresets(res.presets))
      .catch((err) => {
        toast({
          variant: 'destructive',
          title: 'Could not load presets',
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
      .finally(() => setLoading(false))
  }, [toast])

  const apply = async (preset: IdCardPreset) => {
    setApplyingId(preset.id)
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
          isDefault: false,
          isActive: true,
        },
      )
      toast({ title: 'Template created', description: `"${res.template.name}" is ready.` })
      router.push(`/id-cards/templates/${res.template.id}`)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Could not create template',
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setApplyingId(null)
    }
  }

  if (loading) return <LoadingState />

  return (
    <div className="space-y-6">
      <PageHeader
        title="ID Card Design Gallery"
        description="Five hand-designed templates. Click any card to use it for your school."
        backAction={{ onClick: () => router.push('/id-cards/templates') }}
      />

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-50 via-fuchsia-50 to-amber-50 px-6 py-8 dark:from-violet-950/40 dark:via-fuchsia-950/30 dark:to-amber-950/30">
        <div className="absolute -right-12 -top-12 size-48 rounded-full bg-gradient-to-br from-violet-400/30 to-fuchsia-400/30 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 size-48 rounded-full bg-gradient-to-br from-amber-400/30 to-pink-400/30 blur-3xl" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-violet-700 backdrop-blur-sm dark:bg-slate-900/50 dark:text-violet-300">
            <Sparkles className="size-3.5" />
            5 starter designs
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">Pick a design, print in seconds</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Every design renders at exact print dimensions with QR codes, student photos, and your
            school's branding. Customise the HTML/CSS afterwards if you want to.
          </p>
        </div>
      </div>

      {/* Showcase grid */}
      <div className="space-y-6">
        {presets.map((preset, idx) => {
          const OrientIcon = preset.orientation === 'landscape' ? RectangleHorizontal : RectangleVertical
          const isBusy = applyingId === preset.id
          const reversed = idx % 2 === 1

          return (
            <div
              key={preset.id}
              className={cn(
                'grid gap-6 overflow-hidden rounded-2xl border bg-card lg:grid-cols-[1fr_360px]',
                reversed && 'lg:grid-cols-[360px_1fr]',
              )}
            >
              {/* Large preview */}
              <div
                className={cn(
                  'relative flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 p-8 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950',
                  reversed && 'lg:order-2',
                )}
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.08), transparent 50%), radial-gradient(circle at 70% 70%, rgba(236,72,153,0.06), transparent 50%)',
                }}
              >
                <div className="pointer-events-none">
                  <IdCardHtmlRenderer
                    template={presetToTemplate(preset)}
                    card={DEMO_HTML_CARD}
                    schoolLogo={currentSchool?.logo || null}
                    scale={preset.orientation === 'portrait' ? 2.4 : 2.6}
                    side="front"
                  />
                </div>
              </div>

              {/* Info panel */}
              <div className={cn('flex flex-col justify-between gap-5 p-6 lg:p-8', reversed && 'lg:order-1')}>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        'h-5 border-0 bg-gradient-to-r px-2 text-[10px] uppercase tracking-wide text-white',
                        CATEGORY_GRADIENT[preset.category],
                      )}
                    >
                      {CATEGORY_LABEL[preset.category]}
                    </Badge>
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <OrientIcon className="size-2.5" />
                      {preset.widthMm}×{preset.heightMm}mm
                    </Badge>
                    {preset.hasBackSide && (
                      <Badge variant="outline" className="text-[10px]">Front + Back</Badge>
                    )}
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight">{preset.name}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{preset.description}</p>
                </div>

                <Button
                  onClick={() => apply(preset)}
                  disabled={isBusy}
                  size="lg"
                  className="group w-full gap-2"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Creating template…
                    </>
                  ) : (
                    <>
                      Use this design
                      <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
